import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'

export interface Customer {
    id: string
    name: string
    contact: string
    email?: string
    studentId?: string
    branchId: string // Ensure customers are linked to a branch
    createdAt: number
    paymentStatus?: Record<string, boolean> // Key: "YYYY-M" (e.g. "2026-0" for Jan)
}

export const useCustomerStore = defineStore('customer', () => {
    // Persist to localStorage
    const customers = useStorage<Customer[]>('customers', [])

    // No real-time listener needed

    function addCustomer(customer: Omit<Customer, 'id' | 'createdAt'>, branchId?: string) {
        // branchId arg legacy support, strict interface prefers it in customer obj
        const newCustomer: Customer = {
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            paymentStatus: {},
            ...customer,
            branchId: (customer as any).branchId || branchId // Handle potential missing branchId in arg
        }
        customers.value.push(newCustomer)
        return newCustomer
    }

    function updateCustomer(id: string, updates: Partial<Customer>) {
        const index = customers.value.findIndex(c => c.id === id)
        if (index !== -1 && customers.value[index]) {
            customers.value[index] = { ...customers.value[index], ...updates } as Customer
        }
    }

    function togglePaymentStatus(customerId: string, year: number, month: number) {
        const customer = customers.value.find(c => c.id === customerId)
        if (customer) {
            if (!customer.paymentStatus) customer.paymentStatus = {}
            const key = `${year}-${month}`
            // Toggle
            if (customer.paymentStatus[key]) {
                delete customer.paymentStatus[key]
            } else {
                customer.paymentStatus[key] = true
            }
        }
    }

    function deleteCustomer(id: string) {
        const index = customers.value.findIndex(c => c.id === id)
        if (index !== -1) {
            customers.value.splice(index, 1)
        }
    }

    // Stub
    function initCustomerListener() {
        // No-op
    }

    return {
        customers,
        addCustomer,
        updateCustomer,
        deleteCustomer,
        togglePaymentStatus,
        initCustomerListener
    }
})
