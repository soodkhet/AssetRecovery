// เมาส์รูปมือบนสิ่งที่กดได้ (อ่านอย่างเดียว) — นับ cursor ของปุ่ม/แท็บ/ลิงก์/select/checkbox ที่มองเห็นหลายหน้า
import { openAs, BASE } from '../lib.mjs'
const PLAN = [['uat.finance', false, ['/dashboard', '/finance?tab=approval', '/finance?tab=advances']], ['uat.admin', false, ['/settings/companies', '/settings/users']], ['uat.agent.out1', true, ['/field', '/field/advances']]]
const out = []
for (const [persona, mobile, paths] of PLAN) {
  const s = await openAs(persona, { mobile })
  await s.context.route('**/api/**', (r) => (r.request().method() === 'GET' ? r.continue() : r.abort()))
  for (const path of paths) {
    await s.page.goto(`${BASE}${path}`); await s.page.waitForLoadState('networkidle').catch(() => {}); await s.page.waitForTimeout(800)
    out.push({ persona, path, ...(await s.page.evaluate(() => {
      const sel = 'button, [role=button], [role=tab], a[href], select, input[type=checkbox], input[type=radio], tr[tabindex]'
      const els = [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length > 0)
      const bad = []
      let ok = 0, dis = 0
      for (const e of els) {
        const c = getComputedStyle(e).cursor
        const disabled = e.disabled === true || e.getAttribute('aria-disabled') === 'true'
        if (disabled) { if (c === 'not-allowed') dis++; else bad.push(`disabled ${e.tagName} "${e.textContent.trim().slice(0, 20)}" cursor=${c}`) }
        else if (c === 'pointer') ok++
        else bad.push(`${e.tagName}${e.getAttribute('role') ? '[' + e.getAttribute('role') + ']' : ''} "${e.textContent.trim().slice(0, 20)}" cursor=${c}`)
      }
      return { total: els.length, pointer: ok, disabledNotAllowed: dis, bad: bad.slice(0, 6), badCount: bad.length }
    })) })
  }
  await s.browser.close()
}
console.log(JSON.stringify(out, null, 1))
