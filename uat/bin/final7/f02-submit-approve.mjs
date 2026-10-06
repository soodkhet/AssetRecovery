// Flow 2 — ธุรการส่งตรวจ FINAL7-001 → เจ้าหน้าที่อนุมัติเคส (ตรวจ snapshot ค่าบริการตอน approved)
import { openAs, shot, log, q } from './_h.mjs'
import { collect, trackApi } from '../r2/_h.mjs'
const REF = 'FINAL7-001'
if (!process.env.SKIPADMIN) { const s = await openAs('uat.admin'); const { page } = s; const api = trackApi(page)
  await page.goto('http://localhost:3000/cases/submit'); await page.waitForLoadState('networkidle')
  const row = page.locator('tr', { hasText: REF }).first()
  log('f02', 'row:', (await row.innerText()).replace(/\s+/g, ' '))
  if (process.env.ADDPHOTO) { await row.getByRole('button', { name: 'แก้ไข' }).click(); const ed = page.getByRole('dialog'); await ed.waitFor(); await page.waitForTimeout(800)
    const fi = ed.locator('input[type=file]'); log('f02', 'file inputs', await fi.count()); await fi.nth(await fi.count() - 1).setInputFiles('uat/fixtures/files/C1-product.png'); await page.waitForTimeout(500)
    await ed.getByRole('button', { name: /บันทึก/ }).last().click(); log('f02', 'edit toasts', await collect(page, 6000), api.splice(0).map(x => x.slice(0, 120))); await page.waitForLoadState('networkidle') }
  await row.getByRole('button', { name: 'ส่งตรวจสอบเคส' }).click(); await page.waitForTimeout(800)
  const cd = page.getByRole('dialog')
  if (await cd.isVisible().catch(() => false)) { log('f02', 'confirm:', (await cd.innerText()).replace(/\s+/g, ' ').slice(0, 300)); await shot(page, 'final/flow', 'f02-submit-confirm'); await cd.getByRole('button', { name: /ยืนยัน|ส่ง/ }).last().click() }
  log('f02', 'toasts', await collect(page, 4000), api.splice(0).map(x => x.slice(0, 140)))
  log('f02', 'console', s.consoleErrors, s.serverErrors); await s.browser.close() }
log('f02', q(`select status from cases where case_ref='${REF}'`))
{ const s = await openAs('uat.approver'); const { page } = s; const api = trackApi(page)
  await page.goto('http://localhost:3000/cases/submit'); await page.waitForLoadState('networkidle')
  const row = page.locator('tr', { hasText: REF }).first()
  log('f02', 'approver row:', (await row.innerText()).replace(/\s+/g, ' '))
  log('f02', 'approver row buttons', (await row.getByRole('button').allInnerTexts()).join('|'))
  await row.getByRole('button', { name: /ตรวจ|พิจารณา|ดูรายละเอียด/ }).first().click(); await page.waitForTimeout(1200)
  const d = page.getByRole('dialog').last()
  log('f02', 'detail buttons:', (await d.getByRole('button').allInnerTexts()).map(x => x.trim()).filter(Boolean).join(' | '))
  await shot(page, 'final/flow', 'f02-approver-detail', { fullPage: true })
  // validation: ไม่รับเคส เหตุผลว่าง
  const rej = d.getByRole('button', { name: /^ไม่รับ/ }).first()
  log('f02', 'reject disabled w/o reason:', await rej.isDisabled(), await rej.getAttribute('title')); if (false) { await rej.click(); await page.waitForTimeout(600)
    const rd = page.getByRole('dialog').last(); log('f02', 'reject dlg:', (await rd.innerText()).replace(/\s+/g, ' ').slice(0, 250))
    const btns = (await rd.getByRole('button').allInnerTexts()).map(x => x.trim()); log('f02', 'reject btns', btns.join('|'))
    const conf = rd.getByRole('button', { name: /ยืนยัน/ }).last(); if (await conf.count()) { log('f02', 'confirm disabled?', await conf.isDisabled()); if (!(await conf.isDisabled())) { await conf.click(); await page.waitForTimeout(800); log('f02', 'empty reason msgs', await collect(page, 1500), (await rd.innerText()).replace(/\s+/g, ' ').slice(0, 300)) } }
    await shot(page, 'final/flow', 'f02-reject-empty-reason')
    await rd.getByRole('button', { name: /ยกเลิก|ปิด/ }).first().click().catch(() => page.keyboard.press('Escape')); await page.waitForTimeout(500) }
  log('f02', 'api after reject probe', api.splice(0))
  const d2 = page.getByRole('dialog').last()
  await d2.getByRole('button', { name: /^รับเคส/ }).first().click(); await page.waitForTimeout(800)
  const cd = page.getByRole('dialog').last(); log('f02', 'approve dlg:', (await cd.innerText()).replace(/\s+/g, ' ').slice(0, 400))
  await shot(page, 'final/flow', 'f02-approve-dlg', { fullPage: true })
  await cd.getByRole('button', { name: /ยืนยัน|รับเคส/ }).last().click().catch(e => log('f02', 'no confirm dialog'))
  log('f02', 'approve toasts', await collect(page, 4000), api.splice(0).map(x => x.slice(0, 160)))
  log('f02', 'console', s.consoleErrors, s.serverErrors); await s.browser.close() }
log('f02', q(`select c.status,t.name team,c.service_fee_model_snapshot,c.service_fee_rate_pct,c.service_fee_basis_snapshot,c.projected_revenue_satang from cases c left join teams t on t.id=coalesce(c.assigned_team_id,c.suggested_team_id) where case_ref='${REF}'`))
