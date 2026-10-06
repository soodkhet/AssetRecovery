// BUG-180 / U170 — บัญชียืนยันค่าตั้งรอนักบัญชีครบทุกรายการผ่านหน้ารวม (เหตุผลบังคับ + audit)
import { openAs, shot, log, q, collect, trackApi, U, clean } from './_h.mjs'
const s = await openAs('uat.account'); const { page } = s; const api = trackApi(page)
await page.goto(U + '/accounting/setting-assumptions'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200)
const btns = () => page.locator('tbody button', { hasText: 'ยืนยันแล้ว' })
log('b180', 'pending buttons', await btns().count())
let first = true, n = 0
while (await btns().count()) {
  await btns().first().click(); await page.waitForTimeout(500)
  const d = page.getByRole('dialog').last()
  const ok = d.getByRole('button', { name: 'ยืนยันแล้ว' })
  if (first) { log('b180', 'dialog', clean(await d.innerText()).slice(0, 400), 'disabled w/o reason:', await ok.isDisabled()); await shot(page, 'b180-dialog'); first = false }
  await d.locator('textarea').fill('สำนักงานบัญชียืนยันแล้ว (ด่าน 7 รอบทวน)')
  await ok.click(); await page.waitForTimeout(900); n++
  if (n > 40) break
}
log('b180', 'confirmed', n, 'non-GET', api.length, api.filter(x => !x.startsWith('2')).slice(0, 5))
await page.reload(); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1000)
const t = clean(await page.locator('main').innerText()); log('b180', 'after:', t.match(/รอนักบัญชียืนยัน \d+.{0,80}/)?.[0])
await shot(page, 'b180-after', { fullPage: true })
log('b180', 'audit', q(`select action, count(*) from audit_logs where created_at > now() - interval '10 minutes' and actor_id=(select id from users where username='uat.account') group by 1`))
log('b180', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
