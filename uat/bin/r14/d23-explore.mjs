// R14.23 สำรวจฟอร์มผู้รับเงิน (ไม่บันทึก)
import { openAs, shot, log, settle, sleep, R, BASE, mainText } from './_h.mjs'
import { fields } from '../r1/_h.mjs'
const { browser, page } = await openAs('uat.finance')
await page.goto(`${BASE}/finance?tab=payee`); await settle(page); await sleep(1200)
log('payee tab', await mainText(page, 1500))
const row = page.locator('tbody tr').filter({ hasText: 'อนันต์' })
log('row', (await row.innerText()).replace(/\s+/g, ' '), await row.getByRole('button').allInnerTexts())
await row.getByRole('button', { name: /แก้ไข/ }).click(); await sleep(1000)
const d = page.locator('[role=dialog]').last()
log('dialog', (await d.innerText()).replace(/\s*\n+\s*/g, ' | ').slice(0, 1500))
log('fields\n  ' + await fields(d))
await shot(page, R, '23-payee-edit-form', { fullPage: true })
await browser.close()
