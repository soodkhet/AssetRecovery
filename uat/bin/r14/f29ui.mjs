// R14.29 (หน้าจอ) การเงินเปิดแท็บเงินรับ → ต้องไม่มีปุ่มออกใบ/ออกใบแทน
import { openAs, shot, log, settle, sleep, R, BASE, mainText } from './_h.mjs'
const { browser, page } = await openAs('uat.finance')
await page.goto(`${BASE}/accounting?tab=receipts`); await settle(page); await sleep(1500)
log('url', page.url()); log('main', await mainText(page, 700))
log('ปุ่มออกใบ', await page.getByRole('button', { name: /ออกใบเสร็จรับเงิน|ออกใบแทน/ }).count())
await shot(page, R, '29-finance-receipts-tab', { fullPage: true })
await browser.close()
