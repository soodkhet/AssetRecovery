import { openAs, BASE, settle, log, txt, shot, step, toasts, track, sleep, errText, q, fieldsOf } from './_a.mjs'
const s = await openAs('superadmin'); const p = s.page; const res = track(p)
const tab = async n => { await p.locator('main').getByRole('button', { name: n, exact: true }).first().click(); await settle(p, 900) }
const save = async (d, name) => { const r = p.waitForResponse(r => r.url().includes('/api/') && r.request().method() !== 'GET', { timeout: 20000 }); await d.getByRole('button', { name, exact: true }).click(); const rr = await r; let b=''; try{b=(await rr.text()).slice(0,250)}catch{}; return { st: rr.status(), b, t: await toasts(p, 1200) } }
const apiCount = () => res.length
try {
  await p.goto(`${BASE}/settings/finance`); await settle(p, 1200)
  await tab('กติกาภาษี (Tax Profile)')
  const addTp = async (name, pct, tryBad) => {
    await p.locator('main').getByRole('button', { name: '+ เพิ่ม Tax Profile' }).click(); await settle(p, 600)
    const d = p.getByRole('dialog').last()
    await d.locator('#tax-name').fill(name)
    await d.locator('#tax-income-type').selectOption({ index: 0 })
    let bad = null
    if (tryBad) {
      await d.locator('#tax-wht-pct').fill('150'); await d.locator('#tax-reason').fill('เพิ่มกติกาภาษีรอบ MT6')
      const n0 = apiCount(); await d.getByRole('button', { name: /^เพิ่ม/ }).last().click(); await sleep(900)
      bad = { e: (await errText(d)).filter(x => /อัตรา/.test(x)), api: apiCount() - n0, focus: await p.evaluate(() => document.activeElement?.id || document.activeElement?.tagName), foot: await d.locator('[data-modal-footer] [role=alert]').allInnerTexts() }
      await shot(p, 'A2-taxprofile-150')
      await d.locator('#tax-wht-pct').fill(''); await d.locator('#tax-wht-pct').pressSequentially('2a'); bad.typed = await d.locator('#tax-wht-pct').inputValue()
    }
    await d.locator('#tax-wht-pct').fill(pct)
    await d.locator('#tax-reason').fill('เพิ่มกติกาภาษีรอบ MT6')
    const btn = (await d.locator('[data-modal-footer] button').allInnerTexts()).pop()
    const r = await save(d, btn.trim()); await settle(p, 700); return { r, bad }
  }
  const t1 = await addTp('บุคคลธรรมดา ค่าจ้างทำของ 2%', '2', true); log('tp1', t1)
  const t2 = await addTp('Inhouse บุคคลธรรมดา ค่าจ้างทำของ 3%', '3', false); log('tp2', t2.r)
  await shot(p, 'A2-taxprofiles')
  const tps = q("select id,name,wht_pct,threshold_satang from tax_profiles where name like '%ค่าจ้างทำของ%'")
  step({ step: 'A2.taxprofile', action: "เพิ่ม Tax Profile 'บุคคลธรรมดา ค่าจ้างทำของ 2%' (ลองอัตรา 150 / พิมพ์ '2a') + 'Inhouse บุคคลธรรมดา ค่าจ้างทำของ 3%'", expected: 'ปฏิเสธ 150 · รับเฉพาะตัวเลข · 201 ×2', actual: `150 → ${t1.bad.e.join(' / ')} API ${t1.bad.api} footer=${JSON.stringify(t1.bad.foot)} focus=${t1.bad.focus} · '2a'→'${t1.bad.typed}' · ${t1.r.st}/${t2.r.st} · DB ${JSON.stringify(tps)}`, status: t1.r.st === 201 && t2.r.st === 201 && t1.bad.api === 0 ? 'pass' : 'fail', evidence: ['A2-taxprofile-150.png', 'A2-taxprofiles.png'] })
  // defaults
  await p.locator('main').getByRole('button', { name: 'ตั้งค่าใหม่' }).click(); await settle(p, 700)
  const d = p.getByRole('dialog').last()
  log('DEFAULTS DIALOG', await txt(d, 1500)); log((await fieldsOf(d)).join('\n'))
  const selects = d.locator('select')
  const n = await selects.count()
  for (let i = 0; i < n; i++) {
    const lab = await selects.nth(i).evaluate(e => (e.id && document.querySelector(`label[for="${e.id}"]`)?.innerText) || e.getAttribute('aria-label') || e.closest('label')?.innerText || '')
    const opts = await selects.nth(i).locator('option').allInnerTexts()
    log('sel', i, lab, opts)
    if (/Inhouse|ในทีม|In-house/i.test(lab) && /บุคคล/.test(lab) && !/นิติ/.test(lab)) {
      const o = opts.find(x => x.includes('Inhouse บุคคลธรรมดา ค่าจ้างทำของ 3%')); if (o) await selects.nth(i).selectOption({ label: o })
    }
  }
  const ta = d.locator('textarea'); if (await ta.count()) await ta.first().fill('ตั้งค่าเริ่มต้นตามประเภทผู้รับรอบ MT6')
  await shot(p, 'A2-taxdefaults-dialog')
  const btn = (await d.locator('[data-modal-footer] button').allInnerTexts()).pop().trim()
  const rd = await save(d, btn); log('defaults', rd); await settle(p, 800)
  const card = await txt(p.locator('main'), 6000)
  const cardPart = card.slice(card.indexOf('Tax Profile ค่าเริ่มต้นตามประเภทผู้รับ'), card.indexOf('Tax Profile ค่าเริ่มต้นตามประเภทผู้รับ') + 700)
  await shot(p, 'A2-taxdefaults')
  step({ step: 'A2.taxdefaults', action: "'ตั้งค่าใหม่' ค่าเริ่มต้นตามประเภทผู้รับ ทันทีหลังสร้าง (ไม่ reload) → Inhouse·บุคคล = Inhouse 3%", expected: 'dropdown มี profile ใหม่ · 201', actual: `${rd.st} · ${cardPart}`, status: rd.st === 201 || rd.st === 200 ? 'pass' : 'fail', evidence: ['A2-taxdefaults-dialog.png', 'A2-taxdefaults.png'] })
  log('5xx', s.serverErrors, 'console', s.consoleErrors)
} finally { await s.browser.close() }
