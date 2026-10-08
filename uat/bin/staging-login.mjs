// login persona บน staging ผ่านหน้า login จริง แล้วเก็บ session ลง uat/.auth-staging/<username>.json
// **ผู้ใช้รันเองเท่านั้น** (Claude/subagent ห้ามกรอกรหัสบนระบบที่ไม่ใช่ localhost)
//
//   node uat/bin/staging-login.mjs              → ทุก persona ใน uat/personas-staging.json
//   node uat/bin/staging-login.mjs uat.admin …  → เฉพาะที่ระบุ
//   node uat/bin/staging-login.mjs --manual superadmin
//        → เปิด Chrome ให้ผู้ใช้ login เอง (บัญชีที่ไม่ได้อยู่ใน personas-staging.json เช่น Superadmin) แล้วเก็บ session
//          ชื่อหลัง --manual = ชื่อไฟล์ session · สคริปต์ไม่เห็น/ไม่เก็บรหัส
//
// - must_change_password (บัญชีที่ seed-final สร้าง) → ระบบพาไปหน้าเปลี่ยนรหัส: สุ่มรหัสใหม่ เขียนกลับ personas-staging.json
//   **ก่อน** กดบันทึก (ถ้าล้มกลางทาง ไฟล์มีทั้งรหัสเดิม/ใหม่ — previousPassword) แล้วเก็บ session ที่ได้
// - ไม่พิมพ์รหัสออกจอ · บัญชีที่ระงับ/ลบ (temp1/temp2) login ไม่ได้ตามตั้งใจ → ข้าม
// - Vercel Deployment Protection: ปิดชั่วคราว หรือ export VERCEL_AUTOMATION_BYPASS_SECRET ก่อนรัน
import { chromium } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { STAGING_URL, applyBypass } from './lib.mjs'

const BASE = process.env.UAT_BASE ?? STAGING_URL
if (/localhost|127\.0\.0\.1/.test(BASE)) throw new Error('สคริปต์นี้สำหรับ staging — localhost ใช้ openAs() ปกติ')
const FILE = 'uat/personas-staging.json'
const AUTH_DIR = 'uat/.auth-staging'
const EXPECTED_BLOCKED = new Set(['uat.temp1', 'uat.temp2'])

const args = process.argv.slice(2)
if (args[0] === '--manual') {
  const name = args[1]
  if (!name || !/^[a-z0-9._-]+$/i.test(name)) throw new Error('ใส่ชื่อ session เช่น --manual superadmin')
  mkdirSync(AUTH_DIR, { recursive: true })
  const browser = await chromium.launch({ channel: 'chrome', headless: false })
  const context = await browser.newContext({ locale: 'th-TH', timezoneId: 'Asia/Bangkok', viewport: { width: 1280, height: 860 } })
  await applyBypass(context)
  const page = await context.newPage()
  await page.goto(`${BASE}/login`)
  console.log(`login เป็น ${name} ในหน้าต่าง Chrome ที่เปิดขึ้น (รอได้ 5 นาที)…`)
  await page.waitForURL(u => u.origin === new URL(BASE).origin && !u.pathname.startsWith('/login') && !u.pathname.startsWith('/auth/'), { timeout: 300000 })
  await context.storageState({ path: `${AUTH_DIR}/${name}.json` })
  console.log(`✅ เก็บ session ${AUTH_DIR}/${name}.json (${new URL(page.url()).pathname})`)
  await browser.close()
  process.exit(0)
}

if (!existsSync(FILE)) throw new Error(`ไม่มี ${FILE} — รัน uat/bin/staging-prep.sh users ก่อน`)
const readAll = () => JSON.parse(readFileSync(FILE, 'utf8'))
const writeAll = data => writeFileSync(FILE, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 })

/** รหัสใหม่: ตัวอักษร + ตัวเลข ยาว ≥ 8 (กติกา passwordSchema) */
const newPassword = () => `Stg-${randomBytes(12).toString('base64url')}${randomBytes(1)[0] % 10}`

