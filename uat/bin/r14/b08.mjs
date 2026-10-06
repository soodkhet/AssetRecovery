// R14.08 สร้างรอบวางบิล CO1 → probe CO1 ซ้อน → CO2 (uat.finance)
import { openAs, shot, BASE, settle, sleep, toasts, log, R, q, mainText, CO1, CO2 } from './_h.mjs'
const f = await openAs('uat.finance'); const p = f.page
const posts = []; p.on('response', async r => { if (r.url().includes('/api/billing-batches') && r.request().method() !== 'GET') posts.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname} ${(await r.text().catch(() => '')).slice(0, 700)}`) })
await p.goto(`${BASE}/finance?tab=revenue`); await settle(p); await sleep(1200)
const TODAY = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)
log('TODAY', TODAY)
async function create(co, name, tag) {
  posts.length = 0
  await p.getByRole('button', { name: '+ สร้างรอบวางบิล' }).click(); await sleep(800)
  const d = p.locator('[role="dialog"]').last()
  await d.locator('select').first().selectOption(co); await d.locator('input[type=date]').fill(TODAY)
  await d.locator('textarea').fill(`UAT R14 วางบิล ${name}`); await sleep(800)
  log(`modal ${tag}:`, (await d.innerText()).replace(/\s+/g, ' ').slice(0, 700))
  await d.getByRole('button', { name: 'สร้างรอบวางบิล' }).click(); await sleep(2500)
  log(`toast ${tag}`, await toasts(p, 500)); log('POST', posts)
  await shot(p, R, `08-create-${tag}`)
  if (await d.isVisible().catch(() => false)) { await p.keyboard.press('Escape'); await sleep(500) }
  await settle(p); await sleep(600)
}
await create(CO1, 'CO1', 'co1')
const n0 = q(`select count(*) from billing_batches`)
await create(CO1, 'CO1 ซ้อน (probe)', 'co1-dup-probe')
log('batches before/after probe', n0.split('\n')[2], q(`select count(*) from billing_batches`).split('\n')[2])
await create(CO2, 'CO2', 'co2')
log(q(`select batch_number,status,period,total_satang,wht_withheld_by_customer_satang wht,due_date from billing_batches order by created_at desc limit 2`))
log(await mainText(p, 1500))
await shot(p, R, '08-batches-list', { fullPage: true })
log('5xx', f.serverErrors, f.consoleErrors.slice(0, 3))
await f.browser.close()
