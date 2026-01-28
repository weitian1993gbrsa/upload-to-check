import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'

export interface ReceiptItem {
    description: string
    details?: string
    amount: number
    discount?: number
    quantity: number
}

export interface Receipt {
    id: string
    branchId: string
    receiptNumber: string
    date: string
    receivedFrom: string
    contact?: string
    studentName?: string
    items: ReceiptItem[]
    paymentMethod: string
    receivedBy: string
    status: 'paid' | 'pending'
    createdAt: number
}

export const useReceiptStore = defineStore('receipt', () => {
    // Persist to localStorage with key 'receipts'
    const receipts = useStorage<Receipt[]>('receipts', [])

    // No listener needed for local storage

    function generateReceiptNumber(branchPrefix: string, dateStr: string, branchId: string) {
        const date = new Date(dateStr)
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const year = date.getFullYear()

        const count = receipts.value.filter(r => {
            if (r.branchId !== branchId) return false
            const rDate = new Date(r.date)
            return rDate.getMonth() + 1 === date.getMonth() + 1 && rDate.getFullYear() === year
        }).length

        return `${branchPrefix}_${month}_${String(count + 1).padStart(3, '0')}`
    }

    // Synchronous action for local storage
    function addReceipt(receiptData: Omit<Receipt, 'id' | 'createdAt' | 'branchId'>, branchId: string) {
        if (!branchId) throw new Error("No active branch ID provided")

        const newReceipt: Receipt = {
            id: crypto.randomUUID(), // Local UUID generation
            branchId: branchId,
            createdAt: Date.now(),
            ...receiptData
        }

        receipts.value.push(newReceipt)
        return newReceipt
    }

    function updateReceipt(id: string, updatedData: Partial<Receipt>) {
        const index = receipts.value.findIndex(r => r.id === id)
        if (index !== -1 && receipts.value[index]) {
            receipts.value[index] = { ...receipts.value[index], ...updatedData }
        }
    }

    function deleteReceipt(id: string) {
        const index = receipts.value.findIndex(r => r.id === id)
        if (index !== -1) {
            receipts.value.splice(index, 1)
        }
    }

    function updateReceiptPrefix(branchId: string, newPrefix: string) {
        // Filter mutable copy to find relevant receipts
        const branchReceipts = receipts.value
            .filter(r => r.branchId === branchId)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.createdAt - b.createdAt)

        const monthlyCounts: Record<string, number> = {}

        // This loop modifies the actual receipt objects in the reactive array indirectly if we find them
        const map = new Map(receipts.value.map((r, i) => [r.id, i]))

        branchReceipts.forEach(receipt => {
            const d = new Date(receipt.date)
            const monthStr = String(d.getMonth() + 1).padStart(2, '0')
            const year = d.getFullYear()
            const key = `${year}-${monthStr}`

            monthlyCounts[key] = (monthlyCounts[key] || 0) + 1
            const count = monthlyCounts[key]

            const newReceiptNumber = `${newPrefix}_${monthStr}_${String(count).padStart(3, '0')}`

            if (receipt.receiptNumber !== newReceiptNumber) {
                const index = map.get(receipt.id)
                if (index !== undefined && receipts.value[index]) {
                    receipts.value[index].receiptNumber = newReceiptNumber
                }
            }
        })
    }

    function updateReceiptCustomerName(oldName: string, newName: string) {
        receipts.value.forEach(receipt => {
            if (receipt.receivedFrom === oldName) {
                receipt.receivedFrom = newName
            }
        })
    }

    // Stub for initListener to prevent breaking components that call it
    function initReceiptsListener() {
        // No-op for local storage
    }

    return {
        receipts,
        generateReceiptNumber,
        addReceipt,
        updateReceipt,
        deleteReceipt,
        updateReceiptPrefix,
        updateReceiptCustomerName,
        initReceiptsListener
    }
})
