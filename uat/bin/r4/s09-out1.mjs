// R4.19–R4.22 out1 มือถือ: รับ/จัดวัน/เช็คอิน C5 · probe .mp4 ปลอม · ปิดงานด้วย race 2 คำขอ · หน้าเบิก/รายได้
import { openAs, shot, BASE, settle, sleep, collect, trackMutations, trackApi, card, mainText, q, log, SQL, REF, C, geo, pick, fmt, F } from './_h.mjs'
const { browser, context, page, consoleErrors, serverErrors } = await openAs('uat.agent.out1', { mobile: true })
const mut = trackMutations(page); const api = trackApi(page)
const failed = []; page.on('requestfailed', r => failed.push(`${r.failure()?.errorText} ${r.url().slice(0, 90)}`))
log('=== s09', new Date().toISOString())
await page.goto(`${BASE}/field/pending`); await settle(page); await sleep(800)
log('R4.19 pending:', await mainText(page, 600))
await shot(page, 'R4', 'R4.19-out1-pending')
await card(page, REF.C5, 'รับงาน').getByRole('button', { name: 'รับงาน', exact: true }).click()
log('R4.19 accept:', await collect(page, 2500))
await page.goto(`${BASE}/field/accepted`); await settle(page); await sleep(700)
await card(page, REF.C5, 'จัดวันที่').getByRole('button', { name: 'จัดวันที่' }).click()
const cal = page.getByRole('dialog').last(); await cal.waitFor(); await sleep(500)
await cal.locator('button:has(> span:text-is("3"))').first().click(); await sleep(400)
await page.getByRole('button', { name: 'ยืนยันเลือกวันนี้' }).click()
log('R4.19 schedule:', await collect(page, 3000))
await geo(context, 'C5')
await page.goto(`${BASE}/field/tracking`); await settle(page); await sleep(800)
await card(page, 'นายประยุทธ์ ไกลบ้าน', 'เริ่มงาน').getByRole('button', { name: 'เริ่มงาน' }).click()
const dlg = page.getByRole('dialog').last(); await dlg.waitFor(); await sleep(1200)
await dlg.getByRole('button', { name: 'สำเร็จ', exact: true }).click(); await sleep(800)
log('R4.19 form after outcome:', (await dlg.innerText()).replace(/\s*\n+\s*/g, ' | ').slice(0, 400))
await dlg.getByRole('button', { name: /แตะเพื่อเช็คอินตำแหน่งปัจจุบัน/ }).click()
log('R4.19 checkin:', await collect(page, 3500))
await shot(page, 'R4', 'R4.19-c5-checkin', { fullPage: true })
log(q(SQL.ci).split('\n').filter(l => l.includes('005')).join('\n'))

// R4.20
api.length = 0
await pick(page, dlg, 'วิดีโอ', F('R4-fake-video.mp4'))
log('R4.20 toasts:', await collect(page, 2000))
log('R4.20 api:', api)
log('R4.20 draft:', q(`select videos from close_case_drafts where case_id='${C.C5}'`))
await shot(page, 'R4', 'R4.20-fake-mp4-accepted', { fullPage: true })
const rm = dlg.getByRole('button', { name: 'ลบวิดีโอลำดับที่ 1' })
log('R4.20 remove btn count:', await rm.count())
if (await rm.count()) { await rm.click(); await sleep(1500) }
log('R4.20 draft after remove:', q(`select videos from close_case_drafts where case_id='${C.C5}'`))

// R4.21
api.length = 0
await pick(page, dlg, 'รูปถ่าย', F('R4-C5-photo.jpg'))
await pick(page, dlg, 'วิดีโอ', F('R4-C5-video.mp4'))
await pick(page, dlg, 'รูปสินค้ายืนยัน', F('R4-C5-product.png'))
log('R4.21 api:', api.map(a => a.slice(0, 160)))
await shot(page, 'R4', 'R4.21-c5-form', { fullPage: true })
const det = (await (await page.request.get(`${BASE}/api/field/cases/${C.C5}`)).json()).data
const d = det.draft
log('R4.21 draft via API:', JSON.stringify(d))
const body = { outcome: 'closed_success', photos: d.photos, videos: d.videos, productPhotos: d.productPhotos, audioUrl: null, note: null }
const [a, b] = await Promise.all([page.request.post(`${BASE}/api/field/cases/${C.C5}/close`, { data: body }), page.request.post(`${BASE}/api/field/cases/${C.C5}/close`, { data: body })])
log('R4.21 race A:', await fmt(a)); log('R4.21 race B:', await fmt(b))
await page.goto(`${BASE}/field/tracking`); await settle(page); await sleep(900)
log('R4.21 tracking after:', await mainText(page, 400))
await page.goto(`${BASE}/field/closed`); await settle(page); await sleep(900)
log('R4.21 closed:', await mainText(page, 500))
await shot(page, 'R4', 'R4.21-c5-closed')
log(q(SQL.ev).split('\n').filter(l => l.includes('005') || l.includes('case_ref')).join('\n'))
log(q(SQL.ex).split('\n').filter(l => l.includes('005') || l.includes('case_ref')).join('\n'))
log(q(SQL.as)); log(q(SQL.dr))

// R4.22
await page.goto(`${BASE}/field/expenses`); await settle(page); await sleep(1000)
log('R4.22 expenses:', await mainText(page, 900))
await shot(page, 'R4', 'R4.22-out1-expenses', { fullPage: true })
await page.goto(`${BASE}/field/income`); await settle(page); await sleep(1000)
log('R4.22 income:', await mainText(page, 900))
await shot(page, 'R4', 'R4.22-out1-income', { fullPage: true })
log('failed', failed, 'console', consoleErrors, 'server', serverErrors)
await browser.close()
