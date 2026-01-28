<script setup lang="ts">
import { ref } from 'vue'
import { useReceiptStore } from '../stores/receiptStore'
import { useBranchStore } from '../stores/branchStore'
import { useCustomerStore } from '../stores/customerStore'
import { useInventoryStore } from '../stores/inventoryStore'
import { Download, Upload, AlertTriangle, CheckCircle, Database } from 'lucide-vue-next'

const receiptStore = useReceiptStore()
const branchStore = useBranchStore()
const customerStore = useCustomerStore()
const inventoryStore = useInventoryStore()

const fileInput = ref<HTMLInputElement | null>(null)
const status = ref<{ type: 'success' | 'error' | 'idle' | 'loading', message: string }>({ type: 'idle', message: '' })

function exportData() {
    try {
        const backupData = {
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            data: {
                receipts: receiptStore.receipts,
                branches: branchStore.branches,
                globalSettings: branchStore.globalSettings,
                customers: customerStore.customers,
                inventory: inventoryStore.items
            }
        }

        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        
        const now = new Date()
        const dateStr = now.toISOString().split('T')[0]
        const timeStr = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0')
        link.href = url
        link.download = `InvoiceSystem_Backup_${dateStr}_${timeStr}.json`
        link.click()
        
        URL.revokeObjectURL(url)
        
        status.value = { type: 'success', message: 'Backup file generated and downloaded!' }
        setTimeout(() => status.value = { type: 'idle', message: '' }, 3000)
    } catch (e) {
        status.value = { type: 'error', message: 'Failed to generate backup.' }
    }
}

function triggerImport() {
    fileInput.value?.click()
}

function handleImport(event: Event) {
    const target = event.target as HTMLInputElement
    const file = target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
        try {
            const content = e.target?.result as string
            const backup = JSON.parse(content)

            if (!backup.data || !backup.version) {
                throw new Error('Invalid backup file format.')
            }

            if (confirm('WARNING: Importing will overwrite ALL current data. This cannot be undone. Are you sure you want to proceed?')) {
                // Restore Data Directly to Stores (VueUse useStorage will persist changes)
                status.value = { type: 'loading', message: 'Restoring data...' }

                if (backup.data.receipts) receiptStore.receipts = backup.data.receipts
                if (backup.data.customers) customerStore.customers = backup.data.customers
                if (backup.data.inventory) inventoryStore.items = backup.data.inventory
                if (backup.data.branches) branchStore.branches = backup.data.branches
                if (backup.data.globalSettings) branchStore.globalSettings = backup.data.globalSettings

                // Force reload to ensure UI updates cleanly
                 status.value = { type: 'success', message: 'Restore Complete! Refreshing...' }
                 setTimeout(() => window.location.reload(), 1500)
            }
        } catch (error) {
            status.value = { type: 'error', message: 'Failed to import data. Please check the file.' }
        }
        // Reset input
        target.value = ''
    }
    reader.readAsText(file)
}
</script>

<template>
    <div class="space-y-8">
        <div>
            <div class="flex items-center gap-3 mb-6">
                <Database class="text-blue-600" :size="32" />
                <div>
                    <h2 class="text-2xl font-bold text-gray-800">Backup & Restore</h2>
                    <p class="text-gray-500 text-sm">Manage your local data.</p>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
                <!-- Export Section -->
                <div class="group p-8 border border-blue-100 rounded-2xl bg-gradient-to-br from-white to-blue-50/50 flex flex-col items-center text-center space-y-6 hover:shadow-md transition-all duration-300 relative overflow-hidden">
                    <div class="absolute top-0 right-0 p-4 opacity-5">
                        <Download :size="80" />
                    </div>
                    <div class="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 shadow-sm group-hover:scale-110 transition-transform duration-300">
                        <Download :size="32" />
                    </div>
                    <div>
                        <h3 class="text-lg font-bold text-gray-800">Export Backup</h3>
                        <p class="text-xs text-gray-500 mt-2 leading-relaxed">
                            Save a JSON file of your current data.
                        </p>
                    </div>
                    <button @click="exportData" class="w-full py-3 px-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-200 text-sm">
                        <Download :size="16" /> Download .json
                    </button>
                </div>

                <!-- Import Section -->
                <div class="group p-8 border border-amber-100 rounded-2xl bg-gradient-to-br from-white to-amber-50/50 flex flex-col items-center text-center space-y-6 hover:shadow-md transition-all duration-300 relative overflow-hidden">
                    <div class="absolute top-0 right-0 p-4 opacity-5">
                        <Upload :size="80" />
                    </div>
                    <div class="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600 shadow-sm group-hover:scale-110 transition-transform duration-300">
                        <Upload :size="32" />
                    </div>
                    <div>
                        <h3 class="text-lg font-bold text-gray-800">Restore Data</h3>
                        <p class="text-xs text-gray-500 mt-2 leading-relaxed">
                            Upload a backup file to overwrite current data.
                        </p>
                    </div>
                    <input type="file" ref="fileInput" @change="handleImport" accept=".json" class="hidden" />
                    <button @click="triggerImport" class="w-full py-3 px-4 bg-white border-2 border-amber-200 text-amber-700 rounded-xl font-bold hover:bg-amber-50 active:scale-95 transition-all flex items-center justify-center gap-2 text-sm">
                        <Upload :size="16" /> Upload & Restore
                    </button>
                    <div class="text-[9px] text-amber-400 font-bold uppercase tracking-widest">Caution: Overwrites All Data</div>
                </div>
            </div>

            <!-- Status Alerts -->
            <div v-if="status.message" class="mt-6">
                <div v-if="status.type === 'success'" class="p-4 bg-green-50 text-green-700 rounded-lg flex items-center gap-3 border border-green-200">
                    <CheckCircle :size="20" />
                    <span class="font-medium">{{ status.message }}</span>
                </div>
                <div v-if="status.type === 'error'" class="p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-3 border border-red-200">
                    <AlertTriangle :size="20" />
                    <span class="font-medium">{{ status.message }}</span>
                </div>
                <div v-if="status.type === 'loading'" class="p-4 bg-blue-50 text-blue-700 rounded-lg flex items-center gap-3 border border-blue-200">
                    <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-700"></div>
                    <span class="font-medium">{{ status.message }}</span>
                </div>
            </div>

            <!-- Storage Info -->
            <div class="mt-8 pt-8 border-t border-gray-100">
                <h4 class="font-bold text-gray-700 flex items-center gap-2 mb-4">
                    <Database class="text-gray-400" :size="18" /> 
                    Data Status: Stored Locally
                </h4>
                <div class="space-y-3 text-sm text-gray-600">
                    <p>
                        Your data is stored securely on <strong>this computer</strong>. 
                        No data is sent to the cloud.
                    </p>
                    <div class="p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <p class="font-medium text-gray-800 mb-1 leading-relaxed">Local Mode:</p>
                        <ul class="list-disc list-inside space-y-1 text-gray-600 leading-relaxed">
                            <li>Fast and offline-capable.</li>
                            <li>Use <strong>Export Backup</strong> regularly to keep your data safe.</li>
                            <li>PDFs are auto-saved to your Google Drive folder.</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
