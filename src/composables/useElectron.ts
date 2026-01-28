export interface ElectronApi {
    savePdf: (payload: {
        filename: string
        studentName: string
        siblingNames: string[]
        pdfBuffer: ArrayBuffer
        customPath?: string
    }) => Promise<{ success: boolean, path?: string, error?: string }>
    selectDirectory: () => Promise<string | null>
    generatePdf: (htmlContent: string | string[]) => Promise<ArrayBuffer>
}

declare global {
    interface Window {
        invoiceApi?: ElectronApi
        electron?: ElectronApi
    }
}

export function useElectron() {
    // Check for either bridge name
    const getIsElectron = () => typeof window !== 'undefined' && (window.invoiceApi !== undefined || window.electron !== undefined)
    const api = typeof window !== 'undefined' ? (window.invoiceApi || window.electron) : undefined

    return {
        isElectron: getIsElectron(),
        savePdf: async (pdfBuffer: ArrayBuffer, filename: string, studentName: string, customPath?: string) => {
            if (api) {
                console.log(`[useElectron] Calling savePdf for: ${filename}`);
                return await api.savePdf({
                    filename,
                    studentName,
                    siblingNames: [], // Default to empty for standard saves
                    pdfBuffer,
                    customPath
                })
            }
            return { success: false, error: 'Not running in Electron' }
        },
        selectDirectory: async () => {
            if (api) {
                return await api.selectDirectory()
            }
            return null
        }
    }
}
