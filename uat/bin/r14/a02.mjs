// R14.02 approver รับเคส UAT-CO1-006 + UAT-CO2-R14 (ทีม A) → snapshot ค่าบริการ
import { openAs, shot, log, settle, sleep, R, q, BASE, toasts } from './_h.mjs'
const { browser, page, serverErrors } = await openAs('uat.approver')
await page.goto(`${BASE}/cases/submit`); await settle(page); await sleep(800)
for (const [ref, slug] of [['UAT-CO1-006', 'co1-006'], ['UAT-CO2-R14', 'co2-r14']]) {
  log(`== ${ref}`)
  await page.locator('tr', { hasText: ref }).first().getByRole('button', { name: 'พิจารณา' }).click()
  const dlg = page.getByRole('dialog').last(); await dlg.waitFor(); await sleep(1500)
  const t = (await dlg.innerText()).replace(/\s+/g, ' ')
  for (const k of ['ประมาณการรายได้', 'ทีมที่เสนอ', 'ค่าบริการ']) { const a = t.indexOf(k); if (a >= 0) log(k, '→', t.slice(a, a + 140)) }
  const tick = dlg.getByText('ตรวจเอกสารชุดแล้ว', { exact: false })
  if (await tick.count()) { log('มีช่องติ๊กเอกสารชุด → ติ๊ก'); await tick.first().click() }
  await shot(page, R, `02-review-${slug}`)
  const resP = page.waitForResponse(x => x.url().includes('/status') && x.request().method() === 'PATCH')
  await dlg.getByRole('button', { name: 'รับเคส & ยืนยันทีม', exact: true }).click()
  const res = await resP; log('PATCH', res.status(), (await res.text()).slice(0, 200))
  log('toasts', await toasts(page, 2500)); await settle(page); await sleep(500)
}
await shot(page, R, '02-approved', { fullPage: true })
log(q(`select c.case_ref,c.status,at.name team,c.projected_revenue_satang proj,t.version v,c.service_fee_model_snapshot m,c.service_fee_base_satang base,c.service_fee_rate_pct rate,c.service_fee_basis_snapshot basis from cases c left join teams at on at.id=c.assigned_team_id left join service_fee_templates t on t.id=c.service_fee_template_id where case_ref in ('UAT-CO1-006','UAT-CO2-R14')`))
log(q(`select c.case_ref,a.action,a.reason from audit_logs a join cases c on c.id=a.target_id where a.action='approve' and c.case_ref in ('UAT-CO1-006','UAT-CO2-R14')`))
log('5xx', serverErrors)
await browser.close()
