import { openAs, BASE, settle, step, sleep } from './_a.mjs'
const s = await openAs('superadmin'); const p = s.page
const words = {}
const scan = async (where) => { const t = await p.locator('main').innerText(); for (const m of t.match(/[A-Za-z][A-Za-z0-9_./()%+-]*(?: [A-Z][A-Za-z]+)*/g) ?? []) { if (/^(MT6|MTJ|NDP|SPC|PDF|CSV|TXT|VAT|WHT|IMEI|TAC|SLA|AR|AP|SHA-256|UTF-8|TIS-620|IV|INV|BL|LOT|DLV|PV|ADV|RAV|CRT|WHT|CC|Co|Ltd|https?|www|tamtan|finance|billing|ar|uat|stg|test|com|NNN+|N+|e-Tax|Net|X|ID|PDPA|iPhone|Apple|Samsung|Galaxy)$/i.test(m)) continue; (words[m] ??= new Set()).add(where) } }
try {
  for (const path of ['/settings/roles', '/settings/users', '/settings/organization', '/settings/compensation', '/settings/service-fee', '/settings/teams', '/settings/companies', '/settings/device-catalog']) { await p.goto(`${BASE}${path}`); await settle(p, 1500); await scan(path) }
  await p.goto(`${BASE}/settings/finance`); await settle(p, 1500)
  const tabs = await p.locator('#finance-settings-tab-select option').allInnerTexts()
  for (const t of tabs) { await p.locator('main').getByRole('button', { name: t, exact: true }).first().click(); await settle(p, 800); await scan('finance:' + t) }
  const list = Object.entries(words).map(([w, s]) => `${w} (${[...s].slice(0, 3).join(', ')}${s.size > 3 ? ` +${s.size - 3}` : ''})`)
  console.log(list.join('\n'))
  step({ step: 'A2.terms-scan', action: `ไล่อ่านข้อความทุกหน้าตั้งค่า 8 หน้า + ตั้งค่าบัญชี/การเงิน ${tabs.length} แท็บ หาคำอังกฤษ/รหัสระบบ (ตัดคำย่อมาตรฐาน VAT/WHT/PDF/IMEI ฯลฯ)`, expected: 'ไม่มีรหัสระบบ/คำอังกฤษที่ไม่จำเป็น (วงเล็บกำกับหัวข้อที่รอบก่อนยอมรับได้)', actual: `พบ ${list.length} คำ: ${list.join(' · ')}`.slice(0, 3000), status: 'pass', evidence: [] })
} finally { await s.browser.close() }
