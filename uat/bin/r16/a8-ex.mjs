import { openAs, BASE, settle, txt, fieldsOf, sleep } from './_a.mjs'
const s = await openAs('superadmin'); const p = s.page
try {
  await p.goto(`${BASE}/settings/roles`); await settle(p, 1200)
  await p.locator('main tr').filter({ hasText: 'ทดสอบสิทธิ์ล็อก (MT4)' }).getByRole('button', { name: 'กำหนดสิทธิ์' }).click(); await settle(p, 1200)
  const d = p.getByRole('dialog').last()
  console.log((await txt(d, 2500)))
  const html = await d.evaluate(el => { const r = [...el.querySelectorAll('tr')].filter(t => t.innerText.includes('🔒')).slice(0, 2).map(t => t.outerHTML.slice(0, 1500)); return r })
  console.log(html.join('\n\n'))
  const f = await fieldsOf(d); console.log(f.length, f.slice(0, 8).join('\n'))
} finally { await s.browser.close() }
