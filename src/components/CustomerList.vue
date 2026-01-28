<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { useCustomerStore } from '../stores/customerStore'
import { Download, Plus, Search, Trash2, Edit2, Upload, Users, Loader2 } from 'lucide-vue-next'

import { useBranchStore } from '../stores/branchStore'
import { useReceiptStore, type Receipt } from '../stores/receiptStore'
import InvoicePrintLayout from './InvoicePrintLayout.vue'
const customerStore = useCustomerStore()
const receiptStore = useReceiptStore()
const branchStore = useBranchStore()

const currentBranchCustomers = computed(() => 
    customerStore.customers.filter(c => c.branchId === branchStore.activeBranchId)
)

const searchQuery = ref('')
const isAdding = ref(false)
const isProcessing = ref(false) // New state for loading indicator
const newCustomerName = ref('')
const newCustomerContact = ref('')
const editingCustomerId = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

// Context Menu State
const contextMenu = ref({
    show: false,
    x: 0,
    y: 0,
    customer: null as any
})

function onContextMenu(e: MouseEvent, customer: any) {
    e.preventDefault()
    contextMenu.value = {
        show: true,
        x: e.clientX,
        y: e.clientY,
        customer
    }
}

function handleMenuAction(action: 'edit' | 'delete' | 'download') {
    const customer = contextMenu.value.customer
    if (!customer) return
    
    contextMenu.value.show = false
    
    if (action === 'edit') startEditing(customer)
    else if (action === 'delete') deleteCustomer(customer.id)
    else if (action === 'download') downloadFullInvoice(customer)
}

function closeMenu() {
    contextMenu.value.show = false
}

function triggerCSVImport() {
    fileInput.value?.click()
}

