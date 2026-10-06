// ชุด 2 — แดชบอร์ด/คิวต่อ role (เทียบ FINAL-coverage ส่วน G)
import { openAs, shot, checkPage, log } from './_h.mjs'
for (const u of process.argv.slice(2)) {
  const s = await openAs(u); const { page } = s
  const r = await page.request.get('http://localhost:3000/api/dashboard')
  let j = null; try { j = await r.json() } catch {}
  await page.goto('http://localhost:3000/dashboard'); const c = await checkPage(page)
  await shot(page, 'final/s02', `dash-${u}`, { fullPage: true })
  const w = (j?.data?.widgets ?? j?.widgets ?? j?.data ?? j)
  log('s02', `## ${u} api=${r.status()} issues=${c.issues.join(';')}`)
  log('s02', JSON.stringify(w).slice(0, 2500))
  await s.browser.close()
}
