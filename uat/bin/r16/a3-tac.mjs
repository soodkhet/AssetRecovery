import { openAs, BASE, settle, log, txt, shot, step, toasts, track, sleep, q } from './_a.mjs'
const s = await openAs('superadmin'); const p = s.page; const res = track(p)
try {
  await p.goto(`${BASE}/settings/device-catalog`); await settle(p, 1500)
  const t0 = await txt(p.locator('main'), 800); await shot(p, 'A3-tac-empty')
  step({ step: 'A3.tac-empty', action: 'เปิด Model Phone ก่อนนำเข้า (ฐานว่าง)', expected: 'แจ้งยังไม่ได้นำเข้า + ตารางว่าง', actual: t0.slice(t0.indexOf('ยังไม่ได้นำเข้า'), t0.indexOf('ยังไม่ได้นำเข้า') + 200) + ' · ' + (t0.includes('ยังไม่มีแบรนด์ในระบบ') ? 'ตาราง ยังไม่มีแบรนด์ในระบบ' : ''), status: t0.includes('ยังไม่ได้นำเข้าฐาน TAC') ? 'pass' : 'fail', evidence: ['A3-tac-empty.png'] })
  const w = p.waitForResponse(r => r.url().includes('/api/') && r.request().method() !== 'GET', { timeout: 30000 })
  await p.getByRole('button', { name: 'อัปเดตตอนนี้' }).click(); await sleep(800)
  const dd = p.getByRole('dialog').last()
  if (await dd.isVisible().catch(() => false)) { log('confirm', await txt(dd, 400)); const ta = dd.locator('textarea'); if (await ta.count()) await ta.fill('นำเข้าฐาน TAC ครั้งแรก รอบ MT6'); await dd.getByRole('button', { name: /อัปเดต|ยืนยัน|เริ่ม/ }).last().click() }
  const rr = await w; let body = ''; try { body = (await rr.text()).slice(0, 200) } catch {}
  log('update', rr.status(), body)
  await sleep(3000); await settle(p, 500)
  const during = await txt(p.locator('main'), 500); await shot(p, 'A3-tac-running')
  const start = Date.now(); let done = null
  while (Date.now() - start < 540000) {
    await sleep(15000)
    const u = q("select status, created_at, finished_at from device_tac_updates order by created_at desc limit 1")[0]
    if (u && !/run|pend|queue/i.test(u.status)) { done = u; break }
    log('poll', JSON.stringify(u))
  }
  const secs = Math.round((Date.now() - start) / 1000)
  await p.reload(); await settle(p, 2000)
  const t1 = await txt(p.locator('main'), 1500); await shot(p, 'A3-tac-done')
  const cnt = q('select (select count(*) from device_tacs) tacs,(select count(*) from device_brands) brands,(select count(*) from device_models) models')[0]
  step({ step: 'A3.tac-import', action: 'Model Phone → อัปเดตตอนนี้ (ฐานว่าง)', expected: '202 job · แสดงกำลังอัปเดต · เสร็จแล้วสถิติครบ', actual: `${rr.status()} ${body.slice(0, 100)} · ระหว่างนำเข้า: ${during.slice(during.indexOf('ฐานรุ่น'), during.indexOf('ฐานรุ่น') + 250)} · เสร็จ ~${secs}s ${JSON.stringify(done)} · DB ${JSON.stringify(cnt)} · หน้า: ${t1.slice(t1.indexOf('แบรนด์ที่แสดง'), t1.indexOf('แบรนด์ที่แสดง') + 260)}`, status: done && /succ|done|complete/i.test(done.status) ? 'pass' : 'fail', evidence: ['A3-tac-running.png', 'A3-tac-done.png'] })
  log('5xx', s.serverErrors, 'console', s.consoleErrors)
} finally { await s.browser.close() }
