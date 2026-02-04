<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { Plus, Trash2, Save, Users, GripVertical } from 'lucide-vue-next'
import { useReceiptStore, type ReceiptItem, type Receipt } from '../stores/receiptStore'
import { useBranchStore } from '../stores/branchStore'
import { useCustomerStore } from '../stores/customerStore'
import { useInventoryStore, type InventoryItem } from '../stores/inventoryStore'
import { storeToRefs } from 'pinia'
import { format } from 'date-fns'

const props = defineProps<{
  onSaved?: (receiptId: string) => void
}>()

const emit = defineEmits<{
  (e: 'update:activeReceipt', receipt: Receipt): void
  (e: 'download'): void
}>()

const receiptStore = useReceiptStore()
const branchStore = useBranchStore()
const customerStore = useCustomerStore()
const { activeBranch } = storeToRefs(branchStore)
// REMOVED: const { currentBranchCustomers } = storeToRefs(customerStore) - now computing locally

const currentBranchCustomers = computed(() => 
    customerStore.customers.filter(c => c.branchId === branchStore.activeBranchId)
)

// 1. Create a sorted version of the branch customers
// This only recalculates when the customer list changes, NOT when you type.
const sortedBranchCustomers = computed(() => {
    return [...currentBranchCustomers.value].sort((a, b) => a.name.localeCompare(b.name))
})

const form = ref({
  date: format(new Date(), 'yyyy-MM-dd'),
  receivedFrom: '',
  contact: '',
  paymentMethod: 'Cash', 
  status: 'paid' as 'paid' | 'pending',
  items: [
    { id: crypto.randomUUID(), description: '', details: '', amount: 0, discount: 0, quantity: 1 }
  ] as (ReceiptItem & { id: string })[]
})

const editingId = ref<string | null>(null)
const overriddenReceiptNumber = ref('')

// Optimization logic
const debouncedCustomerQuery = ref('')
const debouncedInventoryQuery = ref('')

// Watch for changes in customer input and debounce the search query update
// Watch for changes in customer input and debounce the search query update
// REMOVED: Watcher caused recursive updates and lag. Now handled in handleReceivedFromInput.

const debounceCustomerSearch = useDebounceFn((newVal: string) => {
    debouncedCustomerQuery.value = newVal
}, 300)

// Auto-complete logic for Received From
const showSuggestions = ref(false)
const filteredCustomers = computed(() => {
    if (!debouncedCustomerQuery.value) return []
    const query = debouncedCustomerQuery.value.toLowerCase()
    
    // Optimization: If query is empty, don't return anything (already handled above)
    
    return sortedBranchCustomers.value
        .filter(c => c.name.toLowerCase().includes(query))
        .slice(0, 5)
})

function selectCustomer(customer: any) {
    // 1. Update values
    form.value.receivedFrom = customer.name
    form.value.contact = customer.contact || ''
    
    // Update the debounced query immediately to hide dropdown if needed or keep it in sync
    debouncedCustomerQuery.value = customer.name
    
    // 2. FORCE close the suggestions immediately
    showSuggestions.value = false
}

const inventoryStore = useInventoryStore()
const { items: inventoryItems } = storeToRefs(inventoryStore)
const activeItemIndex = ref<number | null>(null)

// 1. Pre-sort inventory items for the active branch
const sortedInventoryItems = computed(() => {
    const activeBranchId = branchStore.activeBranchId
    return inventoryItems.value
        .filter(i => i.branchId === activeBranchId)
        .sort((a, b) => a.name.localeCompare(b.name))
})

// Watch for changes in the ACTIVE item's description
watch(() => {
    if (activeItemIndex.value === null) return ''
    const item = form.value.items[activeItemIndex.value]
    return item ? item.description : ''
}, (newVal) => {
    debounceInventorySearch(newVal)
})

const debounceInventorySearch = useDebounceFn((newVal: string) => {
    debouncedInventoryQuery.value = newVal
}, 300)

const filteredInventory = computed(() => {
    if (activeItemIndex.value === null) return []
    // Use the DEBOUNCED query instead of the direct input
    const currentInput = debouncedInventoryQuery.value.toLowerCase()
    if (!currentInput) return []
    
    // Use the pre-sorted list
    return sortedInventoryItems.value
        .filter(i => 
            i.name.toLowerCase().includes(currentInput) || 
            (i.description && i.description.toLowerCase().includes(currentInput))
        )
        .slice(0, 5)
})

