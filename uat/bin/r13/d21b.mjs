// R13.21 ต่อ — ปุ่มเคลียร์ยอด ADV5 บนหน้าการเงิน (ต้องปิด + เหตุผล)
import { openAs, shot, log, settle, sleep, R, BASE } from './_h.mjs'
const SLUG = process.env.SLUG ?? '21-adv5-settle-disabled'
const { browser, page } = await openAs('uat.finance')
for (const tab of ['advances', 'approvals']) {
  await page.goto(`${BASE}/finance?tab=${tab}`); await settle(page); await sleep(1200)
  const r5 = page.locator('tbody tr').filter({ hasText: '500.00' }).filter({ hasText: 'อนันต์' })
  const n = await r5.count(); log(tab, 'rows', n)
  if (!n) continue
  log('row', (await r5.first().innerText()).replace(/\s+/g, ' ').slice(0, 300))
  const sb = r5.first().getByRole('button', { name: /เคลียร์ยอด/ })
  if (await sb.count()) {
    log('btn disabled', await sb.first().isDisabled(), 'title', await sb.first().getAttribute('title'))
    await sb.first().hover({ force: true }); await sleep(700)
  } else log('no settle button in row; buttons:', await r5.first().getByRole('button').allInnerTexts())
  const k = (await page.locator('main').innerText()).replace(/\s*\n+\s*/g, ' | ')
  const i = k.indexOf('ยังไม่ได้จ่าย'); const j = k.indexOf('รอบจ่าย "'); log('hint', i >= 0 ? k.slice(i - 20, i + 120) : '', j >= 0 ? k.slice(j - 60, j + 160) : '')
  await shot(page, R, SLUG, { fullPage: true })
  break
}
await browser.close()
