import { BASE, shot } from '../lib.mjs'
import { open } from './h.mjs'
const RECEIPT = 'expenses/88cb577d-32b4-49ff-96fb-06a2e093d339/receipts/da2904f1-5b20-4550-bded-fcd0ed53ed4a-R4-C1-photo.jpg'
const C1DOC = 'cases/a10492d4-c805-4c7d-9ec4-a63fa730e9ea/national_id_doc/ae9213b6-1676-4ac7-950e-8b309d020a57-C1-idcard.png'
for (const who of ['uat.agent.in1', 'uat.agent.in2']) {
  const { browser, page } = await open(who, { mobile: true, fresh: process.argv[2] === 'fresh' })
  await page.goto(BASE + '/'); await page.waitForLoadState('networkidle')
  for (const [n, path] of [['receipt-in1', RECEIPT], ['C1doc', C1DOC]]) {
    const r = await page.evaluate(async (path) => {
      const res = await fetch('/api/storage/download-url', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path }) })
      const j = await res.json().catch(() => null)
      let file = null
      if (res.ok && j?.data?.url) { const f = await fetch(j.data.url); const b = await f.arrayBuffer(); file = { status: f.status, type: f.headers.get('content-type'), bytes: b.byteLength, host: new URL(j.data.url).host, signed: new URL(j.data.url).pathname.includes('/object/sign/') } }
      return { status: res.status, code: j?.error?.code ?? null, ttl: j?.data?.expiresInSeconds ?? null, file }
    }, path)
    console.log(who, n, JSON.stringify(r))
    if (who === 'uat.agent.in1' && n === 'receipt-in1' && r.file) {
      const u = await page.evaluate(async (path) => (await (await fetch('/api/storage/download-url', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path }) })).json()).data.url, path)
      await page.goto(u); await page.waitForTimeout(1000); await shot(page, 'STORAGE-AFTER', '05-agent-in1-receipt-signed')
      await page.goto(BASE + '/')
    }
  }
  await browser.close()
}