const wanted = args
const usernames = wanted.length > 0 ? wanted : Object.keys(readAll())
mkdirSync(AUTH_DIR, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = []
for (const username of usernames) {
  const persona = readAll()[username]
  if (!persona) { results.push([username, '❌ ไม่มีใน personas-staging.json']); continue }
  const context = await browser.newContext({ locale: 'th-TH', timezoneId: 'Asia/Bangkok', viewport: { width: 1440, height: 900 } })
  await applyBypass(context)
  const page = await context.newPage()
  try {
    // staging (Vercel cold start) ช้ากว่า local: กรอกก่อน React hydrate เสร็จ = ค่าหาย ("ข้อมูลไม่ครบ" ฝั่ง browser — ยังไม่ส่ง server)
    // ⇒ รอ network ว่าง + ตรวจค่าหลังกรอก · ลองใหม่ได้ 3 ครั้งเฉพาะกรณีที่ยังไม่ถึง server หรือ server ไม่ตอบ
    let outcome = null
    for (let attempt = 1; attempt <= 3 && outcome !== 'moved'; attempt++) {
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 })
      if (page.url().includes('vercel.com')) throw new Error('ติด Vercel Deployment Protection')
      if (!new URL(page.url()).pathname.startsWith('/login')) { outcome = 'moved'; break }
      await page.waitForTimeout(1000)
      await page.locator('#identifier').fill(username)
      await page.locator('#password').fill(persona.password)
      await page.waitForTimeout(300)
      if ((await page.locator('#identifier').inputValue()) !== username || (await page.locator('#password').inputValue()) === '') continue
      await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
      outcome = await Promise.race([
        page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 60000 }).then(() => 'moved', () => null),
        page.locator('div.rounded-xl [role="alert"]').first().waitFor({ timeout: 60000 }).then(() => 'alert', () => null),
      ])
      if (outcome === 'alert') {
        const title = (await page.locator('div.rounded-xl [role="alert"]').first().innerText()).trim()
        // ข้อมูลไม่ครบ = ฝั่ง browser (ไม่ถึง server) · เชื่อมต่อไม่สำเร็จ = server ไม่ตอบทันเวลา ⇒ ลองใหม่ · อื่น ๆ (รหัสผิด/ระงับ) = หยุด
        if (/^(ข้อมูลไม่ครบ|เชื่อมต่อไม่สำเร็จ)/.test(title) && attempt < 3) { outcome = null; continue }
        break
      }
      if (outcome === null && !new URL(page.url()).pathname.startsWith('/login')) outcome = 'moved'
    }
    if (outcome === null) throw new Error('login ไม่สำเร็จใน 3 ครั้ง (หน้าไม่ตอบ/ค่าหาย)')
    if (outcome === 'alert') {
      const text = (await page.locator('div.rounded-xl [role="alert"]').first().innerText()).trim().slice(0, 120)
      results.push([username, EXPECTED_BLOCKED.has(username) ? `⏭️  login ไม่ได้ตามตั้งใจ (${text})` : `❌ ${text}`])
      continue
    }
    let note = ''
    if (new URL(page.url()).pathname.startsWith('/auth/change-password')) {
      const next = newPassword()
      // เขียนรหัสใหม่ลงไฟล์ก่อนกดบันทึก — กันรหัสหายถ้าสคริปต์ตายหลังเปลี่ยนสำเร็จ
      const all = readAll()
      all[username] = { ...all[username], previousPassword: persona.password, password: next, mustChangePassword: false, changedAt: new Date().toISOString() }
      writeAll(all)
      await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => undefined)
      await page.waitForTimeout(1000)
      await page.locator('#current-password').fill(persona.password)
      await page.locator('#new-password').fill(next)
      await page.locator('#confirm-password').fill(next)
      await page.getByRole('button', { name: 'บันทึกรหัสผ่านใหม่' }).click()
      await page.waitForURL(u => !u.pathname.startsWith('/auth/change-password'), { timeout: 90000 })
      if (new URL(page.url()).pathname.startsWith('/login')) throw new Error('เปลี่ยนรหัสแล้วแต่ระบบพากลับหน้า login — รันซ้ำเฉพาะคนนี้')
      const done = readAll()
      delete done[username].previousPassword
      writeAll(done)
      note = ' (เปลี่ยนรหัสครั้งแรกแล้ว)'
    }
    await context.storageState({ path: `${AUTH_DIR}/${username}.json` })
    results.push([username, `✅ ${new URL(page.url()).pathname}${note}`])
  } catch (error) {
    results.push([username, `❌ ${error instanceof Error ? error.message.split('\n')[0] : error}`])
  } finally {
    await context.close()
  }
}
await browser.close()
for (const [username, status] of results) console.log(`${username.padEnd(16)} ${status}`)
const failed = results.filter(([u, s]) => s.startsWith('❌')).length
console.log(`\nสรุป: ✅ ${results.filter(([, s]) => s.startsWith('✅')).length} · ⏭️  ${results.filter(([, s]) => s.startsWith('⏭️')).length} · ❌ ${failed} — session อยู่ ${AUTH_DIR}/`)
if (failed > 0) process.exitCode = 1
