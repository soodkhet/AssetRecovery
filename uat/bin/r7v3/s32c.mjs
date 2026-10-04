// R7.32 (ต่อ หลัง fixer O แก้ BUG-116) — เช็คแถบแดง BUG-117 + Export Pack v1 + v2 (uat.account)
import { mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { openAs, shot, R, ID, log, q, q1, settle, sleep, waitToast, mainText, dlgText, BASE, auditSince } from './_h.mjs'
log('=== R7.32c', new Date().toISOString())
const T = q1('select now()'); log('T', T)
const DL = 'uat/fixtures/downloads-R7cv3'; mkdirSync(DL, { recursive: true })
const s = await openAs('uat.account'); const p = s.page
const uiDl = []
p.on('download', async d => { const f = `${DL}/ui-${Date.now()}-${d.suggestedFilename()}`; await d.saveAs(f).catch(e => log('dl err', String(e))); uiDl.push(f); log('UI download', d.suggestedFilename(), f) })
s.context.on('page', async np => { await sleep(1500); log('popup', np.url()); await np.close().catch(() => {}) })

// BUG-117: แถบแดงข้อยกเว้นในแท็บรอบส่งบัญชี
await p.goto(`${BASE}/accounting?tab=closing`); await settle(p); await sleep(1200)
log('32 closing', await mainText(p, 1600))
await shot(p, R, '32f-closing-no-stale-critical', { fullPage: true })

await p.goto(`${BASE}/accounting?tab=export`); await settle(p); await sleep(1000)
log('32 export tab', await mainText(p, 1200))
const recs = []
for (const [i, note] of [[1, 'UAT R7 ชุดแรก'], [2, 'UAT R7 ชุดที่ 2 หลังตรวจทาน']]) {
  await p.locator('main').getByRole('button', { name: 'สร้างชุดเอกสารใหม่' }).click(); await sleep(800)
  const d = p.locator('[role="dialog"]').last()
  const sel = d.locator('select').first()
  if (!(await sel.inputValue())) await sel.selectOption(ID.PERIOD)
  await sleep(500)
  await d.locator('textarea').fill(note)
  log(`32 v${i} dlg`, await dlgText(p, 1400))
  await shot(p, R, `32${i === 1 ? 'g' : 'i'}-export-modal-v${i}`)
  const rp = p.waitForResponse(r => r.url().includes('/api/accounting/export-pack') && r.request().method() === 'POST', { timeout: 90000 })
  await d.getByRole('button', { name: 'ดาวน์โหลดไฟล์ (.zip)' }).click()
  const resp = await rp; let j = {}; try { j = await resp.json() } catch { j = { raw: (await resp.text()).slice(0, 300) } }
  log(`32 v${i} resp`, resp.status(), JSON.stringify(j).slice(0, 900))
  recs.push(j.data)
  log(`32 v${i} toast`, await waitToast(p)); await sleep(3000); await settle(p)
  await shot(p, R, `32${i === 1 ? 'h' : 'j'}-export-history-v${i}`, { fullPage: true })
  if (resp.status() >= 500) { log('!!! STOP 5xx'); break }
}
log('32 history', await mainText(p, 2400))
for (const r of recs) {
  if (!r?.id) continue
  const res = await p.request.get(`${BASE}/api/accounting/export-history/${r.id}/download`)
  const b = await res.body(); const f = `${DL}/export-pack-v${r.version}.zip`; writeFileSync(f, b)
  log('32 dl', r.version, res.status(), res.headers()['content-type'], res.headers()['content-disposition'], 'x-sha', res.headers()['x-pack-sha256'], b.length, 'sha256', createHash('sha256').update(b).digest('hex'), f)
}
log('32 uiDl', uiDl)
log('32 sql', q('select id, version, status, file_hash, file_urls, generated_at, sent_at from export_records order by version'))
log('32 audit', q(auditSince(T)))
log('errs', s.consoleErrors.slice(0, 6), s.serverErrors)
await s.browser.close()
