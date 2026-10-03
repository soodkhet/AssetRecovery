// R4.29 (ก่อนเบิกจริง) probe ใบเสร็จค่าที่พักฝั่ง server (BUG-072): ไฟล์ปลอม .jpg ผ่านหน้าจอ · path นอกขอบเขต / ไม่มีไฟล์ ผ่าน API — ต้องไม่มีแถว
import { execFileSync } from 'node:child_process'
import { openAs, shot, BASE, settle, sleep, collect, trackMutations, mainText, q, log, post } from './_h.mjs'
import { trackApi } from '../r2/_h.mjs'
const R = 'R4v3'
const FAKE = process.env.FAKE_RECEIPT
const IN1 = '88cb577d-32b4-49ff-96fb-06a2e093d339', IN2 = '0e2d5aaa-f3d4-487a-a4bc-f7779745fb1e'
const TODAY = execFileSync('uat/bin/q.sh', ["select to_char((now() at time zone 'Asia/Bangkok')::date,'YYYY-MM-DD')"], { encoding: 'utf8' }).split('\n')[3].trim()
const flat = s => s.replace(/\s*\n+\s*/g, ' | ')
log('=== s14a R4b v3 hotel receipt probe', new Date().toISOString(), TODAY)
const { browser, page, consoleErrors, serverErrors } = await openAs('uat.agent.in1', { mobile: true })
const mut = trackMutations(page)
const api = trackApi(page)
await page.goto(`${BASE}/field/expenses`); await settle(page); await sleep(1200)
await page.getByRole('button', { name: 'เบิกแยก', exact: true }).click(); await sleep(900)
await page.getByRole('button', { name: /เบิกที่พัก/ }).click(); await sleep(900)
const dlg = page.getByRole('dialog').filter({ hasText: 'เบิกค่าที่พัก' }).last(); await dlg.waitFor()
await dlg.locator('input[type=date]').fill(TODAY)
await dlg.locator('input[inputmode=decimal]').fill('600')
const [ch] = await Promise.all([page.waitForEvent('filechooser'), dlg.getByText(/แตะเพื่อแนบใบเสร็จ/).click()])
await ch.setFiles(FAKE); await sleep(800)
await dlg.locator('textarea').fill('UAT probe ใบเสร็จปลอม')
mut.res.length = 0; api.length = 0
await dlg.getByRole('button', { name: 'ส่งคำขอเบิก' }).click()
log('R4.29 fake receipt toasts:', await collect(page, 4000), 'res:', mut.res, 'api:', api.filter(s => s.includes('storage') || s.includes('/api/field')).map(s => s.slice(0, 260)))
log('R4.29 fake receipt modal open:', await page.getByRole('dialog').filter({ hasText: 'เบิกค่าที่พัก' }).count(), 'errors:', (await dlg.locator('.text-red-600').allInnerTexts().catch(() => [])))
await shot(page, R, '29-hotel-fake-receipt')
log(q(`select count(*) hotel_rows from expenses where expense_type='hotel'`))
// API probes
const fakePath = (api.find(s => s.includes('/receipts/') && s.includes('"Key"')) || '').match(/"Key":"case-documents\/([^"]+)"/)?.[1]
log('R4.29 uploaded fake path:', fakePath)
const body = p => ({ expenseDate: TODAY, amountSatang: 60000, sharedWithUserId: null, receiptFileUrl: p, note: 'UAT probe' })
log('R4.29 API fake again:', await post(page, '/api/field/expenses/hotel', body(fakePath ?? `expenses/${IN1}/receipts/none.jpg`)))
log('R4.29 API path of in2:', await post(page, '/api/field/expenses/hotel', body(`expenses/${IN2}/receipts/00000000-0000-0000-0000-000000000000-x.jpg`)))
log('R4.29 API evidence path C1:', await post(page, '/api/field/expenses/hotel', body(q(`select photos[1] from case_evidences where case_id='a10492d4-c805-4c7d-9ec4-a63fa730e9ea'`).split('\n')[2].trim())))
log('R4.29 API traversal:', await post(page, '/api/field/expenses/hotel', body(`expenses/${IN1}/receipts/../../${IN2}/receipts/x.jpg`)))
log('R4.29 API not found:', await post(page, '/api/field/expenses/hotel', body(`expenses/${IN1}/receipts/00000000-0000-0000-0000-000000000000-missing.jpg`)))
log(q(`select count(*) hotel_rows from expenses where expense_type='hotel'`))
log(q(`select count(*) audits_hotel from audit_logs where created_at > now() - interval '5 minutes' and target_type='expenses' and action='create'`))
log('console', consoleErrors, 'server', serverErrors)
await browser.close()
