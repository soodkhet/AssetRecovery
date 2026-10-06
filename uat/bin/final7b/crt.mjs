// U143 — out2 อัปโหลดใบรับรองแทนใบเสร็จฉบับเซ็น CRT-2569-0004 (มือถือ)
import { openAs, shot, log, q, collect, trackApi, U, clean } from './_h.mjs'
const s = await openAs('uat.agent.out2', { mobile: true }); const { page } = s; await page.setViewportSize({ width: 375, height: 812 }); const api = trackApi(page)
await page.goto(U + '/field/advances'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200)
const box = page.locator('div', { hasText: 'CRT-2569-0004' }).filter({ hasText: 'อัปโหลดฉบับเซ็นแล้ว' }).last()
await box.locator('input[type=file]').first().setInputFiles('uat/fixtures/files/R5-LOT-CO1-signed-v1.pdf')
log('crt', 'upload', await collect(page, 6000), api.splice(0).filter(x => !x.includes('storage/v1')).map(x => x.slice(0, 250)))
await page.waitForTimeout(800); const t = clean(await page.locator('main').innerText()); log('crt', 'after', t.match(/CRT-2569-0004.{0,200}/)?.[0])
await shot(page, 'crt-after', { fullPage: true }); log('crt', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
