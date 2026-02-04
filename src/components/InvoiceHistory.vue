<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useReceiptStore } from '../stores/receiptStore'

import { Trash2, Search, FileText, Eye, Download, Edit2, X, Loader2, Plus } from 'lucide-vue-next'
import type { Receipt } from '../stores/receiptStore'
import { format, parseISO } from 'date-fns'
import InvoicePreview from './InvoicePreview.vue'
import { useBranchStore } from '../stores/branchStore'
import InvoicePrintLayout from './InvoicePrintLayout.vue'
import BulkInvoiceModal from './BulkInvoiceModal.vue'

const receiptStore = useReceiptStore()
const branchStore = useBranchStore()

const currentBranchReceipts = computed(() => 
    receiptStore.receipts
        .filter(r => r.branchId === branchStore.activeBranchId)
        .sort((a, b) => b.createdAt - a.createdAt)
)

const emit = defineEmits<{
    (e: 'edit', receipt: Receipt): void
    (e: 'create'): void
}>()

const searchQuery = ref('')
const selectedMonth = ref('all')
const selectedReceipt = ref<Receipt | null>(null)

// Bulk Export State
const isBulkExporting = ref(false)
const bulkProgress = ref(0)
const bulkTotal = ref(0)

// NEW: Store groups instead of flat list for batch rendering
type StudentGroup = {
    studentName: string;
    receipts: Receipt[];
}
const bulkStudentGroups = ref<StudentGroup[]>([])
const isBulkCreateOpen = ref(false) // State for Bulk Create Modal

const availableMonths = computed(() => {
    const months = new Set<string>()
    const currentYear = new Date().getFullYear()
    for (let m = 1; m <= 12; m++) {
        months.add(`${currentYear}-${String(m).padStart(2, '0')}`)
    }
    currentBranchReceipts.value.forEach(r => {
        const date = parseISO(r.date)
        const monthYear = format(date, 'yyyy-MM')
        months.add(monthYear)
    })
    return Array.from(months).sort((a, b) => a.localeCompare(b))
})

const filteredReceipts = computed(() => {
    let result = currentBranchReceipts.value
    if (selectedMonth.value !== 'all') {
        result = result.filter(r => format(parseISO(r.date), 'yyyy-MM') === selectedMonth.value)
    }
    if (searchQuery.value) {
        const query = searchQuery.value.toLowerCase()
        result = result.filter(r => 
            r.receiptNumber.toLowerCase().includes(query) ||
            r.receivedFrom.toLowerCase().includes(query) ||
            (r.contact && r.contact.toLowerCase().includes(query)) ||
            r.items.some(i => i.description.toLowerCase().includes(query))
        )
    }
    return result
})

const totalFilteredAmount = computed(() => {
    return filteredReceipts.value.reduce((sum, r) => {
        const receiptTotal = r.items.reduce((itemSum, item) => {
            return itemSum + ((item.amount * (item.quantity || 1)) - (item.discount || 0))
        }, 0)
        return sum + receiptTotal
    }, 0)
})

function formatCurrency(amount: number) {
    return `RM ${amount.toFixed(2)}`
}

function deleteReceipt(id: string) {
    if (confirm('Are you sure you want to delete this invoice?')) {
        receiptStore.deleteReceipt(id)
    }
}

function openPreview(receipt: Receipt) {
    selectedReceipt.value = receipt
}

