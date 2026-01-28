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
  <div v-if="receipt" class="a5-landscape mx-auto bg-white relative text-black hidden-on-empty font-sans p-4 box-border flex flex-col pt-8">
     <!-- Simple Header -->
     <header class="flex justify-between items-start mb-2">
        <!-- Left: Company Info -->
        <div class="flex-grow">
             <h2 class="font-bold text-[12px] text-black uppercase leading-none mt-0 mb-1">
                {{ displayBranch?.name }}
             </h2>
             <div class="text-[9px] text-black leading-tight max-w-[320px]">
                <div class="mb-1 whitespace-pre-line">{{ displayBranch?.address }}</div>
                
                <div class="space-y-0.5">
                    <div v-if="displayBranch?.contactNumber" class="flex items-center gap-1">
                        <span class="w-8 flex-shrink-0 font-medium">Tel:</span>
                        <span>{{ displayBranch.contactNumber }}</span>
                    </div>
                    
                    <div v-if="displayBranch?.email" class="flex items-center gap-1">
                        <span class="w-8 flex-shrink-0 font-medium">Email:</span>
                        <span class="lowercase">{{ displayBranch.email }}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Right: Invoice Meta -->
        <div class="text-right flex flex-col items-end">
            <h1 class="text-2xl font-bold uppercase tracking-widest leading-none mt-0 mb-4 text-black">Invoice</h1>
            
            <div class="space-y-1">
                <div class="flex justify-end gap-3 items-baseline">
                    <span class="text-gray-500 font-medium text-[9px] w-16 text-right">Invoice No:</span>
                    <span class="font-bold font-mono text-black text-[11px] w-32 text-left">{{ receipt.receiptNumber }}</span>
                </div>
                
                <div class="flex justify-end gap-3 items-baseline">
                    <span class="text-gray-500 font-medium text-[9px] w-16 text-right">Date:</span>
                    <span class="text-black text-[10px] font-semibold w-32 text-left">{{ formattedDate }}</span>
                </div>
                
                <div v-if="receipt.paymentMethod" class="flex justify-end gap-3 items-baseline">
                    <span class="text-gray-500 font-medium text-[9px] w-16 text-right">Payment:</span>
                    <span class="text-black text-[10px] font-semibold w-32 text-left capitalize">{{ receipt.paymentMethod }}</span>
                </div>
            </div>
        </div>
     </header>

     <!-- Background Overlay (Middle of Page) -->
     <div v-if="displayBranch?.logo" class="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
        <img 
            :src="displayBranch.logo" 
            :style="{ opacity: displayBranch.logoOpacity }" 
            class="max-w-[60%] max-h-[60%] w-auto h-auto object-contain" 
        />
     </div>

     <!-- Divider -->
     <div class="border-b border-black mb-2"></div>

      <div class="mb-4">
           <h3 class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Bill To:</h3>
           <div class="text-sm font-extrabold text-black">{{ receipt.receivedFrom }}</div>
           <div v-if="receipt.contact" class="text-[10px] text-gray-600 font-medium">{{ receipt.contact }}</div>
      </div>

     <!-- Items Table -->
     <div class="flex-grow">
          <table class="w-full border-collapse">
              <thead>
                  <tr class="border-b border-black text-[10px] font-bold uppercase tracking-wider text-black">
                      <th class="py-1.5 text-left w-2/3">Description</th>
                      <th class="py-1.5 text-center px-1">Qty</th>
                      <th class="py-1.5 text-center px-1">Discount</th>
                      <th class="py-1.5 text-right">Amount</th>
                  </tr>
              </thead>
              <tbody class="text-xs">
                  <tr v-for="(item, idx) in receipt.items" :key="idx" class="">
                      <td class="py-1 align-top">
                         <div class="font-medium text-black text-[11px]">{{ item.description }}</div>
                         <div v-if="item.details" class="text-[9px] text-gray-400 italic mt-0 leading-tight">
                             {{ item.details }}
                         </div>
                      </td>
                      <td class="py-1 text-center align-top text-[11px]">{{ item.quantity || 1 }}</td>
                      <td class="py-1 text-center align-top text-[11px] text-gray-600">
                          {{ item.discount ? formatCurrency(item.discount) : '-' }}
                      </td>
                      <td class="py-1 text-right font-medium align-top text-[11px]">
                          {{ formatCurrency((item.amount * (item.quantity || 1)) - (item.discount || 0)) }}
                      </td>
                  </tr>
              </tbody>
          </table>
     </div>

     <!-- Footer Summary -->
      <div class="flex justify-end mt-2 mb-1">
           <div class="w-52">
             <div class="flex justify-between text-[11px] font-bold text-black mb-1.5">
                 <span>Grand Total</span>
                 <span>{{ formatCurrency(grandTotal) }}</span>
             </div>
             <div class="flex justify-between text-[10px] text-gray-500 mb-2">
                 <span>Total Paid</span>
                 <span>{{ formatCurrency(paidAmount) }}</span>
             </div>
             <!-- Robust border on a wrapper with padding to prevent PDF overlap -->
             <div class="border-t border-black pt-2 mt-1">
                 <div class="flex justify-between font-bold text-gray-900 text-[11px]">
                     <span>Balance Due</span>
                     <span>{{ formatCurrency(balanceDue) }}</span>
                 </div>
             </div>
           </div>
      </div>

     <!-- Signatures -->

  </div>

   <!-- Empty State -->
  <div v-else class="flex flex-col items-center justify-center p-20 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50 h-[148mm]">
      <span class="text-lg">Invoice Preview</span>
      <span class="text-sm">Create an invoice to preview it here</span>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

.a5-landscape {
    width: 210mm;
    height: 144.5mm; /* Aggressive buffer (3.5mm) to prevent overflow on A5 */
    max-height: 144.5mm;
    overflow: hidden;
    font-family: 'Inter', sans-serif;
    box-sizing: border-box;
    background: white;
}

.font-mono {
    font-family: 'JetBrains Mono', monospace;
}

@media print {
  @page {
    size: landscape;
    margin: 0;
  }
  
  .a5-landscape {
    box-shadow: none !important;
    margin: 0;
    width: 210mm;
    height: 144.5mm;
    border: none !important;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
}
</style>
