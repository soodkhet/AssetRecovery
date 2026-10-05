import { shot, BASE } from '../lib.mjs'; import { open } from './h.mjs'
const [ref, fileText, slug] = process.argv.slice(2)
const { browser, context, page, serverErrors } = await open(process.env.WHO ?? 'uat.admin', { fresh: process.env.FRESH === '1' })
const net = []
context.on('response', r => { const u = r.url(); if (u.includes('/api/storage') || u.includes('supabase.co/storage')) net.push(`${r.status()} ${r.request().method()} ${u.replace(/\?.*$/, '')} ${r.headers()['content-type'] ?? ''}`) })
await page.goto(BASE + '/cases'); await page.waitForLoadState('networkidle')
await page.getByPlaceholder(/ค้นหา/).first().fill(ref); await page.waitForTimeout(2000)
const tabs = await page.getByRole('tab').allInnerTexts().catch(() => [])
console.log('rows', await page.getByText(ref).count())
await page.getByRole('button', { name: 'ดูรายละเอียด' }).first().click(); await page.waitForTimeout(3000)
const t = await page.locator('body').innerText()
const lines = t.split('\n').filter(l => /\.(pdf|png|jpe?g)|เอกสาร|หลักฐาน|รูป/i.test(l)).slice(0, 30)
console.log(lines.join('\n'))
if (fileText) {
  const el = page.getByText(fileText).first()
  await el.scrollIntoViewIfNeeded(); await shot(page, 'STORAGE-AFTER', `${slug}-a-detail`)
  const [popup] = await Promise.all([context.waitForEvent('page', { timeout: 8000 }).catch(() => null), el.click()])
  await page.waitForTimeout(3500)
  if (popup) { await popup.waitForLoadState().catch(() => {}); console.log('popup', popup.url().replace(/\?.*$/, '')); await shot(popup, 'STORAGE-AFTER', `${slug}-b-open`) }
  else await shot(page, 'STORAGE-AFTER', `${slug}-b-open`)
  const imgs = await page.locator('[role=dialog] img, [role=dialog] iframe, [role=dialog] embed, [role=dialog] object').evaluateAll(es => es.map(e => ({ tag: e.tagName, ok: e.tagName === 'IMG' ? e.naturalWidth > 0 : true, src: (e.src || e.data || '').replace(/\?.*$/, '').slice(0, 140) })))
  console.log('viewer', JSON.stringify(imgs))
}
console.log(net.join('\n')); console.log('5xx', serverErrors)
await browser.close()
