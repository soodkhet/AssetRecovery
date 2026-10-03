// R5.20/21 (เสริม) 403 ที่ console ของผู้ใช้บริษัท + ลิงก์ Export ของการเงิน/บัญชี/บริหาร
import { openAs, BASE, settle, sleep, log, R, shot, LOT1 } from './_h.mjs'
for (const u of ['uat.co1.mgr', 'uat.finance', 'uat.account', 'uat.exec']) {
  const s = await openAs(u); const p = s.page; const f = []
  p.on('response', r => { if (r.status() === 403) f.push(new URL(r.url()).pathname + new URL(r.url()).search) })
  await p.goto(`${BASE}/warehouse`); await settle(p); await sleep(1000)
  await p.getByRole('tab', { name: /^ส่งมอบแล้ว/ }).click(); await sleep(800)
  const card = p.locator('div', { hasText: 'LOT-2569-001' }).filter({ has: p.getByRole('button', { name: 'ดูรายการ' }) }).last()
  await card.getByRole('button', { name: 'ดูรายการ' }).click(); await sleep(1200)
  const links = (await p.locator('main a, main button').allInnerTexts()).map(x => x.trim()).filter(x => /Excel|PDF|เอกสาร|ยืนยัน/.test(x))
  const pdf = await p.request.get(`${BASE}/api/handover-lots/${LOT1}/pdf`)
  const sel = await p.getByRole('combobox', { name: 'กรองตามบริษัทไฟแนนซ์' }).locator('option').allInnerTexts().catch(() => [])
  log(`R5.2x ${u}: detail links=${JSON.stringify(links)} pdf=${pdf.status()} 403s=${JSON.stringify([...new Set(f)])} companySelect=${JSON.stringify(sel)}`)
  if (u === 'uat.finance') await shot(p, R, 'R5.21-finance-lot1-detail')
  await s.browser.close()
}
