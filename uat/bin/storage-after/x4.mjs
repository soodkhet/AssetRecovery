import { BASE } from '../lib.mjs'; import { open } from './h.mjs'
const { browser, page } = await open('uat.admin')
await page.goto(BASE + '/cases'); await page.waitForLoadState('networkidle')
await page.getByPlaceholder(/ค้นหา/).first().fill('UAT-CO1-001'); await page.waitForTimeout(2000)
await page.getByRole('button', { name: 'ดูรายละเอียด' }).first().click(); await page.waitForTimeout(3000)
const d = page.getByRole('dialog').last()
console.log((await d.innerText()).replace(/\n+/g,' | ').slice(0, 3000))
console.log(await d.getByRole('button').allInnerTexts(), await d.getByRole('tab').allInnerTexts())
await browser.close()
