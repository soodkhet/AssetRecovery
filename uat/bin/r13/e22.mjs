// R13.22 สร้างรอบจ่าย inhouse (ชื่อจาก env NAME) แล้วดู preview
import { openAs, shot, log, settle, sleep, R, q, BASE, toasts } from './_h.mjs'
const NAME = process.env.NAME ?? 'UAT IN-R13a', SLUG = process.env.SLUG ?? '22'
const TODAY = '2026-10-05'
const flat = s => s.replace(/\s*\n+\s*/g, ' | ')
const { browser, page, serverErrors } = await openAs('uat.finance')
const posts = []
page.on('response', async r => { if (r.request().method() === 'POST' && r.url().endsWith('/api/payout-batches')) posts.push(`${r.status()} ${(await r.text().catch(() => '')).slice(0, 300)}`) })
await page.goto(`${BASE}/finance?tab=payout`); await settle(page); await sleep(1000)
await page.getByRole('button', { name: '+ สร้างรอบจ่าย' }).click(); await sleep(600)
const d = page.locator('[role="dialog"]').last()
log('modal', flat(await d.innerText()).slice(0, 600))
await d.locator('select').first().selectOption('inhouse')
await d.locator('input[type=date]').fill(TODAY)
await d.locator('input:not([type=date])').last().fill(NAME)
await d.getByRole('button', { name: 'สร้างรอบจ่าย' }).click()
log('create toasts', await toasts(page, 4000), posts)
await page.reload(); await settle(page); await sleep(1000)
await page.locator('tbody tr').filter({ hasText: NAME }).getByRole('button', { name: 'ดูรายการ' }).click(); await sleep(1500)
const dt = flat(await page.locator('[role="dialog"]').last().innerText())
log('detail', dt.slice(0, 2500))
await shot(page, R, `${SLUG}-payout-offset`, { fullPage: true })
log('5xx', serverErrors)
await browser.close()
const id = q(`select id from payout_batches where name='${NAME}'`).split('\n')[2].trim()
log('batch', q(`select name,status,gross_satang,wht_satang,net_satang,advance_offset_satang,(select count(*) from payout_batch_items i where i.payout_batch_id=b.id) items from payout_batches b where id='${id}'`))
log(q(`select coalesce(x.expense_type::text,'advance') t, i.gross_satang, i.wht_satang, i.net_satang from payout_batch_items i left join expenses x on x.payout_batch_item_id=i.id where i.payout_batch_id='${id}' order by 1`))
log(q(`select left(r.advance_id::text,8) adv,r.channel,r.amount_satang,r.reversed_at,r.payout_batch_id='${id}' this from advance_returns r order by r.created_at`))
