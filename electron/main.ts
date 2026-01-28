import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'url'
import { PDFDocument } from 'pdf-lib'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
    app.quit()
}

// Fix environment variables
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')

let win: BrowserWindow | null = null

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function createWindow() {
    const preloadPath = app.isPackaged
        ? path.join(__dirname, 'preload.mjs')
        : path.join(process.cwd(), 'dist-electron', 'preload.mjs')

    win = new BrowserWindow({
        icon: path.join(process.env.VITE_PUBLIC || '', 'electron-vite.svg'),
        width: 1200,
        height: 800,
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
        autoHideMenuBar: true,
    })

    if (VITE_DEV_SERVER_URL) {
        win.loadURL(VITE_DEV_SERVER_URL)
    } else {
        win.loadFile(path.join(process.env.DIST || '', 'index.html'))
    }
}

// Quit when all windows are closed.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})

app.whenReady().then(() => {
    createWindow()

    ipcMain.handle('select-invoice-path', async () => {
        const dir = await dialog.showOpenDialog({
            title: 'Select Invoice Output Folder (PDFs)',
            properties: ['openDirectory']
        })

        if (!dir.canceled && dir.filePaths.length > 0) {
            return dir.filePaths[0]
        }

        return null
    })

    ipcMain.handle(
        'save-pdf',
        async (
            _event,
            {
                filename,
                studentName,
                siblingNames,
                pdfBuffer,
                customPath
            }: {
                filename: string
                studentName: string
                siblingNames: string[]
                pdfBuffer: ArrayBuffer
                customPath?: string
            }
        ) => {
            const baseDir = customPath

            if (!baseDir) {
                throw new Error('Invoice output folder not set for this branch')
            }

            const sanitize = (s: string) =>
                s.replace(/[\\/:*?"<>|]/g, '').trim()

            const nameSet = new Set(
                [studentName, ...siblingNames].map(sanitize).filter(Boolean)
            )

            let targetDir: string | null = null

            // Try to find an existing directory that matches the set of names
            try {
                if (fs.existsSync(baseDir)) {
                    const entries = fs.readdirSync(baseDir, { withFileTypes: true })
                    for (const entry of entries) {
                        if (!entry.isDirectory()) continue

                        const parts = new Set(entry.name.split('&').map(p => p.trim()))
                        if (
                            parts.size === nameSet.size &&
                            [...parts].every(p => nameSet.has(p))
                        ) {
                            targetDir = path.join(baseDir!, entry.name)
                            break
                        }
                    }
                }
            } catch (err) {
                console.error('Error reading output path:', err)
            }
            if (!targetDir) {
                const folderName = [...nameSet].sort().join(' & ')
                targetDir = path.join(baseDir!, folderName)
            }

            fs.mkdirSync(targetDir, { recursive: true })

            const filePath = path.join(targetDir, sanitize(filename))
            await fs.promises.writeFile(filePath, Buffer.from(pdfBuffer))

            return { success: true, path: filePath }
        }
    )

    ipcMain.handle('generate-pdf', async (_event, htmlContent: string | string[]) => {
        const inputs = Array.isArray(htmlContent) ? htmlContent : [htmlContent]
        const buffers: Buffer[] = []

        const workerWin = new BrowserWindow({
            show: false,
            webPreferences: { offscreen: true }
        })

        try {
            for (const html of inputs) {
                await workerWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

                // Wait specifically for content to be ready instead of a long hardcoded delay
                await workerWin.webContents.executeJavaScript('document.fonts.ready')
                await new Promise(r => setTimeout(r, 50)) // Change 200 to 50

                const pdfBuffer = await workerWin.webContents.printToPDF({
                    pageSize: 'A4',
                    landscape: true,
                    printBackground: true,
                    marginsType: 1
                } as any)
                buffers.push(pdfBuffer)
            }
            // ... rest of your merge logic
            if (buffers.length === 0) return Buffer.alloc(0)
            if (buffers.length === 1) return buffers[0]

            // Merge PDFs if more than one
            const mergedPdf = await PDFDocument.create()
            for (const buffer of buffers) {
                const pdf = await PDFDocument.load(buffer)
                const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices())
                copiedPages.forEach((page) => mergedPdf.addPage(page))
            }
            const mergedBytes = await mergedPdf.save()
            return Buffer.from(mergedBytes)
        } finally {
            workerWin.destroy()
        }
    })

    ipcMain.handle('select-directory', async () => {
        if (!win) return null
        const result = await dialog.showOpenDialog(win, {
            properties: ['openDirectory']
        })
        if (result.canceled || result.filePaths.length === 0) {
            return null
        }
        return result.filePaths[0]
    })
})