function selectInventoryItem(item: InventoryItem, index: number) {
    const formItem = form.value.items[index]
    if (formItem) {
        formItem.description = item.name
        formItem.details = item.description || ''
        formItem.amount = item.price
        formItem.quantity = 1
    }
    // Update query to match selection so it doesn't pop up again weirdly
    debouncedInventoryQuery.value = item.name
    
    // FORCE close the suggestions
    activeItemIndex.value = null
}

function handleReceivedFromInput(event: Event) {
    const target = event.target as HTMLInputElement
    // Apply Uppercase Mask
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const uppercased = target.value.toUpperCase()
    
    // Only update if changed to avoid unnecessary cycles
    if (form.value.receivedFrom !== uppercased) {
        form.value.receivedFrom = uppercased
        
        // Restore cursor position if needed (Vue v-model usually handles this but manual update might jump)
        // With simple uppercase, length is preserved, so usually safe.
        // We force the input value to match immediately to prevent visual glitch
        target.value = uppercased
        if (start !== null && end !== null) {
            target.setSelectionRange(start, end);
        }
    }

    debounceCustomerSearch(uppercased)
}

const isCustomerModalOpen = ref(false)
const customerSearch = ref('')

const modalFilteredCustomers = computed(() => {
    const q = customerSearch.value.toLowerCase()
    // Use the pre-sorted list!
    return sortedBranchCustomers.value
        .filter(c => 
            c.name.toLowerCase().includes(q) || 
            (c.contact && c.contact.toLowerCase().includes(q))
        )
})

function selectCustomerFromModal(customer: any) {
    form.value.receivedFrom = customer.name
    form.value.contact = customer.contact || ''
    debouncedCustomerQuery.value = customer.name // Sync
    isCustomerModalOpen.value = false
    customerSearch.value = ''
}

const isSelectionModalOpen = ref(false)
const inventorySearch = ref('')
const selectedInventoryIds = ref(new Set<string>())

const modalFilteredInventory = computed(() => {
    const q = inventorySearch.value.toLowerCase()
    const activeBranchId = branchStore.activeBranchId
    
    return inventoryItems.value.filter(i => {
        // Strict Branch Filter
        return i.branchId === activeBranchId && (
            i.name.toLowerCase().includes(q) || 
            (i.description && i.description.toLowerCase().includes(q))
        )
    })
})

function toggleSelection(item: InventoryItem) {
    if (selectedInventoryIds.value.has(item.id)) {
        selectedInventoryIds.value.delete(item.id)
    } else {
        selectedInventoryIds.value.add(item.id)
    }
}

function addSelectedItems() {
    const selectedItems = inventoryItems.value.filter(i => selectedInventoryIds.value.has(i.id))
    
    // Remove default empty row if it's the only one and untouched
    const currentItems = form.value.items
    if (currentItems.length === 1) {
        const first = currentItems[0]
        if (first && first.description === '' && first.amount === 0) {
            form.value.items = []
        }
    }

    selectedItems.forEach(item => {
        form.value.items.push({
            id: crypto.randomUUID(),
            description: item.name,
            details: item.description || '', 
            amount: item.price,
            quantity: 1,
            discount: 0
        })
    })

    // Reset selection
    selectedInventoryIds.value.clear()
    inventorySearch.value = ''
    isSelectionModalOpen.value = false
}

function handleBlur() {
    setTimeout(() => {
        showSuggestions.value = false
        activeItemIndex.value = null
    }, 200)
}

// Drag and Drop Logic for Items
const draggedItemIndex = ref<number | null>(null)

function onDragStart(event: DragEvent, index: number) {
    draggedItemIndex.value = index
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move'
    }
}

function onDrop(_event: DragEvent, dropIndex: number) {
    if (draggedItemIndex.value === null) return
    const draggedIndex = draggedItemIndex.value
    
    // Move item in form
    const itemToMove = form.value.items[draggedIndex]
    if (itemToMove) {
        form.value.items.splice(draggedIndex, 1)
        form.value.items.splice(dropIndex, 0, itemToMove)
    }

    draggedItemIndex.value = null
}

