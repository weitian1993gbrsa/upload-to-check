<script setup lang="ts">
import { ref, computed, watch, type ComponentPublicInstance, onMounted } from 'vue'
import { useBranchStore } from './stores/branchStore'
import { useReceiptStore, type Receipt } from './stores/receiptStore'
import { useCustomerStore } from './stores/customerStore'
import { useInventoryStore } from './stores/inventoryStore'
import { storeToRefs } from 'pinia'

import InvoiceForm from './components/InvoiceForm.vue'

import BranchSelection from './components/BranchSelection.vue'
import CustomerList from './components/CustomerList.vue'
import FullInvoiceView from './components/FullInvoiceView.vue'
import InvoiceHistory from './components/InvoiceHistory.vue'
import InventoryManager from './components/InventoryManager.vue'
import BackupManager from './components/BackupManager.vue'
import StudentPaymentMatrix from './components/StudentPaymentMatrix.vue'
import { Receipt as ReceiptIcon, Users, History, Package, Database, CheckSquare, LogOut, FileText } from 'lucide-vue-next'

const branchStore = useBranchStore()
const receiptStore = useReceiptStore()
const customerStore = useCustomerStore()
const inventoryStore = useInventoryStore()
const { activeBranchId, activeBranch } = storeToRefs(branchStore)


const currentBranchReceipts = computed(() => 
    receiptStore.receipts
        .filter(r => r.branchId === branchStore.activeBranchId)
        .sort((a, b) => b.createdAt - a.createdAt)
)

const currentBranchCustomers = computed(() => 
    customerStore.customers.filter(c => c.branchId === branchStore.activeBranchId)
)

const activeReceipt = ref<Receipt | null>(null)
const receiptFormRef = ref<ComponentPublicInstance | null>(null)
const showSelection = computed(() => !activeBranchId.value)

onMounted(() => {
    console.log("Initializing Local Stores...")
    branchStore.initListeners() 
    receiptStore.initReceiptsListener()
    customerStore.initCustomerListener()
    inventoryStore.initInventoryListener()
})

const activeTab = ref<'create' | 'customers' | 'full' | 'history' | 'inventory' | 'backup' | 'check'>('history')

function setActiveTab(tab: 'create' | 'customers' | 'full' | 'history' | 'inventory' | 'backup' | 'check') {
  activeTab.value = tab
}

async function handleReceiptSaved(receiptId: string) {
    const receipt = receiptStore.receipts.find(r => r.id === receiptId)
    if (receipt) {
        activeReceipt.value = receipt
        if ((window as any).invoiceApi) {
            setTimeout(async () => {
                await downloadPDF(true)
                activeTab.value = 'history'
            }, 100)
        } else {
            activeTab.value = 'history'
        }
    }
}

watch(activeBranchId, (newId: string) => {
    if (newId) {
        activeTab.value = 'history'
    }
})

