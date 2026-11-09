import { openAs, BASE, settle, log, txt, shot, step, toasts, track, sleep, errText, q, fieldsOf } from './_a.mjs'
const s = await openAs('superadmin'); const p = s.page; const res = track(p)
const tab = async n => { await p.locator('main').getByRole('button', { name: n, exact: true }).first().click(); await settle(p, 900) }
const save = async (d, name) => { const r = p.waitForResponse(r => r.url().includes('/api/') && r.request().method() !== 'GET', { timeout: 20000 }); await d.getByRole('button', { name, exact: true }).click(); const rr = await r; let b=''; try{b=(await rr.text()).slice(0,250)}catch{}; return { st: rr.status(), b, t: await toasts(p, 1200) } }
const day = async (d, n) => { const b = d.getByRole('button', { name: String(n), exact: true }); if (await b.count()) return b.first().click(); return d.getByLabel(String(n), { exact: true }).check() }
try {
  await p.goto(`${BASE}/settings/finance`); await settle(p, 1200)
  await tab('รอบบิลและรอบจ่าย')
  await p.locator('main').getByRole('button', { name: '+ สร้างรอบ' }).click(); await settle(p, 600)
  let d = p.getByRole('dialog').last()
  await d.locator('#cycle-name').fill('รอบวางบิลสิ้นเดือน (MT6)')
  await d.locator('#cycle-type').selectOption({ index: 0 })
  await d.locator('#cycle-cutoff-type').selectOption({ label: 'ทุกสิ้นเดือน' }); await sleep(300)
  await d.locator('#cycle-due-value').fill(''); await d.locator('#cycle-due-value').pressSequentially('-5'); const neg = await d.locator('#cycle-due-value').inputValue()
  await d.locator('#cycle-due-value').fill('30')
  await d.locator('#cycle-reason').fill('ตั้งรอบวางบิลรายเดือนรอบทดสอบ MT6')
  const r1 = await save(d, 'สร้างรอบ'); log('AR', r1); await settle(p, 700)
  await p.locator('main').getByRole('button', { name: '+ สร้างรอบ' }).click(); await settle(p, 600)
  d = p.getByRole('dialog').last()
  const reopen = await d.locator('#cycle-name').inputValue()
  await d.locator('#cycle-name').fill('รอบจ่ายค่าตอบแทน 15 และสิ้นเดือน (MT6)')
  await d.locator('#cycle-type').selectOption({ index: 1 }); await sleep(300)
  await d.locator('#cycle-cutoff-type').selectOption({ label: 'วันที่คงที่ทุกเดือน' }); await sleep(200)
  await day(d, 15); await day(d, 30)
  await d.locator('#cycle-due-value').fill('5')
  log('AP fields', (await fieldsOf(d)).join(' | '))
  await d.locator('#cycle-reason').fill('ตั้งรอบจ่ายค่าตอบแทนทีมรอบทดสอบ MT6')
  const r2 = await save(d, 'สร้างรอบ'); log('AP', r2); await settle(p, 700)
  await shot(p, 'A2-cycles')
  const tbl = await txt(p.locator('main table'), 700)
  const db = q("select id,name,cycle_type,cutoff_rule,due_rule,scope from billing_payout_cycles")
  step({ step: 'A2.cycles', action: "สร้างรอบ AR 'รอบวางบิลสิ้นเดือน (MT6)' ทุกสิ้นเดือน Net 30 ทุกบริษัท (ลองพิมพ์ -5) + AP 'รอบจ่ายค่าตอบแทน 15 และสิ้นเดือน (MT6)' วันที่ 15,30 Net 5", expected: '201 ทั้งสอง · ลบถูกกรอง', actual: `${r1.st}/${r2.st} · '-5' → '${neg}' · เปิดฟอร์มใหม่ชื่อ='${reopen}' · ตาราง ${tbl} · DB ${JSON.stringify(db).slice(0,400)}`, status: r1.st === 201 && r2.st === 201 ? 'pass' : 'fail', evidence: ['A2-cycles.png'] })
  // approval
  await tab('สายการอนุมัติ')
  const addRule = async (name, thr, roles, sod) => {
    await p.locator('main').getByRole('button', { name: '+ เพิ่มกติกา' }).click(); await settle(p, 600)
    const d = p.getByRole('dialog').last()
    await d.locator('#approval-condition').fill(name)
    if (thr) await d.locator('#approval-threshold').fill(thr)
    for (let i = 0; i < roles.length; i++) {
      if (i > 0) { await d.getByRole('button', { name: '+ เพิ่มขั้นอนุมัติ' }).click(); await sleep(300) }
      await d.getByLabel(`บทบาทผู้อนุมัติขั้นที่ ${i + 1}`).selectOption({ label: roles[i] })
    }
    if (sod) await d.getByLabel(/บังคับแยกหน้าที่/).check()
    await d.locator('#approval-reason').fill('ตั้งสายอนุมัติรอบทดสอบ MT6')
    return save(d, 'เพิ่มกติกา')
  }
  const a1 = await addRule('ยอดไม่เกิน 5,000 บาท (MT6)', '5000', ['ผู้จัดการทีมติดตามทรัพย์', 'การเงิน'], false); log('ap1', a1); await settle(p, 600)
  const a2 = await addRule('ยอดเกิน 5,000 บาท (MT6)', '', ['ผู้จัดการทีมติดตามทรัพย์', 'การเงิน', 'บริหาร'], true); log('ap2', a2); await settle(p, 600)
  await shot(p, 'A2-approval')
  const at = await txt(p.locator('main table').first(), 600)
  step({ step: 'A2.approval', action: 'สายอนุมัติ 2 กฎ: ≤5,000 ผจก.→การเงิน (ไม่แยกหน้าที่) · ไม่จำกัด ผจก.→การเงิน→บริหาร (แยกหน้าที่)', expected: '201 ×2 ตารางเรียงเพดาน', actual: `${a1.st}/${a2.st} · ${at}`, status: a1.st === 201 && a2.st === 201 ? 'pass' : 'fail', evidence: ['A2-approval.png'] })
  // policy
  const pol = p.locator('#policy-advance-max')
  await pol.fill(''); await pol.pressSequentially('-100'); const v1 = await pol.inputValue()
  await pol.fill(''); await pol.pressSequentially('5,0a00'); const v2 = await pol.inputValue()
  // paste mixed text
  await pol.fill(''); await pol.focus()
  await p.evaluate(() => { const el = document.querySelector('#policy-advance-max'); const dt = new DataTransfer(); dt.setData('text/plain', 'ราคา 5,000 บาท'); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })) }); await sleep(300)
  const v3 = await pol.inputValue()
  await p.locator('#policy-reason').fill('x')
  const n0 = res.length
  await p.getByRole('button', { name: 'บันทึกนโยบายการเงิน' }).click(); await sleep(900)
  const e1 = await errText(p.locator('main')); await shot(p, 'A2-policy-validation')
  await pol.fill('5000'); await p.locator('#policy-reason').fill('ตั้งเพดานเงินทดรอง 5,000 บาท รอบ MT6')
  const w = p.waitForResponse(r => r.url().includes('/api/') && r.request().method() !== 'GET', { timeout: 20000 })
  await p.getByRole('button', { name: 'บันทึกนโยบายการเงิน' }).click()
  let rp = await w; const tp = await toasts(p, 1200)
  // maybe confirm dialog
  await shot(p, 'A2-policy-saved')
  const fp = q('select advance_max_amount_per_request_satang from finance_policy_settings')
  step({ step: 'A2.policy', action: "นโยบายการเงิน เพดานทดรอง พิมพ์ '-100' / '5,0a00' / วาง 'ราคา 5,000 บาท' + เหตุผล 'x' แล้ว 5,000 + เหตุผล", expected: 'รับเฉพาะตัวเลข · บันทึก 500000 สตางค์', actual: `'-100'→'${v1}' · '5,0a00'→'${v2}' · วาง→'${v3}' · เหตุผลสั้น: ${e1.filter(x=>/เหตุผล|เพดาน/.test(x)).join(' / ')} API ${res.length - n0 === 0 ? 'ไม่ยิง' : 'ยิง'} · บันทึก ${rp.status()} ${tp.join(' / ')} · DB ${JSON.stringify(fp)}`, status: rp.status() === 200 && fp[0]?.advance_max_amount_per_request_satang == 500000 ? 'pass' : 'fail', evidence: ['A2-policy-validation.png', 'A2-policy-saved.png'] })
  log('5xx', s.serverErrors, 'console', s.consoleErrors)
} finally { await s.browser.close() }
