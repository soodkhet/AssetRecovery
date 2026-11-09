import { openAs, BASE, settle, log, txt, shot, step, toasts, sleep, q, track } from './_a.mjs'
const s = await openAs('superadmin'); const p = s.page
try {
  await p.goto(`${BASE}/settings/roles`); await settle(p, 1200)
  const rows = await p.locator('main tbody tr').evaluateAll(trs => trs.map(t => { const c = t.querySelectorAll('td'); return `${c[0]?.innerText.trim()}=${c[3]?.innerText.trim()}` }))
  const delTitle = await p.locator('main tr').filter({ hasText: 'Superadmin' }).getByRole('button', { name: 'ลบ' }).evaluate(b => `${b.getAttribute('title') ?? b.getAttribute('aria-label') ?? ''} disabled=${b.disabled}`)
  await shot(p, 'A8-roles')
  step({ step: 'A8.roles-labels', action: 'หน้าสิทธิ์: คอลัมน์สถานะของตารางบทบาท + tooltip ปุ่มลบบทบาทพื้นฐาน', expected: "'🔒 พื้นฐาน'/'สร้างเอง' ไม่มี Seed/Custom · ปุ่มลบ seed ปิดพร้อมเหตุผล", actual: `${rows.join(' · ')} · ปุ่มลบ Superadmin: ${delTitle}`, status: rows.join().includes('🔒 พื้นฐาน') && !/Seed|Custom/.test(rows.join()) ? 'pass' : 'fail', evidence: ['A8-roles.png'] })
  await p.locator('main tr').filter({ hasText: 'ทดสอบสิทธิ์ล็อก (MT4)' }).getByRole('button', { name: 'กำหนดสิทธิ์' }).click(); await settle(p, 1200)
  const d = p.getByRole('dialog').last()
  const locked = await d.locator('select:disabled').evaluateAll(es => es.map(e => { const row = e.closest('div:has(> select), li, tr') ?? e.parentElement; let r = e; for (let i = 0; i < 4 && !(r.innerText || '').includes('🔒'); i++) r = r.parentElement; return `${e.getAttribute('aria-label').replace('ระดับสิทธิ์ของ ', '')} [${((r.innerText || '').match(/🔒[^\n|]*/) || [''])[0].trim()}] title=${(r.querySelector('[title]')?.getAttribute('title') || '')}` }))
  const allTitles = await d.locator('[title]').evaluateAll(es => [...new Set(es.map(e => e.getAttribute('title')))])
  const bad = allTitles.filter(t => /[a-z]+_[a-z]+/.test(t))
  const dlgText = await d.innerText(); const snake = dlgText.match(/\b[a-z]+_[a-z_]+\b/g) ?? []
  await shot(p, 'A8-perm-dialog')
  log('locked', locked.length, locked)
  step({ step: 'A8.perm-tooltips', action: 'อ่าน tooltip (title) ทุกจุด + ข้อความหน้าต่างกำหนดสิทธิ์ หารหัสอังกฤษ', expected: 'tooltip ไทย ไม่มี snake_case', actual: `tooltip ${allTitles.length} แบบ: ${allTitles.slice(0, 12).join(' | ')} · snake_case ใน title ${bad.length} ในข้อความ ${snake.length}`, status: bad.length === 0 && snake.length === 0 ? 'pass' : 'fail', evidence: ['A8-perm-dialog.png'] })
  // DOM unlock
  const targets = ['อนุมัติรายการปรับปรุง (งวดที่ล็อกแล้ว)']
  const comp = locked.find(x => /บริษัทไฟแนนซ์/.test(x)); if (comp) targets.push(comp.split(' [')[0])
  for (const t of targets) {
    const sel = d.locator(`select[aria-label="ระดับสิทธิ์ของ ${t}"]`)
    await sel.evaluate(e => e.removeAttribute('disabled'))
    await sel.selectOption({ label: '✅ ทำได้' }).catch(async () => { await sel.evaluate(e => { const o = [...e.options].find(o => o.text.includes('ทำได้')); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(e, o.value); e.dispatchEvent(new Event('change', { bubbles: true })) }) })
    log('after set', t, await sel.inputValue())
  }
  const ta = d.locator('textarea'); if (await ta.count()) await ta.last().fill('ทดสอบปลดล็อกสิทธิ์ผ่าน DOM รอบ MT6')
  const w = p.waitForResponse(r => r.url().includes('/api/') && r.request().method() !== 'GET', { timeout: 20000 }).catch(() => null)
  await d.getByRole('button', { name: /^บันทึก/ }).last().click()
  const r = await w; let b = ''; try { b = (await r.text()).slice(0, 300) } catch {}
  const t = await toasts(p, 1200); await shot(p, 'A8-capability-locked')
  const db = q("select count(*) c from role_capabilities rc join roles r on r.id=rc.role_id where r.name='ทดสอบสิทธิ์ล็อก (MT4)'")
  step({ step: 'A8.capability-locked', action: "บทบาท 'ทดสอบสิทธิ์ล็อก (MT4)' (ใช้ของเดิม) → กำหนดสิทธิ์: นับรายการ 🔒 · ปลด disabled ผ่าน DOM ตั้ง approve_adjustment_locked + manage_companies = ✅ แล้วบันทึก", expected: '🔒 9 รายการ (Superadmin 6 + บริหาร 3) · server 400 CAPABILITY_LOCKED', actual: `🔒 ${locked.length} รายการ: ${locked.map(x => x.replace(/ title=.*/, '')).join(' · ')} · บันทึก → ${r?.status()} ${b} · toast ${t.slice(-1)} · role_capabilities ของบทบาท ${db[0]?.c}`, status: locked.length === 9 && r?.status() === 400 && /CAPABILITY_LOCKED/.test(b) ? 'pass' : 'fail', evidence: ['A8-perm-dialog.png', 'A8-capability-locked.png'] })
  log('5xx', s.serverErrors, 'console', s.consoleErrors)
} finally { await s.browser.close() }
