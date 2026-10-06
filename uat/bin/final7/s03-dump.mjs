// ดึงข้อความหน้า (ต่อ user × URL) ลง out/text/ + ภาพเต็มหน้า — ใช้เทียบคิว G / golden H
// ใช้: node s03-dump.mjs <user> <url> [<url>...]   (url ขึ้นต้น / · ใส่ #click=ข้อความ เพื่อกดปุ่ม/แท็บ ก่อนเก็บ)
import { openAs, shot, checkPage, log, slug } from './_h.mjs'
import { writeFileSync, mkdirSync } from 'node:fs'
mkdirSync('uat/bin/final7/out/text', { recursive: true })
const [u, ...urls] = process.argv.slice(2)
const s = await openAs(u, { mobile: process.env.MOBILE === '1' }); const { page } = s
if (process.env.MOBILE === '1') await page.setViewportSize({ width: 375, height: 812 })
for (const raw of urls) {
  const [url, ...clicks] = raw.split('#click=')
  const b = s.consoleErrors.length, sb = s.serverErrors.length
  await page.goto('http://localhost:3000' + url); await checkPage(page)
  for (const c of clicks) { await page.getByText(c, { exact: false }).first().click({ timeout: 8000 }).catch(e => log('s03', 'click fail', c)); await checkPage(page) }
  await page.waitForTimeout(1500)
  const r = await checkPage(page)
  const name = `${u}-${slug(url)}${clicks.length ? '-' + slug(clicks.join('-')) : ''}`.slice(0, 90)
  writeFileSync(`uat/bin/final7/out/text/${name}.txt`, r.text)
  const f = await shot(page, 'final/s03', name, { fullPage: true })
  const ce = s.consoleErrors.slice(b), se = s.serverErrors.slice(sb)
  log('s03', `${u} ${raw} issues=${r.issues.join(';')} console=${ce.length} 5xx=${se.join(',')} ${f}`)
}
await s.browser.close()
