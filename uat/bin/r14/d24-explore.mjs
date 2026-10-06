import { openAs, log, settle, sleep, BASE } from './_h.mjs'
import { fields } from '../r1/_h.mjs'
const { browser, page } = await openAs('uat.agent.in1', { mobile: true })
await page.goto(`${BASE}/field/expenses`); await settle(page); await sleep(1200)
await page.getByRole('button', { name: 'เบิกแยก', exact: true }).click(); await sleep(1000)
log('buttons', await page.getByRole('button').allInnerTexts())
await page.getByRole('button', { name: /เบิกที่พัก/ }).click(); await sleep(1000)
const dlg = page.getByRole('dialog').filter({ hasText: 'เบิกค่าที่พัก' }).last()
log('modal', (await dlg.innerText()).replace(/\s*\n+\s*/g, ' | '))
log('fields\n  ' + await fields(dlg))
await browser.close()
