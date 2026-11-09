// ฟอนต์ที่วาดจริงของข้อความแต่ละชนิดในตารางรายการเบิก (อ่านอย่างเดียว) — UAT_TARGET=staging ได้
import { mkdirSync } from 'node:fs'
import { openAs, BASE } from '../lib.mjs'
const OUT = process.env.SHOT_DIR; mkdirSync(OUT, { recursive: true })
const s = await openAs('uat.finance')
await s.context.route('**/api/**', (r) => (r.request().method() === 'GET' ? r.continue() : r.abort()))
await s.page.goto(`${BASE}/finance?tab=approval`); await s.page.waitForLoadState('networkidle').catch(() => {}); await s.page.waitForTimeout(1500)
const cdp = await s.context.newCDPSession(s.page); await cdp.send('DOM.enable'); await cdp.send('CSS.enable')
const probes = [
  ['ไทยปกติ', (e) => /^[฀-๿\s]{4,}$/.test(e.textContent.trim()) && !e.closest('.font-mono')],
  ['อังกฤษ', (e) => /Claims|Approval Matrix|Gross/.test(e.textContent) && !e.closest('.font-mono')],
  ['เลขอ้างอิง (mono)', (e) => e.closest('.font-mono') && /^[A-Z0-9-]{6,}$/.test(e.textContent.trim())],
  ['ไทยในช่อง mono', (e) => e.closest('.font-mono') && /ไม่ผูกเคส/.test(e.textContent)],
  ['ยอดเงิน', (e) => /^฿[\d,]+\.\d\d$/.test(e.textContent.trim())],
]
const out = []
for (const [i, [label]] of probes.entries()) {
  const found = await s.page.evaluate(({ i, src }) => {
    const fn = eval(src)
    const el = [...document.querySelectorAll('body *')].find((e) => e.children.length === 0 && e.getClientRects().length > 0 && fn(e))
    if (!el) return null
    el.setAttribute('data-probe', String(i)); return el.textContent.trim().slice(0, 40)
  }, { i, src: probes[i][1].toString() })
  let fonts = []
  if (found) {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-probe="${i}"]` })
    fonts = (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts.map((f) => `${f.familyName}(${f.glyphCount})`)
  }
  out.push({ label, sample: found, fonts: fonts.join(' + ') })
}
await s.page.screenshot({ path: `${OUT}/claims.png` })
console.log(JSON.stringify({ base: BASE, out, console: s.consoleErrors.slice(0, 3) }, null, 1))
await s.browser.close()
