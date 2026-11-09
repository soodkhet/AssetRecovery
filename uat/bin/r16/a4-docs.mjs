import { openAs, BASE, settle, log, txt, shot, step, toasts, track, sleep, q, fieldsOf, errText, A } from './_a.mjs'
const s = await openAs('superadmin'); const p = s.page; const res = track(p)
const F = `${A}/files/`
const dlg = () => p.getByRole('dialog').last()
const card = name => p.locator('main').locator('div').filter({ hasText: name }).filter({ has: p.getByRole('button', { name: '📎 เอกสารบริษัท' }) }).last()
const CO = { MTJ: 'บริษัท มือถือทันใจ ลีสซิ่ง จำกัด (MT6)', NDP: 'บริษัท เงินด่วนโฟน จำกัด (MT6)', SPC: 'บริษัท สมาร์ทผ่อน แคปปิตอล จำกัด (MT6)' }
const IDS = { MTJ: '50707134-993b-4618-9287-2a8c7ab9b0fa', NDP: 'c6bade94-2c5c-4b0d-9116-f12bc7652c42', SPC: 'cb92ea58-0e17-4730-b6cc-76baab6e10bd' }
const selByText = async (loc, re) => { const opts = await loc.locator('option').evaluateAll(es => es.map(e => ({ v: e.value, t: e.textContent }))); const o = opts.find(o => re.test(o.t)); if (!o) throw new Error('no option ' + re + JSON.stringify(opts)); await loc.selectOption(o.v) }
const upload = async (typeRe, file, issued) => {
  const d = dlg()
  if (!(await d.locator('#company-doc-type').count())) { await d.getByRole('button', { name: /แนบเอกสาร/ }).first().click(); await sleep(700) }
  await selByText(d.locator('#company-doc-type'), typeRe); await sleep(200)
  if (issued && await d.locator('#company-doc-issued').count()) await d.locator('#company-doc-issued').fill(issued)
  await d.locator('#company-doc-file').setInputFiles(F + file); await sleep(300)
  await d.locator('#company-doc-reason').fill('แนบเอกสารบริษัทตามสัญญา รอบ MT6')
  const w = p.waitForResponse(r => r.url().includes('/api/') && r.request().method() !== 'GET', { timeout: 30000 })
  await d.getByRole('button', { name: 'แนบเอกสาร', exact: true }).last().click()
  const r = await w; let b = ''; try { b = (await r.text()).slice(0, 300) } catch {}
  const t = await toasts(p, 1500); await settle(p, 600)
  return { st: r.status(), path: new URL(r.url()).pathname, b, t: t.slice(-1) }
}
try {
  await p.goto(`${BASE}/settings/companies`); await settle(p, 1200)
  // explore
  await card(CO.MTJ).getByRole('button', { name: '📎 เอกสารบริษัท' }).click(); await settle(p, 800)
  log('DOCS DLG', await txt(dlg(), 1500)); log((await fieldsOf(dlg())).join('\n'))
  if (!(await dlg().locator('#company-doc-type').count())) { const b = dlg().getByRole('button', { name: /แนบเอกสาร/ }); log('btns', await b.allInnerTexts()); await b.first().click(); await sleep(700); log((await fieldsOf(dlg())).join('\n')); log('types', await dlg().locator('#company-doc-type option').allInnerTexts()) }
  const before = q(`select count(*) c from storage.objects where name like '%${IDS.MTJ}%'`)[0]?.c
  const fake = await upload(/หนังสือรับรอง/, 'fake.pdf', '2026-09-01')
  await shot(p, 'A4-company-fakepdf')
  await sleep(2000)
  const after = q(`select count(*) c from storage.objects where name like '%${IDS.MTJ}%'`)[0]?.c
  const recent = q(`select bucket_id,name,created_at from storage.objects where created_at > now() - interval '3 minutes' order by created_at desc limit 5`)
  step({ step: 'A4.company-fakepdf', action: 'แนบเอกสาร MTJ ด้วยไฟล์ข้อความชื่อ fake.pdf แล้วตรวจ storage.objects', expected: '400 UPLOAD_FILE_TYPE_INVALID ข้อความไทย · ไม่มีไฟล์ค้างใน Storage', actual: `${fake.st} ${fake.path} ${fake.b.slice(0, 200)} · toast ${fake.t} · storage objects ของบริษัท ก่อน ${before} หลัง ${after} · object ใหม่ 3 นาทีล่าสุด ${JSON.stringify(recent)}`, status: fake.st === 400 && before === after && recent.length === 0 ? 'pass' : 'fail', evidence: ['A4-company-fakepdf.png'] })
  const out = []
  const plan = { MTJ: [[/หนังสือรับรอง/, 'MTJ-cert.pdf', '2026-09-01'], [/ภ\.พ\.20/, 'MTJ-vat.pdf', '2026-08-15'], [/สัญญา/, 'MTJ-contract.pdf', '2026-10-01']], NDP: [[/หนังสือรับรอง/, 'NDP-cert.pdf', '2026-09-05'], [/ภ\.พ\.20/, 'NDP-vat.pdf', '2026-08-20']], SPC: [[/หนังสือรับรอง/, 'SPC-cert.pdf', '2026-09-10'], [/ภ\.พ\.20/, 'SPC-vat.pdf', '2026-08-25']] }
  for (const [co, items] of Object.entries(plan)) {
    if (co !== 'MTJ') { await p.keyboard.press('Escape'); await sleep(500); if (await p.locator('[role=alertdialog]').isVisible().catch(() => false)) await p.getByRole('button', { name: 'ทิ้งข้อมูล' }).click(); await sleep(400); await card(CO[co]).getByRole('button', { name: '📎 เอกสารบริษัท' }).click(); await settle(p, 800) }
    for (const [re, f, dte] of items) { const r = await upload(re, f, dte); out.push(`${co} ${f} ${r.st}`); log(co, f, r) }
    await shot(p, `A4-docs-${co}`)
  }
  // view file in SPC dialog
  const listTxt = await txt(dlg(), 1200)
  const viewBtn = dlg().getByRole('button', { name: /เปิดดู|ดูไฟล์/ }).first()
  let view = 'ไม่พบปุ่มเปิดดู'
  if (await viewBtn.count()) {
    await viewBtn.click(); await sleep(2500)
    const fr = p.locator('iframe').last(); const src = await fr.getAttribute('src').catch(() => null)
    view = `iframe src host=${src ? new URL(src, BASE).host : 'none'} signed=${/token=|sign/.test(src ?? '')}`
    if (src) { const rr = await p.request.get(new URL(src, BASE).toString(), { failOnStatusCode: false }); view += ` GET ${rr.status()} ${rr.headers()['content-type']} ${(await rr.body()).length}B` }
    await shot(p, 'A4-docs-view')
    await p.keyboard.press('Escape'); await sleep(700)
    view += ` · หลัง Esc: alertdialog=${await p.locator('[role=alertdialog]').isVisible().catch(() => false)} dialogs=${await p.getByRole('dialog').count()}`
  }
  const docs = q("select finance_company_id, document_type, version, file_id from finance_company_documents order by created_at")
  const files = q("select f.id, f.storage_path, f.sha256 from files f join finance_company_documents d on d.file_id=f.id")
  step({ step: 'A4.company-docs', action: 'แนบ PDF (มี noise) MTJ: หนังสือรับรอง+ภ.พ.20+สัญญา · NDP/SPC: หนังสือรับรอง+ภ.พ.20 · เปิดดูไฟล์', expected: '201 ×7 · เวอร์ชัน + SHA-256 · เปิดดูได้จริงจาก Storage', actual: `${out.join(' · ')} · รายการ SPC: ${listTxt.slice(0, 300)} · เปิดดู: ${view} · DB docs ${docs.length} files ${JSON.stringify(files).slice(0, 600)}`, status: out.every(x => / 201$/.test(x)) && out.length === 7 ? 'pass' : 'fail', evidence: ['A4-docs-MTJ.png', 'A4-docs-NDP.png', 'A4-docs-SPC.png', 'A4-docs-view.png'] })
  log('5xx', s.serverErrors, 'console', s.consoleErrors)
} finally { await s.browser.close() }
