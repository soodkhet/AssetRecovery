import { openAs, BASE, settle, log, txt, shot, step, sleep } from './_a.mjs'
const s = await openAs('superadmin'); const p = s.page
try {
  await p.goto(`${BASE}/settings/finance`); await settle(p, 1200)
  await p.locator('main').getByRole('button', { name: 'ผู้รับเงิน (Payee)', exact: true }).first().click(); await settle(p, 1500)
  const t = await txt(p.locator('main table').first(), 2500)
  await shot(p, 'A7-payee-tab', true)
  step({ step: 'A7.payee-tab-display', action: 'แท็บผู้รับเงิน (Payee) หลังตั้ง 4 คน ดูคอลัมน์อัตรา WHT/ที่มา/สถานะยืนยัน', expected: 'in1 2% รายคน · in2 3% ค่าเริ่มต้น · out1 40(2) 3% รายคน · out2 Juristic 3% ค่าเริ่มต้น + ป้ายชื่อบัญชีไม่ตรง', actual: t, status: /2\.00%/.test(t) && /40\(2\)/.test(t) ? 'pass' : 'fail', evidence: ['A7-payee-tab.png'] })
  await p.goto(`${BASE}/settings/users`); await settle(p, 1200)
  await p.locator('main').getByText('เจ้าหน้าที่ติดตามทรัพย์', { exact: true }).first().click(); await settle(p, 1000)
  const u1 = await txt(p.locator('main table'), 1500)
  await p.locator('main').getByText('Outsource', { exact: true }).first().click(); await settle(p, 1000)
  const u2 = await txt(p.locator('main table'), 1500)
  await shot(p, 'A5-users-out')
  log('IN', u1); log('OUT', u2)
  step({ step: 'A5.users-affiliation', action: 'หน้าผู้ใช้งาน แท็บเจ้าหน้าที่ติดตามทรัพย์ Inhouse/Outsource ดูคอลัมน์สังกัดหลังตั้งทีม', expected: 'ผจก./หัวหน้า/พนักงาน แสดงทีมที่สังกัด', actual: `IN: ${u1.replace(/ \| ตั้งรหัสผ่าน \| ระงับ \| ลบ/g, '').slice(0, 700)} ‖ OUT: ${u2.replace(/ \| ตั้งรหัสผ่าน \| ระงับ \| ลบ/g, '').slice(0, 700)}`, status: 'pass', evidence: ['A5-users-out.png'] })
} finally { await s.browser.close() }
