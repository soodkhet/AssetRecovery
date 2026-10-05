import { shot, BASE } from '../lib.mjs'; import { open } from './h.mjs'
const { browser, page, serverErrors } = await open('uat.admin')
await page.goto(BASE + '/cases'); await page.waitForLoadState('networkidle')
console.log(page.url())
const s = page.getByPlaceholder(/ค้นหา/).first(); if (await s.count()) { await s.fill('UAT-CO1-902'); await page.waitForTimeout(1500) }
console.log('rows', await page.getByText('UAT-CO1-902').count())
await shot(page, 'STORAGE-AFTER', '00-cases-list')
await page.getByText('UAT-CO1-902').first().click(); await page.waitForTimeout(2500)
await shot(page, 'STORAGE-AFTER', '00b-902-detail')
console.log(page.url()); console.log((await page.locator('body').innerText()).slice(0, 1800))
console.log(await page.getByRole('button').allInnerTexts())
console.log(serverErrors); await browser.close()
