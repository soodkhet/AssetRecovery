// R2 probe — อ่านอย่างเดียว: เปิดฟอร์มรับเคส ดู label/ไฟล์ input แล้วปิด · ยิง GET API ตาม role
// ห้ามกดบันทึก/ส่ง/อัปโหลด — ตรวจว่าไม่มี non-GET request ออกไปเลย
import { openAs, shot, BASE } from './lib.mjs'

const sleep = ms => new Promise(r => setTimeout(r, ms))
const out = []
const log = (...a) => { out.push(a.join(' ')); console.log(...a) }

async function fields(scope) {
  return await scope.locator('input,select,textarea').evaluateAll(els => els.map(e => {
    let l = e.id ? document.querySelector(`label[for="${CSS.escape(e.id)}"]`)?.innerText : null
    if (!l) l = e.closest('label')?.innerText ?? e.getAttribute('aria-label') ?? ''
    const sec = e.closest('section')?.querySelector('h3,h4')?.innerText ?? ''
    const box = e.closest('div.rounded-lg')?.querySelector('h4')?.innerText ?? ''
    return `${e.tagName.toLowerCase()}#${e.id} type=${e.type} accept=${e.getAttribute('accept') ?? ''} «${(l ?? '').replace(/\s+/g, ' ').slice(0, 50)}» [${sec}|${box}]`
  }))
}

function guard(page, who) {
  page.on('request', r => {
    const u = r.url()
    if (r.method() !== 'GET' && r.method() !== 'HEAD' && !u.includes('/_next/') && !u.includes('__nextjs')) log(`!! NON-GET ${who}: ${r.method()} ${u}`)
  })
}

// ── 1) ธุรการ: หน้า + ฟอร์ม
{
  const { browser, page, consoleErrors, serverErrors } = await openAs('uat.admin')
  guard(page, 'admin')
  await page.goto(`${BASE}/cases/submit`)
  await page.waitForLoadState('networkidle')
  log('admin url', page.url())
  log('admin buttons', (await page.getByRole('button').allInnerTexts()).map(s => s.trim()).filter(Boolean).join(' | '))
  log('admin table headers', (await page.locator('th').allInnerTexts()).join(' | '))
  await shot(page, 'R2-probe', '01-admin-list')
  await page.getByRole('button', { name: '+ รับเคส (กรอกมือ)' }).click()
  const dlg = page.getByRole('dialog')
  await dlg.waitFor()
  await sleep(800)
  log('dialog title', (await dlg.locator('h2').first().innerText().catch(() => '?')))
  log('fields:\n  ' + (await fields(dlg)).join('\n  '))
  log('dialog buttons', (await dlg.getByRole('button').allInnerTexts()).map(s => s.trim()).filter(Boolean).join(' | '))
  log('company options', (await dlg.locator('#case-company option').allInnerTexts()).join(' | '))
  log('asset-type options', (await dlg.locator('#asset-type option').allInnerTexts()).join(' | '))
  log('nationality options', (await dlg.locator('#debtor-nationality option').allInnerTexts()).join(' | '))
  await shot(page, 'R2-probe', '02-admin-form', { fullPage: true })
  await dlg.getByRole('button', { name: 'ยกเลิก' }).click()
  await sleep(300)
  log('admin console', consoleErrors.length, 'server5xx', serverErrors.length)
  // GET API read-only
  const r = await page.request.get(`${BASE}/api/cases?limit=5`)
  log('admin GET /api/cases', r.status())
  await browser.close()
}

// ── 2) role อื่น: หน้า /cases + GET API
for (const u of ['uat.approver', 'uat.mgr.in', 'uat.mgr.out', 'uat.co1.mgr', 'uat.co2.admin', 'uat.finance', 'uat.agent.in1']) {
  const { browser, page } = await openAs(u)
  guard(page, u)
  await page.goto(`${BASE}/cases`)
  await page.waitForLoadState('networkidle')
  const h1 = await page.locator('h1').first().innerText().catch(() => '')
  log(`${u} /cases -> ${new URL(page.url()).pathname} h1=«${h1.trim()}»`)
  await page.goto(`${BASE}/cases/submit`)
  await page.waitForLoadState('networkidle')
  log(`${u} /cases/submit -> ${new URL(page.url()).pathname}`)
  const a = await page.request.get(`${BASE}/api/cases?limit=5`)
  const body = await a.json().catch(() => null)
  log(`${u} GET /api/cases -> ${a.status()} ${body?.error?.code ?? ''} total=${body?.data?.total ?? '-'}`)
  const b = await page.request.get(`${BASE}/api/cases/00000000-0000-4000-8000-000000000000`)
  const bb = await b.json().catch(() => null)
  log(`${u} GET /api/cases/<random> -> ${b.status()} ${bb?.error?.code ?? ''}`)
  await browser.close()
}
