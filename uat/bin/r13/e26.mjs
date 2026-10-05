// R13.26 สร้างไฟล์ธนาคาร + ดาวน์โหลดไฟล์ + ใบสำคัญจ่าย · probe ยกเลิกโดยไม่ติ๊กยืนยันไฟล์
import { writeFileSync, mkdirSync } from 'node:fs'
import { openAs, shot, log, settle, sleep, R, q, BASE, toasts } from './_h.mjs'
const NAME = 'UAT IN-R13b', ID = 'c1e8fdb8-c6bf-4a6a-b817-ca5939adcca2'
const BFF = 'add7ece2-24bc-4166-bbf5-2f6c4b1702d7', BACC = 'c30800c4-52c6-431a-a357-b073cf077b89'
const DL = 'uat/fixtures/downloads-R13'; mkdirSync(DL, { recursive: true })
const flat = s => s.replace(/\s*\n+\s*/g, ' | ')
const { browser, page } = await openAs('uat.finance')
await page.goto(`${BASE}/finance?tab=payout`); await settle(page); await sleep(1000)
await page.locator('tbody tr').filter({ hasText: NAME }).getByRole('button', { name: /สร้างไฟล์โอน/ }).click(); await sleep(1500)
const d = page.locator('[role="dialog"]').last()
await d.locator('select').first().selectOption(BFF); await d.locator('select').nth(1).selectOption(BACC)
await d.locator('textarea').first().fill('UAT R13 สร้างไฟล์โอนรอบ IN-R13b')
log('gen modal', flat(await d.innerText()).slice(0, 700))
const [resp] = await Promise.all([page.waitForResponse(x => x.url().includes('/generate-payment-file'), { timeout: 20000 }), d.getByRole('button', { name: /^สร้างไฟล์โอน$/ }).click()])
log('gen', resp.status(), (await resp.text()).slice(0, 300)); log('toasts', await toasts(page, 2500))
await shot(page, R, '26-file-generated')
const dlg2 = page.locator('[role="dialog"]').last(); if (await dlg2.count()) await dlg2.getByRole('button', { name: 'ปิด' }).click().catch(() => {})
for (const [p, fn] of [['payment-file', 'IN-R13b-payment.csv'], ['voucher-pdf', 'IN-R13b-voucher.pdf'], ['summary-pdf', 'IN-R13b-summary.pdf']]) {
  const r = await page.request.get(`${BASE}/api/payout-batches/${ID}/${p}`, { failOnStatusCode: false })
  writeFileSync(`${DL}/${fn}`, await r.body()); log('download', p, r.status(), r.headers()['content-type'], r.headers()['content-disposition'])
}
log('csv:\n' + (await import('node:fs')).readFileSync(`${DL}/IN-R13b-payment.csv`, 'utf8').slice(0, 800))
// probe ยกเลิก
await page.reload(); await settle(page); await sleep(1000)
await page.locator('tbody tr').filter({ hasText: NAME }).getByRole('button', { name: 'ดูรายการ' }).click(); await sleep(1500)
await page.locator('[role="dialog"]').last().getByRole('button', { name: /ยกเลิกรอบ/ }).first().click(); await sleep(900)
const c = page.locator('[role="dialog"]').last()
log('cancel modal', flat(await c.innerText()).slice(0, 800))
await c.locator('textarea').first().fill('UAT R13 probe ยกเลิกหลังสร้างไฟล์')
const cb = c.getByRole('button', { name: /ยืนยัน|ยกเลิกรอบ/ }).last()
log('confirm disabled w/o checkbox?', await cb.isDisabled())
await shot(page, R, '26-cancel-needs-file-confirm')
const r0 = await page.request.post(`${BASE}/api/payout-batches/${ID}/cancel`, { data: { reason: 'UAT R13 probe ยกเลิกหลังสร้างไฟล์' }, failOnStatusCode: false })
log('API cancel w/o confirm', r0.status(), (await r0.text()).slice(0, 300))
await c.getByRole('button', { name: /ปิด|กลับ|ไม่ยกเลิก/ }).first().click().catch(() => page.keyboard.press('Escape'))
await browser.close()
log(q(`select name,status,gross_satang,wht_satang,net_satang,advance_offset_satang from payout_batches where id='${ID}'`))
