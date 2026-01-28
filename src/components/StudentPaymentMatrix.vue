<script setup lang="ts">
import { computed } from 'vue'
import { Check } from 'lucide-vue-next'
import type { Receipt } from '../stores/receiptStore'
import type { Customer } from '../stores/customerStore'

const props = defineProps<{
    receipts: Receipt[],
    customers?: Customer[]
}>()

const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]

const matrixData = computed(() => {
    // 1. Initialize with all customers
    const studentMap: Record<string, Receipt[]> = {}
    
    // Add all registered customers first (even if they have no receipts)
    if (props.customers) {
        props.customers.forEach(customer => {
             studentMap[customer.name] = []
        })
    }
    
    // 2. Map receipts to students
    props.receipts.forEach(receipt => {
        // Prefer studentName if set, otherwise fallback to receivedFrom (payer)
        const name = receipt.studentName || receipt.receivedFrom
        if (!name) return

        if (!studentMap[name]) {
            studentMap[name] = []
        }
        studentMap[name].push(receipt)
    })

    // 2. Build rows
    const rows = Object.entries(studentMap).map(([name, studentReceipts]) => {
        const monthStatus = Array(12).fill(null)

        studentReceipts.forEach(r => {
            const date = new Date(r.date)
            const monthIndex = date.getMonth() // 0-11
            
            // If multiple receipts in a month, just taking the last one for now, 
            // or we could show a list. For simple tracking, just knowing "Paid" is enough.
            monthStatus[monthIndex] = r
        })

        return {
            name,
            months: monthStatus
        }
    })

    // 3. Sort by name
    return [...rows].sort((a, b) => a.name.localeCompare(b.name))
})

const emit = defineEmits<{
    (e: 'view-receipt', receipt: Receipt): void
}>()
</script>

<template>
    <div class="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
        <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10 border-r border-gray-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                            Student / Payer
                        </th>
                        <th v-for="month in months" :key="month" scope="col" class="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[60px]">
                            {{ month }}
                        </th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                    <tr v-for="row in matrixData" :key="row.name" class="hover:bg-gray-50">
                        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-white z-10 border-r border-gray-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                            {{ row.name }}
                        </td>
                        <td v-for="(receipt, index) in row.months" :key="index" class="px-2 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                            <div v-if="receipt" class="flex justify-center">
                                <button 
                                    @click="emit('view-receipt', receipt)" 
                                    class="text-green-600 hover:text-green-800 transition-colors p-1 rounded-full hover:bg-green-50"
                                    :title="`Paid: ${receipt.receiptNumber}`"
                                >
                                    <Check :size="18" stroke-width="3" />
                                </button>
                            </div>
                            <div v-else class="text-gray-200">
                                -
                            </div>
                        </td>
                    </tr>
                    <tr v-if="matrixData.length === 0">
                        <td colspan="13" class="px-6 py-12 text-center text-gray-500">
                            No data found for the current filter.
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>
