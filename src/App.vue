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
// If no branch is active (or we define a "null" state), show selection.
const showSelection = computed(() => !activeBranchId.value)

onMounted(() => {
    // Initialize Local Stores (No Auth Required)
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
        
        // Short delay to ensure UI updates before PDF generation
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

// Reset tab to Sales whenever a profile is selected/switched
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
    
    // Target the visible invoice container instead of a hidden one
    const element = document.querySelector('.invoice-container')
    if (!element) {
        if (!silent) alert('Could not find receipt content.')
        return
    }

    try {
        const invoiceApi = (window as any).invoiceApi;
        if (invoiceApi) {
            // Grab current styles to ensure fonts (Inter/JetBrains) carry over to the PDF
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
    // Give Vue time to mount the create tab if it wasn't active
    setTimeout(() => {
        if (receiptFormRef.value && 'loadReceipt' in receiptFormRef.value) {
            (receiptFormRef.value as any).loadReceipt(receipt)
        }
    }, 50)

}
</script>

<template>
  <BranchSelection v-if="showSelection" />
  
  <div v-else class="h-screen overflow-hidden bg-gray-100 p-4 printable-container-parent">
    <div class="w-full mx-auto bg-white shadow-lg rounded-lg h-full flex flex-col printable-container-parent px-6">
      <!-- Header -->
      <header class="flex justify-between items-center p-6 border-b no-print pointer-events-auto">
        <div class="flex items-center gap-4">
            <h1 class="text-2xl font-bold text-gray-800">Invoice System</h1>
            <div class="flex items-center gap-2">
                <span class="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium flex items-center gap-2">
                    {{ activeBranch?.name }}
                </span>
                <button 
                    @click="branchStore.setActiveBranch('')"
                    class="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors no-print"
                    title="Switch Profile"
                >
                    <LogOut :size="16" />
                </button>
            </div>
        </div>
      </header>

      <!-- Navigation Tabs -->
      <div class="px-6 border-b border-gray-200 no-print">
          <nav class="flex -mb-px space-x-2" aria-label="Tabs">
             <button 
              @click="setActiveTab('history')"
              :class="['px-4 py-2 text-sm font-medium rounded-t-lg flex items-center gap-2 border-t border-x border-b', activeTab === 'history' ? 'border-gray-200 border-b-white bg-white text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300']"
            >
              <History :size="18" />
              Sales
            </button>
            <button 
              @click="setActiveTab('create')"
              :class="['px-4 py-2 text-sm font-medium rounded-t-lg flex items-center gap-2 border-t border-x border-b', activeTab === 'create' ? 'border-gray-200 border-b-white bg-white text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300']"
            >
              <ReceiptIcon :size="18" />
              Create Invoice
            </button>
            <button 
              @click="setActiveTab('customers')"
              :class="['px-4 py-2 text-sm font-medium rounded-t-lg flex items-center gap-2 border-t border-x border-b', activeTab === 'customers' ? 'border-gray-200 border-b-white bg-white text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300']"
            >
              <Users :size="18" />
              Customers
            </button>
            <button 
              @click="setActiveTab('full')"
              :class="['px-4 py-2 text-sm font-medium rounded-t-lg flex items-center gap-2 border-t border-x border-b', activeTab === 'full' ? 'border-gray-200 border-b-white bg-white text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300']"
            >
              <FileText :size="18" />
              Full Invoice
            </button>
             <button 
              v-if="activeBranch?.category === 'School'"
              @click="setActiveTab('check')"
              :class="['px-4 py-2 text-sm font-medium rounded-t-lg flex items-center gap-2 border-t border-x border-b', activeTab === 'check' ? 'border-gray-200 border-b-white bg-white text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300']"
            >
              <CheckSquare :size="18" />
              Check
            </button>
             <button 
              @click="setActiveTab('inventory')"
              :class="['px-4 py-2 text-sm font-medium rounded-t-lg flex items-center gap-2 border-t border-x border-b', activeTab === 'inventory' ? 'border-gray-200 border-b-white bg-white text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300']"
            >
              <Package :size="18" />
              Inventory
            </button>
             <button 
              @click="setActiveTab('backup')"
              :class="['px-4 py-2 text-sm font-medium rounded-t-lg flex items-center gap-2 border-t border-x border-b', activeTab === 'backup' ? 'border-gray-200 border-b-white bg-white text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300']"
            >
              <Database :size="18" />
              Backup
            </button>
          </nav>
      </div>

      <!-- Main Content -->
      <main class="flex-grow p-6 printable-container-parent">
          <!-- Tab Content -->
          <div v-if="activeTab === 'create'" class="printable-container-parent">
            <div class="no-print">
                <InvoiceForm 
                  ref="receiptFormRef" 
                  :onSaved="handleReceiptSaved" 
                  @update:activeReceipt="(r: Receipt) => activeReceipt = r"
                  @download="downloadPDF"
                />
            </div>
          </div>

          <!-- Customers View -->
          <div v-else-if="activeTab === 'customers'">
              <CustomerList @edit="handleEditReceipt" />
          </div>

          <!-- Full Invoice View -->
          <div v-else-if="activeTab === 'full'">
              <FullInvoiceView @edit="handleEditReceipt" />
          </div>

          <!-- Check View (Schools Only) -->
          <div v-else-if="activeTab === 'check'">
               <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 flex items-start gap-3">
                 <CheckSquare class="text-blue-600 mt-0.5" :size="20" />
                 <div>
                     <h4 class="font-bold text-blue-800 text-sm">Monthly Payment Matrix</h4>
                     <p class="text-blue-600 text-xs mt-1">
                         Track student payments for each month. Green checks indicate paid invoices.
                     </p>
                 </div>
            </div>

               <StudentPaymentMatrix 
                 :receipts="currentBranchReceipts" 
                 :customers="currentBranchCustomers"
                 @view-receipt="r => handleEditReceipt(r)" 
               />
           </div>


          <!-- Inventory View -->
          <div v-else-if="activeTab === 'inventory'">
              <InventoryManager />
          </div>

          <!-- History View -->
          <div v-else-if="activeTab === 'history'" class="printable-container-parent">
              <InvoiceHistory @edit="handleEditReceipt" />
          </div>

          <!-- Backup & Restore View -->
          <div v-else-if="activeTab === 'backup'">
              <BackupManager />
          </div>
      </main>


    </div>
  </div>
</template>

<style>
/* Previous print styles removed as print functionality was disabled */
</style>
