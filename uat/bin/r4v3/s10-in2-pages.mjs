// R4.18 v2 in2 มือถือ: เบิกค่าใช้จ่าย (ขยายกลุ่มดูป้ายชนิด) / สรุปรายได้ / แดชบอร์ด + R4.16 ตรวจกระดิ่ง mgr.out
import { openAs, shot, BASE, settle, sleep, mainText, log, q, T0 } from './_h.mjs'
const R = 'R4v3'
const { browser, page, consoleErrors, serverErrors } = await openAs('uat.agent.in2', { mobile: true })
log('=== s10 v3', new Date().toISOString())
await page.goto(`${BASE}/field/expenses`); await settle(page); await sleep(1000)
log('R4.18 expenses:', await mainText(page, 1000))
await shot(page, R, '18-in2-expenses', { fullPage: true })
for (const who of ['นายวีระ หายไป', 'นางมณี ส่งช้า']) {
  await page.getByText(who).first().click().catch(e => log('no click', e.message.slice(0, 60))); await sleep(1200)
  const d = page.getByRole('dialog')
  const txt = (await d.count()) ? await d.last().innerText() : await page.locator('main').innerText()
  log(`R4.18 expand ${who}:`, txt.replace(/\s*\n+\s*/g, ' | ').slice(0, 900))
  await shot(page, R, `18-in2-expense-${who === 'นายวีระ หายไป' ? 'c3' : 'c4'}`, { fullPage: true })
  if (await d.count()) { await page.keyboard.press('Escape'); await sleep(500) }
}
await page.goto(`${BASE}/field/income`); await settle(page); await sleep(1000)
log('R4.18 income:', await mainText(page, 1000))
await shot(page, R, '18-in2-income', { fullPage: true })
await page.goto(`${BASE}/field`); await settle(page); await sleep(1000)
log('R4.18 dashboard:', await mainText(page, 700))
await shot(page, R, '18-in2-dashboard')
log('console', consoleErrors, 'server', serverErrors)
await browser.close()
const m = await openAs('uat.mgr.out')
await m.page.goto(`${BASE}/`); await settle(m.page); await sleep(800)
await m.page.getByRole('button', { name: /แจ้งเตือน/ }).first().click(); await sleep(1200)
const t = (await m.page.locator('body').innerText()).replace(/\s*\n+\s*/g, ' | ')
log('R4.16 mgr.out bell:', t.slice(Math.max(0, t.indexOf('แจ้งเตือน')), t.indexOf('แจ้งเตือน') + 500), 'has C3:', t.includes('UAT-CO2-003'))
await shot(m.page, R, '16-mgr-out-bell')
log(q(`select count(*) mgr_out_noti from notifications n join users u on u.id=n.user_id where u.username='uat.mgr.out' and n.created_at>'${T0}'`))
await m.browser.close()
