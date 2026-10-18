// mytester รอบ 7 กลุ่ม AG1 — persistent Playwright driver (ถือล็อก persona ตลอดอายุ · ปิดตัวเองเมื่อครบ 9 นาที)
//   UAT_TARGET=staging R7_SP=<SP> R7_PHASE=AG1 node uat/bin/r7/ag1-driver.mjs <persona> <port> [mobile]
//   POST JS body → http://127.0.0.1:<port>/run · GET /close
// อ่านฐานได้อย่างเดียว (q) · ไม่เขียนข้อมูลด้วย API — snippet ต้องกดผ่านหน้าจอเท่านั้น
import http from 'node:http'
import { openAs, BASE, q, lockPersona, SP, A } from './_lib.mjs'
import { mkdirSync } from 'node:fs'

const persona = process.argv[2] ?? 'uat.admin'
const port = Number(process.argv[3] ?? 4711)
const mobile = process.argv[4] === 'mobile'
const MAX_LIFE_MS = 9 * 60_000
mkdirSync(`${A}/shots`, { recursive: true })

const release = await lockPersona(`${SP}/locks`, persona)
let s
try { s = await openAs(persona, { mobile }) } catch (e) { release(); console.log('OPEN_FAIL', e.message); process.exit(2) }
const { browser, context, consoleErrors, serverErrors } = s
let page = s.page
const netLog = []
const hook = (p) => {
  p.on('response', async r => {
    const u = r.url()
    if (u.includes('/api/') && r.request().method() !== 'GET') {
      let body = ''
      try { body = (await r.text()).slice(0, 300) } catch {}
      netLog.push(`${r.status()} ${r.request().method()} ${u.replace(BASE, '')} => ${body}`)
    }
  })
}
hook(page)
let closing = false
async function shutdown(code = 0) {
  if (closing) return
  closing = true
  try { await browser.close() } catch {}
  release()
  console.log('CLOSED', persona)
  process.exit(code)
}
setTimeout(() => { console.log('MAX_LIFE reached'); shutdown(0) }, MAX_LIFE_MS)
process.on('SIGTERM', () => shutdown(0))
process.on('SIGINT', () => shutdown(0))

const shotp = async (name, full = false) => { const p = `${A}/shots/${name}.png`; await page.screenshot({ path: p, fullPage: full }); return p }
const text = async (sel = 'main') => { const l = page.locator(sel).first(); return (await l.count()) ? (await l.innerText()).slice(0, 8000) : (await page.locator('body').innerText()).slice(0, 8000) }
console.log('READY', persona, page.url())
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
http.createServer(async (req, res) => {
  let body = ''
  req.on('data', c => body += c)
  req.on('end', async () => {
    if (req.url === '/close') { res.end('closed'); await shutdown(0); return }
    consoleErrors.length = 0; serverErrors.length = 0; netLog.length = 0
    let out
    try {
      const fn = new AsyncFunction('page', 'context', 'BASE', 'shotp', 'text', 'setPage', 'q', 'A', body)
      out = await fn(page, context, BASE, shotp, text, (p) => { page = p; hook(p) }, q, A)
    } catch (e) { out = 'ERROR: ' + (e?.message ?? e) }
    try { await s.saveSession?.() } catch {}
    const login = new URL(page.url()).pathname.startsWith('/login')
    res.end(JSON.stringify({ url: page.url(), login, out, consoleErrors: consoleErrors.slice(0, 10), serverErrors: serverErrors.slice(0, 10), net: netLog.slice(0, 40) }, null, 1))
  })
}).listen(port, '127.0.0.1')
