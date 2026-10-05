// R13.06 ช่อง IMEI หรือ Serial ตอนส่งเคส — เตือน ไม่บล็อก (ไม่บันทึก)
import { openAs, shot, log, settle, sleep, R, q, BASE, trackMutations } from './_h.mjs'
const n0 = q(`select count(*) from cases`)
const { browser, page } = await openAs('uat.admin')
const m = trackMutations(page)
await page.goto(`${BASE}/cases/submit`); await settle(page); await sleep(800)
const btns = (await page.getByRole('button').allInnerTexts()).map(x => x.trim()).filter(Boolean)
log('buttons', btns.slice(0, 30))
const nb = page.getByRole('button', { name: /รับเคส \(กรอกมือ\)/ }).first()
if (await nb.count()) { await nb.click(); await sleep(1200) }
const scope = (await page.getByRole('dialog').count()) ? page.getByRole('dialog').last() : page.locator('main')
const inp = page.locator('#asset-imei')
log('imei inputs', await inp.count())
const cases = [['35678910000O094', 'o'], ['3567 8910 0000 094', 'space'], ['35-678910-000009-4', 'dash'], ['SN-ABC12345', 'sn']]
for (const [v, slug] of cases) {
  await inp.first().fill(v); await inp.first().blur(); await sleep(600)
  const box = inp.first().locator('xpath=..')
  const t = (await box.innerText().catch(() => '')).replace(/\s*\n+\s*/g, ' | ')
  const amber = await box.locator('[class*="amber"],[class*="yellow"]').allInnerTexts().catch(() => [])
  const red = await box.locator('[class*="red-"]').allInnerTexts().catch(() => [])
  log(`[${v}] text=${t.slice(0, 200)} | amber=${JSON.stringify(amber)} red=${JSON.stringify(red)}`)
  await shot(page, R, `06-imei-${slug}`)
}
const cl = scope.getByRole('button', { name: /ยกเลิก|ปิด/ }).first()
if (await cl.count()) await cl.click().catch(() => {})
await sleep(500); await browser.close()
log('mutations', m.reqs, 'cases before/after', n0.split('\n').at(-2), q(`select count(*) from cases`).split('\n').at(-2))
