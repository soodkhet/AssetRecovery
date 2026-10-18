// AG2 persistent Playwright driver (mytester r7): node uat/bin/r7/ag2-driver.mjs <persona> <port> [mobile]
// POST JS body to http://127.0.0.1:PORT/run · GET /close — ถือล็อก persona ตลอดอายุ process (ปิดให้เร็ว)
import http from 'node:http'
import { openAs, BASE, lockPersona, SP, A, q, sleep, settle, toasts, fieldsOf, buttons, errText, txt } from './_lib.mjs'
import { mkdirSync } from 'node:fs'
const persona = process.argv[2] ?? 'superadmin'
const port = Number(process.argv[3] ?? 4655)
const mobile = process.argv[4] === 'mobile'
mkdirSync(`${A}/shots`, { recursive: true })
const release = await lockPersona(`${SP}/locks`, persona)
let s
try { s = await openAs(persona, { mobile }) } catch (e) { release(); console.log('OPENAS_FAIL', e.message); process.exit(2) }
const { browser, context, consoleErrors, serverErrors } = s
let page = s.page
const netLog = []
const hook = (p) => {
  p.on('response', async r => {
    const u = r.url()
    if (u.includes('/api/') && r.request().method() !== 'GET') {
      let body = ''
      try { body = (await r.text()).slice(0, 600) } catch {}
      netLog.push(`${r.status()} ${r.request().method()} ${u.replace(BASE, '')} :: ${r.request().postData()?.slice(0, 400) ?? ''} => ${body}`)
    }
  })
}
hook(page)
const shotp = async (name, full = false) => { const p = `${A}/shots/${name}.png`; await page.screenshot({ path: p, fullPage: full }); return p }
const text = async (sel = 'main') => { const l = page.locator(sel).first(); return (await l.count()) ? (await l.innerText()).slice(0, 8000) : (await page.locator('body').innerText()).slice(0, 8000) }
const shutdown = async () => { try { await browser.close() } catch {} release(); process.exit(0) }
setTimeout(shutdown, 9 * 60_000)
console.log('READY', page.url())
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
http.createServer(async (req, res) => {
  let body = ''
  req.on('data', c => body += c)
  req.on('end', async () => {
    if (req.url === '/close') { res.end('closed'); await shutdown() }
    consoleErrors.length = 0; serverErrors.length = 0; netLog.length = 0
    let out
    try {
      const fn = new AsyncFunction('page', 'context', 'BASE', 'shotp', 'text', 'setPage', 'q', 'h', body)
      out = await fn(page, context, BASE, shotp, text, (p) => { page = p; hook(p) }, q, { sleep, settle, toasts, fieldsOf, buttons, errText, txt })
    } catch (e) { out = 'ERROR: ' + (e?.message ?? e) }
    try { await s.saveSession?.() } catch {}
    const login = new URL(page.url()).pathname.startsWith('/login')
    res.end(JSON.stringify({ url: page.url(), login, out, consoleErrors: consoleErrors.slice(0, 10), serverErrors: serverErrors.slice(0, 10), net: netLog.slice(0, 40) }, null, 1))
  })
}).listen(port, '127.0.0.1')
