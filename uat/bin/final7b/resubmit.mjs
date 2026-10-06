// out1 มือถือ: แก้ไขหลักฐานปิดงาน FT-14 (ถูกตีกลับ) → อัปรูป/รูปสินค้าใหม่ → ส่งปิดงานใหม่ (resubmit_close)
import { openAs, shot, log, q, collect, trackApi, U, clean } from './_h.mjs'
import { pick } from '../r4v3/_h.mjs'
const REF = 'FINAL-FT-14'
const s = await openAs('uat.agent.out1', { mobile: true }); const { page } = s; await page.setViewportSize({ width: 375, height: 812 }); const api = trackApi(page)
log('rs', 'before', q(`select e.status::text, count(*) from expenses e join cases c on c.id=e.case_id where c.case_ref='${REF}' group by 1`).replace(/\n/g, ' ; '))
await page.goto(U + '/field/tracking'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200)
const card = page.locator('div', { hasText: REF }).filter({ has: page.getByRole('button', { name: 'แก้ไขหลักฐาน' }) }).last()
await card.getByRole('button', { name: 'แก้ไขหลักฐาน' }).click(); await page.waitForTimeout(1500)
const d = page.getByRole('dialog').last()
await pick(page, d, 'รูปถ่าย', 'uat/fixtures/files/R4-C1-photo.jpg')
await pick(page, d, 'รูปสินค้ายืนยัน', 'uat/fixtures/files/R4-C1-product.jpg')
const btns = (await d.getByRole('button').allInnerTexts()).map(x => x.trim()).filter(Boolean); log('rs', 'buttons', btns.slice(-6).join('|'))
await shot(page, 'rs-form', { fullPage: true })
await d.getByRole('button', { name: /ส่ง|ยืนยัน/ }).last().click(); await page.waitForTimeout(800)
const c = page.getByRole('dialog').last(); if ((await c.innerText()) !== (await d.innerText().catch(() => ''))) { log('rs', 'confirm', clean(await c.innerText()).slice(0, 300)); await c.getByRole('button', { name: /ยืนยัน|ส่ง/ }).last().click() }
log('rs', 'submit', await collect(page, 5000), api.splice(0).filter(x => !x.includes('storage/v1')).map(x => x.slice(0, 250)))
log('rs', 'after', q(`select e.expense_type||':'||e.status::text, e.gross_satang from expenses e join cases c on c.id=e.case_id where c.case_ref='${REF}' order by e.created_at`).replace(/\n/g, ' ; '))
log('rs', q(`select ev.status::text, ev.created_at from case_evidences ev join cases c on c.id=ev.case_id where c.case_ref='${REF}' order by ev.created_at`).replace(/\n/g, ' ; '))
log('rs', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
