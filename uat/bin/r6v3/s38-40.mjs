// R6.38/39 สร้างรอบวางบิล CO1/CO2 + probe ซ้ำ · R6.40 ส่งบิล (ดับเบิลคลิก) + probe ซ้ำ
import { openAs, shot, BASE, settle, sleep, log, R, q, waitToast, flat, dlgText, api, guard2xx, CO1, CO2, TODAY, T0B } from './_hb.mjs'
log('=== s38-40', new Date().toISOString())
const f = await openAs('uat.finance'); const p = f.page
await p.goto(`${BASE}/finance?tab=revenue`); await settle(p); await sleep(1200)
log('revenue tab:', flat(await p.locator('main').innerText()).slice(0, 1500))
await shot(p, R, '67-R6.38-revenue-ready', { fullPage: true })
const posts = []; p.on('response', async r => { if (r.url().includes('/api/billing-batches') && r.request().method() !== 'GET') posts.push(`${r.status()} ${r.request().method()} ${(await r.text().catch(() => '')).slice(0, 300)}`) })
async function create(co, reason, shotName) {
  posts.length = 0
  await p.getByRole('button', { name: '+ สร้างรอบวางบิล' }).click(); await sleep(800)
  const d = p.locator('[role="dialog"]').last()
  await d.locator('select').first().selectOption(co); await d.locator('input[type=date]').fill(TODAY)
  await d.locator('textarea').fill(reason)
  log('billing modal:', await dlgText(p, 900))
  if (shotName) await shot(p, R, shotName)
  await d.getByRole('button', { name: 'สร้างรอบวางบิล' }).click()
  log('toast', await waitToast(p, 8000)); await sleep(1500); log('POST', posts)
}
await create(CO1, 'UAT R6 วางบิลรอบ ต.ค. 2569 บริษัท 1', '68-R6.38-create-billing-co1')
const d1 = await api(p, 'POST', '/api/billing-batches', { companyId: CO1, cutoffDate: TODAY, cycleId: null, reason: 'UAT R6 probe สร้างซ้ำ CO1' }); log('CO1 again', d1); guard2xx('co1-again', d1)
await create(CO2, 'UAT R6 วางบิลรอบ ต.ค. 2569 บริษัท 2')
const d2 = await api(p, 'POST', '/api/billing-batches', { companyId: CO2, cutoffDate: TODAY, cycleId: null, reason: 'UAT R6 probe สร้างซ้ำ CO2' }); log('CO2 again', d2); guard2xx('co2-again', d2)
const BB = `select f.short_name, b.period, b.status, b.total_satang, b.cutoff_date, b.due_date, b.due_date - b.cutoff_date days, b.wht_withheld_by_customer_satang wht_c, b.received_satang, b.id from billing_batches b join finance_companies f on f.id=b.company_id order by 1`
log(q(BB))
log(q(`select c.case_ref, r.status, f.short_name from revenues r join cases c on c.id=r.case_id left join billing_batches b on b.id=r.billing_batch_id left join finance_companies f on f.id=b.company_id order by 1`))
await p.reload(); await settle(p); await sleep(1000)
await shot(p, R, '69-R6.39-billing-drafts', { fullPage: true })
// R6.40 ส่ง
for (const [co, n] of [['ยูเอที ลิสซิ่ง', '70-R6.40-send-modal'], ['ยูเอที แคปปิตอล', null]]) {
  posts.length = 0
  const row = p.locator('tbody tr').filter({ hasText: co }).filter({ has: p.getByRole('button', { name: 'ส่งวางบิล' }) })
  log(`row ${co}`, await row.count())
  await row.first().getByRole('button', { name: 'ส่งวางบิล' }).click(); await sleep(600)
  const d = p.locator('[role="dialog"]').last()
  log('send modal:', await dlgText(p, 600))
  log('empty disabled:', await d.getByRole('button', { name: 'ยืนยันส่งบิล' }).isDisabled())
  await d.locator('textarea').fill('ส่งใบวางบิลทางอีเมลให้ฝ่ายบัญชีบริษัท UAT R6')
  if (n) await shot(p, R, n)
  await d.getByRole('button', { name: 'ยืนยันส่งบิล' }).dblclick()
  log('toast', await waitToast(p, 8000)); await sleep(2000); log('send responses', posts)
}
const bid = q(`select b.id from billing_batches b join finance_companies f on f.id=b.company_id where f.short_name='UATL'`).split('\n').map(s => s.trim()).find(s => /^[0-9a-f-]{36}$/.test(s))
const s2 = await api(p, 'PATCH', `/api/billing-batches/${bid}/send`, { reason: 'UAT R6 probe ส่งซ้ำ' }); log('send again', s2); guard2xx('send-again', s2)
await p.reload(); await settle(p); await sleep(1000)
log('revenue tab after:', flat(await p.locator('main').innerText()).slice(0, 1600))
await shot(p, R, '71-R6.40-billing-sent', { fullPage: true })
log(q(BB))
log(q(`select f.short_name, s.total_before_vat_satang, s.vat_satang, s.total_satang from sales_records s join finance_companies f on f.id=s.company_id order by 1`))
log(q(`select b.total_satang - round(sum(r.gross_satang) * f.wht_withheld_by_customer_pct / 100) alt from billing_batches b join finance_companies f on f.id=b.company_id join revenues r on r.billing_batch_id=b.id where f.short_name='UATL' group by b.id, f.wht_withheld_by_customer_pct`))
log(q(`select action,target_type,reason from audit_logs where created_at > '${T0B}' and target_type in ('billing_batches','sales_records','revenues') order by created_at`))
log('5xx', f.serverErrors, f.consoleErrors.slice(0, 3))
await f.browser.close()
