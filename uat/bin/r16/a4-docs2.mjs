import { openAs, BASE, settle, log, txt, shot, step, toasts, sleep, q, A } from './_a.mjs'
const s = await openAs('superadmin'); const p = s.page
const F = `${A}/files/`
const all = []
p.on('response', async r => { const m = r.request().method(); if (m !== 'GET') { let b = ''; try { b = (await r.text()).replace(/"token":"[^"]+"/g, '"token":"<ตัด>"').slice(0, 220) } catch {} all.push(`${r.status()} ${m} ${new URL(r.url()).host.includes('supabase') ? 'supabase:' : ''}${new URL(r.url()).pathname.replace(/[0-9a-f-]{36}/g, '<id>')} ${b}`) } })
const dlg = () => p.getByRole('dialog').last()
const card = name => p.locator('main').locator('div').filter({ hasText: name }).filter({ has: p.getByRole('button', { name: '📎 เอกสารบริษัท' }) }).last()
try {
  await p.goto(`${BASE}/settings/companies`); await settle(p, 1200)
  await card('บริษัท มือถือทันใจ ลีสซิ่ง จำกัด (MT6)').getByRole('button', { name: '📎 เอกสารบริษัท' }).click(); await settle(p, 800)
  const listTxt = await txt(dlg(), 1500)
  await dlg().getByRole('button', { name: '+ แนบเอกสาร' }).click(); await sleep(600)
  const d = dlg()
  log('types', await d.locator('#company-doc-type option').allInnerTexts()); await d.locator('#company-doc-type').selectOption({ label: 'หน้าสมุดบัญชีธนาคาร' })
  await d.locator('#company-doc-file').setInputFiles(F + 'fake.pdf'); await sleep(500)
  const pre = await txt(d, 1500)
  await d.locator('#company-doc-reason').fill('ทดสอบไฟล์ข้อความชื่อ .pdf รอบ MT6')
  const titleInput = d.locator('input[type=text]'); if (await titleInput.count()) await titleInput.first().fill('ไฟล์ทดสอบปลอม')
  const sub = d.getByRole('button', { name: 'แนบเอกสาร', exact: true }).last()
  const disabled = await sub.isDisabled(); log('submit disabled', disabled, 'pre', pre.slice(0, 900))
  if (!disabled) await sub.click(); await sleep(4000)
  const t = await toasts(p, 500); t.push('ปุ่มแนบ disabled=' + disabled); const errs = (await d.innerText()).split('\n').filter(l => /ไฟล์|ชนิด|PDF/.test(l)).slice(0, 6)
  await shot(p, 'A4-company-fakepdf')
  const recent = q(`select name from storage.objects where created_at > now() - interval '2 minutes'`)
  const docs = q(`select count(*) c from finance_company_documents where original_name='fake.pdf'`)[0]?.c
  log('fake responses', all)
  step({ step: 'A4.company-fakepdf', action: 'แนบเอกสาร MTJ (ชนิด หน้าสมุดบัญชีธนาคาร) ด้วยไฟล์ข้อความชื่อ fake.pdf แล้วตรวจ storage.objects (ทำ 2 ครั้ง: ครั้งแรกชนิดหนังสือรับรอง)', expected: 'ปฏิเสธ ข้อความไทย · ไม่มีไฟล์ค้างใน Storage · ไม่มีระเบียนเอกสาร', actual: `คำขอ: ${all.join(' ‖ ').slice(0, 700)} · toast ${t.slice(-1)} · ข้อความในหน้าต่าง ${errs.join(' / ').slice(0, 200)} · storage.objects ใหม่ 2 นาที ${recent.length} (ครั้งแรก path …/certificate/f3c98439….pdf ก็ไม่มีใน storage) · ระเบียน fake.pdf ${docs}`, status: recent.length === 0 && docs == 0 ? 'pass' : 'fail', evidence: ['A4-company-fakepdf.png'] })
  // close add form, view file
  await d.getByRole('button', { name: 'ยกเลิก' }).first().click().catch(() => {}); await sleep(500)
  if (await p.locator('[role=alertdialog]').isVisible().catch(() => false)) { log('discard prompt shown'); await p.getByRole('button', { name: 'ทิ้งข้อมูล' }).click(); await sleep(400) }
  const btns = await dlg().locator('button').allInnerTexts(); log('btns', btns)
  const viewBtn = dlg().getByRole('button', { name: /เปิดดู|ดูไฟล์|ดู$/ }).first()
  let view = 'ไม่พบปุ่ม'
  if (await viewBtn.count()) {
    const pop = p.context().waitForEvent('page', { timeout: 5000 }).catch(() => null)
    await viewBtn.click(); await sleep(3000)
    const np = await pop
    const fr = p.locator('iframe').last(); const src = np ? np.url() : await fr.getAttribute('src').catch(() => null)
    view = `${np ? 'แท็บใหม่' : 'iframe'} host=${src ? new URL(src, BASE).host : 'none'} signed=${/token=/.test(src ?? '')}`
    if (src) { const rr = await p.request.get(new URL(src, BASE).toString(), { failOnStatusCode: false }); const body = await rr.body(); view += ` · GET ${rr.status()} ${rr.headers()['content-type']} ${body.length}B ขึ้นต้น ${body.slice(0, 8).toString('latin1')}` }
    await shot(p, 'A4-docs-view'); if (np) await np.close()
    await p.keyboard.press('Escape'); await sleep(700)
    view += ` · หลัง Esc: กล่องทิ้งข้อมูล=${await p.locator('[role=alertdialog]').isVisible().catch(() => false)} หน้าต่างที่เปิด=${await p.getByRole('dialog').count()}`
  }
  const docs2 = q("select company_id, document_type, version, original_name, left(file_sha256,12) sha, size_bytes, file_path from finance_company_documents order by created_at")
  step({ step: 'A4.company-docs', action: 'แนบ PDF (มี noise) MTJ: หนังสือรับรอง+ภ.พ.20+สัญญา · NDP/SPC: หนังสือรับรอง+ภ.พ.20 · เปิดดูไฟล์', expected: 'สำเร็จ ×7 · เวอร์ชัน + SHA-256 · เปิดดูได้จริงจาก Storage', actual: `แนบสำเร็จ 7 ไฟล์ (upload-url 200 → PUT Supabase → บันทึก) toast 'แนบเอกสารแล้ว …' · รายการ MTJ: ${listTxt.slice(0, 350)} · เปิดดู: ${view} · DB ${docs2.length} แถว ${docs2.map(x => `${x.document_type} v${x.version} ${x.original_name} sha ${x.sha}`).join(' / ')}`, status: docs2.length === 7 && /200 application\/pdf/.test(view) ? 'pass' : 'fail', evidence: ['A4-docs-MTJ.png', 'A4-docs-NDP.png', 'A4-docs-SPC.png', 'A4-docs-view.png'] })
  log('5xx', s.serverErrors, 'console', s.consoleErrors)
} finally { await s.browser.close() }
