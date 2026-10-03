// probe R4 (อ่านอย่างเดียว): เปิดหน้า /field/** ของพนักงานในโหมดมือถือ + desktop แล้วเก็บข้อความ/ภาพ
// ทุก request ที่ไม่ใช่ GET ไปที่ /api/** (ยกเว้น /api/auth/*) ถูก abort ที่ระดับ context — ไม่มีทางเกิด mutation
// รัน: node uat/bin/probe-r4-field.mjs [username ...]
import { openAs, BASE } from './lib.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'

const users = process.argv.slice(2).length ? process.argv.slice(2) : ['uat.agent.in1', 'uat.agent.in2', 'uat.agent.out1']
const PAGES = ['/field', '/field/pending', '/field/accepted', '/field/tracking', '/field/closed', '/field/expenses', '/field/income']
const OUT = 'uat/shots/R4-probe'
mkdirSync(OUT, { recursive: true })
const blocked = []
const report = []

for (const u of users) {
  for (const mobile of [true, false]) {
    const { browser, context, page, consoleErrors, serverErrors } = await openAs(u, { mobile })
    await context.route('**/api/**', (route) => {
      const req = route.request()
      if (req.method() === 'GET' || req.url().includes('/api/auth/')) return route.continue()
      blocked.push(`${u} ${req.method()} ${req.url()}`)
      return route.abort()
    })
    for (const p of PAGES) {
      await page.goto(`${BASE}${p}`)
      await page.waitForLoadState('networkidle').catch(() => {})
      const slug = `${u.replace('uat.', '')}-${mobile ? 'm' : 'd'}${p.replaceAll('/', '_')}`
      await page.screenshot({ path: `${OUT}/${slug}.png`, fullPage: true })
      const text = (await page.locator('main').innerText().catch(() => page.locator('body').innerText())).replace(/\s+/g, ' ').slice(0, 900)
      report.push(`## ${slug} → ${new URL(page.url()).pathname}\n${text}\n`)
    }
    // ช่องที่อัปโหลดไฟล์ + ปุ่มบนหน้า (ไว้ยืนยัน locator)
    const buttons = await page.getByRole('button').allInnerTexts().catch(() => [])
    report.push(`### buttons(${u},${mobile ? 'm' : 'd'}) ${[...new Set(buttons.map(b => b.trim()).filter(Boolean))].join(' | ').slice(0, 600)}`)
    report.push(`### errors console=${consoleErrors.length} server=${serverErrors.join(',')}`)
    await browser.close()
  }
}
writeFileSync(`${OUT}/probe-field.txt`, report.join('\n') + `\n\nblocked=${JSON.stringify(blocked)}\n`)
console.log(`pages=${report.length} blocked=${blocked.length}`)
