<script setup lang="ts">
import { ref, computed } from 'vue'
import { X, Plus, Trash2, Users, Search, CheckSquare, Square, Loader2 } from 'lucide-vue-next'
import { useCustomerStore } from '../stores/customerStore'
import { useBranchStore } from '../stores/branchStore'
import { useReceiptStore } from '../stores/receiptStore'
import { useInventoryStore, type InventoryItem } from '../stores/inventoryStore'
import { format } from 'date-fns'

const props = defineProps<{
    modelValue: boolean
}>()

const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void
    (e: 'generated'): void
}>()

const customerStore = useCustomerStore()
const branchStore = useBranchStore()
const receiptStore = useReceiptStore()
const inventoryStore = useInventoryStore()

const step = ref(1)
const isGenerating = ref(false)
const generationProgress = ref(0)

const searchQuery = ref('')
const activeItemIndex = ref<number | null>(null)

// Inventory Logic
const sortedInventoryItems = computed(() => {
    return inventoryStore.items
        .filter(i => i.branchId === branchStore.activeBranchId)
        .sort((a, b) => a.name.localeCompare(b.name))
})

const filteredInventory = computed(() => {
    if (activeItemIndex.value === null) return []
    const item = form.value.items[activeItemIndex.value]
    if (!item || !item.description) return []
    
    const query = item.description.toLowerCase()
    
    return sortedInventoryItems.value
        .filter(i => 
            i.name.toLowerCase().includes(query) || 
            (i.description && i.description.toLowerCase().includes(query))
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
    activeItemIndex.value = null
}

function handleBlur() {
    // Delay to allow click event to fire
    setTimeout(() => {
        activeItemIndex.value = null
    }, 200)
    setTimeout(() => {
        activeItemIndex.value = null
    }, 200)
}

// Inventory Selection Modal Logic
const isSelectionModalOpen = ref(false)
const inventorySearchQuery = ref('')
const selectedInventoryIds = ref(new Set<string>())

const modalFilteredInventory = computed(() => {
    const q = inventorySearchQuery.value.toLowerCase()
    return sortedInventoryItems.value.filter(i => 
        i.name.toLowerCase().includes(q) || 
        (i.description && i.description.toLowerCase().includes(q))
    )
})

function toggleInventorySelection(item: InventoryItem) {
    if (selectedInventoryIds.value.has(item.id)) {
        selectedInventoryIds.value.delete(item.id)
    } else {
        selectedInventoryIds.value.add(item.id)
    }
}

function addSelectedInventoryItems() {
    const selectedItems = inventoryStore.items.filter(i => selectedInventoryIds.value.has(i.id))
    
    // Remove default empty row if untouched
    if (form.value.items.length === 1 && !form.value.items[0]?.description && form.value.items[0]?.amount === 0) {
        form.value.items = []
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

    // Reset
    selectedInventoryIds.value.clear()
    inventorySearchQuery.value = ''
    isSelectionModalOpen.value = false
}

// Step 1: Invoice Details
const form = ref({
    date: format(new Date(), 'yyyy-MM-dd'),
    paymentMethod: 'Cash',
    status: 'pending' as 'paid' | 'pending',
    items: [
        { id: crypto.randomUUID(), description: '', details: '', amount: 0, discount: 0, quantity: 1 }
    ]
})

// Step 2: Student Selection
const selectedCustomerIds = ref<Set<string>>(new Set())

const sortedCustomers = computed(() => {
    return customerStore.customers
        .filter(c => c.branchId === branchStore.activeBranchId)
        .sort((a, b) => a.name.localeCompare(b.name))
})

const filteredCustomers = computed(() => {
    if (!searchQuery.value) return sortedCustomers.value
    const query = searchQuery.value.toLowerCase()
    return sortedCustomers.value.filter(c => c.name.toLowerCase().includes(query))
})

const allSelected = computed(() => {
    return filteredCustomers.value.length > 0 && 
           filteredCustomers.value.every(c => selectedCustomerIds.value.has(c.id))
})

function toggleSelectAll() {
    if (allSelected.value) {
        filteredCustomers.value.forEach(c => selectedCustomerIds.value.delete(c.id))
    } else {
        filteredCustomers.value.forEach(c => selectedCustomerIds.value.add(c.id))
    }
}

function toggleSelection(id: string) {
    if (selectedCustomerIds.value.has(id)) {
        selectedCustomerIds.value.delete(id)
    } else {
        selectedCustomerIds.value.add(id)
    }
}

function addItem() {
    form.value.items.push({ 
        id: crypto.randomUUID(), 
        description: '', 
        details: '', 
        amount: 0, 
        discount: 0, 
        quantity: 1 
    })
}

function removeItem(index: number) {
    form.value.items.splice(index, 1)
}

function nextStep() {
    if (step.value === 1) {
        // Validate items
        if (form.value.items.length === 0 || !form.value.items[0]?.description) {
            alert('Please add at least one item with a description.')
            return
        }
        step.value = 2
    }
}

async function generateInvoices() {
    if (selectedCustomerIds.value.size === 0) {
        alert('Please select at least one student.')
        return
    }

    if (!confirm(`Are you sure you want to generate ${selectedCustomerIds.value.size} invoices? This cannot be undone easily.`)) {
        return
    }

    isGenerating.value = true
    generationProgress.value = 0
    const total = selectedCustomerIds.value.size
    let current = 0

    try {
        const customers = sortedCustomers.value.filter(c => selectedCustomerIds.value.has(c.id))
        
        for (const customer of customers) {
            // Simulate small delay for UI updates
            await new Promise(r => setTimeout(r, 50))
            
            receiptStore.addReceipt({
                date: form.value.date,
                receivedFrom: customer.name,
                contact: customer.contact,
                paymentMethod: form.value.paymentMethod,
                status: form.value.status,
                items: form.value.items.map(i => ({...i, id: crypto.randomUUID()})), // Clone items with new IDs
                receiptNumber: receiptStore.generateReceiptNumber(branchStore.activeBranch?.receiptPrefix || 'REC', form.value.date, branchStore.activeBranchId),
                receivedBy: 'Admin'
            }, branchStore.activeBranchId)

            current++
            generationProgress.value = Math.round((current / total) * 100)
        }

        alert(`Successfully generated ${total} invoices!`)
        emit('generated')
        close()
        
    } catch (e) {
        console.error(e)
        alert('An error occurred during generation.')
    } finally {
        isGenerating.value = false
    }
}

function close() {
    emit('update:modelValue', false)
    // Reset state after close
    setTimeout(() => {
        step.value = 1
        selectedCustomerIds.value.clear()
        searchQuery.value = ''
        form.value.items = [{ id: crypto.randomUUID(), description: '', details: '', amount: 0, discount: 0, quantity: 1 }]
    }, 300)
}

const totalAmount = computed(() => {
    return form.value.items.reduce((sum, item) => {
        const subtotal = (item.amount * item.quantity) - item.discount
        return sum + subtotal
    }, 0)
})
</script>

<template>
    <div v-if="modelValue" class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full flex flex-col max-h-[90vh]">
            <!-- Header -->
            <div class="px-6 py-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                <h3 class="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <Users class="text-blue-600" />
                    Bulk Invoice Wizard
                </h3>
                <button @click="close" class="text-gray-400 hover:text-gray-600">
                    <X :size="24" />
                </button>
            </div>

            <!-- Content -->
            <div class="flex-grow overflow-hidden flex flex-col p-6">
                
                <!-- Progress Stepper -->
                <div class="flex items-center justify-center mb-8">
                    <div class="flex items-center">
                        <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors"
                            :class="step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'">1</div>
                        <span class="ml-2 font-medium" :class="step >= 1 ? 'text-blue-600' : 'text-gray-400'">Invoice Details</span>
                    </div>
                    <div class="w-20 h-1 mx-4 bg-gray-200 rounded-full overflow-hidden">
                        <div class="h-full bg-blue-600 transition-all duration-300" :style="{ width: step >= 2 ? '100%' : '0%' }"></div>
                    </div>
                    <div class="flex items-center">
                        <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors"
                            :class="step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'">2</div>
                        <span class="ml-2 font-medium" :class="step >= 2 ? 'text-blue-600' : 'text-gray-400'">Select Students</span>
                    </div>
                </div>

                <!-- STEP 1: Invoice Details -->
                <div v-if="step === 1" class="flex-grow overflow-y-auto custom-scrollbar pr-2">
                    <div class="grid grid-cols-2 gap-6 mb-6">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Date</label>
                            <input v-model="form.date" type="date" class="w-full border rounded-md p-2" />
                        </div>
                        <div>
                             <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
                             <select v-model="form.status" class="w-full border rounded-md p-2">
                                <option value="pending">Pending</option>
                                <option value="paid">Paid</option>
                            </select>
                        </div>
                    </div>

                    <div class="space-y-4">
                        <div class="flex justify-between items-center">
                            <h4 class="font-bold text-gray-700">Line Items</h4>
                            <div class="flex gap-2">
                                <button @click="addItem" class="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1">
                                    <Plus :size="16" /> Add Manual
                                </button>
                                <button @click="isSelectionModalOpen = true" class="text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center bg-purple-50 px-2 py-1 rounded">
                                    <Plus :size="14" class="mr-1" /> From Inventory
                                </button>
                            </div>
                        </div>

                         <div v-for="(item, index) in form.items" :key="item.id" class="flex gap-2 items-start bg-gray-50 p-3 rounded border">
                            <div class="flex-grow grid grid-cols-12 gap-2">
                                <div class="col-span-6">
                                    <div class="relative">
                                        <input 
                                            v-model="item.description" 
                                            @focus="activeItemIndex = index"
                                            @blur="handleBlur"
                                            placeholder="Description (e.g. Feb 2026 Fee)" 
                                            class="w-full border rounded p-1.5 text-sm" 
                                        />
                                        <!-- Suggestions Dropdown -->
                                        <div v-if="activeItemIndex === index && filteredInventory.length > 0" class="absolute z-10 w-full bg-white border rounded-md shadow-lg mt-1 max-h-48 overflow-y-auto">
                                            <div 
                                                v-for="invItem in filteredInventory" 
                                                :key="invItem.id"
                                                @mousedown.prevent="selectInventoryItem(invItem, index)"
                                                class="p-2 hover:bg-blue-50 cursor-pointer border-b last:border-0 text-sm"
                                            >
                                                <div class="font-medium text-gray-800">{{ invItem.name }}</div>
                                                <div class="text-xs text-gray-500 flex justify-between">
                                                    <span>{{ invItem.description }}</span>
                                                    <span class="font-mono text-blue-600">RM {{ invItem.price.toFixed(2) }}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-span-2">
                                    <input v-model.number="item.amount" type="number" placeholder="Price" class="w-full border rounded p-1.5 text-sm" />
                                </div>
                                <div class="col-span-2">
                                    <input v-model.number="item.quantity" type="number" placeholder="Qty" class="w-full border rounded p-1.5 text-sm" />
                                </div>
                                 <div class="col-span-2">
                                    <div class="flex items-center text-sm font-medium text-gray-700 h-full pl-2">
                                        {{ ((item.amount * item.quantity) - item.discount).toFixed(2) }}
                                    </div>
                                </div>
                            </div>
                            <button @click="removeItem(index)" class="text-red-400 hover:text-red-600 p-1.5">
                                <Trash2 :size="16" />
                            </button>
                        </div>
                    </div>
                     <div class="mt-4 text-right text-xl font-bold text-gray-800">
                        Total per Invoice: <span class="text-blue-600">RM {{ totalAmount.toFixed(2) }}</span>
                    </div>
                </div>

                <!-- STEP 2: Select Students -->
                <div v-if="step === 2" class="flex-grow flex flex-col overflow-hidden">
                    <div class="flex gap-4 mb-4">
                        <div class="relative flex-grow">
                             <Search class="absolute left-3 top-2.5 text-gray-400" :size="18" />
                             <input v-model="searchQuery" placeholder="Search students..." class="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                        <div class="bg-blue-50 px-4 py-2 rounded-lg text-blue-800 font-bold flex items-center">
                            {{ selectedCustomerIds.size }} Selected
                        </div>
                    </div>

                    <div class="flex items-center gap-2 mb-2 px-2">
                        <button @click="toggleSelectAll" class="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 font-medium">
                            <CheckSquare v-if="allSelected" class="text-blue-600" :size="20" />
                            <Square v-else class="text-gray-400" :size="20" />
                            Select All
                        </button>
                    </div>

                    <div class="flex-grow overflow-y-auto border rounded-lg p-2 custom-scrollbar">
                        <div v-for="customer in filteredCustomers" :key="customer.id" 
                            @click="toggleSelection(customer.id)"
                            class="flex items-center justify-between p-3 hover:bg-gray-50 rounded cursor-pointer transition-colors border-b last:border-0"
                            :class="{ 'bg-blue-50': selectedCustomerIds.has(customer.id) }"
                        >
                            <div class="flex items-center gap-3">
                                <div class="text-gray-500">
                                     <CheckSquare v-if="selectedCustomerIds.has(customer.id)" class="text-blue-600" :size="20" />
                                     <Square v-else class="text-gray-300" :size="20" />
                                </div>
                                <span class="font-medium text-gray-800">{{ customer.name }}</span>
                            </div>
                            <span class="text-xs text-gray-400">{{ customer.contact }}</span>
                        </div>
                        
                        <div v-if="filteredCustomers.length === 0" class="text-center py-8 text-gray-400">
                            No students found.
                        </div>
                    </div>
                </div>

                <!-- Loading Overlay -->
                <div v-if="isGenerating" class="absolute inset-0 bg-white/90 z-10 flex flex-col items-center justify-center">
                    <Loader2 class="animate-spin text-blue-600 w-12 h-12 mb-4" />
                    <h3 class="text-xl font-bold text-gray-800 mb-2">Generating Invoices...</h3>
                    <div class="w-64 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div class="h-full bg-blue-600 transition-all duration-300" :style="{ width: generationProgress + '%' }"></div>
                    </div>
                    <p class="mt-2 text-gray-500 font-medium">{{ generationProgress }}%</p>
                </div>

            </div>

            <!-- Footer -->
            <div class="px-6 py-4 border-t bg-gray-50 rounded-b-lg flex justify-between">
                <button v-if="step === 2" @click="step = 1" class="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium">
                    Back
                </button>
                <div v-else></div> <!-- Spacer -->

                <button v-if="step === 1" @click="nextStep" class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm transition-colors">
                    Next: Select Students
                </button>
                <button v-else @click="generateInvoices" class="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium shadow-sm transition-colors flex items-center gap-2">
                    <CheckSquare :size="18" /> Generate {{ selectedCustomerIds.size }} Invoices
                </button>
            </div>
        </div>
    </div>

    <!-- Inventory Selection Modal (Nested) -->
    <div v-if="isSelectionModalOpen" class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
        <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[90vh] flex flex-col">
            <h3 class="text-xl font-bold text-gray-800 mb-4">Select Items from Inventory</h3>
            
            <input 
                v-model="inventorySearchQuery" 
                type="text" 
                placeholder="Search inventory..." 
                class="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2 border mb-4"
                autofocus
            />

            <div class="flex-grow overflow-y-auto border rounded-md mb-4 bg-gray-50 custom-scrollbar">
                <div v-for="item in modalFilteredInventory" :key="item.id" 
                     class="p-3 border-b border-gray-200 hover:bg-white flex items-center justify-between cursor-pointer"
                     @click="toggleInventorySelection(item)"
                >
                    <div class="flex items-center gap-3">
                        <div class="w-5 h-5 border rounded flex items-center justify-center" :class="selectedInventoryIds.has(item.id) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-400 bg-white'">
                            <CheckSquare v-if="selectedInventoryIds.has(item.id)" :size="14" />
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
                <button @click="addSelectedInventoryItems" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium">
                    Add Selected Items
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.5);
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: rgba(107, 114, 128, 0.8);
}
</style>