async function downloadPDF() {
    if (!selectedReceipt.value) return
    
    // Look for element inside Teleported container
    const element = document.getElementById('history-single-print-area')?.querySelector('.invoice-container')
    if (!element) {
        alert('Could not find receipt content to download.')
        return
    }

    const filename = `Invoice_${selectedReceipt.value.receiptNumber}.pdf`

    if (!branchStore.activeBranch?.pdfFolderPath) {
        alert('Please set the PDF Folder for this branch on the Home page first.')
        return
    }

    try {
        const invoiceApi = (window as any).invoiceApi;
        if (invoiceApi) {
            const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
                .map(node => {
                    if (node.tagName.toLowerCase() === 'link' && (node as HTMLLinkElement).rel === 'stylesheet') {
                        const href = (node as HTMLLinkElement).href
                        return `<link rel="stylesheet" href="${new URL(href, window.location.origin).href}">`
                    }
                    return node.outerHTML
                })
                .join('\n')
            
            const fullHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <base href="${window.location.origin}/">
                    <title>${filename}</title>
                    ${styles}
                    <style>
                        body { margin: 0; padding: 0; background: white; }
                    </style>
                </head>
                <body>
                    ${element.outerHTML}
                </body>
                </html>
            `
            
            await new Promise(resolve => setTimeout(resolve, 500))

            const pdfBuffer = await invoiceApi.generatePdf(fullHtml)
            const studentName = selectedReceipt.value.receivedFrom
            
            const result = await invoiceApi.savePdf({
              filename: filename,
              studentName: studentName,
              siblingNames: [],
              pdfBuffer,
              customPath: branchStore.activeBranch?.pdfFolderPath
            })

            if(result.success) {
                alert(`Saved to ${result.path}`)
            } else {
                alert(`Failed to save: ${result.error}`)
            }
        }
    } catch (error) {
        console.error('PDF Generation failed:', error)
        alert('Failed to generate PDF.')
    }
}

// --- OPTIMIZED BULK EXPORT FUNCTION ---
async function bulkExportFilteredStudents() {
    if (!filteredReceipts.value.length) {
        alert('No invoices to export');
        return;
    }

    const invoiceApi = (window as any).invoiceApi;
    if (!invoiceApi) {
        alert('Electron API not available');
        return;
    }

    // 1. Prepare Data
    const studentGroups: Record<string, Receipt[]> = {};
    filteredReceipts.value.forEach(r => {
        const name = r.receivedFrom;
        if (!studentGroups[name]) {
            studentGroups[name] = [];
        }
        studentGroups[name]!.push(r);
    });

    const students = Object.keys(studentGroups);
    if (!confirm(`Generate merged PDFs for ${students.length} students?`)) return;

    isBulkExporting.value = true;
    bulkTotal.value = students.length;
    bulkProgress.value = 0;

    try {
        // 2. Render ALL students at once
        const groupsData: StudentGroup[] = students.map(name => ({
            studentName: name,
            receipts: studentGroups[name]!.sort((a, b) => b.receiptNumber.localeCompare(a.receiptNumber, undefined, { numeric: true }))
        }));
        
        bulkStudentGroups.value = groupsData;
        
        // 3. Wait ONCE for DOM to settle (Wait 1 second for images/fonts)
        await nextTick();
        await new Promise(r => setTimeout(r, 1000)); 

        // 4. Loop and Save (Fast!)
        for (const studentName of students) {
            
            // Find the specific container for this student
            // Note: We use a safe ID selector
            const safeId = `print-group-${students.indexOf(studentName)}`;
            const groupContainer = document.getElementById(safeId);
            
            if (!groupContainer) {
                console.error(`Render container not found for ${studentName}`);
                continue;
            }

            const invoices = groupContainer.querySelectorAll('.invoice-container');
            if (invoices.length === 0) continue;

            const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
                .map(node => {
                    if (node.tagName.toLowerCase() === 'link' && (node as HTMLLinkElement).rel === 'stylesheet') {
                        const href = (node as HTMLLinkElement).href
                        return `<link rel="stylesheet" href="${new URL(href, window.location.origin).href}">`
                    }
                    return node.outerHTML
                })
                .join('\n')

            const htmls = Array.from(invoices).map(invoice => {
                 return `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <base href="${window.location.origin}/">
                        <title>2026_invoice_${studentName}</title>
                        ${styles}
                        <style>
                            body { margin: 0; padding: 0; background: white; }
                        </style>
                    </head>
                    <body>
                        ${invoice.outerHTML}
                    </body>
                    </html>
                `
            })

            const pdfBuffer = await invoiceApi.generatePdf(htmls)

            if (!pdfBuffer || pdfBuffer.byteLength === 0) {
                console.error(`Empty buffer for ${studentName}`)
                continue
            }

             if (!branchStore.activeBranch?.pdfFolderPath) {
                throw new Error('PDF Folder path not set')
            }

            const result = await invoiceApi.savePdf({
                filename: `2026_invoice_${studentName}.pdf`,
                studentName: studentName,
                siblingNames: [],
                pdfBuffer,
                customPath: branchStore.activeBranch?.pdfFolderPath
            });

            if(!result.success) {
                 console.error(`Failed to save ${studentName}:`, result.error);
            }
            
            bulkProgress.value++;
            // Small breathing room for UI updates
            await new Promise(r => setTimeout(r, 10));
        }
        alert(`Bulk export complete! Processed ${bulkProgress.value} students.`);

    } catch (error: any) {
        console.error("Bulk export failed:", error);
        alert(`Bulk export failed: ${error.message || error}`);
    } finally {
        isBulkExporting.value = false;
        bulkProgress.value = 0;
        bulkStudentGroups.value = []; // Clear DOM
    }
}

function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
        if (selectedReceipt.value) {
            selectedReceipt.value = null
        }
    }
}

onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
    <div class="h-full flex flex-col space-y-8 printable-container-parent">
        <div class="flex flex-col gap-6">
            <div class="flex justify-between items-end">
                <div>
                   <h2 class="text-2xl font-bold text-gray-800">Invoice History</h2>
                   <p class="text-gray-500">Manage and track all your issued invoices.</p>
                </div>
                <div class="flex gap-4 items-center">
                    <div class="relative w-48">
                        <select 
                            v-model="selectedMonth"
                            class="w-full border-gray-300 rounded-lg shadow-sm border p-2.5 pr-8 focus:ring-blue-500 focus:border-blue-500 text-sm appearance-none bg-white font-medium"
                        >
                            <option value="all">All Months</option>
                            <option v-for="month in availableMonths" :key="month" :value="month">
                                {{ format(parseISO(month + '-01'), 'MMMM yyyy') }}
                            </option>
                        </select>
                        <div class="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-400">
                            <svg class="h-4 w-4 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>
                        </div>
                    </div>
                    <div class="relative w-64">
                        <Search class="absolute left-3 top-3 text-gray-400" :size="18" />
                        <input 
                            v-model="searchQuery" 
                            type="text" 
                            placeholder="Search invoices..." 
                            class="pl-10 w-full border-gray-300 rounded-lg shadow-sm border p-2.5 focus:ring-blue-500 focus:border-blue-500 text-sm"
                        />
                    </div>
                    
                    
                    <button 
                        @click="emit('create')"
                        class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 shadow-sm transition-all flex items-center gap-2 whitespace-nowrap"
                    >
                        <Plus :size="18" />
                        Create New Invoice
                    </button>
                    
                    <button 
                        @click="isBulkCreateOpen = true"
                        class="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 shadow-sm transition-all flex items-center gap-2 whitespace-nowrap"
                    >
                        <Users :size="18" />
                        Bulk Create
                    </button>
                    
                    <button 
                        @click="bulkExportFilteredStudents"
                        :disabled="isBulkExporting"
                        class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 shadow-sm transition-all flex items-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Export filtered invoices to per-student merged PDFs"
                    >
                        <Download :size="18" />
                        {{ isBulkExporting ? 'Exporting...' : 'Bulk Export All' }}
                    </button>

                    <div v-if="isBulkExporting" class="flex items-center gap-2 text-blue-600 bg-blue-50 px-3 py-2 rounded-lg animate-pulse">
                        <Loader2 class="animate-spin" :size="16" />
                        <span class="text-xs font-bold">{{ bulkProgress }} / {{ bulkTotal }}</span>
                    </div>

                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
               <div class="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
                   <div>
                       <p class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Total Revenue</p>
                       <h3 class="text-3xl font-black text-gray-900 leading-none">{{ formatCurrency(totalFilteredAmount) }}</h3>
                   </div>
                   <div class="w-12 h-12 rounded-full bg-green-50 text-green-600 flex items-center justify-center">
                       <span class="text-2xl font-bold">$</span>
                   </div>
               </div>
               <div class="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
                   <div>
                       <p class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Invoices Issued</p>
                       <h3 class="text-3xl font-black text-gray-900 leading-none">{{ filteredReceipts.length }}</h3>
                   </div>
                   <div class="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                       <FileText :size="24" />
                   </div>
               </div>
            </div>
        </div>

        <div v-if="filteredReceipts.length === 0" class="text-center py-20 bg-white rounded-xl border border-dashed border-gray-200">
            <FileText class="mx-auto text-gray-200 mb-4" :size="64" />
            <p class="text-gray-500 font-medium text-lg">No receipts found.</p>
            <p class="text-gray-400 text-sm">Create a new invoice to get started.</p>
        </div>

        <div v-else class="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-100 table-fixed">
                    <thead class="bg-gray-50/50">
                        <tr>
                            <th scope="col" class="w-32 px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Date</th>
                            <th scope="col" class="w-40 px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Receipt No</th>
                            <th scope="col" class="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Received From</th>
                            <th scope="col" class="w-32 px-6 py-4 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                            <th scope="col" class="w-40 px-6 py-4 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Amount</th>
                            <th scope="col" class="w-48 px-6 py-4 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-50">
                        <tr v-for="receipt in filteredReceipts" :key="receipt.id" class="hover:bg-blue-50/50 transition-colors group">
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">
                                {{ format(parseISO(receipt.date), 'dd/MM/yyyy') }}
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-xs font-mono font-bold text-blue-600">
                                {{ receipt.receiptNumber }}
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                                {{ receipt.receivedFrom }}
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-center">
                                <span 
                                    class="inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide"
                                    :class="receipt.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'"
                                >
                                    {{ receipt.status }}
                                </span>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 text-right">
                                {{ formatCurrency(receipt.items.reduce((sum, item) => sum + ((item.amount * (item.quantity || 1)) - (item.discount || 0)), 0)) }}
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <div class="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button @click="emit('edit', receipt)" class="p-2 text-amber-500 hover:bg-amber-50 rounded-lg transition-colors" title="Edit">
                                        <Edit2 :size="16" />
                                    </button>
                                    <button @click="openPreview(receipt)" class="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="View & Print">
                                        <Eye :size="16" />
                                    </button>
                                    <button @click="deleteReceipt(receipt.id)" class="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                                        <Trash2 :size="16" />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <div v-if="selectedReceipt" class="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 printable-container-parent">
            <div class="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300">
                <div class="p-4 border-b flex justify-between items-center no-print">
                    <h3 class="font-bold text-gray-800">Invoice Preview</h3>
                     <div class="flex gap-2">
                        <button @click="downloadPDF" class="bg-blue-600 text-white px-3 py-1.5 rounded flex items-center gap-2 text-sm hover:bg-blue-700 shadow-sm">
                            <Download :size="16" /> Download PDF
                        </button>
                        <button @click="selectedReceipt = null" class="text-gray-400 hover:text-gray-600 p-1">
                            <X :size="24" />
                        </button>
                    </div>
                </div>
                 <div class="flex-grow overflow-auto p-8 bg-gray-100 flex justify-center printable-container">
                    <div class="transform scale-90 origin-top shadow-xl invoice-container">
                         <InvoicePreview :receipt="selectedReceipt" />
                    </div>
                </div>
            </div>
        </div>

        <Teleport to="body">
            <div class="fixed top-0 left-0 w-px h-px opacity-0 overflow-hidden z-[-100]">
                <div id="bulk-print-temp-area">
                    <div 
                        v-for="(group, index) in bulkStudentGroups" 
                        :key="group.studentName"
                        :id="'print-group-' + index"
                    >
                        <div v-for="receipt in group.receipts" :key="receipt.id">
                            <div class="w-[297mm] min-h-[210mm] overflow-hidden flex items-center justify-center bg-white">
                                <InvoicePrintLayout :receipt="receipt" />
                            </div>
                            <div class="page-break"></div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="fixed top-0 left-0 w-px h-px opacity-0 overflow-hidden z-[-100]">
                <div id="history-single-print-area">
                    <InvoicePrintLayout :receipt="selectedReceipt" />
                </div>
            </div>
        </Teleport>

        <!-- Bulk Invoice Modal -->
        <BulkInvoiceModal v-model="isBulkCreateOpen" @generated="selectedMonth = 'all'" />
    </div>
</template>
