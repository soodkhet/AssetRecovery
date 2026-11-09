import { openAs, BASE, settle, log, txt, shot, step, sleep, errText, track, fieldsOf } from './_a.mjs'
const s = await openAs('superadmin'); const p = s.page; const res = track(p)
// กันบันทึก: ดักทุก POST /api/users ไม่ให้ไปถึง server
await p.route(u => /\/api\/users\/?$/.test(new URL(u).pathname), r => r.request().method() === 'POST' ? r.abort() : r.continue())
try {
  await p.goto(`${BASE}/settings/users`); await settle(p, 1200)
  await p.getByRole('button', { name: '+ สร้างบัญชี' }).click(); await settle(p, 800)
  const d = p.getByRole('dialog').last()
  log((await fieldsOf(d)).join('\n'))
  const btn = (await d.locator('[data-modal-footer] button').allInnerTexts()).pop().trim()
  const n0 = res.length
  await d.getByRole('button', { name: btn, exact: true }).click(); await sleep(1000)
  const e1 = [...new Set(await errText(d))]; const f1 = await p.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)
  await shot(p, 'A9-user-empty')
  await d.locator('#user-username').fill('สมชาย ใจดี'); await d.locator('#user-email').fill('abc@'); await d.locator('#user-phone').fill('12')
  await d.locator('#user-name').fill('ก')
  await d.getByRole('button', { name: btn, exact: true }).click(); await sleep(1000)
  const e2 = [...new Set(await errText(d))]
  await shot(p, 'A9-user-invalid')
  await p.keyboard.press('Escape'); await sleep(600)
  const ad = await p.locator('[role=alertdialog]').isVisible().catch(() => false)
  if (ad) await p.getByRole('button', { name: 'ทิ้งข้อมูล' }).click(); await sleep(500)
  await p.getByRole('button', { name: '+ สร้างบัญชี' }).click(); await settle(p, 800)
  const re = await p.getByRole('dialog').last().locator('#user-username').inputValue()
  await p.getByRole('dialog').last().getByRole('button', { name: 'ยกเลิก' }).click(); await sleep(400)
  step({ step: 'A9.user-create-validation', action: "+ สร้างบัญชี: กดสร้างว่าง · username 'สมชาย ใจดี' / อีเมล 'abc@' / เบอร์ '12' / ชื่อ 'ก' (ไม่กรอกรหัสผ่าน · ดัก POST ไม่ให้บันทึก) · Esc → ทิ้ง → เปิดใหม่", expected: 'ข้อความไทยครบ ไม่ยิง API · Esc ถามทิ้ง · เปิดใหม่ว่าง', actual: `ว่าง: ${e1.join(' / ')} (focus=${f1}) · ค่าผิด: ${e2.join(' / ')} · API ${res.length - n0} · Esc ถามทิ้ง ${ad} · เปิดใหม่ username='${re}'`, status: res.length === n0 && e1.length && ad && re === '' ? 'pass' : 'fail', evidence: ['A9-user-empty.png', 'A9-user-invalid.png'] })
  log('5xx', s.serverErrors, 'console', s.consoleErrors)
} finally { await s.browser.close() }
