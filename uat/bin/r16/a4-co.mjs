import { openAs, BASE, settle, log, txt, shot, step, toasts, track, sleep, q, fieldsOf, errText } from './_a.mjs'
const s = await openAs('superadmin'); const p = s.page; const res = track(p)
const waitMut = () => p.waitForResponse(r => r.url().includes('/api/') && r.request().method() !== 'GET', { timeout: 20000 })
const dlg = () => p.getByRole('dialog').last()
const open = async () => { await p.getByRole('button', { name: '+ สร้างบริษัท' }).click(); await settle(p, 700); return dlg() }
const selByText = async (loc, re) => { const opts = await loc.locator('option').evaluateAll(es => es.map(e => ({ v: e.value, t: e.textContent }))); const o = opts.find(o => re.test(o.t)); if (!o) throw new Error('no option ' + re + ' in ' + JSON.stringify(opts)); await loc.selectOption(o.v); return o.t }
const dl = async (d, id) => { const l = await d.locator(id).getAttribute('list'); return l ? p.locator(`datalist[id="${l}"] option`).evaluateAll(es => es.map(e => e.value)) : null }
const addr = async (d, detail, postal, dist, sub) => {
  if (detail !== null) await d.locator('[id$="-detail"]').fill(detail)
  await d.locator('[id$="-postal"]').fill(''); await d.locator('[id$="-postal"]').pressSequentially(postal); await sleep(1200)
  const prov = await d.locator('[id$="-province"] option:checked').textContent()
  const dopts = await dl(d, '[id$="-district"]')
  await d.locator('[id$="-district"]').fill(dist); await sleep(400)
  const sopts = await dl(d, '[id$="-subdistrict"]')
  if (sub !== null) { await d.locator('[id$="-subdistrict"]').fill(sub); await d.locator('[id$="-subdistrict"]').blur() }
  await sleep(400)
  const warn = (await d.innerText()).split('\n').filter(l => /ไม่อยู่ในรหัส/.test(l))
  return { prov, dopts, sopts: sopts?.slice(0, 30), nsub: sopts?.length, warn }
}
const CO = {
  MTJ: { name: 'บริษัท มือถือทันใจ ลีสซิ่ง จำกัด (MT6)', short: 'MTJ', tax: '0105568111111', phone: '02-245-6789', contact: 'คุณวิภา ประสานงาน', cphone: '081-234-5678', signer: 'นายทันใจ มือถือดี', email: 'billing@mtj-mt6.test', detail: '123 อาคารทันใจทาวเวอร์ ชั้น 8 ถนนพระราม 9', postal: '10310', dist: 'ห้วยขวาง', sub: 'ห้วยขวาง', tpl: /เหมาจ่าย 1,500/, delivery: /กระดาษ/, vatmode: /ก่อน VAT/, wht: '3' },
  NDP: { name: 'บริษัท เงินด่วนโฟน จำกัด (MT6)', short: 'NDP', tax: '0105568222222', phone: '02-583-4455', contact: 'คุณสมศักดิ์ เร่งรัด', cphone: '089-876-5432', signer: 'นางเงินด่วน ใจกว้าง', email: 'ar@ndp-mt6.test', detail: '45/6 ถนนแจ้งวัฒนะ', postal: '11120', dist: 'ปากเกร็ด', sub: 'บางตลาด', tpl: /ค่าความสำเร็จ 5%/, delivery: /e-Tax|อิเล็กทรอนิกส์/i, vatmode: /รวม VAT/, wht: '3' },
  SPC: { name: 'บริษัท สมาร์ทผ่อน แคปปิตอล จำกัด (MT6)', short: 'SPC', tax: '0105568111111', phone: '034-251-888', contact: 'คุณปรีชา ผ่อนสบาย', cphone: '086-111-2222', signer: 'นายสมาร์ท ผ่อนง่าย', email: 'finance@spc-mt6.test', detail: '88 ถนนเพชรเกษม', postal: '73000', dist: 'เมืองนครปฐม', sub: 'สนามจันทร์', tpl: /ผสม 500/, delivery: /กระดาษ/, vatmode: /ก่อน VAT/, wht: '', branch: '00012' },
}
const fillCo = async (d, o, opts = {}) => {
  await d.locator('#co-name').fill(o.name); await d.locator('#co-short').fill(o.short); await d.locator('#co-taxid').fill(o.tax)
  await d.locator('#co-phone').fill(o.phone); await d.locator('#co-contact').fill(o.contact); await d.locator('#co-contact-phone').fill(o.cphone)
  await d.locator('#co-signer').fill(o.signer); await d.locator('#co-email').fill(o.email)
  if (o.branch) { await selByText(d.locator('#co-branch-kind'), /สาขา/); await sleep(300); const ids = await d.locator('input').evaluateAll(es => es.map(e => e.id)); const bid = ids.find(i => /branch/.test(i) && i !== 'co-branch-kind'); await d.locator(`#${bid}`).fill(o.branch) }
  const a = opts.noaddr ? null : await addr(d, o.detail, o.postal, o.dist, o.sub)
  await selByText(d.locator('#co-template'), o.tpl); await selByText(d.locator('#co-delivery'), o.delivery)
  await selByText(d.locator('#co-vat'), /จด VAT แล้ว/); await selByText(d.locator('#co-vat-mode'), o.vatmode)
  await d.locator('#co-customer-wht').fill(o.wht)
  await d.locator('#co-reason').fill('เพิ่มบริษัทไฟแนนซ์คู่สัญญารายใหม่ รอบ MT6')
  return a
}
try {
  await p.goto(`${BASE}/settings/companies`); await settle(p, 1200)
  let d = await open()
  log('options delivery', await d.locator('#co-delivery option').allInnerTexts(), 'vatmode', await d.locator('#co-vat-mode option').allInnerTexts(), 'tpl', await d.locator('#co-template option').allInnerTexts())
  // --- no address + bad phone
  await fillCo(d, CO.MTJ, { noaddr: true })
  await d.locator('#co-phone').fill('12')
  let n0 = res.length
  await d.getByRole('button', { name: 'สร้างบริษัท', exact: true }).click(); await sleep(1000)
  const e1 = await errText(d); const f1 = await p.evaluate(() => { const e = document.activeElement; return `${e?.tagName}#${e?.id}` }); const foot1 = await d.locator('[data-modal-footer] [role=alert]').allInnerTexts()
  await shot(p, 'A4-company-noaddr')
  step({ step: 'A4.company-noaddr', action: "สร้างบริษัท MTJ โดยไม่กรอกที่อยู่ + เบอร์โทร '12'", expected: 'แจ้งช่องที่อยู่ + เบอร์ผิด ไม่ยิง API', actual: `${e1.filter(x => /ที่อยู่|ไปรษณีย์|กรุณา|เบอร์|จังหวัด|อำเภอ|ตำบล/.test(x)).join(' / ')} · API ${res.length - n0} · footer=${JSON.stringify(foot1)} · focus=${f1}`, status: res.length === n0 && e1.some(x => /ที่อยู่|ไปรษณีย์/.test(x)) ? 'pass' : 'fail', evidence: ['A4-company-noaddr.png'] })
  const phoneErr12 = e1.filter(x => /เบอร์|โทร/.test(x))
  await d.locator('#co-phone').fill(''); await d.locator('#co-phone').pressSequentially('02abc12345'); const typedPh = await d.locator('#co-phone').inputValue()
  n0 = res.length; await d.getByRole('button', { name: 'สร้างบริษัท', exact: true }).click(); await sleep(900)
  const phoneErrAbc = (await errText(d)).filter(x => /เบอร์|โทร/.test(x))
  await d.locator('#co-contact-phone').fill('12'); await d.getByRole('button', { name: 'สร้างบริษัท', exact: true }).click(); await sleep(900)
  const cphoneErr = (await errText(d)).filter(x => /เบอร์|โทร/.test(x))
  await shot(p, 'A4-company-phone')
  step({ step: 'A4.company-phone', action: "เบอร์โทรบริษัท '12' / พิมพ์ '02abc12345' / เบอร์ผู้ติดต่อ '12' (เทียบกติกาเบอร์สำนักงานองค์กร)", expected: "ปฏิเสธ 'เบอร์โทรไม่ถูกต้อง — กรอกเบอร์ 9–10 หลัก ขึ้นต้นด้วย 0' เหมือนองค์กร", actual: `'12' → ${phoneErr12.join(' / ') || 'ไม่มีข้อความ'} · '02abc12345' ช่องได้ '${typedPh}' → ${phoneErrAbc.join(' / ') || 'ไม่มีข้อความ'} · ผู้ติดต่อ '12' → ${cphoneErr.join(' / ') || 'ไม่มีข้อความ'} · API ${res.length - n0}`, status: phoneErr12.length && phoneErrAbc.length && res.length === n0 ? 'pass' : 'fail', evidence: ['A4-company-phone.png'] })
  // address picker checks
  const pk = []
  for (const [pc, di] of [['10310', 'ห้วยขวาง'], ['11120', 'ปากเกร็ด'], ['73000', 'เมืองนครปฐม']]) { const a = await addr(d, CO.MTJ.detail, pc, di, null); pk.push(`${pc} → ${a.prov} ${JSON.stringify(a.dopts)} ตำบล ${a.nsub}`) }
  const mm = await addr(d, CO.MTJ.detail, '10310', 'บางนา', null)
  await shot(p, 'A4-company-address-picker')
  step({ step: 'A4.company-address-picker', action: 'ฟอร์มบริษัท: รหัสไปรษณีย์ 10310/11120/73000 แล้วดูอำเภอ/ตำบล · ลอง 10310 + เขตบางนา', expected: 'จังหวัด/อำเภอ/ตำบลกรองตามรหัส · เตือนเมื่อไม่ตรง', actual: pk.join(' · ') + ` · 10310+บางนา: ${mm.warn.join(' / ')}`, status: mm.warn.length ? 'pass' : 'fail', evidence: ['A4-company-address-picker.png'] })
  // fill MTJ properly
  await d.locator('#co-phone').fill(CO.MTJ.phone); await d.locator('#co-contact-phone').fill(CO.MTJ.cphone)
  const aM = await addr(d, CO.MTJ.detail, CO.MTJ.postal, CO.MTJ.dist, CO.MTJ.sub)
  let w = waitMut(); await d.getByRole('button', { name: 'สร้างบริษัท', exact: true }).click(); const rM = await w; const bM = (await rM.text()).slice(0, 160); await settle(p, 900)
  log('MTJ', rM.status(), bM, aM)
  // NDP
  d = await open(); const reopen = await d.locator('#co-name').inputValue()
  await fillCo(d, CO.NDP); w = waitMut(); await d.getByRole('button', { name: 'สร้างบริษัท', exact: true }).click(); const rN = await w; const bN = (await rN.text()).slice(0, 160); await settle(p, 900)
  log('NDP', rN.status(), bN)
  // SPC with dup tax
  d = await open(); await fillCo(d, CO.SPC)
  w = waitMut(); await d.getByRole('button', { name: 'สร้างบริษัท', exact: true }).click(); const rD = await w; const bD = (await rD.text()).slice(0, 200); const tD = await toasts(p, 1200)
  const stillOpen = await d.isVisible(); await shot(p, 'A4-company-dup')
  step({ step: 'A4.company-dup-taxid', action: 'สร้าง SPC ด้วยเลขผู้เสียภาษีของ MTJ (0105568111111)', expected: '400 DUPLICATE_TAX_ID ข้อความไทย ฟอร์มยังเปิด', actual: `${rD.status()} ${bD} · toast ${tD.slice(-1)} · ฟอร์มยังเปิด ${stillOpen}`, status: rD.status() === 400 && /DUPLICATE_TAX_ID/.test(bD) && stillOpen ? 'pass' : 'fail', evidence: ['A4-company-dup.png'] })
  await d.locator('#co-taxid').fill('0105568333334')
  w = waitMut(); await d.getByRole('button', { name: 'สร้างบริษัท', exact: true }).click(); const rS = await w; const bS = (await rS.text()).slice(0, 160); await settle(p, 1200)
  log('SPC', rS.status(), bS)
  await shot(p, 'A4-companies', true)
  const cards = await txt(p.locator('main'), 3000)
  const db = q("select id,short_name,name,tax_id,branch_code,vat_mode,customer_wht_pct,tax_invoice_delivery,service_fee_template_id,phone from finance_companies order by created_at")
  step({ step: 'A4.companies', action: 'สร้าง MTJ FLAT ราคาก่อน VAT WHT3 กระดาษ · NDP SUCCESS_FEE รวม VAT e-Tax WHT3 · SPC HYBRID สาขา 00012 ไม่หัก WHT (ที่อยู่ผ่านช่องเลือก)', expected: '201 ×3 · การ์ดแสดงรอบบิล', actual: `${rM.status()}/${rN.status()}/${rS.status()} · เปิดฟอร์มใหม่ชื่อ='${reopen}' · DB ${JSON.stringify(db).slice(0, 900)} · การ์ด: ${cards.slice(0, 600)}`, status: [rM, rN, rS].every(r => r.status() === 201) ? 'pass' : 'fail', evidence: ['A4-companies.png'] })
  log('5xx', s.serverErrors, 'console', s.consoleErrors)
} finally { await s.browser.close() }
