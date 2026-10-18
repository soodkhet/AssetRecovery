// mytester รอบ 7 กลุ่ม AG5 (S4 เงินทดรองเลยกำหนด · S5 หมดเวลารอยินยอม) — driver หลาย persona ใน process เดียว (เพื่อ raceClick ข้ามคน)
//   UAT_TARGET=staging R7_SP=<SP> R7_PHASE=AG5 node uat/bin/r7/ag5-driver.mjs <port> <persona> [persona…]
//   persona ต่อท้าย :mobile = เปิดแบบมือถือ (เช่น uat.agent.in2:mobile)
//   POST JS body → http://127.0.0.1:<port>/run  (ตัวแปร: S = {persona:{page,context}}, raceClick, openTabs, q, A, BASE, shotp(page,name), h)
//   GET /close — ปิดทุก browser + ปล่อยล็อก · ปิดเองเมื่อครบ 9 นาที
// อ่านฐานได้อย่างเดียว (q) · snippet ต้องกดผ่านหน้าจอเท่านั้น
import http from 'node:http'
import { openAs, BASE, q, lockPersona, raceClick, openTabs, SP, A, sleep, settle, toasts, fieldsOf, buttons, errText, txt } from './_lib.mjs'
import { mkdirSync } from 'node:fs'

const port = Number(process.argv[2] ?? 4851)
const personas = process.argv.slice(3)
mkdirSync(`${A}/shots`, { recursive: true })
const S = {}
const releases = []
const sessions = []
const netLog = []
const hook = (p, who) => {
  p.on('response', async r => {
    const u = r.url()
    if (u.includes('/api/') && r.request().method() !== 'GET') {
      let body = ''
      try { body = (await r.text()).slice(0, 500) } catch {}
      netLog.push(`[${who}] ${r.status()} ${r.request().method()} ${u.replace(BASE, '')} :: ${r.request().postData()?.slice(0, 200) ?? ''} => ${body}`)
    }
  })
}
let closing = false
async function shutdown() {
  if (closing) return
  closing = true
  for (const s of sessions) { try { await s.saveSession?.() } catch {} try { await s.browser.close() } catch {} }
  for (const r of releases) r()
  console.log('CLOSED', personas.join(','))
  process.exit(0)
}
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown)
setTimeout(() => { console.log('MAX_LIFE'); shutdown() }, 9 * 60_000)
for (const spec of personas) {
  const [p, flag] = spec.split(':')
  const rel = await lockPersona(`${SP}/locks`, p)
  releases.push(rel)
  try {
    const s = await openAs(p, { mobile: flag === 'mobile' })
    sessions.push(s)
    S[p] = { page: s.page, context: s.context, session: s, consoleErrors: s.consoleErrors, serverErrors: s.serverErrors }
    hook(s.page, p)
    s.context.on('page', np => hook(np, p + '+'))
  } catch (e) { console.log('OPEN_FAIL', p, e.message); await shutdown() }
}
const shotp = async (page, name, full = false) => { const p = `${A}/shots/${name}.png`; await page.screenshot({ path: p, fullPage: full }); return p }
console.log('READY', personas.join(','))
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
http.createServer(async (req, res) => {
  let body = ''
  req.on('data', c => body += c)
  req.on('end', async () => {
    if (req.url === '/close') { res.end('closed'); await shutdown(); return }
    netLog.length = 0
    let out
    try {
      const fn = new AsyncFunction('S', 'raceClick', 'openTabs', 'q', 'A', 'BASE', 'shotp', 'h', body)
      out = await fn(S, raceClick, openTabs, q, A, BASE, shotp, { sleep, settle, toasts, fieldsOf, buttons, errText, txt })
    } catch (e) { out = 'ERROR: ' + (e?.message ?? e) }
    for (const s of sessions) { try { await s.saveSession?.() } catch {} }
    const urls = Object.fromEntries(Object.entries(S).map(([k, v]) => [k, v.page.url()]))
    res.end(JSON.stringify({ urls, out, net: netLog.slice(0, 60) }, null, 1))
  })
}).listen(port, '127.0.0.1')
