<script setup lang="ts">
import { ref, computed } from 'vue'
import { Check } from 'lucide-vue-next'
import type { Receipt } from '../stores/receiptStore'
import { useCustomerStore, type Customer } from '../stores/customerStore'

const props = defineProps<{
    receipts: Receipt[],
    customers?: Customer[]
}>()

const customerStore = useCustomerStore()

const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]

const selectedYear = ref(new Date().getFullYear())

const matrixData = computed(() => {
    // Iterate customers directly
    if (!props.customers) return []

    const rows = props.customers.map(customer => {
        const monthStatus = Array(12).fill(false)

        for (let m = 0; m < 12; m++) {
            const key = `${selectedYear.value}-${m}`
            if (customer.paymentStatus && customer.paymentStatus[key]) {
                monthStatus[m] = true
            }
        }

        return {
            id: customer.id,
            name: customer.name,
            months: monthStatus
        }
    })

    return rows.sort((a, b) => a.name.localeCompare(b.name))
})

function toggleStatus(customerId: string, monthIndex: number) {
    customerStore.togglePaymentStatus(customerId, selectedYear.value, monthIndex)
}

</script>

<template>
    <div class="bg-white rounded-lg shadow overflow-hidden border border-gray-200 flex flex-col h-full">
        <!-- New Header with Year Selector -->
        <div class="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
            <h3 class="font-bold text-gray-700">Payment Check Matrix</h3>
            <div class="flex items-center gap-2">
                <button @click="selectedYear--" class="p-1 hover:bg-gray-200 rounded text-gray-500 font-bold">&lt;</button>
                <span class="font-bold text-gray-800">{{ selectedYear }}</span>
                <button @click="selectedYear++" class="p-1 hover:bg-gray-200 rounded text-gray-500 font-bold">&gt;</button>
            </div>
        </div>

        <div class="overflow-x-auto flex-grow">
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
                        <td v-for="(isPaid, index) in row.months" :key="index" class="px-2 py-4 whitespace-nowrap text-center text-sm">
                            <div class="flex justify-center">
                                <button 
                                    @click="toggleStatus(row.id, index)"
                                    class="transition-all duration-200 p-1.5 rounded-full"
                                    :class="isPaid ? 'bg-green-100 text-green-600 hover:bg-green-200' : 'bg-gray-100 text-gray-300 hover:bg-gray-200'"
                                >
                                    <Check :size="16" stroke-width="4" v-if="isPaid" />
                                    <div v-else class="w-4 h-4 rounded-full border-2 border-gray-300"></div>
                                </button>
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
