// เจ้าหน้าที่อนุมัติเคส → snapshot ค่าบริการ (รวมยอดไม่สำเร็จ U165) · ตรวจรายละเอียดเคสแสดงความจุ/สี
import { openAs, shot, log, q, collect, trackApi, U, clean } from './_h.mjs'
const REF = process.argv[2]
const s = await openAs('uat.approver'); const { page } = s; const api = trackApi(page)
await page.goto(U + '/cases/submit'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(800)
const row = page.locator('tr', { hasText: REF }).first()
await row.getByRole('button', { name: /ตรวจ|พิจารณา|ดูรายละเอียด/ }).first().click(); await page.waitForTimeout(1500)
const d = page.getByRole('dialog').last(); const t = clean(await d.innerText())
log('approve', REF, 'detail asset:', t.match(/ข้อมูลทรัพย์.{0,300}/)?.[0] ?? t.slice(0, 300))
await shot(page, `approve-${REF}-detail`, { fullPage: true })
await d.getByRole('button', { name: /^รับเคส/ }).first().click(); await page.waitForTimeout(800)
const cd = page.getByRole('dialog').last(); log('approve', REF, 'dlg', clean(await cd.innerText()).slice(0, 300))
await cd.getByRole('button', { name: /ยืนยัน|รับเคส/ }).last().click().catch(() => {})
log('approve', REF, await collect(page, 4000), api.splice(0).map(x => x.slice(0, 160)))
log('approve', REF, q(`select c.status,c.service_fee_model_snapshot,c.service_fee_base_satang,c.service_fee_fail_fee_satang,c.projected_revenue_satang from cases c where case_ref='${REF}'`))
log('approve', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
