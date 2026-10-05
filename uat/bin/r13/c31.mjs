// R13c R13.31 — สร้างรอบวางบิล CO1 แล้ว CO2 ผ่านหน้าจอ (หลังแก้ BUG-155 / U86) · probe รอบร่างซ้อน · ส่งเฉพาะ CO2
import { openAs, shot, BASE, settle, sleep, toasts, log, R, q, mainText } from './_h.mjs'
const CO1 = 'e27e79bf-2344-4f52-8979-c58be09a9de6', CO2 = 'dd5c5017-775f-4e5f-8d5d-4735cc88ad56'
log('=== c31', new Date().toISOString())
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
  await d.locator('textarea').fill(`UAT R13c วางบิลรายได้ใหม่ ${name}`)
  log(`modal ${tag}:`, (await d.innerText()).replace(/\s+/g, ' ').slice(0, 700))
  await d.getByRole('button', { name: 'สร้างรอบวางบิล' }).click(); await sleep(2500)
  log(`toast ${tag}`, await toasts(p, 500)); log('POST', posts)
  await shot(p, R, `c31-create-${tag}`)
  if (await d.isVisible().catch(() => false)) { await p.keyboard.press('Escape'); await sleep(500) }
  await settle(p); await sleep(600)
}
await create(CO1, 'CO1', 'co1')
await create(CO2, 'CO2', 'co2')
// probe: CO1 มีรอบ draft ค้าง → สร้างซ้อนต้องถูกปฏิเสธ (ข้อความระบุเลข BL)
await create(CO1, 'CO1 ซ้อน (probe)', 'co1-dup-probe')
log(q(`select batch_number,status,period,total_satang,wht_withheld_by_customer_satang from billing_batches order by created_at`))
log(await mainText(p, 1800))
await shot(p, R, 'c31-batches-list', { fullPage: true })
// ส่งเฉพาะ CO2 (BL ที่เป็นของ CO2 ใหม่)
const row = p.locator('tr').filter({ hasText: 'แคปปิตอล' }).filter({ has: p.getByRole('button', { name: 'ส่งวางบิล' }) }).first()
log('send row:', (await row.innerText()).replace(/\s+/g, ' '))
posts.length = 0
await row.getByRole('button', { name: 'ส่งวางบิล' }).click(); await sleep(800)
const d = p.locator('[role="dialog"]').last()
const ta = d.locator('textarea'); if (await ta.count()) await ta.first().fill('UAT R13c ส่งใบวางบิลทางอีเมลให้ CO2 แล้ว')
log('send modal:', (await d.innerText()).replace(/\s+/g, ' ').slice(0, 600))
await d.getByRole('button', { name: 'ยืนยันส่งบิล' }).click(); await sleep(2500)
log('toast send', await toasts(p, 500)); log('POST', posts)
await settle(p); await sleep(600)
await shot(p, R, 'c31-after-send-co2', { fullPage: true })
log(q(`select b.batch_number,b.status,b.total_satang,b.sent_at,(select count(*) from revenues r where r.billing_batch_id=b.id) nrev from billing_batches b order by created_at`))
log(q(`select status,count(*) from revenues group by 1`))
log('5xx', f.serverErrors, f.consoleErrors.slice(0, 3))
await f.browser.close()
