// R10g.2 ดาวน์โหลดแม่แบบนำเข้าเคส .xlsx + .csv
import { mkdirSync } from 'node:fs'
import { openAs, shot, BASE } from '../lib.mjs'
import { log } from './_h.mjs'
const DIR = 'uat/fixtures/downloads-R10v3'; mkdirSync(DIR, { recursive: true })
const o = await openAs('uat.admin'); await o.page.goto(BASE + '/cases/submit'); await o.page.waitForLoadState('networkidle')
await o.page.getByRole('button', { name: 'Import ไฟล์' }).click(); await o.page.waitForTimeout(800)
await shot(o.page, 'R10v3', 'g2-01-import-modal')
let [d] = await Promise.all([o.page.waitForEvent('download'), o.page.getByRole('button', { name: /ดาวน์โหลดไฟล์ตัวอย่าง/ }).click()])
await d.saveAs(`${DIR}/${d.suggestedFilename()}`); log('XLSX', d.suggestedFilename())
;[d] = await Promise.all([o.page.waitForEvent('download'), o.page.getByText('หรือ CSV', { exact: true }).click()])
await d.saveAs(`${DIR}/${d.suggestedFilename()}`); log('CSV', d.suggestedFilename())
log('srvErr', o.serverErrors.join(';'), 'console', o.consoleErrors.length)
await o.browser.close()
