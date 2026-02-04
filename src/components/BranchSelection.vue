<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useBranchStore, type Branch } from '../stores/branchStore'
import { useReceiptStore } from '../stores/receiptStore'
import { Plus, Building2, Copy, Pencil, Trash2, ArrowRight, Settings, Database, X, Move, FolderOpen, Folder } from 'lucide-vue-next'
import InvoicePreview from './InvoicePreview.vue'
import BackupManager from './BackupManager.vue'
import { useElectron } from '../composables/useElectron'

const { selectDirectory } = useElectron()

const branchStore = useBranchStore()
const receiptStore = useReceiptStore()

// Modal state
const isModalOpen = ref(false)
const isSettingsOpen = ref(false)
const isBackupOpen = ref(false)
const isPathsOpen = ref(false)
const modalMode = ref<'create' | 'edit'>('create')
const editingId = ref('')

const form = ref<Omit<Branch, 'id'>>({
    name: '',
    address: '',
    contactNumber: '',
    receiptPrefix: 'REC',
    logo: '',
    email: '',
    category: 'Academy'
})

const settingsForm = ref({
    companyName: '',
    address: '',
    contactNumber: '',
    email: '',
    logo: '',
    logoPosition: 'watermark' as 'left' | 'center' | 'watermark',
    logoOpacity: 0.1,
    autoBackupEnabled: true
})

async function pickBranchFolder(branch: Branch, e: Event) {
    e.stopPropagation()
    const path = await selectDirectory()
    if (path) {
        branchStore.updateBranch(branch.id, { pdfFolderPath: path })
    }
}

// Dummy receipt for preview purposes
const previewDummyReceipt = {
    id: 'preview',
    branchId: 'preview',
    receiptNumber: 'PREVIEW-001',
    date: new Date().toISOString(),
    receivedFrom: 'Sample Client Name',
    studentName: 'Student Name', 
    items: [
        { description: 'Service Fee', amount: 100, quantity: 1, discount: 0 },
        { description: 'Registration', amount: 50, quantity: 1, discount: 0 },
    ],
    paymentMethod: 'Cash',
    receivedBy: 'Admin',
    status: 'paid' as 'paid' | 'pending',
    createdAt: Date.now()
}

function openCreateModal() {
    modalMode.value = 'create'
    editingId.value = ''
    form.value = {
        name: '',
        address: '',
        contactNumber: '',
        receiptPrefix: 'REC',
        logo: '',
        email: '',
        category: 'Academy'
    }
    isModalOpen.value = true
}

function openEditModal(branch: Branch) {
    modalMode.value = 'edit'
    editingId.value = branch.id
    form.value = {
        name: branch.name,
        address: branch.address,
        contactNumber: branch.contactNumber,
        receiptPrefix: branch.receiptPrefix,
        logo: branch.logo || '',
        email: branch.email || '',
        category: branch.category || 'Academy'
    }
    isModalOpen.value = true
}

function openSettingsModal() {
    settingsForm.value = { 
        ...branchStore.globalSettings
    }
    isSettingsOpen.value = true
}


function resizeImage(base64Str: string, maxWidth = 300): Promise<string> {
    return new Promise((resolve) => {
        const img = new Image()
        img.src = base64Str
        img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        if (width > maxWidth) {
            height *= maxWidth / width
            width = maxWidth
        }

        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.7))
        }
    })
}

function handleLogoUpload(event: Event, type: 'branch' | 'global') {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (e) => {
        const base64 = e.target?.result as string
        const resized = await resizeImage(base64)
        
        if (type === 'global') {
            settingsForm.value.logo = resized
        } else {
            form.value.logo = resized
        }
    }
    reader.readAsDataURL(file)
}

function saveBranch() {
    if (!form.value.name) return
    
    if (modalMode.value === 'create') {
        branchStore.addBranch({
            ...form.value
        })
    } else {
        const branch = branchStore.branches.find(b => b.id === editingId.value)
        if (branch) {
            branchStore.updateBranch(editingId.value, form.value)
            receiptStore.updateReceiptPrefix(editingId.value, form.value.receiptPrefix)
        }
    }
    
    isModalOpen.value = false
}

