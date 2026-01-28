<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useBranchStore } from '../stores/branchStore'
import { useCustomerStore } from '../stores/customerStore'
import { useReceiptStore, type Receipt } from '../stores/receiptStore'

import { Search, Download, X, FileText, ChevronLeft, ArrowRight, Edit2, Clock, TrendingUp } from 'lucide-vue-next'
import InvoicePreview from './InvoicePreview.vue'
import InvoicePrintLayout from './InvoicePrintLayout.vue'
const branchStore = useBranchStore()
const receiptStore = useReceiptStore()
const customerStore = useCustomerStore()
// const { selectDirectory } = useElectron()
 // Removed as we use invoiceApi directly
// const { activeBranch } = storeToRefs(branchStore) // activeBranch unused now
// REMOVED: const { currentBranchCustomers } = storeToRefs(customerStore)

const currentBranchCustomers = computed(() => 
    customerStore.customers.filter((c: any) => c.branchId === branchStore.activeBranchId)
)

const searchQuery = ref('')
const selectedCustomerName = ref<string | null>(null)
const selectedReceipt = ref<Receipt | null>(null)
const showBatchPreview = ref(false)
const showReceiptOverlay = ref(false)


const viewMode = computed(() => selectedCustomerName.value ? 'detail' : 'gallery')

const filteredAndSortedCustomers = computed(() => {
    let customers = [...currentBranchCustomers.value] // Clone
    
    // Enrich with metadata
    const enriched = customers.map(c => {
        const receipts = ([...receiptStore.receipts] as Receipt[])
            .filter(r => r.receivedFrom === c.name)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) // sort here on filtered array is fine since filter creates new array
        
        const lastInvoiceDate = receipts[0]?.date || null

        return {
            ...c,
            invoiceCount: receipts.length,
            lastInvoiceDate
        }
    })

    if (searchQuery.value) {
        const q = searchQuery.value.toLowerCase()
        return enriched.filter(c => c.name.toLowerCase().includes(q))
    }
    
    // Sort by name alphabetically
    return [...enriched].sort((a, b) => a.name.localeCompare(b.name)) // Safe sort
})

const customerReceipts = computed(() => {
    if (!selectedCustomerName.value) return []
    const receipts = ([...receiptStore.receipts] as Receipt[])
        .filter((r: Receipt) => r.receivedFrom === selectedCustomerName.value)
    
    // Safe sort
    return [...receipts].sort((a: Receipt, b: Receipt) => new Date(b.date).getTime() - new Date(a.date).getTime())
})





function selectCustomer(name: string) {
    selectedCustomerName.value = name
    selectedReceipt.value = null
}

function backToGallery() {
    selectedCustomerName.value = null
    selectedReceipt.value = null
}

function openReceipt(receipt: Receipt) {
    selectedReceipt.value = receipt
    showReceiptOverlay.value = true
}


