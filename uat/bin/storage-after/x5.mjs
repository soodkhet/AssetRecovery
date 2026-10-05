import { BASE, shot } from '../lib.mjs'; import { open } from './h.mjs'
const { browser, page } = await open('uat.admin')
await page.goto(BASE + '/warehouse'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1500)
await page.getByRole('tab', { name: /ส่งมอบแล้ว/ }).click(); await page.waitForTimeout(2500)
await shot(page, 'STORAGE-AFTER', '03b-warehouse-handed')
const main = await page.locator('main').innerText().catch(() => page.locator('body').innerText())
console.log(main.slice(0, 2000))
console.log((await page.getByRole('button').allInnerTexts()).slice(0, 40))
await browser.close()
