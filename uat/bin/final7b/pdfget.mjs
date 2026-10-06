// ดาวน์โหลด PDF ด้วย session ของ user → uat/shots/final2/pdf/<name>.pdf  (ใช้: node pdfget.mjs <user> <apiPath> <name>)
import { openAs } from './_h.mjs'
import { writeFileSync, mkdirSync } from 'node:fs'
const [u, path, name] = process.argv.slice(2)
const s = await openAs(u)
const r = await s.page.request.get('http://localhost:3000' + path)
mkdirSync('uat/shots/final2/pdf', { recursive: true })
const buf = await r.body(); writeFileSync(`uat/shots/final2/pdf/${name}.pdf`, buf)
console.log(r.status(), r.headers()['content-type'], buf.length, `uat/shots/final2/pdf/${name}.pdf`)
await s.browser.close()
