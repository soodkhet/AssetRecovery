import { openAs, shot, checkPage, log } from './_h.mjs'
{ const s = await openAs('uat.exec'); const { page } = s
  const bad = []; page.on('response', r => { if (r.status() === 403) bad.push(r.url().replace(/^https?:\/\/[^/]+/, '')) })
  await page.goto('http://localhost:3000/finance'); await checkPage(page)
  for (const name of ['รออนุมัติ', 'ปรับปรุง']) { bad.length = 0
    await page.locator('[aria-label^="แท็บ"] button', { hasText: name }).first().click(); await checkPage(page)
    log('s01b', 'exec finance tab', name, '403:', [...new Set(bad)].join(' '))
    await shot(page, 'final/s01b', `exec-finance-${name === 'รออนุมัติ' ? 'approve' : 'adjust'}`, { fullPage: true })
    const t = await page.locator('main').innerText(); log('s01b', '  text has ไม่มีสิทธิ์?', /ไม่มีสิทธิ์|สิทธิ์ไม่พอ/.test(t), (t.match(/.{0,40}(ไม่มีสิทธิ์|ผิดพลาด).{0,40}/) ?? [''])[0])
  }
  await s.browser.close() }
{ const s = await openAs('uat.sup.out'); const { page } = s
  await page.goto('http://localhost:3000/warehouse'); await checkPage(page)
  await page.locator('[aria-label^="แท็บ"] button, [role=tab]', { hasText: 'รอส่งมอบ' }).first().click()
  await page.waitForTimeout(6000); const r = await checkPage(page)
  log('s01b', 'sup.out รอส่งมอบ after 6s', r.issues.join(';'), r.text.slice(r.text.indexOf('รอส่งมอบ'), r.text.indexOf('รอส่งมอบ') + 300).replace(/\s+/g, ' '))
  await shot(page, 'final/s01b', 'supout-warehouse-pending-handover')
  log('s01b', 'console', s.consoleErrors.slice(0, 3)); await s.browser.close() }
{ const s = await openAs('uat.agent.in1'); const { page } = s
  await page.goto('http://localhost:3000/field/income'); await checkPage(page)
  log('s01b', 'in1 income console', s.consoleErrors.map(e => e.slice(0, 400)))
  await shot(page, 'final/s01b', 'in1-income', { fullPage: true }); await s.browser.close() }
