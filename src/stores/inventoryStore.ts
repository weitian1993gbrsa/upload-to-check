import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'

export interface InventoryItem {
    id: string
    branchId: string // Tied to a specific branch
    name: string
    price: number
    description: string
}

export const useInventoryStore = defineStore('inventory', () => {
    const items = useStorage<InventoryItem[]>('inventory', [])

    function addItem(item: Omit<InventoryItem, 'id'>) {
        const newItem: InventoryItem = {
            id: crypto.randomUUID(),
            ...item
        }
        items.value.push(newItem)
        return newItem
    }

    function updateItem(id: string, updates: Partial<Omit<InventoryItem, 'id'>>) {
        const index = items.value.findIndex(i => i.id === id)
        if (index !== -1 && items.value[index]) {
            items.value[index] = { ...items.value[index], ...updates } as InventoryItem
        }
    }

    function deleteItem(id: string) {
        const index = items.value.findIndex(i => i.id === id)
        if (index !== -1) {
            items.value.splice(index, 1)
        }
    }

    function initInventoryListener() {
        // No-op
    }

    return {
        items,
        addItem,
        updateItem,
        deleteItem,
        initInventoryListener
    }
})
