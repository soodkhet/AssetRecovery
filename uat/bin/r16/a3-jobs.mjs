import { openAs, BASE, settle, txt, shot, step } from './_a.mjs'
const s = await openAs('superadmin'); const p = s.page
try {
  await p.goto(`${BASE}/settings/jobs`); await settle(p, 2000)
  const t = await txt(p.locator('main table').last(), 1200)
  await shot(p, 'A3-jobs-list')
  const row = p.locator('main tbody tr').filter({ hasText: 'TAC' }).first()
  let det = ''
  if (await row.count()) { await row.click(); await settle(p, 1000); const d = p.getByRole('dialog').last(); if (await d.isVisible().catch(() => false)) { det = await txt(d, 1200); await shot(p, 'A3-jobs-detail') } }
  console.log(t, '\n---', det)
  step({ step: 'A3.job-times', action: 'หน้างานเบื้องหลัง: ดูงานอัปเดตฐาน TAC ที่สั่งจาก Model Phone (ใช้เวลา ~3 นาที)', expected: 'แสดงเวลาเริ่ม/เสร็จจริง (เสร็จ ≈ 23:35)', actual: `ตาราง: ${t.slice(0, 500)} · รายละเอียด: ${det.slice(0, 500)} · DB jobs.started_at = completed_at = 16:32:06.311Z`, status: 'fail', evidence: ['A3-jobs-list.png', 'A3-jobs-detail.png'], issue_id: 'A6-02' })
} finally { await s.browser.close() }
