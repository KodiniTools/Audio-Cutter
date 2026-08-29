import { chromium } from 'playwright-core'
import { existsSync, statSync } from 'node:fs'
const EXE='/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const WAV='/tmp/claude-0/-home-user-Audio-Cutter/3ce5a2b5-53a3-5864-a25b-b1b7099d2481/scratchpad/test.wav'
const OUT='/tmp/claude-0/-home-user-Audio-Cutter/3ce5a2b5-53a3-5864-a25b-b1b7099d2481/scratchpad'
const b = await chromium.launch({ executablePath: EXE, args:['--no-sandbox'] })
const p = await b.newPage()
const errs=[]; p.on('pageerror',e=>errs.push(e.message))
await p.addInitScript(() => { window.showSaveFilePicker = undefined })
await p.goto('http://127.0.0.1:5199/audio-cutter/', { waitUntil:'networkidle' })
await (await p.$('input[type=file]')).setInputFiles(WAV)
await p.waitForFunction(() => /Selection:|Auswahl:/.test(document.body.innerText), { timeout: 8000 })
// Auswahl 1000-3000ms (2s) via Spinner
const s=await p.$('input[aria-label="Start (ms)"]'); await s.fill('1000'); await s.dispatchEvent('input')
const e=await p.$('input[aria-label="End (ms)"]'); await e.fill('3000'); await e.dispatchEvent('input'); await p.waitForTimeout(100)
// Modus "Auswahl entfernen"
await p.click('button:has-text("Auswahl entfernen"), button:has-text("Remove selection")'); await p.waitForTimeout(100)
// Format WAV
await p.click('button:has-text("WAV")'); await p.waitForTimeout(100)
// Schneiden
await p.click('button:has-text("Schneiden & Exportieren"), button:has-text("Cut & Export")'); await p.waitForTimeout(1500)
let dl=null; p.on('download', async d=>{const path=OUT+'/remove_'+d.suggestedFilename(); await d.saveAs(path); dl=path})
await p.click('button:has-text("herunterladen"), button:has-text("Download")'); await p.waitForTimeout(1500)
const size = dl&&existsSync(dl)?statSync(dl).size:null
// erwartet ~3s mono 44100: 44 + 3*44100*2 = 264644
console.log('Remove-WAV Groesse:', size, '| erwartet ~264644 (3s)')
console.log('Fehler:', errs.length?errs:'(keine)')
await b.close()
