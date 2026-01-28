<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useInventoryStore, type InventoryItem } from '../stores/inventoryStore'
import { useBranchStore } from '../stores/branchStore'
import { Plus, Search, Pencil, Trash2, Package, GripVertical } from 'lucide-vue-next'

const inventoryStore = useInventoryStore()
const branchStore = useBranchStore()
const searchQuery = ref('')
const isModalOpen = ref(false)
const modalMode = ref<'create' | 'edit'>('create')
const editingId = ref('')

// Form State
const form = ref({
    name: '',
    price: 0,
    description: ''
})

// OPTIMIZATION: Filter items by branch first
const branchItems = computed(() => {
    return inventoryStore.items.filter(item => item.branchId === branchStore.activeBranchId)
})

// Filtered Items for Display
const filteredItems = computed(() => {
    const q = searchQuery.value.toLowerCase()
    if (!q) return branchItems.value
    
    return branchItems.value.filter(item => 
        item.name.toLowerCase().includes(q) || 
        item.description.toLowerCase().includes(q)
    )
})

// Drag and Drop Logic
const draggedItemIndex = ref<number | null>(null)

function onDragStart(event: DragEvent, index: number) {
    draggedItemIndex.value = index
    event.dataTransfer!.effectAllowed = 'move'
}

function onDrop(_event: DragEvent, dropIndex: number) {
    if (draggedItemIndex.value === null) return
    const draggedIndex = draggedItemIndex.value
    
    if (searchQuery.value) {
        alert('Please clear search to reorder items.')
        return
    }

    const itemToMove = filteredItems.value[draggedIndex]
    const itemTarget = filteredItems.value[dropIndex]
    
    // Fixed: Added existence check for TypeScript safety
    if (itemToMove && itemTarget) {
        const globalDraggedIndex = inventoryStore.items.findIndex(i => i.id === itemToMove.id)
        const globalDropIndex = inventoryStore.items.findIndex(i => i.id === itemTarget.id)
        
        if (globalDraggedIndex !== -1 && globalDropIndex !== -1) {
            inventoryStore.items.splice(globalDraggedIndex, 1)
            inventoryStore.items.splice(globalDropIndex, 0, itemToMove)
        }
    }

    draggedItemIndex.value = null
}

function openCreateModal() {
    modalMode.value = 'create'
    editingId.value = ''
    form.value = { name: '', price: 0, description: '' }
    isModalOpen.value = true
}

function openEditModal(item: InventoryItem) {
    modalMode.value = 'edit'
    editingId.value = item.id
    form.value = { 
        name: item.name, 
        price: item.price, 
        description: item.description 
    }
    isModalOpen.value = true
}

function saveItem() {
    if (!form.value.name) return

    if (modalMode.value === 'create') {
        if (!branchStore.activeBranchId) {
            alert('No active branch selected.')
            return
        }
        inventoryStore.addItem({
            ...form.value,
            branchId: branchStore.activeBranchId
        })
    } else {
        inventoryStore.updateItem(editingId.value, {
            ...form.value,
            branchId: branchStore.activeBranchId // Ensure edit also locks to current branch
        })
    }
    
    isModalOpen.value = false
}

function deleteItem(id: string) {
    if (confirm('Delete this item?')) {
        inventoryStore.deleteItem(id)
    }
}

function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
        if (isModalOpen.value) {
            isModalOpen.value = false
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
    <div class="space-y-6">
        <div class="flex justify-between items-center">
            <h2 class="text-2xl font-bold text-gray-800">Inventory</h2>
            <button @click="openCreateModal" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded flex items-center gap-2">
                <Plus :size="20" /> Add Item
            </button>
        </div>

        <!-- Search -->
        <div class="relative">
            <Search class="absolute left-3 top-3 text-gray-400" :size="20" />
            <input 
                v-model="searchQuery" 
                type="text" 
                placeholder="Search inventory..." 
                class="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
        </div>

        <!-- List -->
        <div class="rounded-lg border border-gray-200 overflow-hidden">
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="w-10 px-3 py-3"></th> <!-- Handle -->
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name/Description</th>
                        <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Price (RM)</th>
                        <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                    <tr v-if="filteredItems.length === 0">
                        <td colspan="4" class="px-6 py-12 text-center text-gray-500">
                            <Package :size="48" class="mx-auto mb-2 text-gray-300" />
                            <p>No items found.</p>
                        </td>
                    </tr>
                    <tr 
                        v-for="(item, index) in filteredItems" 
                        :key="item.id" 
                        class="hover:bg-gray-50 transition-colors"
                        :draggable="!searchQuery"
                        @dragstart="onDragStart($event, index)"
                        @dragover.prevent
                        @drop="onDrop($event, index)"
                        :class="{'cursor-move': !searchQuery, 'opacity-50': draggedItemIndex === index}"
                    >
                        <td class="px-3 py-4 text-gray-400 cursor-move">
                            <GripVertical :size="20" v-if="!searchQuery" />
                        </td>
                        <td class="px-6 py-4">
                            <div class="text-sm font-medium text-gray-900 select-none">{{ item.name }}</div>
                            <div class="text-sm text-gray-500 select-none">{{ item.description }}</div>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900 font-mono select-none">
                            {{ item.price.toFixed(2) }}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button @click="openEditModal(item)" class="text-indigo-600 hover:text-indigo-900 mr-4">
                                <Pencil :size="18" />
                            </button>
                            <button @click="deleteItem(item.id)" class="text-red-600 hover:text-red-900">
                                <Trash2 :size="18" />
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- Modal -->
        <div v-if="isModalOpen" class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                <h3 class="text-xl font-bold text-gray-800 mb-4">{{ modalMode === 'create' ? 'Add Item' : 'Edit Item' }}</h3>
                
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Item Name</label>
                        <input v-model="form.name" type="text" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 focus:ring-blue-500 focus:border-blue-500" placeholder="e.g. Registration Fee" />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Price (RM)</label>
                        <input v-model.number="form.price" type="number" step="0.01" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Description (Optional)</label>
                        <input v-model="form.description" type="text" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                </div>

                <div class="mt-6 flex justify-end gap-3">
                    <button @click="isModalOpen = false" class="px-4 py-2 text-gray-600 hover:text-gray-800">Cancel</button>
                    <button @click="saveItem" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
                </div>
            </div>
        </div>
    </div>
</template>
