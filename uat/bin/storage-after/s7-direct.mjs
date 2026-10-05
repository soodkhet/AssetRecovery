// ข้อ 7 — เข้าถึง Supabase Storage ตรงด้วย anon key (จาก bundle สาธารณะ) + access token ของผู้ใช้ (จาก cookie) — ไม่พิมพ์ค่าลับ
import { BASE, shot } from '../lib.mjs'
import { open } from './h.mjs'
const who = process.argv[2] ?? 'uat.agent.in2'
const { browser, context, page } = await open(who, { fresh: process.argv[3] === 'fresh', mobile: who.includes('agent') })
await page.goto(BASE + (who.includes('co') ? '/portal' : '/')); await page.waitForLoadState('networkidle')
// หา URL + anon key จาก JS bundle ที่ browser โหลด
const found = await page.evaluate(async () => {
  const srcs = [...document.scripts].map(s => s.src).filter(Boolean)
  let url = null, key = null
  for (const s of srcs) {
    const t = await (await fetch(s)).text()
    url ??= (t.match(/https:\/\/[a-z0-9]+\.supabase\.co/) ?? [])[0] ?? null
    key ??= (t.match(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/) ?? t.match(/sb_publishable_[A-Za-z0-9_-]{10,}/) ?? [])[0] ?? null
    if (url && key) break
  }
  return { url, key, n: srcs.length }
})
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
const CACHE = '/private/tmp/claude-501/-Users-beer-AssetRecovery/994f4e02-c9c5-4494-855d-cedda7c30d43/scratchpad/pubcfg.json'
if (found.url && found.key) writeFileSync(CACHE, JSON.stringify({ url: found.url, key: found.key }))
else if (existsSync(CACHE)) { Object.assign(found, JSON.parse(readFileSync(CACHE, 'utf8'))); console.log('cfg from cache of earlier bundle scan') }
const role = found.key?.startsWith('eyJ') ? JSON.parse(Buffer.from(found.key.split('.')[1], 'base64url').toString()).role : 'publishable'
console.log('bundle scripts', found.n, 'url?', !!found.url, 'key?', !!found.key, 'keyRole', role)
const ck = (await context.cookies()).filter(c => c.name.startsWith('sb-') && c.name.includes('auth-token')).sort((a, b) => a.name.localeCompare(b.name))
let raw = ck.map(c => c.value).join('')
if (raw.startsWith('base64-')) raw = Buffer.from(raw.slice(7), 'base64').toString()
const token = JSON.parse(raw).access_token
console.log('user token?', !!token, 'tokenRole', JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).role)
const C1DOC = 'cases/a10492d4-c805-4c7d-9ec4-a63fa730e9ea/national_id_doc/ae9213b6-1676-4ac7-950e-8b309d020a57-C1-idcard.png'
const LOTDOC = 'handover-lots/15db3c66-d183-4a3a-bbb0-2d9decee40af/signed-doc/366c808c-cb1a-4966-a06c-e40a4a5bd99b.pdf'
const RECEIPT = 'expenses/88cb577d-32b4-49ff-96fb-06a2e093d339/receipts/da2904f1-5b20-4550-bded-fcd0ed53ed4a-R4-C1-photo.jpg'
const results = await page.evaluate(async ({ url, key, token, C1DOC, LOTDOC, RECEIPT }) => {
  const B = 'case-documents'
  const out = []
  const run = async (label, auth, path, init) => {
    const h = { apikey: key, ...(auth ? { Authorization: 'Bearer ' + token } : { Authorization: 'Bearer ' + key }), ...(init.headers ?? {}) }
    try {
      const r = await fetch(url + path, { ...init, headers: h })
      const body = (await r.text()).slice(0, 160)
      out.push({ label, who: auth ? 'user' : 'anon', status: r.status, body })
    } catch (e) { out.push({ label, who: auth ? 'user' : 'anon', status: 'ERR', body: String(e) }) }
  }
  for (const auth of [true, false]) {
    await run('bucket.list', auth, '/storage/v1/bucket', { method: 'GET' })
    await run('bucket.get', auth, `/storage/v1/bucket/${B}`, { method: 'GET' })
    for (const prefix of ['cases', 'cases/a10492d4-c805-4c7d-9ec4-a63fa730e9ea/national_id_doc', '', 'handover-lots', 'expenses'])
      await run(`list(${prefix || '/'})`, auth, `/storage/v1/object/list/${B}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prefix, limit: 100, offset: 0 }) })
    for (const [n, p] of [['C1doc', C1DOC], ['lotdoc', LOTDOC], ['receipt', RECEIPT]]) {
      await run(`download.auth(${n})`, auth, `/storage/v1/object/authenticated/${B}/${p}`, { method: 'GET' })
      await run(`download(${n})`, auth, `/storage/v1/object/${B}/${p}`, { method: 'GET' })
      await run(`public(${n})`, auth, `/storage/v1/object/public/${B}/${p}`, { method: 'GET' })
      await run(`info(${n})`, auth, `/storage/v1/object/info/${B}/${p}`, { method: 'GET' })
      await run(`sign(${n})`, auth, `/storage/v1/object/sign/${B}/${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expiresIn: 60 }) })
    }
    await run('sign.multi', auth, `/storage/v1/object/sign/${B}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expiresIn: 60, paths: [C1DOC, LOTDOC] }) })
    await run('upload(probe)', auth, `/storage/v1/object/${B}/cases/test/probe-${auth ? 'user' : 'anon'}.txt`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'probe' })
    await run('upsert(probe)', auth, `/storage/v1/object/${B}/cases/test/probe-${auth ? 'user' : 'anon'}.txt`, { method: 'PUT', headers: { 'content-type': 'text/plain', 'x-upsert': 'true' }, body: 'probe2' })
    await run('upload.sign(probe)', auth, `/storage/v1/object/upload/sign/${B}/cases/test/probe-s-${auth ? 'user' : 'anon'}.txt`, { method: 'POST' })
    await run('move(probe)', auth, `/storage/v1/object/move`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bucketId: B, sourceKey: 'cases/test/nonexist.txt', destinationKey: 'cases/test/x.txt' }) })
  }
  return out
}, { url: found.url, key: found.key, token, C1DOC, LOTDOC, RECEIPT })
for (const r of results) console.log(JSON.stringify(r))
const ok = results.filter(r => typeof r.status === 'number' && r.status < 300 && !(r.label.startsWith('list') && r.body.trim() === '[]'))
console.log('SUCCESSES', ok.length, JSON.stringify(ok.map(r => r.who + ':' + r.label + ':' + r.status + ':' + r.body.slice(0, 60))))
await shot(page, 'STORAGE-AFTER', `07-${who}-session`)
await browser.close()
