// Flow 4 — in1 มือถือ 375×812: รับงาน → จัดวัน (วันนี้) → เริ่มงาน → เช็คอิน → ปิดงานสำเร็จ (รูป/วิดีโอ/รูปสินค้า → Storage)
import { openAs, shot as shot0, log, q, collect, trackApi } from '../final7b/_h.mjs'

import { card, pick } from '../r4v3/_h.mjs'
const shot = (p, _r, n, o) => shot0(p, n + '-' + process.argv[2], o)
const REF = process.argv[2], NAME = REF
const s = await openAs('uat.agent.in1', { mobile: true }); const { page, context } = s
await page.setViewportSize({ width: 375, height: 812 })
const api = trackApi(page)
const overflow = async () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
const go = async p => { await page.goto('http://localhost:3000' + p); await page.waitForLoadState('networkidle'); await page.waitForTimeout(800); log('field', p, 'overflowX=', await overflow()) }
await go('/field/pending')
await shot(page, 'final/flow', 'f04-m-pending'); log('field', 'card', (await card(page, NAME, 'รับงาน').innerText()).replace(/\s+/g, ' ').slice(0, 400))
await card(page, NAME, 'รับงาน').getByRole('button', { name: 'รับงาน', exact: true }).click()
log('field', 'accept', await collect(page, 3000), api.splice(0).map(x => x.slice(0, 120)))
await go('/field/accepted')
await card(page, NAME, 'จัดวันที่').getByRole('button', { name: 'จัดวันที่' }).click()
const cal = page.getByRole('dialog').last(); await cal.waitFor(); await page.waitForTimeout(500)
await shot(page, 'final/flow', 'f04-m-calendar')
await cal.locator('button:has(> span:text-is("7"))').first().click(); await page.waitForTimeout(400)
log('field', 'cal confirm text', (await cal.innerText()).replace(/\s+/g, ' ').slice(0, 200))
await page.getByRole('button', { name: 'ยืนยันเลือกวันนี้' }).click()
log('field', 'schedule', await collect(page, 3000), api.splice(0).map(x => x.slice(0, 120)))
await context.grantPermissions(['geolocation'], { origin: 'http://localhost:3000' })
await context.setGeolocation({ latitude: 13.8166, longitude: 100.5612, accuracy: 15 })
await go('/field/tracking')
await shot(page, 'final/flow', 'f04-m-tracking')
await card(page, NAME, 'เริ่มงาน').getByRole('button', { name: 'เริ่มงาน' }).click()
const dlg = page.getByRole('dialog').last(); await dlg.waitFor(); await page.waitForTimeout(1200)
const FAIL = process.env.OUTCOME === 'fail'
await dlg.getByRole('button', { name: FAIL ? 'ไม่สำเร็จ' : 'สำเร็จ', exact: true }).click(); await page.waitForTimeout(600)
// validation: ปิดงานโดยไม่มีอะไร
await dlg.getByRole('button', { name: 'ยืนยันปิดงาน' }).click(); await page.waitForTimeout(1000)
log('field', 'empty close msgs', (await dlg.getByText(/^ยังขาด/).allInnerTexts().catch(() => [])).join(' | '), await collect(page, 1200))
await shot(page, 'final/flow', 'f04-m-close-missing', { fullPage: true })
await dlg.getByRole('button', { name: /แตะเพื่อเช็คอินตำแหน่งปัจจุบัน/ }).click()
log('field', 'checkin', await collect(page, 3500))
await pick(page, dlg, 'รูปถ่าย', 'uat/fixtures/files/R4-C1-photo.jpg')
await pick(page, dlg, 'วิดีโอ', 'uat/fixtures/files/R4-C1-video.mp4')
if (!FAIL) await pick(page, dlg, 'รูปสินค้ายืนยัน', 'uat/fixtures/files/R4-C1-product.jpg')
else { const rg = dlg.getByRole('radiogroup', { name: 'เหตุผลที่ไม่สำเร็จ' }); log('field', 'fail reasons', (await rg.getByRole('radio').allInnerTexts()).join('|')); await rg.getByRole('radio').first().click(); await page.waitForTimeout(300); const ta = dlg.locator('textarea'); for (const t of await ta.all()) if (await t.isVisible()) await t.fill('ลูกหนี้ย้ายที่อยู่ ไม่พบตัว (ด่าน 7 รอบทวน)') }
await shot(page, 'final/flow', 'f04-m-close-form', { fullPage: true })
await dlg.getByRole('button', { name: 'ยืนยันปิดงาน' }).click()
log('field', 'close', await collect(page, 5000), api.splice(0).filter(x => !x.includes('/storage/')).map(x => x.slice(0, 160)))
await go('/field/closed'); await shot(page, 'final/flow', 'f04-m-closed')
await go('/field/income'); await shot(page, 'final/flow', 'f04-m-income')
log('field', q(`select c.status,a.status asg,(select count(*) from check_ins k where k.case_id=c.id) ci,(select string_agg(e.status||':'||cardinality(e.photos)||'/'||cardinality(e.videos)||'/'||cardinality(e.product_photos),',') from case_evidences e where e.case_id=c.id) ev,(select string_agg(x.expense_type||':'||x.gross_satang||':'||x.status,',') from expenses x where x.case_id=c.id) ex,(select string_agg(s.asset_status::text,',') from assets s where s.case_id=c.id) asset from cases c join case_assignments a on a.case_id=c.id where c.case_ref='${REF}'`))
log('field', 'storage paths', q(`select e.photos||e.videos||e.product_photos from case_evidences e join cases c on c.id=e.case_id where c.case_ref='${REF}'`))
log('field', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
