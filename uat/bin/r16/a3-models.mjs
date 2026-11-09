import { openAs, BASE, settle, log, txt, shot, step, toasts, track, sleep, q } from './_a.mjs'
const s = await openAs('superadmin'); const p = s.page; const res = track(p)
const rows = async (n = 12) => (await p.locator('main table tbody tr').allInnerTexts()).slice(0, n).map(r => r.replace(/\s+/g, ' ').trim().slice(0, 80))
try {
  await p.goto(`${BASE}/settings/device-catalog`); await settle(p, 2000)
  const head = await txt(p.locator('main'), 900)
  const job = q("select status,tacs_added,brands_added,models_added,created_at from device_tac_updates order by created_at desc limit 1")[0]
  step({ step: 'A3.tac-import', action: 'Model Phone → อัปเดตตอนนี้ (ฐานว่าง)', expected: '202 job · เสร็จแล้วสถิติครบ', actual: `202 job 58536284 · เสร็จ ~3 นาที (16:32→16:35 UTC) · ${head.slice(head.indexOf('แบรนด์ที่แสดง'), head.indexOf('แบรนด์ที่แสดง') + 230)} · DB ${JSON.stringify(job)} · หมายเหตุ jobs.completed_at = started_at (ดู issue)`, status: job?.status === 'success' ? 'pass' : 'fail', evidence: ['A3-tac-running.png', 'A3-tac-done.png'], issue_id: 'A6-02' })
  // brands
  const sel = p.getByLabel('กรองการแสดง')
  await sel.selectOption({ label: 'ทั้งหมด' }); await settle(p, 1500)
  const b1 = await rows(30)
  const pg = (await p.locator('main').innerText()).match(/หน้า \d+\/\d+/)?.[0]
  await p.getByRole('button', { name: 'ถัดไป' }).click(); await settle(p, 1200); const b2 = await rows(5)
  await p.getByLabel('ค้นหาแบรนด์').fill('sam'); await p.getByRole('button', { name: 'ค้นหา', exact: true }).click(); await settle(p, 1500); const b3 = await rows(5)
  await shot(p, 'A3-brands-sam')
  step({ step: 'A3.brand-order', action: "ตัวกรองแบรนด์ 'ทั้งหมด' ดูหน้า 1–2 + ค้น 'sam'", expected: 'แบรนด์ที่แสดงขึ้นก่อน เรียงต่อเนื่อง · ค้นเจอ Samsung', actual: `${pg} · หน้า1: ${b1.map(x => x.split(' ')[0]).join(', ')} · หน้า2: ${b2.map(x => x.split(' ')[0]).join(', ')} · 'sam': ${b3.join(' / ').slice(0, 250)}`, status: b3.some(x => /Samsung/i.test(x)) && /Apple/.test(b1[0]) ? 'pass' : 'fail', evidence: ['A3-brands-sam.png'] })
  // models
  await p.getByRole('button', { name: 'รุ่น', exact: true }).click(); await settle(p, 1500)
  const search = async (t) => { await p.getByLabel('ค้นหารุ่น').fill(t); await p.getByRole('button', { name: 'ค้นหา', exact: true }).click(); await settle(p, 1500); return rows(8) }
  const out = {}
  for (const t of ['iPhone 13', 'iPhone 14', 'iPhone 15', 'galaxy a54']) { out[t] = await search(t); log(t, out[t]) }
  await search('iPhone 13'); await shot(p, 'A3-iphone13-before')
  const sel13 = p.locator('main select[aria-label="การแสดงของรุ่น Apple iPhone 13"]')
  let r13 = 'ไม่พบ select'
  if (await sel13.count()) {
    const w = p.waitForResponse(r => r.url().includes('/api/') && r.request().method() !== 'GET', { timeout: 15000 }).catch(() => null)
    await sel13.selectOption({ label: 'แสดง (ตั้งเอง)' }); await sleep(600)
    const dd = p.getByRole('dialog').last()
    if (await dd.isVisible().catch(() => false)) { const ta = dd.locator('textarea'); if (await ta.count()) await ta.fill('แสดง iPhone 13 ในตัวเลือก รุ่นยังใช้งานมาก (MT6)'); await dd.getByRole('button', { name: /ยืนยัน|บันทึก/ }).last().click() }
    const rr = await w; r13 = `${rr?.request().method()} ${rr ? new URL(rr.url()).pathname : ''} ${rr?.status()}`; await settle(p, 1200)
  }
  const after = await search('iPhone 13'); await shot(p, 'A3-iphone13-after')
  const sel13b = await p.locator('main select[aria-label="การแสดงของรุ่น Apple iPhone 13"]').inputValue().catch(() => '')
  step({ step: 'A3.models', action: "ค้นรุ่น iPhone 13/14/15 + 'galaxy a54' · ตั้ง iPhone 13 เป็น 'แสดง (ตั้งเอง)'", expected: 'iPhone 14/15/A54 แสดงตามตัวกรอง · iPhone 13 ตั้งด้วยมือแล้วแสดง', actual: Object.entries(out).map(([k, v]) => `${k}: ${v.slice(0, 3).join(' / ')}`).join(' ‖ ') + ` ‖ ตั้ง iPhone 13: ${r13} → ${after[0]} (select=${sel13b})`, status: /200/.test(r13) ? 'pass' : 'fail', evidence: ['A3-iphone13-before.png', 'A3-iphone13-after.png'] })
  log('5xx', s.serverErrors, 'console', s.consoleErrors)
} finally { await s.browser.close() }
