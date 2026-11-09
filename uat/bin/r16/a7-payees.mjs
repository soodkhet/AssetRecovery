import { openAs, BASE, settle, log, txt, shot, step, toasts, sleep, q, fieldsOf, errText, track } from './_a.mjs'
const s = await openAs('superadmin'); const p = s.page; const res = track(p)
const dlg = () => p.getByRole('dialog').last()
const only = process.argv[2]?.split(',')
const selByText = async (loc, re) => { const opts = await loc.locator('option').evaluateAll(es => es.map(e => ({ v: e.value, t: e.textContent }))); const o = opts.find(o => re.test(o.t)); if (!o) throw new Error('no option ' + re + JSON.stringify(opts)); await loc.selectOption(o.v); return o.t }
const openUser = async (u) => {
  await p.goto(`${BASE}/settings/users`); await settle(p, 1200)
  await p.locator('main').getByText('เจ้าหน้าที่ติดตามทรัพย์', { exact: true }).first().click(); await settle(p, 1000)
  if (/out/.test(u)) { await p.locator('main').getByText('Outsource', { exact: true }).first().click(); await settle(p, 1000) }
  await p.locator('main tr').filter({ hasText: u }).getByRole('button', { name: 'แก้ไข', exact: true }).click(); await settle(p, 1200)
  return dlg()
}
const addr = async (d, detail, postal, dist, sub) => {
  await d.locator('[id$="-detail"]').fill(detail)
  await d.locator('[id$="-postal"]').fill(''); await d.locator('[id$="-postal"]').pressSequentially(postal); await sleep(1200)
  await d.locator('[id$="-district"]').fill(dist); await sleep(400)
  await d.locator('[id$="-subdistrict"]').fill(sub); await d.locator('[id$="-subdistrict"]').blur(); await sleep(400)
  return (await d.innerText()).split('\n').filter(l => /ไม่อยู่ในรหัส/.test(l))
}
const fill = async (d, o) => {
  await selByText(d.locator('#user-team'), o.team); await sleep(400)
  await selByText(d.locator('#payee-type'), o.type); await sleep(500)
  if (o.income) await selByText(d.locator('#payee-income-category'), o.income)
  if (o.title && await d.locator('#payee-name-title').count()) await selByText(d.locator('#payee-name-title'), o.title)
  if (o.legal !== undefined) { const ids = await d.locator('input').evaluateAll(es => es.map(e => e.id)); const lid = ids.find(i => /legal/.test(i)); if (lid) await d.locator(`#${lid}`).fill(o.legal) }
  await d.locator('#payee-national-id').fill(o.nid)
  if (o.tp) await selByText(d.locator('#payee-tax-profile'), o.tp)
  if (o.wht402 !== undefined) await d.locator('#payee-wht-40-2').fill(o.wht402)
  const w = await addr(d, o.addr, o.postal, o.dist, o.sub)
  await selByText(d.locator('#payee-bank'), o.bank)
  await d.locator('#payee-account-name').fill(o.accName); await d.locator('#payee-account-number').fill(o.accNo)
  await d.getByLabel(/ยืนยันข้อมูลรับเงิน/).check()
  await d.locator('#user-payment-reason').fill('ตั้งข้อมูลรับเงินและภาษีของผู้รับ รอบ MT6')
  return w
}
const save = async (d) => {
  const n0 = res.length
  await d.getByRole('button', { name: /^บันทึก/ }).last().click(); await sleep(3000)
  const t = await toasts(p, 300)
  return { api: res.slice(n0).map(x => x.slice(0, 200)), t: t.slice(-2), open: await d.isVisible().catch(() => false), e: (await errText(d).catch(() => [])).slice(0, 6) }
}
const P = {
  in1: { u: 'uat.agent.in1', team: /Inhouse \(MT6\)/, type: /บุคคลธรรมดา/, income: /40\(8\)/, title: /^นาย$/, nid: '1103700123458', tp: /ค่าจ้างทำของ 2%/, addr: '55/12 ซอยลาดพร้าว 101 ถนนลาดพร้าว', postal: '10240', dist: 'บางกะปิ', sub: 'คลองจั่น', bank: /กสิกรไทย/, accName: 'อนันต์ ตามทรัพย์', accNo: '111-2-33333-4' },
  in2: { u: 'uat.agent.in2', team: /Inhouse \(MT6\)/, type: /บุคคลธรรมดา/, income: /ตามค่าตั้งองค์กร/, title: /^นาย$/, nid: '3100500678913', tp: /ตามค่าเริ่มต้นของทีม/, addr: '89/4 หมู่ 5 ถนนรัตนาธิเบศร์', postal: '11000', dist: 'เมืองนนทบุรี', sub: 'บางกระสอ', bank: /กรุงไทย/, accName: 'บุญมี ภาคสนาม', accNo: '222-3-44444-5' },
  out1: { u: 'uat.agent.out1', team: /Outsource \(MT6\)/, type: /บุคคลธรรมดา/, income: /40\(2\)/, title: /^นาย$/, nid: '1409900246807', wht402: '3', addr: '12/3 ถนนราชดำเนิน', postal: '73000', dist: 'เมืองนครปฐม', sub: 'พระปฐมเจดีย์', bank: /ไทยพาณิชย์/, accName: 'ประเสริฐ รับเหมา', accNo: '333-4-55555-6' },
  out2: { u: 'uat.agent.out2', team: /Outsource \(MT6\)/, type: /นิติบุคคล/, nid: '0105568444441', legal: '', addr: '77/8 ถนนเอกชัย', postal: '74000', dist: 'เมืองสมุทรสาคร', sub: 'มหาชัย', bank: /กรุงเทพ$/, accName: 'บจก. สมพรรับเหมาติดตาม', accNo: '444-5-66666-7' },
}
try {
  const run = k => !only || only.includes(k)
  if (run('in1')) {
    const d = await openUser('uat.agent.in1')
    await fill(d, P.in1)
    await d.locator('#payee-account-number').fill('123')
    const n0 = res.length; await d.getByRole('button', { name: /^บันทึก/ }).last().click(); await sleep(1000)
    const e = (await errText(d)).filter(x => /บัญชี/.test(x)); const f = await p.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)
    await shot(p, 'A7-payee-acct-123')
    step({ step: 'A7.payee-acct-123', action: "uat.agent.in1 ข้อมูลรับเงิน เลขบัญชี '123' + ติ๊กยืนยัน แล้วบันทึก", expected: 'ข้อความไทย ไม่ยิง API', actual: `${e.join(' / ')} · API ${res.length - n0} · focus=${f}`, status: res.length === n0 && e.length ? 'pass' : 'fail', evidence: ['A7-payee-acct-123.png'] })
    await d.locator('#payee-account-number').fill(P.in1.accNo)
    const r = await save(d); await settle(p, 800); await shot(p, 'A7-payee-in1')
    step({ step: 'A7.payee-in1', action: 'uat.agent.in1 → ทีม Inhouse · บุคคล นาย · 40(8) รายคน · TP บุคคลธรรมดา ค่าจ้างทำของ 2% · 1103700123458 · 10240 บางกะปิ/คลองจั่น · KBank 111-2-33333-4 · ยืนยัน', expected: 'บันทึกสำเร็จ', actual: JSON.stringify(r), status: r.api.length && r.api.every(x => /^20/.test(x)) && !r.open ? 'pass' : 'fail', evidence: ['A7-payee-in1.png'] })
  }
  if (run('in2')) {
    const d = await openUser('uat.agent.in2'); const w = await fill(d, P.in2); const r = await save(d); await settle(p, 800); await shot(p, 'A7-payee-in2')
    step({ step: 'A7.payee-in2', action: 'uat.agent.in2 → บุคคล นาย · ตามค่าตั้งองค์กร · TP ตามค่าเริ่มต้นทีม · 3100500678913 · 11000 เมืองนนทบุรี/บางกระสอ · KTB 222-3-44444-5 · ยืนยัน', expected: 'บันทึกสำเร็จ', actual: JSON.stringify({ ...r, addrWarn: w }), status: r.api.length && r.api.every(x => /^20/.test(x)) && !r.open ? 'pass' : 'fail', evidence: ['A7-payee-in2.png'] })
  }
  if (run('out1')) {
    const d = await openUser('uat.agent.out1'); await fill(d, P.out1)
    await d.locator('#payee-wht-40-2').fill(''); await d.locator('#payee-wht-40-2').pressSequentially('3x'); const typed = await d.locator('#payee-wht-40-2').inputValue()
    const r = await save(d); await settle(p, 800); await shot(p, 'A7-payee-out1')
    step({ step: 'A7.payee-out1', action: "uat.agent.out1 → Outsource · บุคคล 40(2) อัตรา 3% (พิมพ์ '3x') · 1409900246807 · 73000 พระปฐมเจดีย์ · SCB 333-4-55555-6 · ยืนยัน", expected: 'บันทึกสำเร็จ รับเฉพาะตัวเลข', actual: `'3x'→'${typed}' · ${JSON.stringify(r)}`, status: r.api.length && r.api.every(x => /^20/.test(x)) && !r.open ? 'pass' : 'fail', evidence: ['A7-payee-out1.png'] })
  }
  if (run('out2')) {
    const d = await openUser('uat.agent.out2'); await fill(d, P.out2)
    const n0 = res.length; await d.getByRole('button', { name: /^บันทึก/ }).last().click(); await sleep(1000)
    const e = (await errText(d)).filter(x => /นิติบุคคล|ชื่อ/.test(x)); await shot(p, 'A7-payee-out2-nolegal')
    const ids = await d.locator('input').evaluateAll(es => es.map(e => e.id)); const lid = ids.find(i => /legal/.test(i))
    await d.locator(`#${lid}`).fill('บริษัท สมพรรับเหมาติดตาม จำกัด (MT6)')
    const r = await save(d); await settle(p, 800); await shot(p, 'A7-payee-out2')
    step({ step: 'A7.payee-out2', action: "uat.agent.out2 → นิติบุคคล ไม่กรอกชื่อนิติบุคคล → บันทึก แล้วกรอก 'บริษัท สมพรรับเหมาติดตาม จำกัด (MT6)' · BBL ชื่อบัญชี 'บจก. สมพรรับเหมาติดตาม' · 74000 มหาชัย · ยืนยัน", expected: 'บังคับชื่อนิติบุคคล · บันทึกได้ + เตือนชื่อบัญชีไม่ตรง (ไม่ block)', actual: `ไม่กรอก → ${e.join(' / ')} API ${res.length - n0} · กรอกแล้ว ${JSON.stringify(r)}`, status: r.api.length && r.api.every(x => /^20/.test(x)) && !r.open ? 'pass' : 'fail', evidence: ['A7-payee-out2-nolegal.png', 'A7-payee-out2.png'] })
  }
  log('5xx', s.serverErrors, 'console', s.consoleErrors)
} finally { await s.browser.close() }
