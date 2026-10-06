// ด่าน 7 — บัญชี U123 ที่ must_change_password=true: login → หน้าเปลี่ยนรหัส → ตั้งรหัสสุ่ม → เขียนกลับ personas.json (ไม่พิมพ์รหัส)
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { BASE, shot } from '../lib.mjs'
const users = process.argv.slice(2)
for (const u of users) {
  const all = JSON.parse(readFileSync('uat/personas.json', 'utf8'))
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'th-TH', timezoneId: 'Asia/Bangkok' })
  const page = await ctx.newPage()
  const errs = []
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  await page.goto(`${BASE}/login`)
  await page.locator('#identifier').fill(u)
  await page.locator('#password').fill(all[u].password)
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await page.waitForURL(x => !x.pathname.startsWith('/login'), { timeout: 20000 })
  console.log(u, 'landed', new URL(page.url()).pathname)
  if (page.url().includes('/auth/change-password')) {
    await shot(page, 'final', `00-${u}-forced-change`)
    // validation: รหัสใหม่ไม่ตรงกัน
    const np = 'Ft7-' + randomBytes(9).toString('base64url') + '9a'
    await page.locator('#current-password').fill(all[u].password)
    await page.locator('#new-password').fill(np)
    await page.locator('#confirm-password').fill(np + 'x')
    await page.locator('form button[type=submit]').click()
    await page.waitForTimeout(800)
    console.log(u, 'mismatch msg:', (await page.locator('[role=alert], .text-red-600, .text-rose-600').allInnerTexts()).join(' | ').slice(0, 200))
    await shot(page, 'final', `00-${u}-mismatch`)
    await page.locator('#confirm-password').fill(np)
    await page.locator('form button[type=submit]').click()
    await page.waitForURL(x => !x.pathname.startsWith('/auth/change-password'), { timeout: 20000 })
    all[u].initial = all[u].initial ?? all[u].password
    all[u].password = np
    all[u].changedAt = '07/10/2569 ด่าน7'
    writeFileSync('uat/personas.json', JSON.stringify(all, null, 2))
    console.log(u, 'changed → landed', new URL(page.url()).pathname)
    mkdirSync('uat/.auth', { recursive: true })
    await ctx.storageState({ path: `uat/.auth/${u}.json` })
    await shot(page, 'final', `00-${u}-after-change`)
  }
  console.log(u, 'console errors', errs.length, errs.slice(0, 3))
  await browser.close()
}
