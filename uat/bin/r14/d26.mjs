// R14.26 ดาวน์โหลด 50 ทวิ WHT-2569-018 (+017 เทียบ) จากหน้าบัญชี แท็บ WHT
import { openAs, shot, log, settle, sleep, R, BASE, DL, mainText } from './_h.mjs'
const { browser, page, serverErrors } = await openAs('uat.account')
await page.goto(`${BASE}/accounting?tab=wht`); await settle(page); await sleep(1500)
log('wht tab', await mainText(page, 1800))
await shot(page, R, '26-accounting-wht', { fullPage: true })
for (const no of ['WHT-2569-018', 'WHT-2569-017']) {
  const row = page.locator('tr').filter({ hasText: no }).first()
  log(no, 'row', (await row.innerText()).replace(/\s+/g, ' '), await row.locator('button, a').allInnerTexts())
  const pop = page.context().waitForEvent('page', { timeout: 8000 }).catch(() => null)
  const dlp = page.waitForEvent('download', { timeout: 8000 }).catch(() => null)
  const rp = page.waitForResponse(r => /wht/.test(r.url()) && /pdf/i.test(r.headers()['content-type'] ?? ''), { timeout: 8000 }).catch(() => null)
  log('href', await row.getByText('หนังสือรับรอง').first().evaluate(e => e.outerHTML.slice(0, 300))); await row.getByText('หนังสือรับรอง').first().click()
  const [np, dl, rr] = await Promise.all([pop, dlp, rp])
  log('popup', np?.url(), 'download', dl?.suggestedFilename(), 'resp', rr?.url())
  const url = rr?.url() ?? np?.url()
  const fn0 = `${DL}/${no}.pdf`
  if (dl) await dl.saveAs(fn0)
  else if (url) { const r = await page.request.get(url); (await import('node:fs')).writeFileSync(fn0, await r.body()); log('get', r.status(), r.headers()['content-disposition']) }
  else { log('dialog', (await page.locator('[role=dialog]').last().innerText().catch(() => '')).slice(0, 500)); await shot(page, R, '26-wht-btn'); break }
  if (np) await np.close()
  const dl0 = { suggestedFilename: () => url }
  const fn = `${DL}/${no}.pdf`; log('saved', fn, dl0.suggestedFilename())
}
log('5xx', serverErrors)
await browser.close()
