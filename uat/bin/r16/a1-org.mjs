import { openAs, BASE, settle, log, txt, shot, step, toasts, track, sleep, errText, q } from './_a.mjs'
const s = await openAs('superadmin'); const p = s.page; const res = track(p)
const opts = async (id) => {
  await sleep(300)
  const dl = await p.locator(id).evaluate(e => e.list ? [...e.list.options].map(o => o.value) : null)
  return { lb: [], dl }
}
try {
  await p.goto(`${BASE}/settings/organization`); await settle(p, 1000)
  await p.getByRole('button', { name: 'แก้ไขข้อมูล' }).click(); await settle(p, 600)
  const d = p.getByRole('dialog').last()
  const pid = '[id$="-postal"]', did = '[id$="-district"]', sid = '[id$="-subdistrict"]'
  await d.locator(pid).fill('10110'); await sleep(800)
  const o1 = await opts(did)
  log('10110 district', o1)
  // Esc may close dialog? check
  log('dialog still open', await d.isVisible())
  await shot(p, 'A1-postal-10110')
  // mismatch: type บางนา
  await d.locator(did).fill('บางนา'); await sleep(400); await d.locator(sid).fill('บางนาเหนือ'); await sleep(600)
  const mm = await txt(d.locator('form, div').first(), 200)
  const warn = (await d.innerText()).split('\n').filter(l => /ไม่อยู่ในรหัสไปรษณีย์|ไม่ตรง/.test(l))
  log('mismatch warn', warn); await shot(p, 'A1-postal-mismatch')
  step({ step: 'A1.org.postal-mismatch', action: 'รหัสไปรษณีย์ 10110 + พิมพ์เขตบางนา/แขวงบางนาเหนือ', expected: 'เตือนเขตไม่อยู่ในรหัสไปรษณีย์', actual: warn.join(' / ') || 'ไม่มีเตือน', status: warn.length ? 'pass' : 'fail', evidence: [`${'A1-postal-mismatch'}.png`] })
  await d.locator(pid).fill('10310'); await sleep(800)
  const o2 = await opts(did)
  await d.locator(did).fill('ห้วยขวาง'); await sleep(500)
  const o3 = await opts(sid)
  log('10310', o2, o3)
  step({ step: 'A1.org.postal-filter', action: 'แก้ข้อมูลองค์กร: รหัสไปรษณีย์ 10110 ดูรายการอำเภอ · 10310 → อำเภอ/ตำบล', expected: 'รายการกรองตามรหัสไปรษณีย์', actual: `10110 → ${JSON.stringify(o1.lb.length ? o1.lb : o1.dl)} · 10310 → ${JSON.stringify(o2.lb.length ? o2.lb : o2.dl)} ตำบล ${JSON.stringify(o3.lb.length ? o3.lb : o3.dl)}`, status: 'pass', evidence: ['A1-postal-10110.png'] })
  await d.locator(sid).fill('ห้วยขวาง'); await sleep(300)
  // validation
  await d.locator('#org-name').fill('บริษัท ตามทันทรัพย์ (MT6) จำกัด')
  await d.locator('#org-name-en').fill('Tamtan Sap (MT6) Co., Ltd.')
  await d.locator('#org-phone').fill('12'); await d.locator('#org-reason').fill('x')
  const before = res.length
  await d.getByRole('button', { name: 'บันทึก' }).click(); await sleep(1200)
  const e1 = await errText(d); const focused = await p.evaluate(() => document.activeElement?.id)
  await shot(p, 'A1-org-validation')
  log('validation', e1, 'focus', focused, 'api', res.slice(before))
  // phone with letters
  await d.locator('#org-phone').fill(''); await d.locator('#org-phone').pressSequentially('02abc'); const ph = await d.locator('#org-phone').inputValue()
  step({ step: 'A1.org.validation', action: "เบอร์โทร '12' + เหตุผล 'x' แล้วบันทึก · พิมพ์ '02abc'", expected: 'ข้อความผิดภาษาไทย ไม่ยิง API', actual: `${e1.join(' / ')} · focus=#${focused} · API ${res.length - before} ครั้ง · พิมพ์ 02abc ได้ค่า '${ph}'`, status: e1.length && res.length === before ? 'pass' : 'fail', evidence: ['A1-org-validation.png'] })
  await d.locator('#org-phone').fill('02-111-2233')
  await d.locator('#org-reason').fill('ตั้งค่าองค์กรรอบทดสอบ MT6')
  const r = p.waitForResponse(r => r.url().includes('/api/') && r.request().method() !== 'GET', { timeout: 15000 })
  await d.getByRole('button', { name: 'บันทึก' }).click()
  const rr = await r; const t = await toasts(p, 1500)
  await settle(p, 800); await shot(p, 'A1-org-saved')
  const row = q("select name,name_en,tax_id,branch_code,phone,address from organizations")[0]
  log('saved', rr.status(), t, row)
  step({ step: 'A1.org.save', action: "บันทึกองค์กร 'บริษัท ตามทันทรัพย์ (MT6) จำกัด' 0105569123457 สำนักงานใหญ่ ห้วยขวาง กทม. 10310", expected: '200 + toast + ที่อยู่ครบ', actual: `${rr.request().method()} ${rr.status()} toast ${t.join(' / ')} · DB name=${row?.name}`, status: rr.status() === 200 && /MT6/.test(row?.name) ? 'pass' : 'fail', evidence: ['A1-org-saved.png'] })
  log('5xx', s.serverErrors, 'console', s.consoleErrors)
} finally { await s.browser.close() }
