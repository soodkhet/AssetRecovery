// driver กดพร้อมกัน (mytester รอบ 7 · S8/S5) — 2–3 หน้าจอกดปุ่มเดียวกันในเสี้ยววินาที
//
//   import { raceClick } from './race.mjs'
//   const results = await raceClick([
//     { page: a.page, target: a.page.getByRole('button', { name: 'อนุมัติ' }) },
//     { page: b.page, target: b.page.getByRole('button', { name: 'อนุมัติ' }) },
//   ], { urlPart: '/api/expenses/', method: 'POST' })
//   // → [{ i, clickedAt, status, body, ms }]
//
// วิธี: ติดป้าย data-race บนปุ่มของแต่ละหน้า แล้วตั้งเวลาให้ **หน้าเว็บกดเอง** ที่เวลาเดียวกัน (setTimeout ในหน้า —
// ไม่ผ่าน round-trip ของ Playwright) ⇒ ต่างกันไม่กี่มิลลิวินาที · ดัก response แรกที่ตรง urlPart/method ของแต่ละหน้า
//
// session: หลายแท็บของคนเดียว ⇒ ใช้ page หลายตัวใน context เดียวกัน (`context.newPage()`) — **ห้ามเปิด openAs persona เดิม
// ซ้อน 2 process** (Supabase หมุน refresh token → เพิกถอนทั้งชุด) · "2 คน" ⇒ ใช้คนละ persona
export async function raceClick(entries, { urlPart = '/api/', method, leadMs = 1500, timeoutMs = 30000 } = {}) {
  const tag = `r${Date.now()}`
  await Promise.all(entries.map(async ({ target }, i) => {
    await target.waitFor({ state: 'visible', timeout: timeoutMs })
    await target.evaluate((el, v) => el.setAttribute('data-race', v), `${tag}-${i}`)
  }))
  const waits = entries.map(({ page }) => page.waitForResponse(
    r => r.url().includes(urlPart) && (!method || r.request().method() === method),
    { timeout: timeoutMs },
  ).then(async r => ({ status: r.status(), body: (await r.text().catch(() => '')).slice(0, 600), at: Date.now() }))
    .catch(e => ({ status: 0, body: `ไม่มี response: ${e.message.slice(0, 120)}`, at: Date.now() })))
  const fireAt = Date.now() + leadMs
  const clicked = await Promise.all(entries.map(({ page }, i) => page.evaluate(({ sel, at }) => new Promise(res => {
    setTimeout(() => { const el = document.querySelector(sel); const t = Date.now(); el?.click(); res(el ? t : -1) }, Math.max(0, at - Date.now()))
  }), { sel: `[data-race="${tag}-${i}"]`, at: fireAt })))
  const responses = await Promise.all(waits)
  return entries.map((_, i) => ({ i, clickedAt: clicked[i], skewMs: clicked[i] - fireAt, status: responses[i].status, body: responses[i].body, ms: responses[i].at - fireAt }))
}

/** เปิดหลายแท็บของ session เดียว (context เดียวกัน) ไปที่ url เดียวกัน */
export async function openTabs(session, url, n) {
  const pages = [session.page]
  for (let i = 1; i < n; i++) pages.push(await session.context.newPage())
  await Promise.all(pages.map(p => p.goto(url, { waitUntil: 'networkidle' }).catch(() => p.goto(url))))
  return pages
}

/** จองล็อก persona ระหว่าง agent ขนาน (mkdir atomic) — คืนฟังก์ชันปล่อยล็อก */
export async function lockPersona(lockDir, persona, { waitMs = 5000, maxWaitMs = 15 * 60_000 } = {}) {
  const { mkdirSync, rmdirSync } = await import('node:fs')
  const dir = `${lockDir}/${persona}`
  const start = Date.now()
  for (;;) {
    try { mkdirSync(dir); return () => { try { rmdirSync(dir) } catch { /* ปล่อยแล้ว */ } } } catch {
      if (Date.now() - start > maxWaitMs) throw new Error(`รอล็อก ${persona} เกิน ${maxWaitMs / 60000} นาที`)
      await new Promise(r => setTimeout(r, waitMs))
    }
  }
}
