// R13.01–03 คลังเฉพาะทีม (U22)
import { openAs, shot, log, mainText, settle, sleep, R } from './_h.mjs'
const who = [['uat.mgr.in', '01-mgr-in-warehouse'], ['uat.sup.in', '02-sup-in-warehouse'], ['uat.mgr.out', '03-mgr-out-warehouse']]
for (const [u, s] of who) {
  const { browser, page, serverErrors } = await openAs(u)
  await page.goto('http://localhost:3000/warehouse'); await settle(page); await sleep(1500)
  log(`== ${u} url=${page.url()}`)
  const tabs = await page.getByRole('tab').allInnerTexts().catch(() => [])
  log('tabs', tabs)
  const btns = (await page.getByRole('button').allInnerTexts()).map(x => x.trim()).filter(Boolean)
  log('buttons', btns.slice(0, 40))
  log('main', await mainText(page, 2000))
  await shot(page, R, s + '-assets', { fullPage: true })
  for (const t of tabs) {
    if (/ล็อต|ส่งมอบ/.test(t)) {
      await page.getByRole('tab', { name: t }).click(); await settle(page); await sleep(1000)
      log(`tab ${t}:`, await mainText(page, 1500))
      log('buttons', (await page.getByRole('button').allInnerTexts()).map(x => x.trim()).filter(Boolean).slice(0, 40))
      await shot(page, R, s + '-lots', { fullPage: true })
    }
  }
  log('5xx', serverErrors)
  await browser.close()
}
