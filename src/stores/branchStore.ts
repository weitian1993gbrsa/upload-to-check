import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useStorage } from '@vueuse/core'

export interface Branch {
    id: string
    name: string
    address: string
    logo?: string
    receiptPrefix: string
    contactNumber: string
    email?: string
    category: 'School' | 'Academy' | 'Other'
    order?: number
    pdfFolderPath?: string
}

interface GlobalSettings {
    companyName: string
    address: string
    contactNumber: string
    email: string
    logo: string
    logoPosition: 'left' | 'center' | 'watermark'
    logoOpacity: number
    autoBackupEnabled: boolean
}

export const useBranchStore = defineStore('branch', () => {
    // Persist branches array
    const branches = useStorage<Branch[]>('branches', [])

    // Persist global settings
    const globalSettings = useStorage<GlobalSettings>('globalSettings', {
        companyName: 'GB Rope Skipping Academy',
        address: 'No. 8-2, Jalan Tasik Utama 10,\nMedan Niaga Tasik Damai',
        contactNumber: '+6016-721349',
        email: 'weitian1993.gbrsa@gmail.com',
        logo: '',
        logoPosition: 'watermark',
        logoOpacity: 0.1,
        autoBackupEnabled: true
    })

    const activeBranchId = useStorage<string>('activeBranchId', '')

    const activeBranch = computed(() =>
        branches.value.find(b => b.id === activeBranchId.value) || branches.value[0]
    )

    function setActiveBranch(id: string) {
        activeBranchId.value = id
    }

    function addBranch(branch: Omit<Branch, 'id'>) {
        const newOrder = branches.value.length > 0
            ? Math.max(...branches.value.map(b => b.order || 0)) + 1
            : 0

        const newBranch: Branch = {
            id: crypto.randomUUID(),
            ...branch,
            order: newOrder
        }

        branches.value.push(newBranch)
    }

    function updateBranch(id: string, updates: Partial<Omit<Branch, 'id'>>) {
        const index = branches.value.findIndex(b => b.id === id)
        if (index !== -1 && branches.value[index]) {
            branches.value[index] = { ...branches.value[index], ...updates } as Branch
        }
    }

    function updateGlobalSettings(updates: Partial<GlobalSettings>) {
        globalSettings.value = { ...globalSettings.value, ...updates }
    }

    function deleteBranch(id: string) {
        const index = branches.value.findIndex(b => b.id === id)
        if (index !== -1) {
            branches.value.splice(index, 1)
            if (activeBranchId.value === id) {
                activeBranchId.value = ''
            }
        }
    }

    function duplicateBranch(id: string) {
        const branchToCopy = branches.value.find(b => b.id === id)
        if (branchToCopy) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id: _, ...rest } = branchToCopy
            addBranch({
                ...rest,
                name: `${rest.name} (Copy)`
            })
        }
    }

    function reorderBranches(fromIndex: number, toIndex: number) {
        if (fromIndex < 0 || fromIndex >= branches.value.length || toIndex < 0 || toIndex >= branches.value.length) return

        const item = branches.value.splice(fromIndex, 1)[0]
        if (item) {
            branches.value.splice(toIndex, 0, item)
        }

        // Update order property
        branches.value.forEach((b, i) => b.order = i)
    }

    function initListeners() {
        // No-op
    }

    return {
        branches,
        globalSettings,
        activeBranchId,
        activeBranch,
        addBranch,
        updateBranch,
        setActiveBranch,
        deleteBranch,
        duplicateBranch,
        reorderBranches,
        updateGlobalSettings,
        initListeners
    }
})
