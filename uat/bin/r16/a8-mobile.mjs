import { chromium, devices } from '@playwright/test'
import { BASE, settle, log, shot, step, sleep, A } from './_a.mjs'
import { applyBypass } from '../lib.mjs'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'th-TH', timezoneId: 'Asia/Bangkok', storageState: 'uat/.auth-staging/superadmin.json' })
await applyBypass(ctx)
const p = await ctx.newPage(); const err5 = []
p.on('response', r => { if (r.status() >= 500) err5.push(`${r.status()} ${r.url()}`) })
const pages = ['/settings/roles', '/settings/users', '/settings/organization', '/settings/compensation', '/settings/service-fee', '/settings/teams', '/settings/companies', '/settings/device-catalog', '/settings/finance', '/settings/audit-logs', '/settings/jobs']
const out = []
try {
  for (const path of pages) {
    await p.goto(`${BASE}${path}`); await settle(p, 1500)
    const m = await p.evaluate(() => { const d = document.documentElement; const wide = [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.right > window.innerWidth + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('[class*=overflow-x-auto], [class*=overflow-auto], table') }).slice(0, 3).map(e => `${e.tagName}.${(e.className?.toString() || '').slice(0, 40)}`); return { sw: d.scrollWidth, cw: d.clientWidth, wide } })
    const n = path.split('/').pop(); await shot(p, `A8-mobile-${n}`)
    out.push(`${path} ${m.sw}/${m.cw}${m.wide.length ? ' ล้น:' + m.wide.join(',') : ''}`)
  }
  // finance tab select on mobile + roles dialog
  await p.goto(`${BASE}/settings/finance`); await settle(p, 1500)
  const sel = p.locator('#finance-settings-tab-select'); const vis = await sel.isVisible(); const nopt = await sel.locator('option').count()
  await sel.selectOption({ label: 'สิทธิ์บัญชี/การเงิน' }); await settle(p, 1000)
  const m2 = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  await shot(p, 'A8-mobile-finance-perm')
  await p.goto(`${BASE}/settings/roles`); await settle(p, 1500)
  await p.getByRole('button', { name: 'กำหนดสิทธิ์' }).nth(1).click(); await settle(p, 1200)
  const dw = await p.getByRole('dialog').last().evaluate(e => Math.round(e.getBoundingClientRect().width))
  const m3 = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  await shot(p, 'A8-mobile-perm-dialog')
  step({ step: 'A8.mobile', action: 'มือถือ 390px: หน้าตั้งค่า 11 หน้า + ตั้งค่าการเงินเลือกหมวดจาก dropdown + หน้าต่างกำหนดสิทธิ์', expected: 'scrollWidth = clientWidth = 390 ทุกหน้า', actual: `${out.join(' · ')} · dropdown หมวด visible=${vis} ${nopt} หมวด → สิทธิ์บัญชี/การเงิน ${m2.join('/')} · หน้าต่างกำหนดสิทธิ์กว้าง ${dw}px หน้า ${m3.join('/')} · 5xx ${err5.length}`, status: out.every(x => / 390\/390$/.test(x)) && m2[0] === 390 && m3[0] === 390 ? 'pass' : 'fail', evidence: ['A8-mobile-finance.png', 'A8-mobile-companies.png', 'A8-mobile-perm-dialog.png'] })
} finally { await browser.close() }