async function downloadPDF(silent = false) {
    if (!activeReceipt.value) return

    if (!activeBranch.value?.pdfFolderPath) {
        if (!silent) alert('Please set the PDF Folder for this branch first.')
        return
    }
    
    const element = document.querySelector('.invoice-container')
    if (!element) {
        if (!silent) alert('Could not find receipt content.')
        return
    }

    try {
        const invoiceApi = (window as any).invoiceApi;
        if (invoiceApi) {
            const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
                .map(s => s.outerHTML)
                .join('\n')
            
            const fullHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    ${styles}
                    <style>body { margin: 0; padding: 0; background: white; }</style>
                </head>
                <body>
                    ${element.outerHTML}
                </body>
                </html>
            `

            const pdfBuffer = await invoiceApi.generatePdf(fullHtml)
            const filename = `Invoice_${activeReceipt.value.receiptNumber}.pdf`

            const result = await invoiceApi.savePdf({
              filename: filename,
              studentName: activeReceipt.value.receivedFrom,
              siblingNames: [],
              pdfBuffer,
              customPath: activeBranch.value?.pdfFolderPath
            })
            
            if (result.success && !silent) alert(`Saved to ${result.path}`)
        }
    } catch (error) {
        console.error('PDF Generation failed:', error)
    }
}

function handleEditReceipt(receipt: Receipt) {
    activeTab.value = 'create'
    setTimeout(() => {
        if (receiptFormRef.value && 'loadReceipt' in receiptFormRef.value) {
            (receiptFormRef.value as any).loadReceipt(receipt)
        }
    }, 50)
}
</script>

<template>
  <BranchSelection v-if="showSelection" />
  
  <div v-else class="h-screen w-full bg-white flex flex-col overflow-hidden text-gray-900 box-border">
    
    <header class="flex justify-between items-center px-6 py-4 border-b bg-white z-10 shrink-0">
        <div class="flex items-center gap-4">
            <h1 class="text-xl font-bold text-gray-800">Invoice System</h1>
            <div class="flex items-center gap-2">
                <span class="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                    {{ activeBranch?.name }}
                </span>
                <button 
                    @click="branchStore.setActiveBranch('')"
                    class="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                    title="Switch Profile"
                >
                    <LogOut :size="16" />
                </button>
            </div>
        </div>
    </header>

    <div class="px-6 border-b border-gray-200 bg-gray-50/50 shrink-0">
          <nav class="flex -mb-px space-x-1" aria-label="Tabs">
             <button 
              @click="setActiveTab('history')"
              :class="['px-4 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors', activeTab === 'history' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700']"
            >
              <History :size="18" /> Sales
            </button>
            <button 
              @click="setActiveTab('create')"
              :class="['px-4 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors', activeTab === 'create' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700']"
            >
              <ReceiptIcon :size="18" /> Create
            </button>
            <button 
              @click="setActiveTab('customers')"
              :class="['px-4 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors', activeTab === 'customers' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700']"
            >
              <Users :size="18" /> Customers
            </button>
            <button 
              @click="setActiveTab('full')"
              :class="['px-4 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors', activeTab === 'full' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700']"
            >
              <FileText :size="18" /> Full View
            </button>
            <button 
              v-if="activeBranch?.category === 'School'"
              @click="setActiveTab('check')"
              :class="['px-4 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors', activeTab === 'check' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700']"
            >
              <CheckSquare :size="18" /> Check
            </button>
            <button 
              @click="setActiveTab('inventory')"
              :class="['px-4 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors', activeTab === 'inventory' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700']"
            >
              <Package :size="18" /> Inventory
            </button>
            <button 
              @click="setActiveTab('backup')"
              :class="['px-4 py-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors', activeTab === 'backup' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700']"
            >
              <Database :size="18" /> Backup
            </button>
          </nav>
      </div>

      <main class="flex-grow overflow-hidden relative flex flex-col bg-gray-50">
          
          <div v-if="activeTab === 'create'" class="h-full overflow-y-auto p-6">
            <InvoiceForm 
                ref="receiptFormRef" 
                :onSaved="handleReceiptSaved" 
                @update:activeReceipt="(r: Receipt) => activeReceipt = r"
                @download="downloadPDF"
            />
          </div>

          <div v-else-if="activeTab === 'customers'" class="h-full flex flex-col p-6 overflow-hidden">
              <CustomerList @edit="handleEditReceipt" />
          </div>

          <div v-else-if="activeTab === 'full'" class="h-full flex flex-col p-6 overflow-hidden">
              <FullInvoiceView @edit="handleEditReceipt" />
          </div>

          <div v-else-if="activeTab === 'check'" class="h-full overflow-y-auto p-6">
               <StudentPaymentMatrix 
                 :receipts="currentBranchReceipts" 
                 :customers="currentBranchCustomers"
                 @view-receipt="r => handleEditReceipt(r)" 
               />
           </div>

          <div v-else-if="activeTab === 'inventory'" class="h-full overflow-y-auto p-6">
              <InventoryManager />
          </div>

          <div v-else-if="activeTab === 'history'" class="h-full overflow-y-auto p-6">
              <InvoiceHistory @edit="handleEditReceipt" />
          </div>

          <div v-else-if="activeTab === 'backup'" class="h-full overflow-y-auto p-6">
              <BackupManager />
          </div>
      </main>
  </div>
</template>

<style>
/* Previous print styles removed as print functionality was disabled */
</style>
