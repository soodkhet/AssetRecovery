// Q1 ต่อ (ผู้ใช้อนุญาต 16/10/2569): agent อัปโหลดฉบับเซ็นของ CRT-2569-0012 ผ่านหน้าจอมือถือ → finance ปุ่ม "ตรวจแล้ว" ต้องกดได้ (ไม่กดจริง)
import { mkdirSync, writeFileSync } from 'node:fs'
import { openAs, BASE } from '../lib.mjs'
const OUT = process.env.SHOT_DIR
mkdirSync(OUT, { recursive: true })
const ADV = 'f063c417-46e9-4a47-bcbe-1efca7270d30'
const CRT = 'b88eece4-88ee-4941-88e5-fc2dfa3ed57d'
const out = []
{
  const s = await openAs('uat.agent.out1', { mobile: true })
  const page = s.page
  const pdf = await page.request.get(`${BASE}/api/substitute-receipts/${CRT}/pdf`)
  const bytes = await pdf.body()
  out.push({ step: 'download-crt-pdf', status: pdf.status(), sizeBytes: bytes.length, head: bytes.subarray(0, 5).toString() })
  writeFileSync(`${OUT}/CRT-2569-0012-signed.pdf`, bytes)
  await page.goto(`${BASE}/field/advances`)
  await page.waitForTimeout(2500)
  if (!(await page.getByText('ADV-2569-0005').first().isVisible().catch(() => false))) {
    await page.getByRole('tab', { name: /เงินทดรอง/ }).or(page.getByRole('button', { name: /เงินทดรอง/ })).first().click().catch(() => {})
    await page.waitForTimeout(2500)
  }
  const crtText = page.getByText('CRT-2569-0012').first()
  await crtText.waitFor({ timeout: 20000 })
  // ปุ่มอัปโหลดที่อยู่ใน panel เดียวกับเลข CRT นี้ (ancestor ที่ใกล้ที่สุดที่มีปุ่ม)
  const panel = crtText.locator('xpath=ancestor::*[.//button[contains(., "อัปโหลดฉบับเซ็นแล้ว")]][1]')
  const uploadBtn = panel.getByRole('button', { name: 'อัปโหลดฉบับเซ็นแล้ว' })
  out.push({ step: 'agent-card', url: page.url(), uploadButtons: await uploadBtn.count() })
  const resp = page.waitForResponse((r) => r.url().includes(`/api/substitute-receipts/${CRT}/signed`), { timeout: 60000 })
  out.push({ step: 'file-inputs-in-panel', count: await panel.locator('input[type="file"]').count() })
  await panel.locator('input[type="file"]').first().setInputFiles({ name: 'CRT-2569-0012-signed.pdf', mimeType: 'application/pdf', buffer: bytes })
  const r = await resp
  const b = await r.json().catch(() => ({}))
  out.push({ step: 'attach-signed', status: r.status(), crtStatus: b.data?.status ?? null, error: b.error ?? null })
  const card = panel
  await page.waitForTimeout(1500)
  await card.scrollIntoViewIfNeeded().catch(() => {})
  await page.screenshot({ path: `${OUT}/q1-agent-signed.png` })
  out.push({ step: 'agent-errors', console: s.consoleErrors.slice(0, 5), server: s.serverErrors })
  await s.browser.close()
}
{
  const s = await openAs('uat.finance')
  const page = s.page
  await page.goto(`${BASE}/finance?tab=advances`)
  await page.waitForTimeout(3000)
  const row = page.locator('tr', { hasText: 'ADV-2569-0005' })
  const btn = row.getByRole('button', { name: 'ตรวจแล้ว', exact: true })
  out.push({ step: 'ui-button', visible: await btn.isVisible(), disabled: await btn.isDisabled(), title: await btn.getAttribute('title'), rowText: (await row.first().innerText()).replace(/\s+/g, ' ').slice(0, 300) })
  await row.first().scrollIntoViewIfNeeded().catch(() => {})
  await page.screenshot({ path: `${OUT}/q1-finance-after-signed.png` })
  const a = ((await (await page.request.get(`${BASE}/api/advances?pageSize=100`)).json()).data ?? []).find((x) => x.id === ADV)
  out.push({ step: 'after', status: a?.status, clearReviewedAt: a?.clearReviewedAt ?? null, crtStatus: a?.substituteReceipt?.status, receiptFileUrl: a?.receiptFileUrl !== null })
  out.push({ step: 'finance-errors', console: s.consoleErrors.slice(0, 5), server: s.serverErrors })
  await s.browser.close()
}
writeFileSync(`${OUT}/q1-signed-results.json`, JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
