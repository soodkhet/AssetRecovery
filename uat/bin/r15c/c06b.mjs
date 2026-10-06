import { writeFileSync } from 'node:fs'
import { openAs, shot, BASE, settle, sleep, log, R, q, DL } from './_h.mjs'
const T = '2026-10-06T11:43:05.184Z'
const { browser, page } = await openAs('uat.agent.in1', { mobile: true })
await page.goto(`${BASE}/field/expenses`); await settle(page); await sleep(1000); await page.getByRole('button', { name: 'เบิกแยก', exact: true }).click(); await sleep(900)
const t = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
log('CRT mentions', [...t.matchAll(/.{0,60}CRT-2569-000[5678].{0,160}/g)].map(m => m[0]))
await page.getByText('CRT-2569-0008').first().scrollIntoViewIfNeeded(); await shot(page, R, 'c-06-card-0008')
log(q(`select receipt_number,status,expense_id,total_satang,cancel_reason from substitute_receipts where created_at>'${T}' or cancelled_at>'${T}' order by receipt_number`))
const id8 = q(`select id from substitute_receipts where receipt_number='CRT-2569-0008'`).split('\n')[2]?.trim()
const r = await page.request.get(`${BASE}/api/substitute-receipts/${id8}/pdf`); writeFileSync(`${DL}/CRT-2569-0008.pdf`, await r.body()); log('pdf new', r.status())
log(q(`select action,target_type,reason from audit_logs where created_at>'${T}' and action<>'login' order by created_at`))
await browser.close()
