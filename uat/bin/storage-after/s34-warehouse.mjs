import { BASE, shot } from '../lib.mjs'; import { open } from './h.mjs'
const { browser, context, page, serverErrors } = await open('uat.admin')
const net = []
context.on('response', r => { const u = r.url(); if (u.includes('/api/storage') || u.includes('supabase.co/storage')) net.push(`${r.status()} ${r.request().method()} ${u.replace(/\?.*$/, '').split('/case-documents/')[1] ?? u.replace(/\?.*$/, '')} ${r.headers()['content-type'] ?? ''}`) })
const goTab = async () => { await page.goto(BASE + '/warehouse'); await page.waitForLoadState('networkidle'); await page.getByRole('tab', { name: /ส่งมอบแล้ว/ }).click(); await page.waitForTimeout(2000) }
const card = () => page.locator('div').filter({ hasText: 'LOT-2569-003' }).filter({ has: page.getByRole('button', { name: 'เอกสาร' }) }).last()
// ข้อ 4 — เอกสารล็อต
if (!process.env.SKIP4) { await goTab()
await card().getByRole('button', { name: 'เอกสาร' }).click(); await page.waitForTimeout(2500)
const d = page.getByRole('dialog').last()
console.log('[lot dialog]', (await d.innerText()).replace(/\n+/g, ' | ').slice(0, 500))
console.log('[lot buttons]', await d.getByRole('button').allInnerTexts())
await shot(page, 'STORAGE-AFTER', '04a-lot003-docs')
const viewBtn = d.getByRole('button', { name: /ดู|เปิด/ }).first()
if (await viewBtn.count()) {
  const [pop] = await Promise.all([context.waitForEvent('page', { timeout: 6000 }).catch(() => null), viewBtn.click()])
  await page.waitForTimeout(3500)
  if (pop) { await pop.waitForLoadState().catch(() => {}); await shot(pop, 'STORAGE-AFTER', '04b-lot003-signed-doc'); console.log('popup opened'); await pop.close() }
  else await shot(page, 'STORAGE-AFTER', '04b-lot003-signed-doc')
  console.log('[viewer]', JSON.stringify(await page.locator('[role=dialog] img, [role=dialog] iframe').evaluateAll(es => es.map(e => ({ tag: e.tagName, ok: e.tagName === 'IMG' ? e.naturalWidth > 0 : true, src: e.src.replace(/\?.*$/, '').slice(-60) })))))
}
}
console.log(net.splice(0).join('\n'))
// ข้อ 3 — รูปรับเข้าของทรัพย์ C1
await goTab()
await card().getByRole('button', { name: 'ดูรายการ' }).click(); await page.waitForTimeout(2500)
await shot(page, 'STORAGE-AFTER', '03c-lot003-items')
const d2 = page.locator('body')
console.log('[url]', page.url(), 'dialogs', await page.getByRole('dialog').count())
await shot(page, 'STORAGE-AFTER', '03c-lot003-items')
await page.locator('tr').filter({ hasText: '356789100000011' }).getByRole('button', { name: 'ดู' }).click(); await page.waitForTimeout(4000)
const d3 = page.getByRole('dialog').last()
console.log('[asset]', (await d3.innerText()).replace(/\n+/g, ' | ').slice(0, 800))
const [pop3] = await Promise.all([context.waitForEvent('page', { timeout: 6000 }).catch(() => null), d3.getByRole('button', { name: 'ด้านหน้า' }).click()])
await page.waitForTimeout(3500)
if (pop3) { await pop3.waitForLoadState().catch(() => {}); console.log('popup', pop3.url().split('?')[0].slice(-60)); await shot(pop3, 'STORAGE-AFTER', '03e-C1-intake-front') } else await shot(page, 'STORAGE-AFTER', '03e-C1-intake-front')
const imgs = await page.locator('[role=dialog] img').evaluateAll(es => es.map(e => ({ ok: e.naturalWidth > 0, src: e.src.replace(/\?.*$/, '').slice(-70) })))
console.log('[asset imgs]', JSON.stringify(imgs))
await shot(page, 'STORAGE-AFTER', '03d-C1-asset-intake')
console.log(net.join('\n')); console.log('5xx', serverErrors)
await browser.close()
