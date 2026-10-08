// ตัวช่วยกลางของ UAT — ใช้ร่วมทุก role agent
import { chromium, devices } from '@playwright/test'
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export const STAGING_URL = 'https://asset-recovery-git-staging-prototype24.vercel.app'

/**
 * โหมด staging: `UAT_TARGET=staging` (หรือ UAT_BASE ที่ไม่ใช่ localhost)
 * - BASE = staging URL · session อยู่ `uat/.auth-staging/` (gitignored) · รหัสอยู่ `uat/personas-staging.json`
 * - **ห้าม login ผ่าน UI เอง** (Claude/subagent กรอกรหัสบนระบบที่ไม่ใช่ localhost ไม่ได้) — session มาจาก
 *   `uat/bin/staging-login.mjs` ที่ผู้ใช้รันเองเท่านั้น · ไม่มี session = error
 * - Vercel Deployment Protection: ปิดชั่วคราว หรือส่ง `VERCEL_AUTOMATION_BYPASS_SECRET` ทาง env (แนบ header ให้)
 */
export const BASE = process.env.UAT_BASE ?? (process.env.UAT_TARGET === 'staging' ? STAGING_URL : 'http://localhost:3000')
export const IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(BASE)
export const AUTH_DIR = IS_LOCAL ? 'uat/.auth' : 'uat/.auth-staging'

/**
 * แนบ header ข้าม Vercel Deployment Protection เฉพาะคำขอไป origin ของ BASE (ไม่ส่งไป Supabase/Google — กัน CORS + ไม่รั่ว)
 * ใช้เมื่อผู้ใช้ส่ง `VERCEL_AUTOMATION_BYPASS_SECRET` ทาง env เท่านั้น — ไม่พิมพ์ค่า
 */
export async function applyBypass(context) {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  if (!secret || IS_LOCAL) return
  const origin = new URL(BASE).origin
  await context.route(url => url.origin === origin, route =>
    route.continue({ headers: { ...route.request().headers(), 'x-vercel-protection-bypass': secret } }))
}

/** อ่านรหัสของ persona จาก uat/personas.json (ไม่ commit) — admin ใช้ dev alias */
export function credentials(username) {
  if (!IS_LOCAL) throw new Error(`โหมด staging: ห้าม login เอง — ให้ผู้ใช้รัน node uat/bin/staging-login.mjs (ไม่มี session ของ ${username})`)
  if (username === 'admin') return { username: 'admin', password: 'admin' }
  const all = JSON.parse(readFileSync('uat/personas.json', 'utf8'))
  const p = all[username]
  if (!p) throw new Error(`ไม่พบ persona ${username} ใน uat/personas.json`)
  return { username, password: p.password }
}

/**
 * เปิด browser context ของ role — ใช้ session ที่เก็บไว้ (uat/.auth/<username>.json) ถ้ามี ไม่งั้น login ใหม่ผ่าน UI
 * opts.mobile = true → จำลอง iPhone (หน้า Field Agent)
 */
export async function openAs(username, opts = {}) {
  const browser = await chromium.launch({ channel: 'chrome', headless: opts.headed ? false : true })
  const statePath = `${AUTH_DIR}/${username}.json`
  if (!IS_LOCAL && (opts.fresh || !existsSync(statePath))) {
    await browser.close()
    throw new Error(`โหมด staging: ไม่มี session ${statePath} — ให้ผู้ใช้รัน node uat/bin/staging-login.mjs ${username} (ห้าม login เอง)`)
  }
  const base = opts.mobile ? devices['iPhone 14'] : { viewport: { width: 1440, height: 900 } }
  const context = await browser.newContext({
    ...base,
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    storageState: existsSync(statePath) && !opts.fresh ? statePath : undefined,
  })
  await applyBypass(context)
  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message}`))
  const serverErrors = []
  page.on('response', r => { if (r.status() >= 500) serverErrors.push(`${r.status()} ${r.request().method()} ${r.url()}`) })

  await page.goto(`${BASE}/`)
  if (page.url().includes('vercel.com/login') || page.url().includes('vercel.com/sso')) {
    await browser.close()
    throw new Error('ติด Vercel Deployment Protection — ปิดชั่วคราว หรือส่ง VERCEL_AUTOMATION_BYPASS_SECRET')
  }
  if (new URL(page.url()).pathname.startsWith('/login') && !IS_LOCAL) {
    await browser.close()
    throw new Error(`โหมด staging: session ของ ${username} หมดอายุ/ใช้ไม่ได้ — ให้ผู้ใช้รัน node uat/bin/staging-login.mjs ${username} ใหม่`)
  }
  if (page.url().includes('/login')) {
    const { password } = credentials(username)
    await page.locator('#identifier').fill(username)
    await page.locator('#password').fill(password)
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
    await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20000 })
    mkdirSync(dirname(statePath), { recursive: true })
    await context.storageState({ path: statePath })
  }
  return { browser, context, page, consoleErrors, serverErrors }
}

/** ถ่ายภาพลง uat/shots/<round>/<name>.png แล้วคืน path สัมพัทธ์สำหรับใส่ในรายงาน */
export async function shot(page, round, name, opts = {}) {
  const path = `uat/shots/${round}/${name}.png`
  mkdirSync(dirname(path), { recursive: true })
  await page.screenshot({ path, fullPage: opts.fullPage ?? false })
  return `../shots/${round}/${name}.png`
}
