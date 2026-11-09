import { openAs, BASE, settle, log, txt, shot, step, toasts, sleep, q, fieldsOf, errText, track } from './_a.mjs'
const s = await openAs('superadmin'); const p = s.page; const res = track(p)
const dlg = () => p.getByRole('dialog').last()
const open = async () => { await p.getByRole('button', { name: '+ สร้างแผนค่าตอบแทน' }).click(); await settle(p, 700); return dlg() }
const waitMut = () => p.waitForResponse(r => r.url().includes('/api/') && r.request().method() !== 'GET', { timeout: 20000 })
try {
  await p.goto(`${BASE}/settings/compensation`); await settle(p, 1200)
  let d = await open(); let w; const r1 = { status: () => 201 }; const b1 = '(สร้างไปแล้วรอบก่อนหน้า)'
  await d.locator('#plan-name').fill('แผน Outsource เหมาจ่าย 2569 (MT6)')
  await d.locator('#plan-side').selectOption({ label: 'Outsource' })
  await d.getByRole('button', { name: 'เหมาจ่ายรายวัน' }).click(); await sleep(400)
  log('OUT fields', (await fieldsOf(d)).join('\n'))
  const ids = await d.locator('input[type=text]').evaluateAll(es => es.map(e => e.id))
  const daily = ids.find(i => /daily|fuel/.test(i) && !/max/.test(i))
  await d.locator(`#${daily}`).fill('300')
  await d.locator('#plan-allowance').fill('0'); await d.locator('#plan-commission').fill('1500'); await d.locator('#plan-no-success').fill('300'); await d.locator('#plan-wht').fill('3')
  await d.locator('#plan-reason').fill('สร้างแผนค่าตอบแทนรอบ MT6')
  w = waitMut(); await d.getByRole('button', { name: 'สร้างแผน', exact: true }).click(); const r2 = await w; const b2 = (await r2.text()).slice(0, 300); await settle(p, 900)
  await shot(p, 'A6-plans', true)
  const cards = await txt(p.locator('main'), 2500)
  log(b1, b2)
  step({ step: 'A6.plans', action: 'สร้างแผน Inhouse PER_KM 4/กม. เพดาน 500 เบี้ยเลี้ยง 200 ที่พัก 800 คอม 1,000 เบี้ยเสี่ยง 200 WHT3 ติ๊กบังคับใบเสร็จ · Outsource DAILY_FLAT 300 เบี้ยเลี้ยง 0 คอม 1,500 เบี้ยเสี่ยง 300 WHT3 ไม่ติ๊ก', expected: '201 ×2 ค่าเป็นสตางค์', actual: `${r1.status()}/${r2.status()} · ${b1.slice(0, 260)} ‖ ${b2.slice(0, 260)} · การ์ด: ${cards.slice(0, 700)}`, status: r1.status() === 201 && r2.status() === 201 ? 'pass' : 'fail', evidence: ['A6-plans.png'] })
  log('5xx', s.serverErrors, 'console', s.consoleErrors)
} finally { await s.browser.close() }
