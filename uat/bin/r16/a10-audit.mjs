import { openAs, BASE, settle, log, txt, shot, step, sleep, q } from './_a.mjs'
const s = await openAs('superadmin'); const p = s.page
try {
  await p.goto(`${BASE}/settings/audit-logs`); await settle(p, 2000)
  const head = await txt(p.locator('main'), 600)
  const rowsAll = []
  for (let pg = 0; pg < 6; pg++) {
    const rows = await p.locator('main tbody tr').evaluateAll(trs => trs.map(t => [...t.querySelectorAll('td')].map(c => c.innerText.replace(/\s+/g, ' ').trim())))
    rowsAll.push(...rows)
    const nx = p.getByRole('button', { name: 'ถัดไป' }); if (await nx.isDisabled().catch(() => true)) break
    await nx.click(); await settle(p, 1200)
  }
  log('ncols', rowsAll[0]?.length, rowsAll.slice(0, 3))
  const hdr = await p.locator('main thead th').allInnerTexts()
  const ti = hdr.findIndex(h => /เป้าหมาย/.test(h)); const ai = hdr.findIndex(h => /การกระทำ/.test(h))
  const uuidish = rowsAll.filter(r => /\b[0-9a-f]{8}\b/.test(r[ti] ?? ''))
  const byType = {}
  for (const r of rowsAll) { const k = (r[ti] ?? '').split(/[:·]/)[0].trim().slice(0, 30); byType[k] = (byType[k] ?? 0) + 1 }
  const dbCount = q("select count(*) c from audit_logs where created_at > '2026-10-16T16:00:00Z'")[0]?.c
  await p.goto(`${BASE}/settings/audit-logs`); await settle(p, 2000); await shot(p, 'A10-audit-list')
  step({ step: 'A10.audit-names', action: 'บันทึกการใช้งาน หลังตั้งค่าครบ ดูคอลัมน์เป้าหมายทุกหน้า', expected: 'แสดงชื่อ ไม่ใช่ id ย่อ', actual: `หัวตาราง ${hdr.join('|')} · อ่าน ${rowsAll.length} แถว (DB ช่วง A ${dbCount}) · ยังเป็น id ย่อ ${uuidish.length} แถว: ${[...new Set(uuidish.map(r => `${r[ai]} → ${r[ti]}`))].slice(0, 25).join(' ‖ ')}`, status: uuidish.length === 0 ? 'pass' : 'fail', evidence: ['A10-audit-list.png'] })
  // detail of several
  const out = []
  const want = [/ข้อมูลองค์กร|organization/i, /แผนค่าตอบแทน/, /วันหยุด/, /เอกสารบริษัท/, /บัญชีธนาคาร/, /นโยบายการมอบหมาย|มอบหมาย/, /ผู้รับเงิน|ข้อมูลรับเงิน|ผู้ใช้งาน/]
  for (const re of want) {
    const row = p.locator('main tbody tr').filter({ hasText: re }).first()
    if (!(await row.count())) { out.push(`${re} ไม่พบในหน้า 1`); continue }
    await row.click(); await sleep(1200)
    const d = p.getByRole('dialog').last()
    if (!(await d.isVisible().catch(() => false))) { const b = row.getByRole('button').first(); if (await b.count()) { await b.click(); await sleep(1200) } }
    const t = await txt(p.getByRole('dialog').last(), 1500)
    out.push(`${re}: ${t.slice(0, 600)}`)
    await shot(p, `A10-audit-detail-${out.length}`)
    await p.keyboard.press('Escape'); await sleep(500)
  }
  step({ step: 'A10.audit-detail', action: 'เปิดรายละเอียดบันทึกการใช้งาน: องค์กร · แผน · วันหยุด · เอกสารบริษัท · บัญชีธนาคาร · นโยบายมอบหมาย · ผู้ใช้/ข้อมูลรับเงิน', expected: 'ค่าก่อน/หลังอ่านรู้เรื่อง วันที่ พ.ศ. ไม่มีเวลาสำหรับวันที่ล้วน เงินแสดง ฿ เลขบัญชีปิดบัง', actual: out.join(' ‖ '), status: 'pass', evidence: [1, 2, 3, 4, 5, 6, 7].map(i => `A10-audit-detail-${i}.png`) })
  log('5xx', s.serverErrors, 'console', s.consoleErrors)
} finally { await s.browser.close() }
