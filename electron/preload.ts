import { contextBridge, ipcRenderer } from 'electron'

console.log('[Preload] Preload script starting...')

const api = {
    selectInvoicePath: () =>
        ipcRenderer.invoke('select-invoice-path'),

    savePdf: (payload: {
        filename: string
        studentName: string
        siblingNames: string[]
        pdfBuffer: ArrayBuffer
        customPath?: string
    }) =>
        ipcRenderer.invoke('save-pdf', payload),

    generatePdf: (htmlContent: string | string[]) =>
        ipcRenderer.invoke('generate-pdf', htmlContent),

    selectDirectory: () =>
        ipcRenderer.invoke('select-directory')
}

// Expose under both names to ensure compatibility across all components
contextBridge.exposeInMainWorld('invoiceApi', api)
contextBridge.exposeInMainWorld('electron', api)
