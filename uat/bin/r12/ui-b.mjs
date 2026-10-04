// R12.06 รายละเอียด/กรอง/ค้น · R12.10 PDF · R12.11 ล็อต+ใบเซ็นรับ · R12.12 รูป (หน้าจอ)
import { chromium } from '@playwright/test'
import { shot, BASE } from '../lib.mjs'
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
const R = 'R12', out = {}, DL = 'uat/fixtures/downloads-R12'
mkdirSync(DL, { recursive: true })
async function open(u) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', storageState: `uat/.auth/${u}.json`, acceptDownloads: true })
  const page = await context.newPage(); const errs = []
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) }); page.on('pageerror', e => errs.push('pageerror ' + e.message))
  page.on('response', r => { if (r.status() >= 500) errs.push(`${r.status()} ${r.url()}`) })
  return { browser, page, errs }
}
const settle = async p => { await p.waitForLoadState('networkidle'); await p.waitForTimeout(800) }
const body = async p => (await p.locator('body').innerText()).replace(/\s+/g, ' ')
async function save(dl, prefix) { const f = `${DL}/${prefix}-${dl.suggestedFilename()}`; await dl.saveAs(f); const b = readFileSync(f); return { f, size: b.length, head: b.subarray(0, 8).toString('latin1').replace(/[^\x20-\x7e]/g, '.') } }
{ // ผู้จัดการ
  const { browser, page: p, errs } = await open('uat.co1.mgr')
  await p.goto(BASE + '/portal/cases'); await settle(p)
  await p.getByLabel('กรองตามสถานะ').selectOption({ label: 'ติดตามสำเร็จ' }); await settle(p)
  out.filterRecovered = (await body(p)).match(/ทั้งหมด \d+ รายการ/)?.[0]
  await p.getByLabel('กรองตามสถานะ').selectOption({ index: 0 }); await settle(p)
  await p.getByLabel('ค้นหาเลขที่สัญญาหรือชื่อลูกหนี้').fill('UAT-CO2'); await p.keyboard.press('Enter'); await settle(p)
  out.searchCO2 = (await body(p)).slice(300, 700); await shot(p, R, '06c-search-co2-empty')
  await p.getByLabel('ค้นหาเลขที่สัญญาหรือชื่อลูกหนี้').fill(''); await p.keyboard.press('Enter'); await settle(p)
  await p.getByRole('row', { name: /UAT-CO1-001/ }).getByText('ดูรายละเอียด').click(); await settle(p)
  const dlg = p.getByRole('dialog').first()
  out.caseDetail = (await dlg.innerText()).replace(/\s+/g, ' ').slice(0, 1500)
  await shot(p, R, '06b-case-detail')
  const thumb = p.getByLabel(/เปิดรูปที่ 1 จาก/).first()
  if (await thumb.count()) { await thumb.click(); await settle(p); await shot(p, R, '12-photo-viewer'); await p.keyboard.press('Escape') }
  out.imgLoaded = await p.evaluate(() => [...document.images].filter(i => i.src.includes('/api/portal/assets/')).map(i => ({ ok: i.complete && i.naturalWidth > 0, src: i.src.replace(location.origin, '') })).slice(0, 10))
  await p.keyboard.press('Escape')
  // ใบกำกับ PDF
  await p.goto(BASE + '/portal/tax-invoices'); await settle(p)
  const [d1] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.getByLabel(/ดาวน์โหลด PDF ใบกำกับภาษี INV-0001/).locator('visible=true').first().click()])
  out.pdf = await save(d1, 'mgr'); await shot(p, R, '10-tax-pdf-downloaded')
  // ล็อต
  await p.goto(BASE + '/portal/handover'); await settle(p)
  await p.getByText('LOT-2569-003').first().click(); await settle(p)
  out.lotDetail = (await body(p)).slice(0, 2000); await shot(p, R, '11b-lot-detail', { fullPage: true })
  out.lotImgs = await p.evaluate(() => [...document.images].filter(i => i.src.includes('/api/portal/assets/')).map(i => i.complete && i.naturalWidth > 0))
  out.mgrErrs = errs; await browser.close()
}
{ // หัวหน้า: ใบเซ็นรับ
  const { browser, page: p, errs } = await open('uat.co1.sup')
  await p.goto(BASE + '/portal/handover'); await settle(p)
  const [d2] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.getByRole('button', { name: /ดาวน์โหลดใบเซ็นรับ/ }).locator('visible=true').first().click()])
  out.signed = await save(d2, 'sup'); await shot(p, R, '11c-signed-doc-downloaded')
  out.supErrs = errs; await browser.close()
}
{ // แอดมิน CO2: รายละเอียดเคสสำเร็จ + รูป
  const { browser, page: p, errs } = await open('uat.co2.admin')
  await p.goto(BASE + '/portal/cases'); await settle(p)
  await p.getByRole('row', { name: /UAT-CO2-005/ }).getByText('ดูรายละเอียด').click(); await settle(p)
  out.co2Detail = (await p.getByRole('dialog').first().innerText()).replace(/\s+/g, ' ').slice(0, 1200)
  out.co2Imgs = await p.evaluate(() => [...document.images].filter(i => i.src.includes('/api/portal/assets/')).map(i => i.complete && i.naturalWidth > 0))
  await shot(p, R, '12b-admin-case-photo')
  out.adminErrs = errs; await browser.close()
}
writeFileSync('uat/bin/r12/out/ui-b.json', JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1))