// ... rest of logic
const paymentMethods = ['Cash', 'Bank Transfer', 'Cheque', 'Credit Card', 'PayNow/QR']

const subtotal = computed(() => {
  return form.value.items.reduce((sum, item) => sum + ((Number(item.amount) || 0) * (Number(item.quantity) || 1)), 0)
})

const totalDiscount = computed(() => {
  return form.value.items.reduce((sum, item) => sum + (Number(item.discount) || 0), 0)
})

const totalAmount = computed(() => {
  return Math.max(0, subtotal.value - totalDiscount.value)
})

const receiptNumber = computed(() => {
  if (overriddenReceiptNumber.value) return overriddenReceiptNumber.value
  const prefix = activeBranch.value?.receiptPrefix || 'REC'
  return receiptStore.generateReceiptNumber(prefix, form.value.date, branchStore.activeBranchId || '')
})

// Optimization: Construct draft receipt only when emitting, and debounce it
const emitDraftReceipt = useDebounceFn(() => {
    const receipt: Receipt = {
        id: 'draft',
        branchId: branchStore.activeBranchId || '',
        receiptNumber: receiptNumber.value,
        date: form.value.date,
        receivedFrom: form.value.receivedFrom || 'Client Name',
        contact: form.value.contact,
        items: form.value.items.map(i => ({
            ...i, 
            amount: Number(i.amount) || 0,
            discount: Number(i.discount) || 0,
            quantity: Number(i.quantity) || 1
        })),
        paymentMethod: form.value.paymentMethod,
        receivedBy: 'Admin', // Static for draft
        status: form.value.status,
        createdAt: Date.now()
    }
    emit('update:activeReceipt', receipt)
}, 300)

// Watch dependencies that should trigger a draft update
watch(
    [() => form.value, () => activeBranch.value, () => receiptNumber.value],
    () => {
        emitDraftReceipt()
    },
    { deep: true, immediate: true }
)


function addItem() {
  form.value.items.push({ id: crypto.randomUUID(), description: '', details: '', amount: 0, discount: 0, quantity: 1 })
}

function removeItem(index: number) {
  if (form.value.items.length > 1) {
    form.value.items.splice(index, 1)
  }
}

async function saveReceipt() {
  if (!form.value.receivedFrom) {
    alert('Please enter "Received From" (Customer Name)')
    return
  }

  let savedReceipt: any;
  if (editingId.value) {
    savedReceipt = receiptStore.updateReceipt(editingId.value, {
      receiptNumber: receiptNumber.value,
      date: form.value.date,
      receivedFrom: form.value.receivedFrom,
      contact: form.value.contact,
      items: form.value.items.map(i => ({
          ...i, 
          amount: Number(i.amount),
          discount: Number(i.discount) || 0,
          quantity: Number(i.quantity) || 1
      })),
      paymentMethod: form.value.paymentMethod,
      status: form.value.status
    })
  } else {
    // Add new
    if (!branchStore.activeBranchId) {
        alert("Error: No active branch selected.")
        return
    }

    savedReceipt = receiptStore.addReceipt({
      receiptNumber: receiptNumber.value,
      date: form.value.date,
      receivedFrom: form.value.receivedFrom,
      contact: form.value.contact,
      items: form.value.items.map(i => ({
          ...i, 
          amount: Number(i.amount),
          discount: Number(i.discount) || 0,
          quantity: Number(i.quantity) || 1
      })),
      paymentMethod: form.value.paymentMethod,
      status: form.value.status
    } as any, branchStore.activeBranchId)
  }

  const isUpdate = !!editingId.value
  
  // Reset core fields
  form.value.receivedFrom = ''
  form.value.contact = ''
  form.value.status = 'paid'
  form.value.items = [{ id: crypto.randomUUID(), description: '', details: '', amount: 0, discount: 0, quantity: 1 }]
  editingId.value = null
  overriddenReceiptNumber.value = ''
  
  if (props.onSaved && savedReceipt) {
    alert(isUpdate ? 'Invoice updated successfully!' : 'Invoice generated successfully!')
    props.onSaved(savedReceipt.id)
  }
}



