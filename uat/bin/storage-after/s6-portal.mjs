import { BASE, shot } from '../lib.mjs'; import { open } from './h.mjs'
const { browser, context, page, serverErrors } = await open('uat.co1.mgr')
const net = []
context.on('response', r => { const u = r.url(); if (u.includes('/api/storage') || u.includes('supabase.co/storage') || u.includes('/api/portal')) net.push(`${r.status()} ${r.request().method()} ${(u.replace(/\?.*$/, '').split('/case-documents/')[1] ?? u.replace(/\?.*$/, '').replace(BASE, ''))} ${r.headers()['content-type'] ?? ''}`) })
// ก) ดาวน์โหลดใบเซ็นรับ LOT-2569-003
await page.goto(BASE + '/portal/handover'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1000)
const [dl, pop] = await Promise.all([
  page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
  context.waitForEvent('page', { timeout: 8000 }).catch(() => null),
  page.getByRole('button', { name: 'ดาวน์โหลดใบเซ็นรับ' }).first().click(),
])
await page.waitForTimeout(3000)
if (dl) { const f = await dl.path(); const { statSync, readFileSync } = await import('node:fs'); console.log('download', dl.suggestedFilename(), statSync(f).size, readFileSync(f).subarray(0, 5).toString()) }
if (pop) { await pop.waitForLoadState().catch(() => {}); console.log('popup', pop.url().split('?')[0].slice(-80)); await shot(pop, 'STORAGE-AFTER', '06a-portal-lot003-signed') }
else await shot(page, 'STORAGE-AFTER', '06a-portal-lot003-signed')
console.log(net.splice(0).join('\n'))
// ข) รูปทรัพย์เคสสำเร็จ (UAT-CO1-001)
await page.goto(BASE + '/portal/cases'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1000)
await page.locator('tr').filter({ hasText: 'UAT-CO1-001' }).getByRole('button', { name: 'ดูรายละเอียด' }).click(); await page.waitForTimeout(3500)
const d = page.getByRole('dialog').last()
console.log('[case]', (await d.innerText().catch(() => page.locator('main').innerText())).replace(/\n+/g, ' | ').slice(0, 700))
await shot(page, 'STORAGE-AFTER', '06b-portal-C1-detail')
const imgs = await page.locator('[role=dialog] img, main img').evaluateAll(es => es.map(e => ({ ok: e.complete && e.naturalWidth > 0, src: e.src.replace(/\?.*$/, '').slice(-60) })))
console.log('[imgs]', JSON.stringify(imgs))
const btns = await d.getByRole('button').allInnerTexts().catch(() => []); console.log('[btns]', btns)
console.log(net.join('\n')); console.log('5xx', serverErrors)
await browser.close()
