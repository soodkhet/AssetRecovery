// R13.14 ยอดรวมทุกแท็บหน้าเบิกพนักงาน
import { openAs, shot, log, settle, sleep, R, BASE } from './_h.mjs'
const { browser, page } = await openAs('uat.agent.in1', { mobile: true })
await page.goto(`${BASE}/field/expenses`); await settle(page); await sleep(1200)
const kpi = async () => (await page.locator('main').innerText()).replace(/\s*\n+\s*/g, ' | ').match(/รอดำเนินการรวมทุกแท็บ.*?อนุมัติแล้ว/)?.[0]
log('ผูกกับเคส', await kpi()); await shot(page, R, '14-expenses-case-tab', { fullPage: true })
await page.getByRole('button', { name: 'เบิกแยก', exact: true }).click(); await sleep(1000)
log('เบิกแยก', await kpi()); await shot(page, R, '14-expenses-sep-tab', { fullPage: true })
await browser.close()
