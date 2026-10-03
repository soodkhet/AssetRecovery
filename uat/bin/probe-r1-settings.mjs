// probe อ่านอย่างเดียว (R1 step-sheet writer) — เปิดหน้า/เปิด modal แล้วปิดด้วย "ยกเลิก" ห้ามกดบันทึก
import { openAs, shot, BASE } from './lib.mjs'

const s = await openAs('admin')
const { page } = s

async function fieldsOf(scope) {
  return scope.evaluate((root) => {
    const out = []
    for (const el of root.querySelectorAll('input,select,textarea')) {
      const id = el.id || ''
      let label = ''
      if (id) { const l = root.querySelector(`label[for="${id}"]`); if (l) label = l.innerText.trim() }
      if (!label) label = el.getAttribute('aria-label') || el.closest('label')?.innerText.trim() || ''
      const opts = el.tagName === 'SELECT' ? [...el.options].map(o => o.text).slice(0, 12).join(' / ') : ''
      out.push(`${el.tagName.toLowerCase()}${el.type ? ':' + el.type : ''} #${id} «${label.replace(/\s+/g, ' ').slice(0, 80)}»${opts ? ' [' + opts + ']' : ''}`)
    }
    return out
  })
}

async function probe(path, slug, createButton) {
  console.log(`\n===== ${path}`)
  await page.goto(`${BASE}${path}`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(800)
  console.log('url:', page.url())
  const main = page.locator('main').first()
  const txt = (await main.innerText().catch(() => '')).replace(/\n{2,}/g, '\n').slice(0, 900)
  console.log('text:', txt)
  console.log('buttons:', (await main.getByRole('button').allInnerTexts()).map(t => t.trim()).filter(Boolean).slice(0, 30).join(' | '))
  console.log('tabs:', (await page.getByRole('tab').allInnerTexts()).join(' | '))
  await shot(page, 'R1-probe', `${slug}-page`)
  if (createButton) {
    const btn = page.getByRole('button', { name: createButton })
    if (await btn.count() === 0) { console.log('!! create button not found', createButton); return }
    await btn.first().click()
    const dlg = page.getByRole('dialog')
    await dlg.waitFor({ timeout: 5000 }).catch(() => {})
    console.log('dialog text:', (await dlg.innerText().catch(() => '')).replace(/\n{2,}/g, '\n').slice(0, 1500))
    console.log('fields:\n  ' + (await fieldsOf(dlg)).join('\n  '))
    console.log('dialog buttons:', (await dlg.getByRole('button').allInnerTexts()).map(t => t.trim()).filter(Boolean).join(' | '))
    await shot(page, 'R1-probe', `${slug}-modal`, { fullPage: true })
    await dlg.getByRole('button', { name: 'ยกเลิก' }).first().click().catch(() => page.keyboard.press('Escape'))
  }
}

const targets = (process.argv[2] ?? 'all').split(',')
const all = [
  ['/settings/service-fee', 'service-fee', '+ สร้างเทมเพลต'],
  ['/settings/companies', 'companies', '+ สร้างบริษัท'],
  ['/settings/compensation', 'compensation', '+ สร้างเทมเพลต'],
  ['/settings/teams', 'teams', '+ สร้างทีม'],
  ['/settings/users', 'users', '+ สร้างบัญชี'],
  ['/settings/roles', 'roles', null],
  ['/settings/finance?tab=approval', 'fin-approval', '+ เพิ่มกติกา'],
  ['/settings/finance?tab=tax', 'fin-tax', '+ เพิ่ม Tax Profile'],
  ['/settings/finance?tab=payee', 'fin-payee', '+ เพิ่ม Payee'],
  ['/settings/finance?tab=lock', 'fin-lock', null],
  ['/settings/finance?tab=cycles', 'fin-cycles', '+ สร้างรอบ'],
  ['/settings/finance?tab=bank', 'fin-bank', '+ เพิ่มบัญชี'],
  ['/settings/finance?tab=bankfile', 'fin-bankfile', '+ เพิ่มรูปแบบไฟล์'],
  ['/settings/finance?tab=vat', 'fin-vat', null],
  ['/accounting', 'accounting', null],
  ['/settings/audit-logs', 'audit-logs', null],
]
for (const [p, slug, btn] of all) {
  if (targets[0] !== 'all' && !targets.includes(slug)) continue
  try { await probe(p, slug, btn) } catch (e) { console.log('!! probe error', slug, e.message) }
}
console.log('\nconsoleErrors:', s.consoleErrors.slice(0, 10))
console.log('serverErrors:', s.serverErrors)
await s.browser.close()
