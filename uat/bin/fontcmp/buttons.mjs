// ปุ่มบรรทัดเดียว (อ่านอย่างเดียว): ปุ่มที่ข้อความล้นกรอบ / หน้าที่ล้นจอแนวนอน / ปุ่มที่สูงเกินบรรทัดเดียว
import { mkdirSync } from 'node:fs'
import { openAs, BASE } from '../lib.mjs'
const OUT = process.env.SHOT_DIR; mkdirSync(OUT, { recursive: true })
const PLAN = [
  [process.env.UAT_TARGET === 'staging' ? 'superadmin' : 'admin', false, ['/settings/finance?tab=bankfile', '/settings/finance', '/settings/companies', '/settings/users', '/settings/roles', '/settings/teams', '/settings/organization']],
  ['uat.finance', false, ['/dashboard', '/finance?tab=approval', '/finance?tab=advances', '/finance?tab=payout', '/finance?tab=revenue', '/finance?tab=comp', '/accounting']],
  ['uat.admin', false, ['/cases', '/warehouse']],
  ['uat.agent.out1', true, ['/field', '/field/advances', '/field/expenses']],
  ['uat.co1.mgr', true, ['/portal']],
]
const rows = []
for (const [persona, mobile, paths] of PLAN) {
  let s
  try { s = await openAs(persona, { mobile }) } catch (e) { rows.push({ persona, error: e.message.slice(0, 80) }); continue }
  await s.context.route('**/api/**', (r) => (r.request().method() === 'GET' ? r.continue() : r.abort()))
  for (const path of paths) {
    await s.page.goto(`${BASE}${path}`); await s.page.waitForLoadState('networkidle').catch(() => {}); await s.page.waitForTimeout(800)
    const r = await s.page.evaluate(() => {
      const btns = [...document.querySelectorAll('button, a[class*="rounded-lg"][class*="font-semibold"]')].filter((e) => e.getClientRects().length > 0 && e.textContent.trim() !== '')
      const multi = []; const overflow = []
      for (const b of btns) {
        const lh = parseFloat(getComputedStyle(b).lineHeight) || 16
        const range = document.createRange(); range.selectNodeContents(b)
        const lines = new Set([...range.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size
        const t = b.textContent.trim().replace(/\s+/g, ' ').slice(0, 30)
        if (lines > 1 && getComputedStyle(b).whiteSpace !== 'normal') multi.push(t)
        if (b.scrollWidth > b.clientWidth + 1) overflow.push(t)
      }
      return { buttons: btns.length, multiLine: multi.slice(0, 5), overflowText: overflow.slice(0, 5), pageOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth }
    })
    if (path.includes('bankfile')) await s.page.screenshot({ path: `${OUT}/bankfile.png` })
    rows.push({ persona, path, url: new URL(s.page.url()).pathname + new URL(s.page.url()).search, ...r })
  }
  await s.browser.close()
}
for (const r of rows) console.log(JSON.stringify(r))
