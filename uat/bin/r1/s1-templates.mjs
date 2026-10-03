import { openAs, shot, BASE, toasts, inlineErrors, fields, trackMutations, settle, log } from './_h.mjs'
const s = await openAs('admin')
const { page } = s
const m = trackMutations(page)

// R1.01
await page.goto(`${BASE}/settings`); await settle(page)
log('R1.01 url', page.url())
log('R1.01 h1', await page.locator('h1').allInnerTexts())
const nav = await page.locator('a[href^="/settings/"]').allInnerTexts()
log('R1.01 settings links', JSON.stringify(nav.map(x => x.trim())))
await shot(page, 'R1', 'R1.01-settings-home')

// R1.02 T1
await page.goto(`${BASE}/settings/service-fee`); await settle(page)
await page.getByRole('button', { name: '+ สร้างเทมเพลต' }).click()
let dlg = page.getByRole('dialog')
log('R1.02 dialog title', (await dlg.locator('h2,h3').first().innerText()))
await dlg.locator('#sf-name').fill('UAT Success 5%')
await dlg.locator('#sf-model').selectOption('SUCCESS_FEE')
log('R1.02 fields SUCCESS_FEE\n  ' + await fields(dlg))
await dlg.locator('#sf-rate').fill('5.00')
await dlg.locator('#sf-basis').selectOption({ label: 'มูลค่าหนี้คงเหลือ' }).catch(async e => { log('basis label fail', e.message); log(await dlg.locator('#sf-basis').innerHTML()) })
await dlg.locator('#sf-reason').fill('ตั้งเทมเพลตค่าบริการ Success Fee สำหรับ UAT รอบที่ 1')
await shot(page, 'R1', 'R1.02-sf-t1-form', { fullPage: true })
await dlg.getByRole('button', { name: 'สร้างเทมเพลต', exact: true }).click()
log('R1.02 toast', await toasts(page))
await settle(page)
log('R1.02 dialog open?', await dlg.isVisible())
await shot(page, 'R1', 'R1.02-sf-t1-done', { fullPage: true })
log('R1.02 page text', (await page.locator('main').innerText()).replace(/\n+/g, ' | ').slice(0, 800))

// R1.03 T2
await page.waitForTimeout(1500)
await page.getByRole('button', { name: '+ สร้างเทมเพลต' }).click()
dlg = page.getByRole('dialog')
await dlg.locator('#sf-name').fill('UAT Flat 7,490')
await dlg.locator('#sf-model').selectOption('FLAT')
log('R1.03 fields FLAT\n  ' + await fields(dlg))
log('R1.03 checkbox labels', JSON.stringify(await dlg.locator('label').allInnerTexts()))
await dlg.locator('#sf-base').fill('7,490.00')
await dlg.locator('#sf-reason').fill('ตั้งเทมเพลตค่าบริการเหมาจ่ายสำหรับ UAT รอบที่ 1')
await shot(page, 'R1', 'R1.03-sf-t2-form', { fullPage: true })
await dlg.getByRole('button', { name: 'สร้างเทมเพลต', exact: true }).click()
log('R1.03 toast', await toasts(page))
await settle(page)
await shot(page, 'R1', 'R1.03-sf-t2-done', { fullPage: true })
log('R1.03 page text', (await page.locator('main').innerText()).replace(/\n+/g, ' | ').slice(0, 1200))

// R1.04 probe
await page.waitForTimeout(1500)
const before = m.reqs.length
await page.getByRole('button', { name: '+ สร้างเทมเพลต' }).click()
dlg = page.getByRole('dialog')
await dlg.getByRole('button', { name: 'สร้างเทมเพลต', exact: true }).click()
await page.waitForTimeout(800)
log('R1.04 errors', JSON.stringify(await inlineErrors(dlg)))
log('R1.04 dialog open?', await dlg.isVisible(), 'new mutations', m.reqs.slice(before))
await shot(page, 'R1', 'R1.04-sf-required', { fullPage: true })
await dlg.getByRole('button', { name: 'ยกเลิก' }).click()

log('mutations', m.res)
log('consoleErrors', s.consoleErrors, 'serverErrors', s.serverErrors)
await s.browser.close()
