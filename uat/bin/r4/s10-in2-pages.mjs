// R4.18 in2 มือถือ: เบิกค่าใช้จ่าย / สรุปรายได้
import { openAs, shot, BASE, settle, sleep, mainText, log } from './_h.mjs'
const { browser, page, consoleErrors, serverErrors } = await openAs('uat.agent.in2', { mobile: true })
log('=== s10', new Date().toISOString())
await page.goto(`${BASE}/field/expenses`); await settle(page); await sleep(1000)
log('R4.18 expenses:', await mainText(page, 1000))
await shot(page, 'R4', 'R4.18-in2-expenses', { fullPage: true })
await page.goto(`${BASE}/field/income`); await settle(page); await sleep(1000)
log('R4.18 income:', await mainText(page, 1000))
await shot(page, 'R4', 'R4.18-in2-income', { fullPage: true })
log('console', consoleErrors, 'server', serverErrors)
await browser.close()
