import { openAs, BASE, settle, log, txt, shot, step, toasts, sleep, q, A, errText, track } from './_a.mjs'
const s = await openAs('superadmin'); const p = s.page; const res = track(p)
const dlg = () => p.getByRole('dialog').last()
const card = name => p.locator('main').locator('div').filter({ hasText: name }).filter({ has: p.getByRole('button', { name: '⚙️ แก้ไขบริษัท' }) }).last()
const CO = { NDP: 'บริษัท เงินด่วนโฟน จำกัด (MT6)', MTJ: 'บริษัท มือถือทันใจ ลีสซิ่ง จำกัด (MT6)', SPC: 'บริษัท สมาร์ทผ่อน แคปปิตอล จำกัด (MT6)' }
const closeDiscard = async () => { await p.keyboard.press('Escape'); await sleep(500); const ad = await p.locator('[role=alertdialog]').isVisible().catch(() => false); if (ad) { await p.getByRole('button', { name: 'ทิ้งข้อมูล' }).click(); await sleep(400) } return ad }
try {
  await p.goto(`${BASE}/settings/companies`); await settle(p, 1200)
  const out = []
  for (const [k, n] of Object.entries(CO)) {
    await card(n).getByRole('button', { name: '⚙️ แก้ไขบริษัท' }).click(); await settle(p, 800)
    const d = dlg()
    const v = await d.evaluate(el => { const g = s => el.querySelector(s); const val = s => g(s)?.value ?? ''; const sel = s => g(s)?.selectedOptions?.[0]?.textContent ?? ''; return { detail: val('[id$="-detail"]'), postal: val('[id$="-postal"]'), prov: sel('[id$="-province"]'), dist: val('[id$="-district"]'), sub: val('[id$="-subdistrict"]'), branch: sel('#co-branch-kind'), wht: val('#co-customer-wht'), tpl: sel('#co-template'), vat: sel('#co-vat-mode'), del: sel('#co-delivery'), phone: val('#co-phone') } })
    const bno = await d.locator('input[id*=branch]').evaluateAll(es => es.map(e => e.value))
    out.push(`${k}: ${v.detail} · ${v.postal} · ${v.prov} · ${v.dist} · ${v.sub} · ${v.branch} ${bno.join('')} · WHT '${v.wht}' · ${v.tpl.slice(0, 30)} · ${v.vat.slice(0, 20)} · ${v.del} · โทร ${v.phone}`)
    if (k === 'NDP') await shot(p, 'A4-edit-NDP')
    if (k === 'MTJ') {
      await d.locator('#co-contact-phone').fill('12'); const n0 = res.length
      await d.locator('textarea').last().fill('ทดสอบเบอร์ผู้ติดต่อ MT6')
      await d.getByRole('button', { name: /^บันทึก/ }).last().click(); await sleep(900)
      const e = await d.locator('#co-contact-phone').evaluate(el => { const id = el.getAttribute('aria-describedby'); return (id && id.split(' ').map(i => document.getElementById(i)?.innerText).join(' ')) || '' })
      const inv = await d.locator('[aria-invalid=true]').evaluateAll(es => es.map(e => e.id))
      out.push(`MTJ เบอร์ผู้ติดต่อ '12' → ช่องผิด ${JSON.stringify(inv)} ข้อความ '${e}' API ${res.length - n0}`)
      await shot(p, 'A4-edit-contact-phone')
      const ad = await closeDiscard(); out.push(`Esc หลังแก้ → ถามทิ้งข้อมูล ${ad}`)
      continue
    }
    await closeDiscard()
  }
  step({ step: 'A4.company-edit-address', action: "เปิด '⚙️ แก้ไขบริษัท' NDP / MTJ / SPC หลังสร้าง · MTJ ลองเบอร์ผู้ติดต่อ '12' แล้ว Esc", expected: 'ค่าที่อยู่/สาขา/WHT ตรงที่บันทึก · เบอร์ผู้ติดต่อผิดถูกปฏิเสธ · Esc ถามทิ้งข้อมูล', actual: out.join(' ‖ '), status: out.join().includes('00012') && /contact-phone/.test(out.join()) ? 'pass' : 'fail', evidence: ['A4-edit-NDP.png', 'A4-edit-contact-phone.png'] })
  // big file
  await p.locator('main').locator('div').filter({ hasText: CO.SPC }).filter({ has: p.getByRole('button', { name: '📎 เอกสารบริษัท' }) }).last().getByRole('button', { name: '📎 เอกสารบริษัท' }).click(); await settle(p, 800)
  await dlg().getByRole('button', { name: '+ แนบเอกสาร' }).click(); await sleep(600)
  const d = dlg()
  await d.locator('#company-doc-type').selectOption({ label: 'หน้าสมุดบัญชีธนาคาร' })
  const n0 = res.length
  await d.locator('#company-doc-file').setInputFiles(`${A}/files/big-11mb.pdf`); await sleep(800)
  const msg = (await d.innerText()).split('\n').filter(l => /MB|ใหญ่|ขนาด/.test(l))
  await d.locator('#company-doc-reason').fill('ทดสอบไฟล์ใหญ่เกิน 10 MB รอบ MT6')
  const sub = d.getByRole('button', { name: 'แนบเอกสาร', exact: true }).last(); const dis = await sub.isDisabled()
  if (!dis) { await sub.click(); await sleep(6000) }
  const t = await toasts(p, 500); await shot(p, 'A4-docs-bigfile')
  const recent = q(`select name from storage.objects where created_at > now() - interval '3 minutes'`)
  step({ step: 'A4.company-bigfile', action: 'แนบเอกสาร SPC ไฟล์ PDF 11 MB (เกิน 10 MB) แล้วตรวจ storage.objects', expected: 'ปฏิเสธ ข้อความไทย · ไม่มีไฟล์ค้างใน Storage', actual: `ข้อความ ${msg.join(' / ')} · ปุ่มแนบ disabled=${dis} · toast ${t.slice(-1)} · API ${res.slice(n0).map(x => x.slice(0, 160)).join(' ‖ ') || 'ไม่ยิง'} · storage.objects ใหม่ 3 นาที ${recent.length}`, status: recent.length === 0 && (msg.length || t.length) ? 'pass' : 'fail', evidence: ['A4-docs-bigfile.png'] })
  log('5xx', s.serverErrors, 'console', s.consoleErrors)
} finally { await s.browser.close() }
