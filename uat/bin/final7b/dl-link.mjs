// ดาวน์โหลดไฟล์จากลิงก์/ปุ่มในแถว · node dl-link.mjs <user> <url> <ข้อความแถว> <ชื่อลิงก์>
import { openAs, log, U } from './_h.mjs'
import { mkdirSync } from 'node:fs'
const [u, url, rowText, linkName] = process.argv.slice(2)
const s = await openAs(u); const { page } = s; mkdirSync('uat/shots/final2/files', { recursive: true })
await page.goto(U + url); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200)
const scope = rowText === '-' ? page.locator('main') : page.locator('tr', { hasText: rowText }).first()
const dl = page.waitForEvent('download', { timeout: 15000 }).catch(() => null)
const pop = page.context().waitForEvent('page', { timeout: 15000 }).catch(() => null)
await scope.getByText(linkName, { exact: false }).first().click()
const f = await Promise.race([dl, pop.then(async p => { if (!p) return null; const r = await p.waitForEvent('response').catch(() => null); return { popup: p.url() } })])
if (f?.suggestedFilename) { const p = `uat/shots/final2/files/${f.suggestedFilename()}`; await f.saveAs(p); log('dl', u, 'saved', p) } else log('dl', u, 'no download', JSON.stringify(f))
log('dl', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
