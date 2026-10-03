// R4.06–R4.10 in1 มือถือ: จัดวัน C1, เช็คอิน GPS, probe ไม่ครบ/ไฟล์ผิดชนิด, แนบ + ปิดงาน (dblclick)
import { openAs, shot, BASE, settle, sleep, collect, trackMutations, trackApi, card, mainText, q, log, SQL, REF, C, geo, pick, post, F } from './_h.mjs'
const { browser, context, page, consoleErrors, serverErrors } = await openAs('uat.agent.in1', { mobile: true })
const mut = trackMutations(page); const api = trackApi(page)
log('=== s03', new Date().toISOString())
// R4.06
if (!process.env.SKIP06) {
await page.goto(`${BASE}/field/accepted`); await settle(page); await sleep(600)
await card(page, REF.C1, 'จัดวันที่').getByRole('button', { name: 'จัดวันที่' }).click()
let cal = page.getByRole('dialog').last(); await cal.waitFor(); await sleep(500)
log('R4.06 cal:', (await cal.innerText()).replace(/\s*\n+\s*/g, ' | ').slice(0, 400))
const day = d => cal.locator(`button:has(> span:text-is("${d}"))`).first()
log('R4.06 yesterday(2) disabled:', await day(2).isDisabled(), 'today(3) disabled:', await day(3).isDisabled())
await day(3).click(); await sleep(500)
await shot(page, 'R4', 'R4.06-c1-calendar')
const conf = page.getByRole('dialog').last()
log('R4.06 confirm:', (await conf.innerText()).replace(/\s*\n+\s*/g, ' | ').slice(0, 300))
await shot(page, 'R4', 'R4.06-c1-confirm')
await page.getByRole('button', { name: 'ยืนยันเลือกวันนี้' }).click()
log('R4.06 toasts:', await collect(page, 3000), mut.res)
await page.goto(`${BASE}/field/tracking`); await settle(page); await sleep(800)
log('R4.06 tracking:', await mainText(page, 600))
await shot(page, 'R4', 'R4.06-c1-tracking')
log(q(SQL.asg + '').split('\n').filter(l => l.includes('001') || l.includes('case_ref')).join('\n'))

}
await page.goto(`${BASE}/field/tracking`); await settle(page); await sleep(800)
// R4.07
await geo(context, 'C1')
mut.res.length = 0
await card(page, 'นายสมชาย ใจดีมาก', 'เริ่มงาน').getByRole('button', { name: 'เริ่มงาน' }).click()
const dlg = page.getByRole('dialog').last(); await dlg.waitFor(); await sleep(1200)
log('R4.07 form pre:', (await dlg.innerText()).replace(/\s*\n+\s*/g, ' | ').slice(0, 500))
await dlg.getByRole('button', { name: 'สำเร็จ', exact: true }).click(); await sleep(800)
await dlg.getByRole('button', { name: /แตะเพื่อเช็คอินตำแหน่งปัจจุบัน/ }).click()
log('R4.07 toasts:', await collect(page, 4000))
await sleep(800)
const ft = (await dlg.innerText()).replace(/\s*\n+\s*/g, ' | ')
log('R4.07 form:', ft.slice(0, 1500))
log('R4.07 travel-origin text?', ft.includes('กำลังดึงตำแหน่ง GPS'), 'inputs:', await dlg.locator('input:not([type=file]),textarea').count())
await shot(page, 'R4', 'R4.07-c1-checkin', { fullPage: true })
log('R4.07 mut:', mut.res)
log(q(SQL.ci)); log(q(SQL.dr))

// R4.08 UI
mut.res.length = 0
await page.getByRole('button', { name: 'ยืนยันปิดงาน' }).click(); await sleep(1200)
const red = await dlg.locator('.border-rose-300').allInnerTexts()
log('R4.08 missing box:', red, 'close reqs:', mut.reqs.filter(r => r.endsWith('/close')))
log('R4.08 toasts:', await collect(page, 1500))
await shot(page, 'R4', 'R4.08-c1-missing', { fullPage: true })
log('R4.08 API:', await post(page, `/api/field/cases/${C.C1}/close`, { outcome: 'closed_success', photos: [], videos: [], productPhotos: [] }))
log(q(`select (select count(*) from expenses) ex,(select count(*) from case_evidences) ev`))

// R4.09
api.length = 0
await pick(page, dlg, 'รูปถ่าย', F('not-an-image.txt'))
log('R4.09 toasts:', await collect(page, 2500), 'api:', api)
await shot(page, 'R4', 'R4.09-wrong-type')

// R4.10
api.length = 0
await pick(page, dlg, 'รูปถ่าย', F('R4-C1-photo.jpg'))
await pick(page, dlg, 'วิดีโอ', F('R4-C1-video.mp4'))
await pick(page, dlg, 'รูปสินค้ายืนยัน', F('R4-C1-product.jpg'))
log('R4.10 api:', api)
log('R4.10 draft:', q(SQL.dr))
await dlg.evaluate(e => e.scrollTo?.(0, 0))
await shot(page, 'R4', 'R4.10-c1-form', { fullPage: true })
mut.res.length = 0
await page.getByRole('button', { name: 'ยืนยันปิดงาน' }).dblclick()
log('R4.10 toasts:', await collect(page, 4500))
log('R4.10 mut:', mut.res)
await page.goto(`${BASE}/field/closed`); await settle(page); await sleep(800)
log('R4.10 closed:', await mainText(page, 700))
await shot(page, 'R4', 'R4.10-c1-closed', { fullPage: true })
log(q(SQL.asg).split('\n').filter(l => l.includes('001') || l.includes('case_ref')).join('\n'))
log(q(SQL.ev)); log(q(SQL.ex)); log(q(SQL.as)); log(q(SQL.dr))
log(q(`select c.status,c.outcome,c.closed_at from cases c where id='${C.C1}'`))
const ev = JSON.parse(q(`select json_build_object('p',photos,'v',videos,'pp',product_photos)::text from case_evidences where case_id='${C.C1}'`).split('\n')[2])
log('R4.10 repeat close:', await post(page, `/api/field/cases/${C.C1}/close`, { outcome: 'closed_success', photos: ev.p, videos: ev.v, productPhotos: ev.pp }))
log(q(`select count(*) from expenses`))
log('console', consoleErrors, 'server', serverErrors)
await browser.close()