function loadReceipt(receipt: Receipt) {
    editingId.value = receipt.id
    form.value.date = receipt.date
    form.value.receivedFrom = receipt.receivedFrom
    form.value.contact = receipt.contact || ''
    form.value.items = receipt.items.map(i => ({...i, id: (i as any).id || crypto.randomUUID(), discount: i.discount || 0, quantity: i.quantity || 1}))
    form.value.paymentMethod = receipt.paymentMethod
    form.value.status = receipt.status || 'paid'
    overriddenReceiptNumber.value = receipt.receiptNumber
}

function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
        if (isCustomerModalOpen.value) {
            isCustomerModalOpen.value = false
        } else if (isSelectionModalOpen.value) {
            isSelectionModalOpen.value = false
        }
    }
}

onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
})

defineExpose({
    loadReceipt
})
</script>

<template>
  <div class="receipt-form-wrapper">
    <div class="w-full mx-auto h-full">
    <!-- Left Column: Input Form -->
    <div class="space-y-6">
        <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
             <div class="flex justify-between items-center mb-6">
                <div>
                    <div class="flex items-center gap-3">
                        <h2 class="text-xl font-bold text-gray-800">{{ editingId ? 'Edit Invoice' : 'New Invoice' }}</h2>
                        <span v-if="!editingId" class="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-mono font-bold rounded border border-blue-100">
                            {{ receiptNumber }}
                        </span>
                        <span v-else class="px-2 py-0.5 bg-amber-50 text-amber-700 text-xs font-mono font-bold rounded border border-amber-100">
                            {{ overriddenReceiptNumber }}
                        </span>
                    </div>
                    <p class="text-sm text-gray-500">Fill in the details below.</p>
                </div>

                <!-- NEW: Total display at top -->
                <div class="text-right bg-blue-50 px-4 py-2 rounded-2xl border border-blue-100 flex flex-col items-end">
                    <span class="text-[10px] font-black text-blue-400 uppercase tracking-widest">Total Amount</span>
                    <span class="text-2xl font-black text-blue-700 leading-tight">RM {{ totalAmount.toFixed(2) }}</span>
                    <div v-if="totalDiscount > 0" class="text-[9px] font-bold text-gray-400 uppercase">
                        Disc: -RM {{ totalDiscount.toFixed(2) }}
                    </div>
                </div>
             </div>

            <!-- Date -->
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input v-model="form.date" type="date" class="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2 border" />
            </div>

            <!-- Customer & Contact -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div class="relative">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Received From (Payer)</label>
                    <div class="flex gap-2">
                        <div class="relative flex-grow">
                            <input 
                                :value="form.receivedFrom"
                                @input="handleReceivedFromInput"
                                type="text" 
                                placeholder="Search or enter name..." 
                                class="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2 border"
                                @focus="showSuggestions = true"
                                @blur="handleBlur"
                            />
                            <!-- Autocomplete Dropdown -->
                            <div v-if="showSuggestions && filteredCustomers.length > 0" class="absolute z-10 w-full bg-white shadow-lg border border-gray-200 rounded-md mt-1 max-h-40 overflow-auto">
                                <div 
                                    v-for="customer in filteredCustomers" 
                                    :key="customer.id" 
                                    class="p-2 hover:bg-blue-50 cursor-pointer text-sm text-gray-800"
                                    @click="selectCustomer(customer)"
                                >
                                    {{ customer.name }}
                                </div>
                            </div>
                        </div>
                        <button 
                            type="button"
                            @click="isCustomerModalOpen = true" 
                            class="px-4 py-2 bg-gray-50 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors flex items-center gap-2 whitespace-nowrap"
                        >
                            <Users :size="18" />
                        </button>
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Contact / Phone (One-off)</label>
                    <input 
                        v-model="form.contact" 
                        type="text" 
                        placeholder="Optional contact info..." 
                        class="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2 border"
                    />
                </div>
            </div>

            <!-- Payment & Status -->
            <div class="grid grid-cols-2 gap-4 mb-6">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                    <select v-model="form.paymentMethod" class="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2 border">
                        <option v-for="method in paymentMethods" :key="method" :value="method">{{ method }}</option>
                    </select>
                </div>
                <div>
                     <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
                     <button 
                        @click="form.status = form.status === 'paid' ? 'pending' : 'paid'"
                        :class="form.status === 'paid' ? 'bg-green-100 text-green-800 border-green-200' : 'bg-yellow-100 text-yellow-800 border-yellow-200'"
                        class="w-full py-2 rounded-md border font-medium uppercase text-sm transition-colors"
                    >
                        {{ form.status }}
                    </button>
                </div>
            </div>
            
            <hr class="border-gray-100 my-6" />

            <!-- Items -->
            <div class="mb-4">
               <div class="flex justify-between items-center mb-3">
                   <label class="block text-sm font-medium text-gray-700">Line Items</label>
                   <div class="flex gap-2">
                        <button @click="addItem" class="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center bg-blue-50 px-2 py-1 rounded">
                            <Plus :size="14" class="mr-1" /> Add Manual
                        </button>
                        <button @click="isSelectionModalOpen = true" class="text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center bg-purple-50 px-2 py-1 rounded">
                            <Plus :size="14" class="mr-1" /> From Inventory
                        </button>
                   </div>
               </div>

              <div 
                v-for="(item, index) in form.items" 
                :key="item.id" 
                class="bg-gray-50 rounded-lg p-3 mb-3 border border-gray-200 group relative"
                draggable="true"
                @dragstart="onDragStart($event, index)"
                @dragover.prevent
                @drop="onDrop($event, index)"
                :class="{'opacity-50': draggedItemIndex === index}"
              >
                 <!-- Drag Handle -->
                 <div class="absolute left-1 top-1/2 -translate-y-1/2 text-gray-300 group-hover:text-gray-400 cursor-move py-2">
                    <GripVertical :size="16" />
                </div>

                <div class="pl-5">
                    <div class="mb-2 relative">
                         <input 
                            v-model="item.description" 
                            type="text" 
                            placeholder="Description" 
                            class="w-full border-gray-300 rounded shadow-sm focus:ring-blue-500 focus:border-blue-500 p-1.5 border text-sm font-medium"
                            @focus="activeItemIndex = index"
                            @blur="handleBlur"
                        />
                        <!-- Inventory Suggestions -->
                        <div v-if="activeItemIndex === index && filteredInventory.length > 0" class="absolute z-20 w-full bg-white shadow-xl border border-gray-200 rounded-md mt-1 max-h-40 overflow-auto">
                            <div 
                                v-for="inv in filteredInventory" 
                                :key="inv.id" 
                                class="p-2 hover:bg-blue-50 cursor-pointer text-sm text-gray-800 border-b last:border-0"
                                @click="selectInventoryItem(inv, index)"
                            >
                                <div class="font-medium">{{ inv.name }}</div>
                                <div class="text-xs text-gray-500 flex justify-between">
                                    <span>{{ inv.description }}</span>
                                    <span class="font-bold">RM {{ inv.price.toFixed(2) }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="mb-2">
                        <textarea 
                            v-model="item.details" 
                            placeholder="Add details (optional)" 
                            rows="2"
                            class="w-full border-gray-200 bg-white rounded shadow-sm focus:ring-blue-500 focus:border-blue-500 p-1.5 border text-xs text-gray-600 resize-y"
                        ></textarea>
                    </div>
                    <div class="flex gap-2">
                         <div class="w-20">
                            <div class="text-[10px] text-gray-400 mb-0.5 uppercase">Qty</div>
                            <input v-model.number="item.quantity" @focus="($event.target as HTMLInputElement).select()" type="number" min="1" class="w-full border-gray-300 rounded shadow-sm focus:ring-blue-500 focus:border-blue-500 p-1.5 border text-center text-sm font-bold" />
                         </div>
                         <div class="flex-grow">
                             <div class="text-[10px] text-gray-400 mb-0.5 uppercase">Price (RM)</div>
                             <input v-model.number="item.amount" @focus="($event.target as HTMLInputElement).select()" type="number" step="0.01" class="w-full border-gray-300 rounded shadow-sm focus:ring-blue-500 focus:border-blue-500 p-1.5 border text-right text-sm font-bold" />
                         </div>
                         <div class="w-24">
                              <div class="text-[10px] text-gray-400 mb-0.5 uppercase">Disc.</div>
                              <input v-model.number="item.discount" @focus="($event.target as HTMLInputElement).select()" type="number" step="0.01" class="w-full border-gray-200 bg-white rounded shadow-sm focus:ring-blue-500 focus:border-blue-500 p-1.5 border text-right text-sm text-gray-600" />
                         </div>
                         <button @click="removeItem(index)" class="self-end p-2 text-gray-300 hover:text-red-500 transition-colors">
                             <Trash2 :size="16" />
                         </button>
                    </div>
                </div>
              </div>
            </div>


            <!-- Save Action -->
            <button @click="saveReceipt" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-md shadow-blue-200 mt-6">
                <Save :size="20" />
                {{ editingId ? 'Update & Save Invoice' : 'Generate & Save Invoice' }}
            </button>
        </div>
    </div>
  </div>


    <!-- Customer Selection Modal -->
    <div v-if="isCustomerModalOpen" class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[90vh] flex flex-col">
            <h3 class="text-xl font-bold text-gray-800 mb-4">Select Customer</h3>
            
            <input 
                v-model="customerSearch" 
                type="text" 
                placeholder="Search customers..." 
                class="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2 border mb-4"
                autofocus
            />

            <div class="flex-grow overflow-y-auto border rounded-md mb-4 bg-gray-50">
                <div v-for="customer in modalFilteredCustomers" :key="customer.id" 
                     class="p-1.5 border-b border-gray-200 hover:bg-white flex items-center justify-between cursor-pointer"
                     @click="selectCustomerFromModal(customer)"
                >
                    <div class="flex items-center gap-2">
                        <div class="w-7 h-7 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0">
                            {{ customer.name.substring(0, 1).toUpperCase() }}
                        </div>
                        <div class="min-w-0">
                            <div class="font-medium text-gray-900 text-sm truncate">{{ customer.name }}</div>
                            <div class="text-[10px] text-gray-500 truncate">{{ customer.contact }}</div>
                        </div>
                    </div>
                    <button class="text-blue-600 font-medium text-xs px-2 py-1 hover:bg-blue-50 rounded flex-shrink-0">Select</button>
                </div>
                <div v-if="modalFilteredCustomers.length === 0" class="p-8 text-center text-gray-500">
                    No customers found.
                </div>
            </div>

            <div class="flex justify-end gap-3">
                <button @click="isCustomerModalOpen = false" class="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium">Cancel</button>
            </div>
        </div>
    </div>

    <!-- Inventory Selection Modal -->
    <div v-if="isSelectionModalOpen" class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[90vh] flex flex-col">
            <h3 class="text-xl font-bold text-gray-800 mb-4">Select Items from Inventory</h3>
            
            <input 
                v-model="inventorySearch" 
                type="text" 
                placeholder="Search inventory..." 
                class="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2 border mb-4"
            />

            <div class="flex-grow overflow-y-auto border rounded-md mb-4 bg-gray-50">
                <div v-for="item in modalFilteredInventory" :key="item.id" 
                     class="p-3 border-b border-gray-200 hover:bg-white flex items-center justify-between cursor-pointer"
                     @click="toggleSelection(item)"
                >
                    <div class="flex items-center gap-3">
                        <div class="w-5 h-5 border rounded flex items-center justify-center" :class="selectedInventoryIds.has(item.id) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-400 bg-white'">
                            <svg v-if="selectedInventoryIds.has(item.id)" xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                            </svg>
                        </div>
                        <div>
                            <div class="font-medium text-gray-900">{{ item.name }}</div>
                            <div class="text-xs text-gray-500">{{ item.description }}</div>
                        </div>
                    </div>
                    <div class="font-mono font-bold text-gray-700">RM {{ item.price.toFixed(2) }}</div>
                </div>
                <div v-if="modalFilteredInventory.length === 0" class="p-8 text-center text-gray-500">
                    No items found.
                </div>
            </div>

            <div class="flex justify-between items-center bg-gray-50 p-3 rounded mb-4">
                <span class="text-sm font-medium">{{ selectedInventoryIds.size }} items selected</span>
            </div>

            <div class="flex justify-end gap-3">
                <button @click="isSelectionModalOpen = false" class="px-4 py-2 text-gray-600 hover:text-gray-800">Cancel</button>
                <button @click="addSelectedItems" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium">
                    Add Selected Items
                </button>
            </div>
        </div>
    </div>
        </div>
</template>
