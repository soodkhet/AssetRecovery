// กระดิ่งแจ้งเตือน: เปิดรายการ + กดรายการแรก (ไปหน้าปลายทาง) · MOBILE=1
import { openAs, shot, log, U, clean } from './_h.mjs'
const u = process.argv[2]; const mob = process.env.MOBILE === '1'
const s = await openAs(u, { mobile: mob }); const { page } = s; if (mob) await page.setViewportSize({ width: 375, height: 812 })
await page.goto(U + (mob && u.includes('agent') ? '/field' : '/dashboard')); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1000)
const bell = page.getByRole('button', { name: /แจ้งเตือน/ }).first(); log('bell', u, 'bell label', await bell.getAttribute('aria-label'))
await bell.click(); await page.waitForTimeout(1200)
const panel = page.locator('div.absolute.z-50').filter({ has: page.getByRole('button', { name: 'ปิด' }) }).last(); const t = clean(await panel.innerText().catch(() => ''))
log('bell', u, 'panel', t.slice(0, 600)); await shot(page, `bell-${u}${mob ? '-m' : ''}`)
const first = panel.locator('li button, li a').first(); const before = page.url(); await first.click().catch(() => {}); await page.waitForTimeout(1500)
log('bell', u, 'click first →', before.replace(U, ''), '→', page.url().replace(U, '')); log('bell', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
