// R15a.09 U104 บัญชี → ตัวอย่างเอกสารทั้งหมด: หน้า + ดาวน์โหลด PDF ตัวอย่างทุกชนิด
import { writeFileSync } from 'node:fs'
import { openAs, shot, log, settle, sleep, R, BASE, DL, yearCE } from './_h.mjs'
const { browser, page, serverErrors, consoleErrors } = await openAs('uat.account')
page.setDefaultTimeout(20000)
await page.goto(`${BASE}/accounting/document-samples`, { timeout: 60000 }); await settle(page); await sleep(1500)
const t = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
log('page', t.slice(0, 2000)); log('CE', yearCE(t))
await shot(page, R, '09-doc-samples', { fullPage: true })
const api = await page.request.get(`${BASE}/api/accounting/document-samples`, { failOnStatusCode: false })
const body = await api.json().catch(() => null)
log('api', api.status(), JSON.stringify(body).slice(0, 600))
const types = (body?.data ?? body?.data?.items ?? []).map(x => x.docType ?? x.type ?? x.id).filter(Boolean)
log('types', types)
for (const ty of types) {
  const r = await page.request.get(`${BASE}/api/accounting/document-samples/${ty}/pdf`, { failOnStatusCode: false, timeout: 90000 })
  const buf = await r.body()
  if (r.status() === 200) writeFileSync(`${DL}/sample-${ty}.pdf`, buf)
  log('sample', ty, r.status(), r.headers()['content-type'], buf.length)
}
log('5xx', serverErrors, 'console', consoleErrors.slice(0, 3))
await browser.close()
