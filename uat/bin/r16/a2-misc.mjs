import { openAs, BASE, settle, log, txt, shot, step, toasts, track, sleep, errText, q, fieldsOf, A } from './_a.mjs'
import { writeFileSync } from 'node:fs'
const s = await openAs('superadmin'); const p = s.page; const res = track(p)
const tab = async n => { await p.locator('main').getByRole('button', { name: n, exact: true }).first().click(); await settle(p, 900) }
const waitMut = () => p.waitForResponse(r => r.url().includes('/api/') && r.request().method() !== 'GET', { timeout: 20000 })
const save = async (d, name) => { const r = waitMut(); await d.getByRole('button', { name, exact: true }).click(); const rr = await r; let b=''; try{b=(await rr.text()).slice(0,250)}catch{}; return { st: rr.status(), b, t: await toasts(p, 1200) } }
const only = process.argv[2]?.split(',')
const run = n => !only || only.includes(n)
let n0
try {
  await p.goto(`${BASE}/settings/finance`); await settle(p, 1200)
  if (run('vat')) {
    await tab('อัตรา VAT')
    await p.locator('main').getByRole('button', { name: '+ เพิ่มอัตรา VAT' }).click(); await settle(p, 600)
    const d = p.getByRole('dialog').last()
    await d.locator('#vat-rate').fill('150'); await d.locator('#vat-from').fill('2026-11-01'); await d.locator('#vat-note').fill('ทดสอบปรับอัตรา VAT (MT6)'); await d.locator('#vat-reason').fill('ทดสอบเพิ่มอัตรา VAT ใหม่ รอบ MT6')
    n0 = res.length; await d.getByRole('button', { name: /^เพิ่ม|^บันทึก/ }).last().click(); await sleep(900)
    const e1 = (await errText(d)).filter(x => /VAT|อัตรา|ทับ/.test(x)); const api1 = res.length - n0
    await shot(p, 'A2-vat-150')
    await d.locator('#vat-rate').fill('10'); await sleep(500)
    const warn = (await d.innerText()).split('\n').filter(l => /ทับ/.test(l))
    const r = await save(d, (await d.locator('[data-modal-footer] button').allInnerTexts()).pop().trim())
    await shot(p, 'A2-vat-overlap')
    const still = await d.isVisible()
    await d.getByRole('button', { name: 'ยกเลิก' }).click(); await sleep(500)
    const disc = await p.locator('[role=alertdialog]').isVisible().catch(() => false)
    if (disc) await p.getByRole('button', { name: 'ทิ้งข้อมูล' }).click(); await sleep(400)
    const vat = q('select rate_pct,effective_from,effective_to from vat_rate_history')
    step({ step: 'A2.vat', action: 'เพิ่ม VAT 150% → 10% เริ่ม 01/11/2569 (ทับช่วง 7% เปิดปลาย) แล้วยกเลิก', expected: 'ปฏิเสธ 150 · เตือนทับ · 400 VAT_RATE_OVERLAP · คง 7%', actual: `150 → ${e1.join(' / ')} API ${api1} · เตือน ${warn.join(' / ')} · 10% → ${r.st} ${r.b.slice(0,120)} toast ${r.t.slice(-1)} · ฟอร์มยังเปิด ${still} · ยกเลิกถามทิ้ง ${disc} · DB ${JSON.stringify(vat)}`, status: api1 === 0 && r.st === 400 && vat.length === 1 ? 'pass' : 'fail', evidence: ['A2-vat-150.png', 'A2-vat-overlap.png'] })
  }
  if (run('cc')) {
    await tab('ศูนย์ต้นทุน')
    const add = async (name, desc, withReason) => {
      await p.locator('main').getByRole('button', { name: '+ เพิ่มศูนย์ต้นทุน' }).click(); await settle(p, 600)
      const d = p.getByRole('dialog').last()
      await d.locator('#cost-center-name').fill(name); await d.locator('#cost-center-description').fill(desc)
      let e = null
      if (!withReason) { n0 = res.length; await d.getByRole('button', { name: 'เพิ่มศูนย์ต้นทุน' }).click(); await sleep(800); e = { e: (await errText(d)).filter(x => /เหตุผล/.test(x)), api: res.length - n0 }; await shot(p, 'A2-cc-noreason') }
      await d.locator('#cost-center-reason').fill('เพิ่มศูนย์ต้นทุนรอบทดสอบ MT6')
      return { e, r: await save(d, 'เพิ่มศูนย์ต้นทุน') }
    }
    const c1 = await add('ทีมติดตาม Inhouse (MT6)', 'ค่าใช้จ่ายทีมติดตามพนักงานบริษัท', false); await settle(p, 600)
    const c2 = await add('ทีมติดตาม Outsource (MT6)', 'ค่าใช้จ่ายทีมติดตามผู้รับจ้างภายนอก', true); await settle(p, 600)
    await shot(p, 'A2-costcenters')
    const cc = q('select id,code,name from cost_centers')
    step({ step: 'A2.costcenter', action: "เพิ่มศูนย์ต้นทุน 'ทีมติดตาม Inhouse (MT6)' / 'ทีมติดตาม Outsource (MT6)' (ครั้งแรกไม่กรอกเหตุผล)", expected: 'บังคับเหตุผล · 201 CC-001/CC-002', actual: `ไม่กรอกเหตุผล → ${c1.e.e.join(' / ')} API ${c1.e.api} · ${c1.r.st}/${c2.r.st} · DB ${JSON.stringify(cc)}`, status: c1.r.st === 201 && c2.r.st === 201 && c1.e.api === 0 ? 'pass' : 'fail', evidence: ['A2-cc-noreason.png', 'A2-costcenters.png'] })
  }
  if (run('wht')) {
    await tab('ค่าตั้งภาษีหัก ณ ที่จ่าย')
    const t = await txt(p.locator('main'), 5000); const i = t.indexOf('ค่าที่มีผลวันนี้')
    await shot(p, 'A2-wht')
    step({ step: 'A2.wht', action: 'ดูแท็บค่าตั้งภาษีหัก ณ ที่จ่าย (คงค่าเริ่มต้น)', expected: 'แสดงค่าที่มีผลวันนี้ วันที่ พ.ศ.', actual: t.slice(i, i + 450), status: /16\/10\/2569/.test(t) ? 'pass' : 'fail', evidence: ['A2-wht.png'] })
  }
  if (run('num')) {
    await tab('เลขที่เอกสาร')
    await p.locator('main').getByRole('button', { name: 'แก้ไข', exact: true }).first().click(); await settle(p, 600)
    const d = p.getByRole('dialog').last()
    await d.locator('#numbering-prefix').fill('ใบ#1'); const v = await d.locator('#numbering-prefix').inputValue()
    await d.locator('#numbering-reason').fill('ตั้งรูปแบบเลขใบกำกับรอบ MT6')
    n0 = res.length; await d.getByRole('button', { name: 'บันทึกเลขที่เอกสาร' }).click(); await sleep(900)
    const e1 = (await errText(d)).filter(x => /คำนำหน้า/.test(x)); const api1 = res.length - n0
    await shot(p, 'A2-numbering-bad')
    await d.locator('#numbering-prefix').fill('IV')
    await d.getByLabel('รวมปี พ.ศ. ในเลขเอกสาร').check(); await sleep(200)
    await d.getByLabel('เริ่มนับลำดับใหม่ทุกปี พ.ศ.').check()
    const ex = (await d.innerText()).match(/IV-[0-9]{4}-[0-9]+/)?.[0]
    const r = await save(d, 'บันทึกเลขที่เอกสาร'); await settle(p, 700)
    const row = (await txt(p.locator('main table').first(), 400))
    await shot(p, 'A2-numbering')
    step({ step: 'A2.numbering', action: "เลขใบเสร็จ/ใบกำกับ: คำนำหน้า 'ใบ#1' → 'IV' + รวมปี พ.ศ. + นับใหม่ทุกปี", expected: 'ปฏิเสธอักขระไทย/# · 200 ตัวอย่าง IV-2569-0001', actual: `'ใบ#1' ช่องได้ '${v}' → ${e1.join(' / ')} API ${api1} · ตัวอย่าง ${ex} · ${r.st} · ${row}`, status: r.st === 200 && api1 === 0 ? 'pass' : 'fail', evidence: ['A2-numbering-bad.png', 'A2-numbering.png'] })
  }
  if (run('tpl')) {
    await tab('เทมเพลตเอกสาร')
    const tpls = [['billing_invoice', 'โปรดชำระภายในกำหนด ขอบคุณที่ใช้บริการ บริษัท ตามทันทรัพย์ (MT6) จำกัด', true], ['tax_invoice', 'ขอบคุณที่ใช้บริการ บริษัท ตามทันทรัพย์ (MT6) จำกัด', true], ['handover_note', 'ผู้รับมอบโปรดตรวจสภาพทรัพย์ก่อนลงนาม (MT6)', false]]
    const out = []
    for (const [k, footer, sig] of tpls) {
      await p.locator(`#footer-${k}`).fill(footer)
      const cb = p.locator(`#footer-${k}`).locator('xpath=ancestor::*[.//textarea[@id="reason-' + k + '"]][1]').locator('input[type=checkbox]').first()
      if (sig) await cb.check().catch(e => out.push('cb err ' + e.message.slice(0, 60))); else await cb.uncheck().catch(() => {})
      await p.locator(`#reason-${k}`).fill('ตั้งข้อความท้ายเอกสารรอบ MT6')
      const sec = p.locator(`#reason-${k}`).locator('xpath=ancestor::*[.//button[normalize-space()="บันทึกเทมเพลต"]][1]')
      const w = waitMut(); await sec.getByRole('button', { name: 'บันทึกเทมเพลต' }).click(); const rr = await w; out.push(`${k} ${rr.status()}`); await sleep(800)
    }
    await settle(p, 800)
    // preview tax invoice PDF
    const sec = p.locator('#reason-tax_invoice').locator('xpath=ancestor::*[.//button[normalize-space()="ดูตัวอย่าง PDF"]][1]')
    const [pop, resp] = await Promise.all([
      p.context().waitForEvent('page', { timeout: 15000 }).catch(() => null),
      p.waitForResponse(r => /pdf|preview/i.test(r.url()), { timeout: 20000 }).catch(() => null),
      sec.getByRole('button', { name: 'ดูตัวอย่าง PDF' }).click(),
    ])
    let info = `popup=${!!pop} resp=${resp ? resp.status() + ' ' + resp.headers()['content-type'] + ' ' + new URL(resp.url()).pathname : 'none'}`
    if (resp && /pdf/.test(resp.headers()['content-type'] ?? '')) { const b = await resp.body(); writeFileSync(`${A}/A2-tax-invoice-preview.pdf`, b); info += ` ${b.length}B` }
    await sleep(1500); await shot(p, 'A2-templates')
    if (pop) await pop.close()
    step({ step: 'A2.templates', action: 'เทมเพลตเอกสาร 3 ชนิด ข้อความท้าย + ลายเซ็น (ใบส่งมอบไม่พิมพ์ลายเซ็น) → ดูตัวอย่าง PDF ใบเสร็จ/ใบกำกับ', expected: 'บันทึก 200 ×3 · PDF ตัวอย่างหัว MT6', actual: `${out.join(' · ')} · ${info}`, status: out.filter(x => / 200$/.test(x)).length === 3 && resp?.status() === 200 ? 'pass' : 'fail', evidence: ['A2-templates.png', 'A2-tax-invoice-preview.pdf'] })
  }
  if (run('sla')) {
    await tab('เกณฑ์ SLA งานติดตาม')
    await p.locator('#sla-hours').fill('0'); await p.locator('#sla-reason').fill('ตั้งเกณฑ์ SLA รอบทดสอบ MT6')
    n0 = res.length; await p.getByRole('button', { name: 'บันทึกเกณฑ์ SLA' }).click(); await sleep(900)
    const e1 = (await errText(p.locator('main'))).filter(x => /SLA|ชั่วโมง/.test(x)); const api1 = res.length - n0
    await p.locator('#sla-hours').fill(''); await p.locator('#sla-hours').pressSequentially('4x8'); const typed = await p.locator('#sla-hours').inputValue()
    await p.locator('#sla-hours').fill('48')
    const w = waitMut(); await p.getByRole('button', { name: 'บันทึกเกณฑ์ SLA' }).click(); await sleep(700)
    if (await p.getByRole('dialog').last().isVisible().catch(() => false)) { const dd = p.getByRole('dialog').last(); log('sla confirm', await txt(dd, 300)); await dd.getByRole('button', { name: /ยืนยัน|บันทึก/ }).last().click() }
    const rr = await w; await sleep(800); await shot(p, 'A2-sla')
    step({ step: 'A2.sla', action: "SLA 0 → 48 ชม. (ลองพิมพ์ '4x8')", expected: 'ปฏิเสธ 0 · บันทึก 48', actual: `0 → ${e1.join(' / ')} API ${api1} · '4x8'→'${typed}' · 48 → ${rr.status()}`, status: rr.status() === 200 && api1 === 0 ? 'pass' : 'fail', evidence: ['A2-sla.png'] })
  }
  if (run('assign')) {
    await tab('นโยบายการมอบหมายงาน')
    const to = p.locator('#assignment-reassign-timeout')
    await to.fill('0'); n0 = res.length; await p.getByRole('button', { name: 'บันทึกนโยบายการมอบหมายงาน' }).click(); await sleep(900)
    const e1 = (await errText(p.locator('main'))).filter(x => /เวลา|ชั่วโมง/.test(x)); const api1 = res.length - n0
    await shot(p, 'A2-assign-0')
    await to.fill('4'); await p.getByRole('button', { name: 'บันทึกนโยบายการมอบหมายงาน' }).click(); await sleep(800)
    const dd = p.getByRole('dialog').last(); const dtext = await txt(dd, 400); await shot(p, 'A2-assign-confirm')
    await dd.getByRole('button', { name: 'ยกเลิก' }).click(); await sleep(400)
    if (await p.locator('[role=alertdialog]').isVisible().catch(() => false)) await p.getByRole('button', { name: 'ทิ้งข้อมูล' }).click()
    await p.reload(); await settle(p, 1200); await tab('นโยบายการมอบหมายงาน')
    const after = await p.locator('#assignment-reassign-timeout').inputValue()
    // Outsource supervisor off
    await p.getByLabel('หัวหน้าทีมกลุ่ม Outsource มอบหมาย/เปลี่ยนผู้รับผิดชอบได้').uncheck()
    await p.getByRole('button', { name: 'บันทึกนโยบายการมอบหมายงาน' }).click(); await sleep(800)
    const dd2 = p.getByRole('dialog').last(); const d2 = await txt(dd2, 500)
    await dd2.locator('textarea').fill('ปิดสิทธิ์หัวหน้าทีม Outsource มอบหมายงาน เพื่อทดสอบปุ่มซ่อน รอบ MT6')
    const w = waitMut(); await dd2.getByRole('button', { name: /ยืนยัน|บันทึก/ }).last().click(); const rr = await w; await sleep(900)
    await p.reload(); await settle(p, 1200); await tab('นโยบายการมอบหมายงาน')
    const st = await Promise.all(['System', 'Inhouse', 'Outsource'].map(g => p.getByLabel(`หัวหน้าทีมกลุ่ม ${g} มอบหมาย/เปลี่ยนผู้รับผิดชอบได้`).isChecked()))
    await shot(p, 'A2-assign-saved')
    const db = q('select * from assignment_policy_settings')
    step({ step: 'A2.assignment', action: 'นโยบายมอบหมาย: เวลารอ 0 → 4 (เปิดกล่องยืนยันแล้วยกเลิก) คง 3 ชม. · ปิด "หัวหน้าทีมกลุ่ม Outsource มอบหมายได้" แล้วบันทึก', expected: 'ปฏิเสธ 0 · ยกเลิกคง 3 · Outsource ปิด', actual: `0 → ${e1.join(' / ')} API ${api1} · กล่อง: ${dtext.slice(0, 160)} · reload = ${after} · บันทึก Outsource ปิด ${rr.status()} (กล่อง: ${d2.slice(0, 120)}) · System/Inhouse/Outsource = ${st.join('/')} · DB ${JSON.stringify(db).slice(0, 300)}`, status: rr.status() === 200 && after === '3' && st[2] === false && st[1] === true ? 'pass' : 'fail', evidence: ['A2-assign-0.png', 'A2-assign-confirm.png', 'A2-assign-saved.png'] })
  }
  if (run('ret')) {
    await tab('ระยะเก็บเอกสารลูกหนี้')
    const out = []
    for (const v of ['0', '21']) { await p.locator('#retention-years').fill(v); await p.locator('#retention-reason').fill('ทดสอบระยะเก็บเอกสาร MT6'); n0 = res.length; await p.getByRole('button', { name: 'บันทึกระยะเก็บเอกสาร' }).click(); await sleep(800); out.push(`${v} → ${(await errText(p.locator('main'))).filter(x => /ระยะ|ปี/.test(x)).join(' / ')} API ${res.length - n0}`) }
    await shot(p, 'A2-retention')
    await p.locator('#retention-years').fill('5'); await p.locator('#retention-reason').fill('')
    step({ step: 'A2.retention', action: 'ระยะเก็บเอกสาร 0 และ 21 ปี (ไม่บันทึก คง 5 ปี)', expected: 'ปฏิเสธทั้งสองค่า ไม่ยิง API', actual: out.join(' · '), status: out.every(x => / API 0$/.test(x)) ? 'pass' : 'fail', evidence: ['A2-retention.png'] })
  }
  if (run('hol')) {
    await tab('ปฏิทินวันหยุด')
    await p.locator('main').getByRole('button', { name: 'นำเข้าหลายวัน' }).click(); await settle(p, 600)
    const d = p.getByRole('dialog').last()
    const lines = ['2569-10-13,วันคล้ายวันสวรรคต ร.9', '2569-10-23,วันปิยมหาราช', '2569-12-05,วันพ่อแห่งชาติ', '2569-12-10,วันรัฐธรรมนูญ', '2569-12-31,วันสิ้นปี', '2570-01-01,วันขึ้นปีใหม่', '2570-04-13,วันสงกรานต์', '2570-04-14,วันสงกรานต์', '2570-04-15,วันสงกรานต์', '2569-13-40,วันผิดรูป']
    await d.locator('#holiday-import-text').fill(lines.join('\n')); await sleep(600)
    const e1 = (await d.innerText()).split('\n').filter(l => /บรรทัด/.test(l))
    const btn1 = (await d.locator('[data-modal-footer] button').allInnerTexts()).pop(); const dis1 = await d.locator('[data-modal-footer] button').last().isDisabled()
    await shot(p, 'A2-holidays-bad')
    await d.locator('#holiday-import-text').fill(lines.slice(0, 9).join('\n')); await sleep(500)
    await d.locator('#holiday-import-reason').fill('นำเข้าวันหยุดราชการ ปี 2569–2570 รอบ MT6')
    const btn2 = (await d.locator('[data-modal-footer] button').allInnerTexts()).pop().trim()
    const r = await save(d, btn2); await settle(p, 800)
    const t = await txt(p.locator('main table'), 600); await shot(p, 'A2-holidays')
    const cnt = q('select count(*) c from public_holidays')
    step({ step: 'A2.holidays', action: "นำเข้าวันหยุด 10 บรรทัด (บรรทัด 10 '2569-13-40') → ลบบรรทัดผิด → นำเข้า 9 วัน", expected: 'แจ้งบรรทัดผิด ปุ่ม disabled · 201 9 วัน แสดง พ.ศ.', actual: `${e1.join(' / ')} ปุ่ม '${btn1}' disabled=${dis1} · '${btn2}' ${r.st} ${r.t.slice(-1)} · ตาราง 2569: ${t} · DB ${cnt[0]?.c}`, status: r.st === 201 && dis1 && cnt[0]?.c == 9 ? 'pass' : 'fail', evidence: ['A2-holidays-bad.png', 'A2-holidays.png'] })
  }
  log('5xx', s.serverErrors, 'console', s.consoleErrors)
} finally { await s.browser.close() }