function saveSettings() {
    branchStore.globalSettings = { 
        ...settingsForm.value,
        autoBackupEnabled: settingsForm.value.autoBackupEnabled ?? true
    }
    isSettingsOpen.value = false
}

function selectBranch(id: string) {
    branchStore.setActiveBranch(id)
}

function duplicate(id: string, e: Event) {
    e.stopPropagation()
    branchStore.duplicateBranch(id)
}

function remove(id: string, e: Event) {
    e.stopPropagation()
    if (confirm('Are you sure you want to delete this profile?')) {
        branchStore.deleteBranch(id)
    }
}

function edit(branch: Branch, e: Event) {
    e.stopPropagation()
    openEditModal(branch)
}

// Drag and Drop Logic
const draggedIndex = ref<number | null>(null)

function onDragStart(index: number, event: DragEvent) {
    draggedIndex.value = index
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.dropEffect = 'move'
    }
}

function onDrop(dropIndex: number) {
    if (draggedIndex.value === null || draggedIndex.value === dropIndex) return
    branchStore.reorderBranches(draggedIndex.value, dropIndex)
    draggedIndex.value = null
}

function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
        if (isModalOpen.value) isModalOpen.value = false
        else if (isSettingsOpen.value) isSettingsOpen.value = false
        else if (isBackupOpen.value) isBackupOpen.value = false
        else if (isPathsOpen.value) isPathsOpen.value = false
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
  <div class="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
    <div class="w-full px-4 space-y-8">
      <div class="text-center relative">
        <h2 class="mt-6 text-3xl font-extrabold text-gray-900">GBRSA Invoice System</h2>
        
        <div class="absolute top-0 right-0 flex flex-row gap-2">
            <button @click="isPathsOpen = true" class="text-gray-400 hover:text-blue-600 bg-white p-2 rounded-full shadow-sm hover:shadow transition-all border border-gray-100" title="Manage Save Paths">
                <Folder :size="24" />
            </button>
            <button @click="openSettingsModal" class="text-gray-400 hover:text-gray-700 bg-white p-2 rounded-full shadow-sm hover:shadow transition-all border border-gray-100" title="Global Settings">
                <Settings :size="24" />
            </button>
            <button @click="isBackupOpen = true" class="text-gray-400 hover:text-blue-600 bg-white p-2 rounded-full shadow-sm hover:shadow transition-all border border-gray-100" title="Backup & Restore">
                <Database :size="24" />
            </button>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div 
            v-for="(branch, index) in branchStore.branches" 
            :key="branch.id"
            draggable="true"
            @dragstart="onDragStart(index, $event)"
            @dragover.prevent
            @dragenter.prevent
            @drop="onDrop(index)"
            @click="selectBranch(branch.id)"
            class="relative group bg-white p-6 rounded-lg shadow-sm hover:shadow-md transition-all cursor-pointer border border-gray-200 flex flex-col h-full items-center text-center justify-center min-h-[200px]"
            :class="{ 'border-blue-500 border-2 bg-blue-50': draggedIndex === index }"
        >
            <div class="absolute top-2 left-2 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-move p-1">
                <Move :size="16" />
            </div>

            <div class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" @click.stop>
                <button @click="e => edit(branch, e)" class="p-1 text-gray-400 hover:text-blue-600 rounded bg-white shadow-sm" title="Edit">
                    <Pencil :size="14" />
                </button>
                <button @click="e => duplicate(branch.id, e)" class="p-1 text-gray-400 hover:text-green-600 rounded bg-white shadow-sm" title="Duplicate">
                    <Copy :size="14" />
                </button>
                <button @click="e => remove(branch.id, e)" class="p-1 text-gray-400 hover:text-red-600 rounded bg-white shadow-sm" title="Delete">
                    <Trash2 :size="14" />
                </button>
            </div>

            <div class="h-14 w-14 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold mb-4">
                <img v-if="branch.logo" :src="branch.logo" class="h-full w-full object-cover rounded-full" />
                <Building2 v-else :size="28" />
            </div>
            
            <h3 class="text-xl font-bold text-gray-900 mb-1">{{ branch.name }}</h3>
            <span class="text-xs font-mono bg-gray-100 text-gray-500 px-2 py-1 rounded">{{ branch.receiptPrefix }}</span>
            
            <div class="mt-4 flex items-center text-blue-600 font-medium text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                Select <ArrowRight :size="16" class="ml-1" />
            </div>
        </div>

        <button 
            @click="openCreateModal"
            class="bg-gray-50 border-2 border-dashed border-gray-300 p-6 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors flex flex-col items-center justify-center text-center h-full min-h-[200px]"
        >
            <Plus :size="32" class="text-gray-400 group-hover:text-blue-500 mb-3" />
            <span class="text-gray-600 font-medium group-hover:text-blue-600">Add New Client</span>
        </button>
      </div>
    </div>

    <div v-if="isModalOpen" class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div class="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 class="text-xl font-bold text-gray-800 mb-4">{{ modalMode === 'create' ? 'Add New Client' : 'Edit Client' }}</h3>
            
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700">Client / School Name *</label>
                    <input v-model="form.name" type="text" placeholder="e.g. SJK(C) La Salle" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700">Client Category</label>
                    <select v-model="form.category" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 focus:ring-blue-500 focus:border-blue-500">
                        <option value="Academy">Academy</option>
                        <option value="School">School</option>
                        <option value="Other">Other</option>
                    </select>
                </div>

                <div class="flex flex-col gap-2">
                    <label class="block text-sm font-medium text-gray-700">Client Logo (Optional)</label>
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 border rounded bg-gray-50 flex items-center justify-center overflow-hidden">
                            <img v-if="form.logo" :src="form.logo" class="object-contain w-full h-full" />
                            <Building2 v-else class="text-gray-300" :size="24" />
                        </div>
                        <input type="file" @change="e => handleLogoUpload(e, 'branch')" accept="image/*" class="text-xs flex-grow" />
                    </div>
                </div>
                
                <div class="bg-blue-50 p-3 rounded text-sm text-blue-800">
                    <p>Tip: Company details are managed in Global Configuration.</p>
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700">Receipt Prefix</label>
                    <input v-model="form.receiptPrefix" type="text" placeholder="e.g. GBRSA2026" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 focus:ring-blue-500 focus:border-blue-500 uppercase" />
                    <div class="mt-1.5 flex flex-col gap-1">
                        <div class="text-[10px] text-gray-500 leading-tight">
                            Format: <span class="font-mono text-blue-600 font-bold">{{ form.receiptPrefix || 'PREFIX' }}_MM_XXX</span>
                        </div>
                        <div class="text-[10px] text-gray-400 italic">
                            Sequential counter resets every month automatically.
                        </div>
                    </div>
                </div>
            </div>

            <div class="mt-6 flex justify-end gap-3">
                <button @click="isModalOpen = false" class="px-4 py-2 text-gray-600 hover:text-gray-800">Cancel</button>
                <div class="flex gap-2">
                    <button v-if="modalMode === 'edit'" @click="saveBranch" class="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm font-medium">
                        Sync History
                    </button>
                    <button @click="saveBranch" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium">
                        {{ modalMode === 'create' ? 'Create Client' : 'Save Changes' }}
                    </button>
                </div>
            </div>
        </div>
    </div>

    <div v-if="isSettingsOpen" class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div class="bg-white rounded-lg shadow-xl max-w-6xl w-full p-6 max-h-[90vh] flex flex-col">
            <h3 class="text-xl font-bold text-gray-800 mb-1">Global Configuration</h3>
            <p class="text-sm text-gray-500 mb-6 border-b pb-4">Set default company details. Use the preview to verify how they look.</p>

            <div class="flex gap-8 overflow-hidden h-full">
                <div class="w-1/3 overflow-y-auto pr-2 space-y-5 custom-scrollbar">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                        <input v-model="settingsForm.companyName" type="text" class="w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500" placeholder="e.g. Acme Corp HQ" />
                    </div>
                    
                    <div class="flex flex-col gap-2">
                        <label class="block text-sm font-medium text-gray-700">Company Logo</label>
                        <div class="flex items-center gap-4">
                            <div class="w-16 h-16 border rounded bg-gray-50 flex items-center justify-center overflow-hidden">
                                <img v-if="settingsForm.logo" :src="settingsForm.logo" class="object-contain w-full h-full" />
                                <Building2 v-else class="text-gray-300" :size="32" />
                            </div>
                            <div class="flex-grow">
                                <input type="file" @change="e => handleLogoUpload(e, 'global')" accept="image/*" class="text-xs file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                            </div>
                        </div>
                    </div>

                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-4">
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider">Logo Overlay Settings</label>
                        
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1 flex justify-between">
                                Overlay Opacity
                                <span class="font-mono">{{ (settingsForm.logoOpacity * 100).toFixed(0) }}%</span>
                            </label>
                            <input v-model.number="settingsForm.logoOpacity" type="range" min="0.05" max="0.3" step="0.01" class="w-full h-1 bg-blue-100 rounded-lg appearance-none cursor-pointer" />
                            <p class="text-[9px] text-gray-400 mt-2">Adjust how visible the middle-page logo is.</p>
                        </div>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Default Address</label>
                        <textarea v-model="settingsForm.address" rows="3" class="w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Full address..."></textarea>
                    </div>

                    <div class="grid grid-cols-1 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Contact Number</label>
                            <input v-model="settingsForm.contactNumber" type="text" class="w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500" />
                        </div>
                         <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                            <input v-model="settingsForm.email" type="email" class="w-full border rounded-md p-2 focus:ring-blue-500 focus:border-blue-500" />
                        </div>
                    </div>
                    
                    <div class="pt-4 flex justify-end gap-3 sticky bottom-0 bg-white border-t mt-auto">
                        <button @click="isSettingsOpen = false" class="px-4 py-2 text-gray-600 hover:text-gray-800">Cancel</button>
                        <button @click="saveSettings" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium">Save Settings</button>
                    </div>
                </div>

                <div class="w-2/3 bg-gray-200 rounded-lg p-4 flex flex-col items-center justify-start overflow-hidden border border-gray-300 relative h-[660px]">
                    <h4 class="absolute top-4 left-6 text-xs font-bold text-gray-400 uppercase tracking-widest z-10">Live Preview</h4>
                    
                    <div class="w-full h-full flex justify-center items-start pt-5">
                        <div class="transform scale-[0.55] origin-top shadow-2xl">
                             <InvoicePreview :receipt="previewDummyReceipt" :branchOverride="settingsForm" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div v-if="isBackupOpen" class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full p-6 max-h-[90vh] flex flex-col relative">
            <button @click="isBackupOpen = false" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                <X :size="20" />
            </button>
            <h3 class="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                <Database :size="24" class="text-blue-600" />
                Backup & Restore
            </h3>
            
            <div class="overflow-y-auto">
                <BackupManager />
            </div>
        </div>
    </div>

    <div v-if="isPathsOpen" class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[90vh] flex flex-col relative">
            <button @click="isPathsOpen = false" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                <X :size="20" />
            </button>
            <h3 class="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                <Folder :size="24" class="text-blue-600" />
                Manage Save Locations
            </h3>
            <p class="text-sm text-gray-500 mb-4">Select where invoices are saved for each profile.</p>
            
            <div class="space-y-3 overflow-y-auto custom-scrollbar pr-2">
                <div v-for="branch in branchStore.branches" :key="branch.id" class="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div class="flex items-center gap-3">
                         <div class="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center font-bold text-xs overflow-hidden">
                            <img v-if="branch.logo" :src="branch.logo" class="w-full h-full object-cover" />
                            <span v-else>{{ branch.receiptPrefix.substring(0, 2) }}</span>
                        </div>
                        <div>
                            <div class="font-bold text-gray-800">{{ branch.name }}</div>
                            <div class="text-xs font-mono break-all" :class="branch.pdfFolderPath ? 'text-gray-500' : 'text-red-500'">
                                {{ branch.pdfFolderPath || 'No folder selected' }}
                            </div>
                        </div>
                    </div>
                    <button 
                        @click="e => pickBranchFolder(branch, e)"
                        class="px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-all flex items-center gap-2"
                    >
                        <FolderOpen :size="16" /> Change
                    </button>
                </div>
            </div>
            
            <div class="mt-6 flex justify-end">
                <button @click="isPathsOpen = false" class="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm font-medium">Close</button>
            </div>
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
