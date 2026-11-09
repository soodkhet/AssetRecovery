import { openAs, BASE, settle, log, txt, shot, step, sleep } from './_a.mjs'
const s = await openAs('uat.exec'); const p = s.page
try {
  await p.goto(`${BASE}/settings/finance`); await settle(p, 1500)
  await p.locator('main').getByRole('button', { name: 'เกณฑ์ SLA งานติดตาม', exact: true }).first().click(); await settle(p, 1000)
  const sla = await p.locator('#sla-hours').evaluate(e => `disabled=${e.disabled} readonly=${e.readOnly}`).catch(() => 'ไม่มีช่อง')
  const slaBtn = await p.getByRole('button', { name: 'บันทึกเกณฑ์ SLA' }).count()
  await p.locator('main').getByRole('button', { name: 'นโยบายการมอบหมายงาน', exact: true }).first().click(); await settle(p, 1000)
  const to = p.locator('#assignment-reassign-timeout')
  const st = await to.evaluate(e => `disabled=${e.disabled} readonly=${e.readOnly}`)
  await to.fill('9'); const v = await to.inputValue()
  const cb = p.getByLabel('หัวหน้าทีมกลุ่ม Inhouse มอบหมาย/เปลี่ยนผู้รับผิดชอบได้'); await cb.click(); const cbv = await cb.isChecked()
  const saveBtn = await p.getByRole('button', { name: 'บันทึกนโยบายการมอบหมายงาน' }).count()
  await shot(p, 'A2-exec-assignment-editable', true)
  step({ step: 'A2.exec-assignment-readonly', persona: 'uat.exec', action: 'บริหาร (ดูอย่างเดียว) เปิดแท็บเกณฑ์ SLA และนโยบายการมอบหมายงาน ลองพิมพ์/ติ๊ก (ไม่มีปุ่มบันทึก ไม่ยิง API)', expected: 'ผู้ดูอย่างเดียวควรเห็นช่องแบบปิด (เหมือนแท็บ SLA)', actual: `SLA: ช่อง ${sla} ปุ่มบันทึก ${slaBtn} · มอบหมาย: ช่องเวลารอ ${st} พิมพ์ 9 ได้ '${v}' · ติ๊ก Inhouse ได้ (ค่า ${cbv}) · ปุ่มบันทึก ${saveBtn}`, status: /disabled=false/.test(st) && v === '9' ? 'fail' : 'pass', evidence: ['A2-exec-assignment-editable.png'], issue_id: 'A6-04' })
  log('5xx', s.serverErrors)
} finally { await s.browser.close() }
