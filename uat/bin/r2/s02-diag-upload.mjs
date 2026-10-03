// วินิจฉัย upload ล้ม: แก้ไข C1 แนบบัตรประชาชน (ตาม R2.04) แล้วเก็บ body ของ Storage + toast ทันที
import { openAs, shot, BASE, log, q, SQL, settle, sleep } from './_h.mjs'
const { browser, page, consoleErrors } = await openAs('uat.admin')
const bodies = []
page.on('response', async r => { if (r.url().includes('/storage/v1/')) { bodies.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '').slice(0,80)} :: ${(await r.text().catch(() => '?')).slice(0, 300)}`) } })
await page.goto(`${BASE}/cases/submit`); await settle(page)
await page.locator('tr', { hasText: 'UAT-CO1-001' }).getByRole('button', { name: 'แก้ไข' }).click()
const dlg = page.getByRole('dialog'); await dlg.waitFor(); await sleep(800)
log('== diag edit modal title', await dlg.locator('h2').first().innerText().catch(() => '?'))
await dlg.locator('input[type=file]').nth(1).setInputFiles('uat/fixtures/files/C1-idcard.png')
await dlg.locator('#edit-note').fill('แนบสำเนาบัตรประชาชนที่ขาด')
await dlg.getByRole('button', { name: 'บันทึกการแก้ไข' }).click()
const seen = new Set()
for (let i = 0; i < 16; i++) { await sleep(400); for (const t of await page.getByRole('status').allInnerTexts().catch(() => [])) seen.add(t.replace(/\s+/g, ' ')); for (const t of await page.getByRole('alert').allInnerTexts().catch(() => [])) seen.add('ALERT ' + t.replace(/\s+/g, ' ')); if (i === 3) await shot(page, 'R2', 'R2.04-c1-upload-fail-toast') }
log('toasts seen', [...seen])
log('storage bodies', bodies)
log('console', consoleErrors)
log(q(SQL.docs('UAT-CO1-001')))
await browser.close()