async function downloadPDF() {
    if (!selectedReceipt.value) return
    await nextTick()
    const element = document.getElementById('single-invoice-print-area')?.querySelector('.invoice-container')
    if (!element) return

    const filename = `Invoice_${selectedReceipt.value.receiptNumber}.pdf`

    try {
        const branchStore = useBranchStore()
        if (!branchStore.activeBranch?.pdfFolderPath) {
            alert('Please set the PDF Folder for this branch on the Home page first.')
            return
        }
        const invoiceApi = (window as any).invoiceApi;
        if (invoiceApi) {

            const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
                .map(node => {
                    if (node.tagName.toLowerCase() === 'link' && (node as HTMLLinkElement).rel === 'stylesheet') {
                        const href = (node as HTMLLinkElement).href
                        // Ensure absolute URL
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
                        /* Ensure Tailwind/PostCSS vars work if needed */
                        :root { --foreground-rgb: 0, 0, 0; }
                    </style>
                </head>
                <body>
                    ${element.outerHTML}
                </body>
                </html>
            `
            
            // Wait a bit longer for network resources in the new window context
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
        } else {
            console.error('invoiceApi not found. Electron save-pdf will not be used.')
        }
    } catch (error) {
        console.error("Error generating PDF:", error)
        alert("Failed to generate PDF.")
    }
}





async function downloadBatchPDF() {
    if (!selectedCustomerName.value || customerReceipts.value.length === 0) return

    showBatchPreview.value = true
    await nextTick()
    
    // CRITICAL: Wait for DOM to fully render images/styles
    await new Promise(r => setTimeout(r, 400))

    try {
        const printArea = document.getElementById('batch-print-area')
        if (!printArea) throw new Error('Print area not found')

        const invoices = printArea.querySelectorAll('.invoice-container')
        if (invoices.length === 0) throw new Error('No invoices found to print')

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
                    <title>Invoice Batch Export</title>
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

        const invoiceApi = (window as any).invoiceApi
        if (!invoiceApi) throw new Error('Invoice API not found')

        const pdfBuffer = await invoiceApi.generatePdf(htmls)

        if (!pdfBuffer || pdfBuffer.byteLength === 0) {
            throw new Error("Generated PDF buffer is empty")
        }
        
        // Removed local branchStore import as it is available globally in scope
        if (!branchStore.activeBranch?.pdfFolderPath) {
             throw new Error('PDF Folder path not set')
        }

        const result = await invoiceApi.savePdf({
            filename: `2026_invoice_${selectedCustomerName.value}.pdf`,
            studentName: selectedCustomerName.value!,
            siblingNames: [],
            pdfBuffer,
            customPath: branchStore.activeBranch?.pdfFolderPath
        })

        if(result.success) {
            alert(`Saved to ${result.path}`)
        } else {
            alert(`Failed to save: ${result.error}`)
        }

    } catch (error: any) {
        console.error("Error generating student history PDF:", error)
        if (error.message?.includes('EBUSY') || error.toString().includes('EBUSY')) {
             alert('PDF File is currently OPEN in another program. Please CLOSE the PDF file and try again.');
        } else {
             alert(`Failed to generate PDF: ${error.message || error}`)
        }
    } finally {
        showBatchPreview.value = false
    }
}


function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
        if (showReceiptOverlay.value) {
            showReceiptOverlay.value = false
        } else if (showBatchPreview.value) {
            showBatchPreview.value = false
        } else if (selectedCustomerName.value) {
            backToGallery()
        }
    }
}

onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
})

const emit = defineEmits<{
    (e: 'edit', receipt: Receipt): void
}>()
</script>

<template>
  <div class="h-full flex flex-col bg-white rounded-2xl">
    
    <!-- HEADER SECTION (Common for both modes, but changes content) -->
    <div class="px-8 py-6 border-b border-gray-100 no-print">
        <div v-if="viewMode === 'gallery'" class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <h2 class="text-2xl font-black text-gray-900">Select Customer</h2>
                <p class="text-sm text-gray-400 font-medium">Browse invoices by clicking on a customer below.</p>
            </div>
            <div class="relative w-full md:w-80">
                <Search :size="18" class="absolute left-3 top-3.5 text-gray-400" />
                <input v-model="searchQuery" type="text" placeholder="Search customers..." class="pl-10 w-full border-2 border-gray-100 rounded-2xl bg-gray-50 focus:bg-white focus:border-blue-500 p-3 text-sm transition-all outline-none" />
            </div>
        </div>
        
        <div v-else class="flex items-center justify-between">
            <div class="flex items-center gap-4">
                <button @click="backToGallery" class="group flex items-center gap-3 px-6 py-3 bg-gray-900 text-white rounded-2xl hover:bg-black transition-all shadow-xl shadow-gray-200 font-black text-sm uppercase tracking-wide">
                    <ChevronLeft :size="20" class="group-hover:-translate-x-1 transition-transform" />
                    Back to List
                </button>
                <div>
                    <h2 class="text-xl font-bold text-gray-800">{{ selectedCustomerName }}</h2>
                    <p class="text-xs text-blue-600 font-bold uppercase tracking-wider">{{ customerReceipts.length }} Invoices Found</p>
                </div>
            </div>
            
            <div class="flex flex-col gap-2 items-end" v-if="customerReceipts.length > 0">
                <button 
                    @click="showBatchPreview = true" 
                    class="bg-gray-900 text-white px-6 py-3 rounded-2xl font-bold text-sm hover:bg-black transition-all flex items-center gap-2 shadow-xl shadow-gray-200"
                >
                    <Download :size="18" /> Download Full History
                </button>

            </div>
        </div>
    </div>

    <!-- MAIN CONTENT AREA -->
    <div class="flex-grow overflow-y-auto p-8 custom-scrollbar">
        
        <!-- MODE 1: HIGH-DENSITY LIST -->
        <div v-if="viewMode === 'gallery'" class="w-full">
            <div class="bg-gray-50/50 rounded-3xl border border-gray-100 overflow-hidden">
                <div 
                    v-for="customer in filteredAndSortedCustomers" 
                    :key="customer.id"
                    @click="selectCustomer(customer.name)"
                    class="group bg-white border-b border-gray-100 last:border-0 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-blue-50/30 transition-all cursor-pointer"
                >
                    <div class="flex items-center gap-4 min-w-[300px]">
                        <div class="w-12 h-12 bg-gray-100 text-gray-400 rounded-2xl flex items-center justify-center transition-all group-hover:scale-110 group-hover:bg-blue-100 group-hover:text-blue-600">
                            <FileText :size="20" />
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <h4 class="font-bold text-gray-800 leading-tight">{{ customer.name }}</h4>
                            </div>
                            <p class="text-xs text-gray-400 font-medium">{{ customer.contact || 'No contact info' }}</p>
                        </div>
                    </div>
                    
                    <div class="flex items-center gap-8 md:gap-12 flex-grow justify-between md:justify-end">
                        <div class="flex items-center gap-2 text-right">
                             <div>
                                <div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Invoices</div>
                                <div class="font-bold text-gray-700">{{ customer.invoiceCount }}</div>
                             </div>
                             <div class="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-300 group-hover:text-blue-500 transition-colors">
                                <TrendingUp :size="16" />
                             </div>
                        </div>

                        <div class="hidden sm:block min-w-[140px]">
                            <div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                                <Clock :size="10" /> Last Invoice
                            </div>
                            <div class="font-bold text-gray-600">
                                {{ customer.lastInvoiceDate ? new Date(customer.lastInvoiceDate).toLocaleDateString('en-GB') : 'Never' }}
                            </div>
                        </div>

                        <div class="w-10 h-10 rounded-full flex items-center justify-center text-gray-300 group-hover:text-blue-600 group-hover:bg-blue-100 transition-all">
                            <ArrowRight :size="18" />
                        </div>
                    </div>
                </div>
            </div>
            
            <div v-if="filteredAndSortedCustomers.length === 0" class="py-20 text-center">
                 <div class="text-gray-200 mb-4 flex justify-center"><Search :size="64" /></div>
                 <h3 class="text-xl font-bold text-gray-400">No customers found.</h3>
                 <p class="text-gray-400">Try adjusting your search query.</p>
            </div>
        </div>

        <!-- MODE 2: FULL-WIDTH DETAIL HISTORY -->
        <div v-else class="w-full space-y-6">
            <!-- Simplified Header Removed -->
            <div class="h-4"></div>

            <div 
                v-for="receipt in customerReceipts" 
                :key="receipt.id"
                @click="openReceipt(receipt)"
                class="bg-white border border-gray-100 hover:border-blue-500 hover:ring-1 hover:ring-blue-500 p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all cursor-pointer group"
            >
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 bg-gray-50 text-gray-400 rounded-lg flex items-center justify-center transition-colors group-hover:bg-blue-600 group-hover:text-white">
                        <FileText :size="18" />
                    </div>
                    <div>
                        <div class="font-mono font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{{ receipt.receiptNumber }}</div>
                        <div class="text-xs font-bold text-gray-400 uppercase tracking-widest">
                            {{ new Date(receipt.date).toLocaleDateString('en-GB') }}
                        </div>
                    </div>
                </div>
                
                <div class="flex items-center gap-8 justify-between md:justify-end flex-grow">
                    <div class="text-right">
                        <div class="text-[10px] font-bold text-gray-300 uppercase">Amount</div>
                        <div class="font-bold text-gray-900">
                             RM {{ receipt.items.reduce((s: number, i) => s + (Number(i.amount) || 0) * (Number(i.quantity) || 1) - (Number(i.discount) || 0), 0).toFixed(2) }}
                        </div>
                    </div>
                    <div class="flex items-center gap-4">
                         <span :class="['px-2 py-1 rounded-md text-[10px] uppercase font-black tracking-wider', receipt.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700']">
                            {{ receipt.status }}
                        </span>
                        <ChevronLeft :size="16" class="text-gray-300 rotate-180" />
                    </div>
                </div>
            </div>
            
            <div v-if="customerReceipts.length === 0" class="text-center py-20 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-100">
                <FileText class="mx-auto text-gray-200 mb-4" :size="64" />
                <h3 class="text-xl font-bold text-gray-400">No invoices yet.</h3>
                <p class="text-gray-400">This customer hasn't been invoiced recently.</p>
            </div>
        </div>
    </div>

    <!-- OVERLAY 1: FULL INVOICE PREVIEW -->
    <div v-if="showReceiptOverlay && selectedReceipt" class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 printable-container-parent">
        <div class="bg-white rounded-[2rem] shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300">
            <!-- Overlay Header -->
            <div class="p-6 border-b flex justify-between items-center bg-white no-print">
                <div class="flex items-center gap-4">
                     <div class="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                        <FileText :size="20" />
                    </div>
                    <h3 class="font-black text-xl text-gray-900">Preview: {{ selectedReceipt.receiptNumber }}</h3>
                </div>
                <div class="flex gap-3">
                    <button @click="downloadPDF" class="p-3 bg-gray-100 text-blue-600 rounded-2xl hover:bg-blue-600 hover:text-white transition-all shadow-sm" title="Download Image PDF">
                        <Download :size="20" />
                    </button>
                    <button @click="downloadPDF" class="p-3 bg-blue-50 text-blue-700 rounded-2xl hover:bg-blue-700 hover:text-white transition-all shadow-sm" title="Download Text PDF">
                        <FileText :size="20" />
                    </button>
                    <button 
                        @click="showReceiptOverlay = false; emit('edit', selectedReceipt!)"
                        class="px-5 py-3 bg-amber-50 text-amber-700 rounded-2xl font-bold border border-amber-100 hover:bg-amber-100 transition-colors flex items-center gap-2"
                    >
                        <Edit2 :size="18" /> Edit
                    </button>
                    <button @click="showReceiptOverlay = false" class="p-3 text-gray-400 hover:bg-gray-100 rounded-2xl transition-colors">
                        <X :size="24" />
                    </button>
                </div>
            </div>
            <!-- Overlay Body -->
            <div class="flex-grow overflow-auto p-12 bg-gray-50 flex justify-center items-start overlay-preview-container">
                <div class="printable-container transform scale-90 md:scale-100 shadow-2xl bg-white origin-top">
                    <InvoicePreview :receipt="selectedReceipt" />
                </div>
            </div>
        </div>
    </div>

    <!-- OVERLAY 2: BATCH PREVIEW -->
    <div v-if="showBatchPreview" class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 printable-container-parent">
        <div class="bg-white rounded-[2rem] shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300">
            <div class="p-6 border-b flex justify-between items-center bg-white no-print">
                <h3 class="font-black text-2xl text-gray-900">Exporting {{ customerReceipts.length }} Invoices</h3>
                <div class="flex gap-3">
                    <button @click="downloadBatchPDF" class="bg-blue-600 text-white px-8 py-3 rounded-2xl font-black text-sm flex items-center gap-2 hover:bg-black shadow-xl shadow-blue-100 transition-all">
                        <Download :size="20" /> Download combined PDF ({{ customerReceipts.length }} Pages)
                    </button>
                    <button @click="showBatchPreview = false" class="p-3 bg-gray-50 text-gray-400 rounded-2xl hover:text-gray-900 transition-colors">
                        <X :size="24" />
                    </button>
                </div>
            </div>
            <div class="flex-grow overflow-auto p-12 bg-gray-100 flex justify-center items-start">
                <div id="batch-print-area" class="block">
                    <div 
                        v-for="(receipt, index) in customerReceipts" 
                        :key="receipt.id" 
                    >
                        <div class="w-[297mm] min-h-[210mm] overflow-hidden flex items-center justify-center bg-white">
                            <InvoicePrintLayout :receipt="receipt" />
                        </div>
                        <!-- Force page break after every item except the last one -->
                        <div v-if="index < customerReceipts.length - 1" class="page-break"></div> 
                    </div>
                </div>
            </div>
        </div>
    </div>



    <!-- Hidden Print Area for Single Invoice -->
    <div class="fixed opacity-0 pointer-events-none -left-[9999px] top-0 no-print">
        <div id="single-invoice-print-area">
                <InvoicePrintLayout :receipt="selectedReceipt" />
        </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

.statement-preview-font {
    font-family: 'Inter', sans-serif;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #f1f5f9;
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #e2e8f0;
}


.page-break {
    page-break-after: always;
    height: 0;
    overflow: hidden;
}

@keyframes animate-in {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
</style>