function handleCSVImport(event: Event) {
    const target = event.target as HTMLInputElement
    const file = target.files?.[0]
    if (!file) return

    isProcessing.value = true // START LOADING

    // Small timeout to allow UI to update and show the spinner before heavy work
    setTimeout(() => {
        const reader = new FileReader()
        reader.onload = (e) => {
            try {
                const content = e.target?.result as string
                const lines = content.split(/\r?\n/)
                let startIndex = 0
                if (lines.length > 0) {
                    const firstLine = lines[0]?.toLowerCase()
                    if (firstLine && (firstLine.includes('name') || firstLine.includes('contact') || firstLine.includes('phone'))) {
                        startIndex = 1
                    }
                }
                let importCount = 0
                for (let i = startIndex; i < lines.length; i++) {
                    const line = lines[i]?.trim()
                    if (!line) continue
                    const parts = line.split(/[;,]/).map(p => p.trim().replace(/^["']|["']$/g, ''))
                    if (parts.length >= 1 && parts[0]) {
                        if (!branchStore.activeBranchId) return
                        customerStore.addCustomer({ name: parts[0], contact: parts[1] || '', branchId: branchStore.activeBranchId }, branchStore.activeBranchId)
                        importCount++
                    }
                }
                alert(`Successfully imported ${importCount} customers!`)
            } catch (error) {
                alert('Failed to import CSV.')
            } finally {
                isProcessing.value = false // STOP LOADING
                target.value = ''
            }
        }
        reader.readAsText(file)
    }, 100)
}

function handleAddCustomer() {
  if (!newCustomerName.value.trim()) return
  if (!branchStore.activeBranchId) {
      alert("No active branch selected")
      return
  }

  if (editingCustomerId.value) {
    const oldCustomer = currentBranchCustomers.value.find(c => c.id === editingCustomerId.value)
    if (oldCustomer && oldCustomer.name !== newCustomerName.value.trim()) {
        receiptStore.updateReceiptCustomerName(oldCustomer.name, newCustomerName.value.trim())
    }
    customerStore.updateCustomer(editingCustomerId.value, { name: newCustomerName.value, contact: newCustomerContact.value })
  } else {
    customerStore.addCustomer({ name: newCustomerName.value, contact: newCustomerContact.value, branchId: branchStore.activeBranchId }, branchStore.activeBranchId)
  }
  cancelAddOrEdit()
}

function startEditing(customer: any) {
    editingCustomerId.value = customer.id
    newCustomerName.value = customer.name
    newCustomerContact.value = customer.contact || ''
    isAdding.value = true
}

function cancelAddOrEdit() {
    isAdding.value = false
    editingCustomerId.value = null
    newCustomerName.value = ''
    newCustomerContact.value = ''
}

function deleteCustomer(id: string) {
  if(confirm('Are you sure you want to delete this customer?')) {
      customerStore.deleteCustomer(id)
  }
}

const filteredAndSortedCustomers = computed(() => {
    let result = [...currentBranchCustomers.value]
    if (searchQuery.value) {
        const q = searchQuery.value.toLowerCase()
        result = result.filter(c => c.name.toLowerCase().includes(q))
    }
    return [...result].sort((a, b) => a.name.localeCompare(b.name))
})


const batchReceipts = ref<Receipt[]>([])
const showBatchContainer = ref(false)

async function downloadFullInvoice(customer: any) {
    const receipts = ([...receiptStore.receipts] as Receipt[])
        .filter(r => r.receivedFrom === customer.name)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    if (receipts.length === 0) {
        alert("No invoices found for this customer.")
        return
    }

    batchReceipts.value = receipts
    showBatchContainer.value = true
    
    await nextTick()
    await new Promise(r => setTimeout(r, 100))

    const container = document.getElementById('customer-batch-print-area')
    if (!container) {
        console.error('Batch print area not found')
        showBatchContainer.value = false
        return
    }

    const filename = `${new Date().getFullYear()}_invoice_${customer.name}.pdf`

    try {
        const branchStore = useBranchStore()
        if (!branchStore.activeBranch?.pdfFolderPath) {
            alert('Please set the PDF Folder for this branch on the Home page first.')
            return
        }

        const invoiceApi = (window as any).invoiceApi;
        if (invoiceApi) {
             const invoiceElements = container.querySelectorAll('.invoice-container')
             const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
                .map(s => s.outerHTML)
                .join('\n')

             const htmlInputs = Array.from(invoiceElements).map(el => `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    ${styles}
                    <style>
                        body { margin: 0; padding: 0; background: white; } 
                        .invoice-container { box-shadow: none !important; margin: 0 auto !important; }
                    </style>
                </head>
                <body>
                    ${el.outerHTML}
                </body>
                </html>
             `)

             if (htmlInputs.length === 0) throw new Error("No invoices rendered found")

             const pdfBuffer = await invoiceApi.generatePdf(htmlInputs)
             
             if (!pdfBuffer || pdfBuffer.byteLength === 0) throw new Error("Generated PDF buffer is empty");

             const result = await invoiceApi.savePdf({
                 filename: filename,
                 studentName: customer.name,
                 siblingNames: [],
                 pdfBuffer,
                 customPath: branchStore.activeBranch?.pdfFolderPath
             })
             
             if(result.success) alert(`Saved to ${result.path}`)
             else alert(`Failed to save: ${result.error}`)
        }
    } catch (error: any) {
        alert(`Failed to generate PDF: ${error.message || error}`)
    } finally {
        showBatchContainer.value = false
        batchReceipts.value = []
    }
}

onMounted(() => {
    window.addEventListener('click', closeMenu)
})

onUnmounted(() => {
    window.removeEventListener('click', closeMenu)
})
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 shrink-0">
        <div>
            <h2 class="text-xl font-black text-gray-900">Active Students</h2>
            <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{{ filteredAndSortedCustomers.length }} RECORDS SHOWING</p>
        </div>
        <div class="flex items-center gap-4 flex-grow md:max-w-md">
            <div class="relative flex-grow">
                <Search :size="16" class="absolute left-3 top-3 text-gray-400" />
                <input v-model="searchQuery" type="text" placeholder="Search..." class="pl-9 w-full bg-gray-50 border-0 rounded-xl focus:ring-2 focus:ring-blue-500/20 p-2.5 text-sm" />
            </div>
        </div>
    </div>

    <div class="flex gap-2 mb-6 no-print shrink-0 items-center">
        <input type="file" ref="fileInput" @change="handleCSVImport" accept=".csv" class="hidden" />
        <button @click="triggerCSVImport" class="bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 px-4 py-2 rounded-xl flex items-center gap-2 text-xs font-bold transition-all">
          <Upload :size="16" /> Import CSV
        </button>
        <button @click="isAdding = true" class="bg-blue-600 hover:bg-black text-white px-4 py-2 rounded-xl flex items-center gap-2 text-xs font-bold transition-all shadow-lg shadow-blue-100">
          <Plus :size="16" /> Add Customer
        </button>
        
        <div v-if="isProcessing" class="flex items-center gap-2 text-blue-600 bg-blue-50 px-3 py-2 rounded-xl ml-2 animate-pulse">
            <Loader2 class="animate-spin" :size="16" />
            <span class="text-xs font-bold">Processing...</span>
        </div>
    </div>

    <div v-if="isAdding" class="mb-8 bg-blue-50/50 p-6 rounded-2xl border border-blue-100/50 backdrop-blur-sm shrink-0">
        <h3 class="text-xs font-black text-blue-800 uppercase tracking-widest mb-4">{{ editingCustomerId ? 'Update Student Record' : 'Registry' }}</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div class="space-y-1">
                <label class="text-[10px] font-bold text-blue-400 uppercase ml-1">Student Full Name</label>
                <input v-model="newCustomerName" type="text" placeholder="Enter name..." class="border-gray-200 bg-white rounded-xl p-3 text-sm font-semibold w-full focus:ring-2 focus:ring-blue-500/20 transition-all outline-none" @keyup.enter="handleAddCustomer" />
            </div>
            <div class="space-y-1">
                <label class="text-[10px] font-bold text-blue-400 uppercase ml-1">Contact Reference</label>
                <input v-model="newCustomerContact" type="text" placeholder="Phone or email..." class="border-gray-200 bg-white rounded-xl p-3 text-sm font-semibold w-full focus:ring-2 focus:ring-blue-500/20 transition-all outline-none" @keyup.enter="handleAddCustomer" />
            </div>
        </div>
        <div class="flex justify-end gap-3">
            <button @click="cancelAddOrEdit" class="text-gray-400 text-xs font-bold px-4 py-2 hover:bg-gray-100 rounded-xl transition-all">Cancel</button>
            <button @click="handleAddCustomer" class="bg-blue-600 text-white text-xs font-black px-6 py-2 rounded-xl hover:bg-black transition-all shadow-xl shadow-blue-100">
                {{ editingCustomerId ? 'SAVE CHANGES' : 'REGISTER STUDENT' }}
            </button>
        </div>
    </div>

    <div class="flex-grow overflow-y-auto min-h-0 custom-scrollbar pr-2">
        <div v-if="filteredAndSortedCustomers.length > 0" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pb-20">
            <div 
                v-for="customer in filteredAndSortedCustomers" 
                :key="customer.id"
                @contextmenu="onContextMenu($event, customer)"
                class="group relative bg-white border border-gray-100 px-5 py-4 rounded-xl shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-context-menu animate-in fade-in zoom-in duration-300"
            >
                <div class="flex items-center justify-between">
                    <h3 class="font-bold text-gray-800 text-[11px] uppercase tracking-tight truncate pr-4">{{ customer.name }}</h3>
                    <div class="opacity-0 group-hover:opacity-40 transition-opacity">
                        <svg class="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                    </div>
                </div>
            </div>
        </div>
        <div v-else class="h-64 flex flex-col items-center justify-center bg-gray-50/50 rounded-3xl border border-dashed border-gray-200">
            <Users :size="48" class="text-gray-200 mb-4" />
            <p class="text-gray-400 font-bold text-sm">No records matching your search.</p>
        </div>
    </div>

    <div 
        v-if="contextMenu.show"
        class="fixed z-[100] bg-white rounded-2xl shadow-2xl border border-gray-100 py-2 min-w-[200px] animate-in fade-in zoom-in duration-100 backdrop-blur-xl bg-white/95"
        :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
    >
        <div class="px-4 py-2 mb-1 border-b border-gray-50">
            <div class="text-[10px] font-black text-gray-300 uppercase tracking-widest leading-none mb-1">Actions for</div>
            <div class="text-xs font-bold text-gray-900 truncate">{{ contextMenu.customer?.name }}</div>
        </div>
        <button @click="handleMenuAction('download')" class="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-blue-600 hover:text-white transition-colors group">
            <Download :size="14" class="text-blue-500 group-hover:text-white" /> Download Full History
        </button>
        <button @click="handleMenuAction('edit')" class="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-amber-500 hover:text-white transition-colors group">
            <Edit2 :size="14" class="text-amber-500 group-hover:text-white" /> Edit Student Data
        </button>
        <div class="h-px bg-gray-50 my-1"></div>
        <button @click="handleMenuAction('delete')" class="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-red-600 hover:bg-red-600 hover:text-white transition-colors group">
            <Trash2 :size="14" class="text-red-400 group-hover:text-white" /> Terminate Record
        </button>
    </div>

    <Teleport to="body">
        <div v-if="showBatchContainer" class="fixed top-0 left-0 w-px h-px opacity-0 overflow-hidden z-[-100]">
            <div id="customer-batch-print-area">
                <div v-for="receipt in batchReceipts" :key="receipt.id">
                    <div class="w-[297mm] h-[210mm] flex items-center justify-center bg-white">
                        <InvoicePrintLayout :receipt="receipt" />
                    </div>
                </div>
            </div>
        </div>
    </Teleport>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>
