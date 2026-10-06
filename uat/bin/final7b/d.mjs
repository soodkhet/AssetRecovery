// ดึงข้อความหน้า + ภาพ (ต่อ user × URL) · node d.mjs <user> <url[#click=ข้อความ...]> ... · MOBILE=1 = 375×812
import { openAs, shot, checkPage, log, slug, text, U } from './_h.mjs'
const [u, ...urls] = process.argv.slice(2)
const mob = process.env.MOBILE === '1'
const s = await openAs(u, { mobile: mob }); const { page } = s
if (mob) await page.setViewportSize({ width: 375, height: 812 })
for (const raw of urls) {
  const [url, ...clicks] = raw.split('#click=')
  const b = s.consoleErrors.length, sb = s.serverErrors.length
  await page.goto(U + url); await checkPage(page)
  for (const c of clicks) { await page.getByText(c, { exact: false }).first().click({ timeout: 8000 }).catch(() => log('d', 'click fail', c)); await checkPage(page) }
  await page.waitForTimeout(1200)
  const r = await checkPage(page)
  const ox = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  const name = `${u}-${mob ? 'm-' : ''}${slug(url)}${clicks.length ? '-' + slug(clicks.join('-')) : ''}`.slice(0, 90)
  text(name, r.text)
  const f = await shot(page, 'd/' + name, { fullPage: true })
  log('d', `${u}${mob ? ' [m]' : ''} ${raw} final=${page.url().replace(U, '')} issues=${r.issues.join(';')} console=${JSON.stringify(s.consoleErrors.slice(b)).slice(0, 300)} 5xx=${s.serverErrors.slice(sb).join(',')} overflowX=${ox} ${f}`)
}
await s.browser.close()
