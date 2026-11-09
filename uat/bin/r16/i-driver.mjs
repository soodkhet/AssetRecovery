// persistent Playwright driver: POST JS body to http://127.0.0.1:PORT/run ; GET /close
import http from 'node:http'
import { execFileSync } from 'node:child_process'
const q = (sql) => { try { return execFileSync('uat/bin/staging-prep.sh', ['q', sql], { encoding: 'utf8' }) } catch (e) { return 'QERR ' + String(e.stderr || e.message).slice(0, 300) } }
import { openAs, BASE } from '../lib.mjs'
const persona = process.argv[2] ?? 'superadmin'
const port = Number(process.argv[3] ?? 4555)
const mobile = process.argv[4] === 'mobile'
const D = '/private/tmp/claude-501/-Users-beer-AssetRecovery/21ace236-7fe2-4d4d-a2aa-230db94fb870/scratchpad/mytester6/I'
const s = await openAs(persona, { mobile })
const { browser, context, consoleErrors, serverErrors } = s
let page = s.page
const netLog = []
const hook = (p) => {
  p.on('response', async r => {
    const u = r.url()
    if (u.includes('/api/') && r.request().method() !== 'GET') {
      let body = ''
      try { body = (await r.text()).slice(0, 260) } catch {}
      netLog.push(`${r.status()} ${r.request().method()} ${u.replace(BASE, '')} :: ${r.request().postData()?.slice(0, 200) ?? ''} => ${body}`)
    }
  })
}
hook(page)
const shotp = async (name, full = false) => { const p = `${D}/shots/${name}.png`; await page.screenshot({ path: p, fullPage: full }); return p }
const text = async (sel = 'main') => { const l = page.locator(sel).first(); return (await l.count()) ? (await l.innerText()).slice(0, 6000) : (await page.locator('body').innerText()).slice(0, 6000) }
console.log('READY', page.url())
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
http.createServer(async (req, res) => {
  let body = ''
  req.on('data', c => body += c)
  req.on('end', async () => {
    if (req.url === '/close') {
      await browser.close(); res.end('closed'); process.exit(0)
    }
    consoleErrors.length = 0; serverErrors.length = 0; netLog.length = 0
    let out
    try {
      const fn = new AsyncFunction('page', 'context', 'BASE', 'shotp', 'text', 'setPage', 'q', body)
      out = await fn(page, context, BASE, shotp, text, (p) => { page = p; hook(p) }, q)
    } catch (e) { out = 'ERROR: ' + (e?.message ?? e) }
    try { await s.saveSession?.() } catch {}
    const login = new URL(page.url()).pathname.startsWith('/login')
    res.end(JSON.stringify({ url: page.url(), login, out, consoleErrors: consoleErrors.slice(0, 10), serverErrors: serverErrors.slice(0, 10), net: netLog.slice(0, 40) }, null, 1))
  })
}).listen(port, '127.0.0.1')
