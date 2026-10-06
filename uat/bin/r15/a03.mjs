// R15a.03 สร้างไฟล์โลโก้ตัวอย่าง (PNG) แล้วอัปโหลดผ่านหน้า ข้อมูลองค์กร
import { chromium } from '@playwright/test'
import { openAs, shot, log, settle, sleep, R, BASE, toasts, trackMutations, q, mainText } from './_h.mjs'
const LOGO = 'uat/fixtures/files/R15-logo-sample.png'
{ const b = await chromium.launch({ channel: 'chrome' }); const p = await b.newPage({ viewport: { width: 400, height: 400 } })
  await p.setContent(`<div style="width:400px;height:400px;background:#0f766e;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font:bold 64px sans-serif">AR<div style="font-size:28px">UAT SAMPLE</div></div>`)
  await p.screenshot({ path: LOGO }); await b.close() }
const { browser, page, serverErrors, consoleErrors } = await openAs('admin')
const m = trackMutations(page)
await page.goto(`${BASE}/settings/organization`); await settle(page); await sleep(800)
await page.getByRole('button', { name: 'อัปโหลดโลโก้' }).click()
const dlg = page.getByRole('dialog').last(); await dlg.waitFor()
await dlg.getByLabel('ไฟล์โลโก้').setInputFiles(LOGO)
await dlg.locator('#org-logo-reason').fill('UAT R15a โลโก้ตัวอย่าง — ลบก่อนใช้งานจริง')
await shot(page, R, '03-logo-modal')
await dlg.getByRole('button', { name: 'บันทึกโลโก้' }).click()
log('toasts', await toasts(page, 4000), m.res.splice(0))
await settle(page); await sleep(1500)
log('img', await page.locator('img[alt="โลโก้บริษัท"]').count(), 'main', await mainText(page, 400))
await shot(page, R, '03-logo-saved', { fullPage: true })
log(q(`select logo_url from organizations`))
log(q(`select action,target_type,reason,left(after_data::text,200) a,created_at from audit_logs where target_type ilike '%organi%' order by created_at desc limit 2`))
log('5xx', serverErrors, 'console', consoleErrors.slice(0, 3))
await browser.close()
