// Q1 บน staging (ผู้ใช้อนุญาต 16/10/2569): agent เคลียร์ ADV-2569-0005 แบบไม่มีใบเสร็จ → finance ตรวจปุ่ม "ตรวจแล้ว" + server ปฏิเสธ
import { mkdirSync, writeFileSync } from 'node:fs'
import { openAs, BASE } from '../lib.mjs'
const OUT = process.env.SHOT_DIR
mkdirSync(OUT, { recursive: true })
const ADV = 'f063c417-46e9-4a47-bcbe-1efca7270d30'
const out = []
{
  const s = await openAs('uat.agent.out1', { mobile: true })
  const r = await s.page.request.patch(`${BASE}/api/advances/${ADV}/settle`, {
    data: {
      usedSatang: 40000,
      receiptFileUrl: null,
      note: 'ตรวจซ้ำ staging Q1 — เคลียร์แบบไม่มีใบเสร็จ',
      returnMethod: 'payout_offset',
      substituteReceipt: { lines: [{ lineDate: '2026-10-16', description: 'ค่ารถจักรยานยนต์รับจ้างไป-กลับจุดติดตาม', amountSatang: 40000, note: null }] },
    },
  })
  const b = await r.json()
  out.push({ step: 'settle', status: r.status(), advStatus: b.data?.status, crt: b.data?.substituteReceipt ?? null, error: b.error ?? null })
  await s.browser.close()
}
{
  const s = await openAs('uat.finance')
  const page = s.page
  await page.goto(`${BASE}/finance?tab=advances`)
  await page.waitForTimeout(3000)
  const row = page.locator('tr', { hasText: 'ADV-2569-0005' })
  const btn = row.getByRole('button', { name: 'ตรวจแล้ว', exact: true })
  const visible = await btn.isVisible().catch(() => false)
  out.push({ step: 'ui-button', visible, disabled: visible ? await btn.isDisabled() : null, title: visible ? await btn.getAttribute('title') : null, rowText: (await row.first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400) })
  await row.first().scrollIntoViewIfNeeded().catch(() => {})
  await page.screenshot({ path: `${OUT}/q1-advance-row.png` })
  // server ต้องปฏิเสธ (ไม่ประทับตรวจ)
  const r = await page.request.patch(`${BASE}/api/advances/${ADV}/clear-review`, { data: { note: null } })
  const b = await r.json()
  out.push({ step: 'api-clear-review', status: r.status(), code: b.error?.code ?? null, message: b.error?.message ?? null })
  const after = await page.request.get(`${BASE}/api/advances?pageSize=100`)
  const a = ((await after.json()).data ?? []).find((x) => x.id === ADV)
  out.push({ step: 'after', status: a?.status, clearReviewedAt: a?.clearReviewedAt ?? null, crt: a?.substituteReceipt?.receiptNumber, crtStatus: a?.substituteReceipt?.status })
  out.push({ step: 'errors', console: s.consoleErrors.slice(0, 5), server: s.serverErrors })
  await s.browser.close()
}
writeFileSync(`${OUT}/q1-results.json`, JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
