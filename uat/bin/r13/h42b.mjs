// R13.42 (ต่อ) ชุดคืนค่าซ้ำ: ช่อง Inhouse ถูกซ่อนเมื่อเลือก "40(8) ทั้งหมด" แต่ค่า 40(1) จากชุดทดสอบติดไปด้วย → ตั้ง 40(2) ก่อนสลับโหมด
import { openAs, shot, BASE, settle, sleep, toasts, log, R, q, mainText } from './_h.mjs'
log('=== h42b', new Date().toISOString())
const e = await openAs('uat.exec'); const p = e.page
await p.goto(`${BASE}/settings/finance?tab=whtpolicy`); await settle(p); await sleep(1200)
await p.getByRole('button', { name: '+ ตั้งค่าชุดใหม่' }).click(); await sleep(700)
const d = p.locator('[role="dialog"]').last()
await d.locator('#wht-policy-income').selectOption('by_team_side'); await sleep(300)
await d.locator('#wht-policy-inhouse').selectOption('sec_40_2'); await d.locator('#wht-policy-outsource').selectOption('sec_40_8')
await d.locator('#wht-policy-income').selectOption('all_40_8'); await sleep(300)
await d.locator('#wht-policy-filing').selectOption('online')
await d.locator('#wht-policy-reason').fill('คืนค่าเดิมหลังทดสอบ R13 (ตั้งประเภทเงินได้ Inhouse กลับเป็น 40(2) ที่ถูกซ่อนอยู่)')
await d.getByRole('button', { name: 'บันทึกค่าตั้ง' }).click()
log('toast', await toasts(p, 2500)); await sleep(800)
await shot(p, R, '42-set3-restored', { fullPage: true })
log(q(`select effective_from, income_type_mode, issue_zero_rate_40_2_certificate z, inhouse_income_category ih, outsource_income_category os, filing_method, certificate_mode, base_expense_types from wht_policy_history order by created_at`))
await e.browser.close()
