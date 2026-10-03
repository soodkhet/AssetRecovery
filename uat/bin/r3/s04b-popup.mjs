// R3.11(d) หา popup คำขอของ in2 (ห้ามกดยินยอม/ไม่ยินยอม)
import { openAs, shot, BASE, log, sleep } from './_h.mjs'
const a2 = await openAs('uat.agent.in2', { mobile: true })
await a2.page.goto(`${BASE}/field`); await a2.page.waitForLoadState('networkidle'); await sleep(1500)
await shot(a2.page, 'R3', '11-in2-home-request-card', { fullPage: true })
const card = a2.page.getByText('มีคำขอเปลี่ยนผู้รับผิดชอบ').first()
log('home card text:', (await card.locator('xpath=ancestor::*[self::a or self::button or self::div][1]').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300))
await a2.page.goto(`${BASE}/field/accepted`); await a2.page.waitForLoadState('networkidle'); await sleep(2000)
let pd = a2.page.getByRole('dialog')
log('accepted popup count:', await pd.count())
if (!(await pd.count())) {
  log('accepted body:', (await a2.page.locator('body').innerText()).replace(/\s*\n+\s*/g, ' | ').slice(0, 700))
  const b = a2.page.getByRole('button', { name: /คำขอ|ตอบ/ }).first()
  if (await b.count()) { log('click', await b.innerText()); await b.click(); await sleep(1200); pd = a2.page.getByRole('dialog') }
}
if (await pd.count()) {
  log('popup:', (await pd.innerText()).replace(/\s*\n+\s*/g, ' | ').slice(0, 600))
  await shot(a2.page, 'R3', '11-in2-popup')
  await pd.getByRole('button', { name: 'ดูทีหลัง' }).click(); await sleep(800)
  log('after ดูทีหลัง dialogs:', await a2.page.getByRole('dialog').count())
}
log('console:', a2.consoleErrors, a2.serverErrors)
await a2.browser.close()
