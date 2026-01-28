<script setup lang="ts">
import { computed } from 'vue'
import { useBranchStore } from '../stores/branchStore'
import type { Receipt } from '../stores/receiptStore'
import { storeToRefs } from 'pinia'

// Props: accepts a receipt object and optional branch override for previewing settings
const props = defineProps<{
  receipt: Receipt | null
  branchOverride?: any // Allows previewing settings before saving
}>()

const branchStore = useBranchStore()
const { activeBranch } = storeToRefs(branchStore)

const grandTotal = computed(() => {
  if (!props.receipt) return 0
  const subtotalVal = props.receipt.items.reduce((sum, item) => sum + (item.amount * (item.quantity || 1)), 0)
  const discountVal = props.receipt.items.reduce((sum, item) => sum + (item.discount || 0), 0)
  return Math.max(0, subtotalVal - discountVal)
})

const paidAmount = computed(() => {
    if (!props.receipt) return 0
    return props.receipt.status === 'paid' ? grandTotal.value : 0
})

const balanceDue = computed(() => {
    if (!props.receipt) return 0
    return props.receipt.status === 'paid' ? 0 : grandTotal.value
})

function formatCurrency(amount: number) {
    return `RM ${amount.toFixed(2)}`
}

const formattedDate = computed(() => {
    if (!props.receipt) return ''
    const d = new Date(props.receipt.date)
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`
})

const displayBranch = computed(() => {
    // If override is provided (e.g. in config preview), use it primarily
    if (props.branchOverride) {
        return {
             name: props.branchOverride.companyName || 'Company Name',
             address: props.branchOverride.address || 'Address Line 1\nAddress Line 2',
             contactNumber: props.branchOverride.contactNumber || '+1234567890',
             email: props.branchOverride.email || 'email@example.com',
             logo: props.branchOverride.logo,
             logoPosition: props.branchOverride.logoPosition || 'left',
             logoOpacity: props.branchOverride.logoOpacity || 0.1
        }
    }

    // Normal behavior: Prioritize global settings to ensure all invoices update together
    const global = branchStore.globalSettings
    const branch = activeBranch.value
    
    return {
        name: global.companyName || branch?.name || 'Company Name',
        address: global.address || branch?.address || '',
        contactNumber: global.contactNumber || branch?.contactNumber || '',
        email: global.email || branch?.email || '',
        logo: global.logo || branch?.logo,
        logoPosition: global.logoPosition || 'watermark',
        logoOpacity: global.logoOpacity || 0.1
    }
})
</script>

<template>
  <div v-if="receipt" class="invoice-container mx-auto bg-white relative text-gray-900 hidden-on-empty font-sans flex flex-col">
     
     <!-- Simple Header (From Backup - Preserved Layout, Increased Fonts) -->
     <header class="flex justify-between items-start mb-2">
        <!-- Left: Company Info -->
        <div class="flex-grow">
             <h2 class="font-bold text-lg text-black uppercase leading-none mt-0 mb-1">
                {{ displayBranch?.name }}
             </h2>
             <div class="text-xs text-black leading-tight max-w-[400px]">
                <div class="mb-1 whitespace-pre-line">{{ displayBranch?.address }}</div>
                
                <div class="space-y-0.5">
                    <div v-if="displayBranch?.contactNumber" class="flex items-center gap-1">
                        <span class="w-10 flex-shrink-0 font-medium">Tel:</span>
                        <span>{{ displayBranch.contactNumber }}</span>
                    </div>
                    
                    <div v-if="displayBranch?.email" class="flex items-center gap-1">
                        <span class="w-10 flex-shrink-0 font-medium">Email:</span>
                        <span class="lowercase">{{ displayBranch.email }}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Right: Invoice Meta -->
        <div class="text-right flex flex-col items-end">
            <h1 class="text-4xl font-bold uppercase tracking-widest leading-none mt-0 mb-4 text-black">Invoice</h1>
            
            <div class="space-y-1">
                <div class="flex justify-end gap-3 items-baseline">
                    <span class="text-gray-500 font-medium text-xs w-20 text-right">Invoice No:</span>
                    <span class="font-bold font-mono text-black text-sm w-40 text-left">{{ receipt.receiptNumber }}</span>
                </div>
                
                <div class="flex justify-end gap-3 items-baseline">
                    <span class="text-gray-500 font-medium text-xs w-20 text-right">Date:</span>
                    <span class="text-black text-sm font-semibold w-40 text-left">{{ formattedDate }}</span>
                </div>
                
                <div v-if="receipt.paymentMethod" class="flex justify-end gap-3 items-baseline">
                    <span class="text-gray-500 font-medium text-xs w-20 text-right">Payment:</span>
                    <span class="text-black text-sm font-semibold w-40 text-left capitalize">{{ receipt.paymentMethod }}</span>
                </div>
            </div>
        </div>
     </header>

     <!-- Background Overlay (Middle of Page) (From Backup - Preserved) -->
     <div v-if="displayBranch?.logo" class="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
        <img 
            :src="displayBranch.logo" 
            :style="{ opacity: displayBranch.logoOpacity }" 
            class="max-w-[158mm] max-h-[109mm] w-auto h-auto object-contain" 
        />
     </div>

     <!-- UNPAID Stamp -->
     <div v-if="receipt.status === 'pending'" class="unpaid-stamp">
        UNPAID
     </div>

     <!-- Divider -->
     <div class="border-b-2 border-black mb-6"></div>

      <!-- Bill To (Refined Body - Larger Fonts) -->
      <div class="mb-4">
           <h3 class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Bill To:</h3>
           <div class="text-xl font-medium text-black">{{ receipt.receivedFrom }}</div>
           <div v-if="receipt.contact" class="text-sm text-gray-600 font-medium mt-1">{{ receipt.contact }}</div>
      </div>

     <!-- Items Table (Refined Body - Larger Fonts) -->
     <div class="flex-grow">
          <table class="w-full border-collapse">
              <thead>
                  <tr class="border-b-2 border-black text-sm font-bold uppercase tracking-wider text-black">
                      <th class="py-2 text-left w-[55%]">Description</th>
                      <th class="py-2 text-center w-[15%]">Qty</th>
                      <th class="py-2 text-center w-[15%]">Discount</th>
                      <th class="py-2 text-right w-[15%]">Amount</th>
                  </tr>
              </thead>
              <tbody class="text-sm">
                  <tr v-for="(item, idx) in receipt.items" :key="idx" class="border-b border-gray-100 last:border-0">
                      <td class="py-2 align-top">
                         <div class="font-medium text-black text-base">{{ item.description }}</div>
                         <div v-if="item.details" class="text-xs text-gray-500 italic mt-1 leading-relaxed whitespace-pre-line">
                             {{ item.details }}
                         </div>
                      </td>
                      <td class="py-2 text-center align-top text-base">{{ item.quantity || 1 }}</td>
                      <td class="py-2 text-center align-top text-base text-gray-600">
                          {{ item.discount ? formatCurrency(item.discount) : '-' }}
                      </td>
                      <td class="py-2 text-right font-medium align-top text-base tabular-nums">
                          {{ formatCurrency((item.amount * (item.quantity || 1)) - (item.discount || 0)) }}
                      </td>
                  </tr>
              </tbody>
          </table>
     </div>

     <!-- Footer Summary (Refined Body - Larger Fonts) -->
      <div class="flex justify-end mt-4 mb-2 totals-section totals">
           <div class="w-80">
             <div class="flex justify-between text-base font-bold text-gray-700 mb-2">
                 <span>Grand Total</span>
                 <span class="text-black">{{ formatCurrency(grandTotal) }}</span>
             </div>
             <div class="flex justify-between text-sm text-gray-500 mb-3">
                 <span>Total Paid</span>
                 <span>{{ formatCurrency(paidAmount) }}</span>
             </div>
             <!-- Robust border on a wrapper with padding to prevent PDF overlap -->
             <div class="border-t-2 border-black pt-3 mt-2">
                 <div class="flex justify-between font-bold text-black text-xl">
                     <span>Balance Due</span>
                     <span>{{ formatCurrency(balanceDue) }}</span>
                 </div>
             </div>
           </div>
      </div>

     <!-- Signatures -->

  </div>

   <!-- Empty State -->
  <div v-else class="flex flex-col items-center justify-center p-20 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50 invoice-container">
      <span class="text-lg">Invoice Preview</span>
      <span class="text-sm">Select an invoice to preview</span>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=JetBrains+Mono:wght@400;500;700&display=swap');

.invoice-container {
    width: 297mm;
    min-height: 210mm;
    padding: 12mm;
    box-sizing: border-box;
    background: white;
    position: relative;
    margin: 0 auto;
    font-family: 'Inter', sans-serif;
}

.unpaid-stamp {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-30deg);
    font-size: 80pt;
    font-weight: 900;
    color: rgba(220, 53, 69, 0.08);
    border: 12px solid rgba(220, 53, 69, 0.08);
    padding: 20px 50px;
    text-transform: uppercase;
    z-index: 10;
    pointer-events: none;
    user-select: none;
    white-space: nowrap;
}

.font-mono {
    font-family: 'JetBrains Mono', monospace;
}

table {
  width: 100%;
  border-collapse: collapse;
}

thead {
  display: table-header-group;
}

tfoot {
  display: table-footer-group;
}

tr {
  page-break-inside: avoid;
}

.totals {
  page-break-inside: avoid;
}

@page {
  size: A4 landscape;
  margin: 0;
}

/* Print Specifics */
@media print {
  body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
</style>
