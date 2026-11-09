import { openAs, BASE, settle, log, txt, shot, step, toasts, sleep, q, fieldsOf, errText, track } from './_a.mjs'
const s = await openAs('superadmin'); const p = s.page; const res = track(p)
const dlg = () => p.getByRole('dialog').last()
try {
  await p.goto(`${BASE}/settings/users`); await settle(p, 1200)
  await p.locator('main').getByText('บริษัทไฟแนนซ์', { exact: true }).first().click(); await settle(p, 1200)
  const out = []
  for (const [u, co] of [['uat.co1.mgr', 'บริษัท มือถือทันใจ ลีสซิ่ง จำกัด (MT6)'], ['uat.co1.sup', 'บริษัท มือถือทันใจ ลีสซิ่ง จำกัด (MT6)'], ['uat.co2.admin', 'บริษัท เงินด่วนโฟน จำกัด (MT6)']]) {
    await p.locator('main tr').filter({ hasText: u }).getByRole('button', { name: 'แก้ไข', exact: true }).click(); await settle(p, 900)
    const d = dlg()
    if (u === 'uat.co1.mgr') log('fields', (await fieldsOf(d)).join('\n'))
    await d.locator('#user-company').selectOption({ label: co })
    const ta = d.locator('textarea'); const n = await ta.count(); for (let i = 0; i < n; i++) if (await ta.nth(i).isVisible()) await ta.nth(i).fill('ผูกบัญชีพอร์ทัลกับบริษัทไฟแนนซ์คู่สัญญา รอบ MT6')
    const w = p.waitForResponse(r => r.url().includes('/api/') && r.request().method() !== 'GET', { timeout: 20000 })
    await d.getByRole('button', { name: /^บันทึก/ }).last().click(); const r = await w; const t = await toasts(p, 1000)
    out.push(`${u} → ${co.match(/\((MT6)\)/) ? co.replace('บริษัท ', '').slice(0, 22) : co} ${r.request().method()} ${r.status()}`); await settle(p, 900)
  }
  await shot(p, 'A4-portal-bind')
  const tbl = await txt(p.locator('main table'), 900)
  const db = q("select u.username, fc.short_name from users u left join finance_companies fc on fc.id=u.company_id where u.username like 'uat.co%' order by 1")
  step({ step: 'A4.portal-bind', action: 'แก้ผู้ใช้ uat.co1.mgr / uat.co1.sup → MTJ · uat.co2.admin → NDP', expected: '200 ×3 คอลัมน์สังกัดแสดงชื่อบริษัท MT6', actual: `${out.join(' · ')} · DB ${JSON.stringify(db)} · ตาราง ${tbl.slice(0, 500)}`, status: out.every(x => / 200$/.test(x)) ? 'pass' : 'fail', evidence: ['A4-portal-bind.png'] })
  log('5xx', s.serverErrors, 'console', s.consoleErrors)
} finally { await s.browser.close() }
