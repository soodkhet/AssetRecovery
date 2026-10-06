// R15b.02 ดาวน์โหลด PDF ใบรับรองแทนใบเสร็จผ่านปุ่มบนหน้าจอ in1
import { writeFileSync } from 'node:fs'
import { openAs, shot, BASE, settle, sleep, log, R, DL } from './_h.mjs'
const { browser, page, serverErrors } = await openAs('uat.agent.in1', { mobile: true })
await page.goto(`${BASE}/field/expenses`); await settle(page); await sleep(1000)
await page.getByRole('button', { name: 'เบิกแยก', exact: true }).click(); await sleep(900)
const btn = page.getByRole('button', { name: 'ดาวน์โหลดใบรับรอง PDF' }).or(page.getByRole('link', { name: 'ดาวน์โหลดใบรับรอง PDF' })).first()
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }).catch(e => null), btn.click()])
if (dl) { const p = `${DL}/${process.env.NAME ?? 'crt-0001'}.pdf`; await dl.saveAs(p); log('download', dl.suggestedFilename(), p) }
else { await sleep(2000); log('no download event; pages', browser.contexts()[0].pages().map(x => x.url())) }
log('5xx', serverErrors)
await browser.close()
