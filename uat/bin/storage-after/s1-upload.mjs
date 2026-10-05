import { shot, BASE } from '../lib.mjs'; import { open } from './h.mjs'
const SP = '/private/tmp/claude-501/-Users-beer-AssetRecovery/994f4e02-c9c5-4494-855d-cedda7c30d43/scratchpad'
const { browser, page, serverErrors } = await open('uat.admin')
const net = []
page.on('response', r => { const u = r.url(); if (u.includes('/api/storage') || u.includes('supabase.co/storage') || (u.includes('/api/cases') && r.request().method() !== 'GET')) net.push(`${r.status()} ${r.request().method()} ${u.replace(/\?.*$/, '').replace(/token=[^&]+/, '')}`) })
await page.goto(BASE + '/cases'); await page.waitForLoadState('networkidle')
await page.getByPlaceholder(/ค้นหา/).first().fill('UAT-CO1-902'); await page.waitForTimeout(1500)
await page.getByRole('button', { name: 'แก้ไข' }).first().click(); await page.waitForTimeout(2500)
await page.locator('input[type=file]').nth(0).setInputFiles(`${SP}/STORAGE-AFTER-contract.pdf`)
await page.waitForTimeout(5000)
await page.getByText('STORAGE-AFTER-contract.pdf').first().scrollIntoViewIfNeeded()
await shot(page, 'STORAGE-AFTER', '01c-902-uploaded-before-save')
console.log('after pick:', (await page.getByText('STORAGE-AFTER-contract.pdf').first().locator('..').innerText()).replace(/\n/g, ' | '))
await page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click(); await page.waitForTimeout(4000)
await shot(page, 'STORAGE-AFTER', '01d-902-saved')
console.log('toast/body:', (await page.locator('body').innerText()).match(/บันทึก[^\n]{0,80}/g)?.slice(0, 5))
console.log(net.join('\n')); console.log('5xx', serverErrors)
await browser.close()
