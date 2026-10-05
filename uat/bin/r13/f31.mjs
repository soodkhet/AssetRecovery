// R13.31 สร้างรอบวางบิล CO2/CO1 ผ่านหน้าจอ — ตรวจผล (รอบ ต.ค. ของทั้งสองบริษัทมีอยู่แล้ว paid)
import { openAs, shot, BASE, settle, sleep, toasts, log, R, q, mainText } from './_h.mjs'
const CO1 = 'e27e79bf-2344-4f52-8979-c58be09a9de6', CO2 = 'dd5c5017-775f-4e5f-8d5d-4735cc88ad56'
log('=== f31', new Date().toISOString())
const f = await openAs('uat.finance'); const p = f.page
const posts = []; p.on('response', async r => { if (r.url().includes('/api/billing-batches') && r.request().method() !== 'GET') posts.push(`${r.status()} ${(await r.text().catch(() => '')).slice(0, 500)}`) })
await p.goto(`${BASE}/finance?tab=revenue`); await settle(p); await sleep(1200)
log('revenue tab:', await mainText(p, 1800))
await shot(p, R, '31-revenue-ready', { fullPage: true })
const TODAY = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)
for (const [co, name] of [[CO2, 'co2'], [CO1, 'co1']]) {
  posts.length = 0
  await p.getByRole('button', { name: '+ สร้างรอบวางบิล' }).click(); await sleep(800)
  const d = p.locator('[role="dialog"]').last()
  await d.locator('select').first().selectOption(co); await d.locator('input[type=date]').fill(TODAY)
  await d.locator('textarea').fill(`UAT R13 วางบิลรายได้ใหม่ ${name.toUpperCase()}`)
  log('modal:', (await d.innerText()).replace(/\s+/g, ' ').slice(0, 900))
  await d.getByRole('button', { name: 'สร้างรอบวางบิล' }).click(); await sleep(2500)
  log('toast', await toasts(p, 500)); log('dialog after:', (await d.innerText().catch(() => '(closed)')).replace(/\s+/g, ' ').slice(0, 600))
  log('POST', posts)
  await shot(p, R, `31-create-${name}-result`)
  await p.keyboard.press('Escape'); await sleep(500)
}
log(q(`select batch_number,period,status,total_satang from billing_batches order by created_at`))
log('5xx', f.serverErrors, f.consoleErrors.slice(0, 3))
await f.browser.close()
