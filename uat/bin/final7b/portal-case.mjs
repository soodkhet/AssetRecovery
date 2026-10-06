// Portal: เปิดรายละเอียดเคส (คลิกแถว/การ์ด) ดูยี่ห้อ/รุ่น/ความจุ/สี · MOBILE=1
import { openAs, shot, log, U, clean } from './_h.mjs'
const [u, REF] = process.argv.slice(2); const mob = process.env.MOBILE === '1'
const s = await openAs(u, { mobile: mob }); const { page } = s; if (mob) await page.setViewportSize({ width: 375, height: 812 })
await page.goto(U + '/portal/cases'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1000)
const el = page.locator('tr, li, a, button', { hasText: REF }).last(); await el.click(); await page.waitForTimeout(1500)
const d = page.getByRole('dialog').last(); const t = clean(await (await d.count() ? d : page.locator('main')).innerText())
log('portal', u, REF, mob ? '[m]' : '', page.url().replace(U, ''), t.match(/.{0,120}(256GB|ความจุ).{0,120}/)?.[0] ?? 'NO CAPACITY: ' + t.slice(0, 1500))
await shot(page, `portal-case-${REF}${mob ? '-m' : ''}`, { fullPage: true }); log('portal', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
