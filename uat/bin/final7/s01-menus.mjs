// ชุด 1 — ทุก role × ทุกเมนู/แท็บย่อยที่เห็น
import { openAs, shot, checkPage, log, slug, BASE } from './_h.mjs'
const users = process.argv.slice(2)
const MOBILE = new Set(['uat.agent.in1', 'uat.agent.in2', 'uat.agent.out1', 'uat.agent.out2', 'uat.co1.mgr', 'uat.co1.sup', 'uat.co2.admin'])
for (const u of users) {
  const mobile = process.env.MOBILE === '1' && MOBILE.has(u)
  const tag = mobile ? 'm' : 'd'
  const s = await openAs(u, { fresh: !!process.env.FRESH, mobile })
  const { page } = s
  if (mobile) await page.setViewportSize({ width: 375, height: 812 })
  await page.waitForLoadState('networkidle').catch(() => {})
  const land = new URL(page.url()).pathname
  const hrefs = async () => [...new Set(await page.locator('nav a[href^="/"], aside a[href^="/"], header a[href^="/"]').evaluateAll(as => as.map(a => a.getAttribute('href'))))]
  const top = (await hrefs()).filter(h => !h.startsWith('/api') && !h.startsWith('/auth'))
  log('s01', `## ${u} [${tag}] landed=${land} menu=${top.join(' ')}`)
  const seen = new Set()
  const queue = [...top]
  let n = 0
  while (queue.length && n < 80) {
    const href = queue.shift()
    if (seen.has(href)) continue
    seen.add(href); n++
    const before = s.consoleErrors.length, sb = s.serverErrors.length
    const resp = await page.goto(BASE + href).catch(e => ({ status: () => 'NAV:' + e.message.slice(0, 60) }))
    const r = await checkPage(page)
    const final = new URL(page.url()).pathname + new URL(page.url()).search
    const f = await shot(page, `final/s01-${u}`, `${tag}-${slug(href)}`)
    const ce = s.consoleErrors.slice(before), se = s.serverErrors.slice(sb)
    const ok = !r.issues.length && !ce.length && !se.length && (resp?.status?.() ?? 200) < 400
    log('s01', `${ok ? 'OK ' : 'BAD'} ${u} ${href}${final !== href ? ' →' + final : ''} st=${resp?.status?.()} len=${r.textLen} ${r.issues.join(' ; ')} ${ce.length ? 'CONSOLE:' + ce.slice(0, 2).join(' | ').slice(0, 300) : ''} ${se.length ? '5XX:' + se.join(',') : ''} ${f}`)
    // แท็บย่อย (ลิงก์) + role=tab (ปุ่ม)
    const sub = [...new Set(await page.locator('nav[aria-label="แท็บย่อย"] a[href^="/"], [role=tablist] a[href^="/"], main a[href^="/reports/"], main a[href^="/settings/"]').evaluateAll(as => as.map(a => a.getAttribute('href'))))]
    for (const h of sub) if (!seen.has(h) && !queue.includes(h)) queue.push(h)
    const tabs = page.locator('[role=tab]:not(a), [aria-label^="แท็บ"] button')
    const tc = await tabs.count()
    for (let i = 0; i < tc && i < 20; i++) {
      const name = (await tabs.nth(i).innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 30)
      const b2 = s.consoleErrors.length, s2 = s.serverErrors.length
      await tabs.nth(i).click({ timeout: 5000 }).catch(() => {})
      const r2 = await checkPage(page)
      const ce2 = s.consoleErrors.slice(b2), se2 = s.serverErrors.slice(s2)
      const ok2 = !r2.issues.length && !ce2.length && !se2.length
      if (!ok2 || i < 15) {
        const f2 = ok2 ? '' : await shot(page, `final/s01-${u}`, `${tag}-${slug(href)}-tab${i}`)
        log('s01', `  ${ok2 ? 'ok ' : 'BAD'} tab[${i}] ${name} ${r2.issues.join(' ; ')} ${ce2.length ? 'CONSOLE:' + ce2.slice(0, 2).join(' | ').slice(0, 300) : ''} ${se2.length ? '5XX:' + se2.join(',') : ''} ${f2}`)
      }
    }
  }
  await s.browser.close()
}
