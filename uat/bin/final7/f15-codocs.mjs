// Flow 15 — เอกสารบริษัท (U132): CO2 อัปโหลดหนังสือรับรองบริษัท → คำเตือนเหลือ ภ.พ.20 · CO3 หนังสือรับรองเก่าเกิน 6 เดือน = เตือน
import { openAs, shot, log, q } from './_h.mjs'
import { collect, trackApi } from '../r2/_h.mjs'
const s = await openAs('admin'); const { page } = s; const api = trackApi(page)
await page.goto('http://localhost:3000/settings/companies'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1000)
const card = name => page.locator('div', { hasText: name }).filter({ has: page.getByRole('button', { name: /เอกสารบริษัท/ }) }).last()
for (const co of ['บจก. ยูเอที ไฟแนนซ์', 'บจก. ยูเอที แคปปิตอล']) {
  await card(co).getByRole('button', { name: /เอกสารบริษัท/ }).click(); await page.waitForTimeout(1200)
  const d = page.getByRole('dialog').last(); log('f15', co, 'docs dlg:', (await d.innerText()).replace(/\s+/g, ' ').slice(0, 1200))
  await shot(page, 'final/flow', `f15-docs-${co.split(' ').pop()}`, { fullPage: true })
  if (co.includes('แคปปิตอล')) {
    await d.getByRole('button', { name: '+ แนบเอกสาร' }).click(); await page.waitForTimeout(900)
    const d2 = page.getByRole('dialog').last(); log('f15', 'attach form:', (await d2.innerText()).replace(/\s+/g, ' ').slice(0, 700))
    log('f15', 'buttons', (await d.getByRole('button').allInnerTexts()).map(x => x.trim()).filter(Boolean).join('|'))
    log('f15', 'selects', await page.getByRole('dialog').last().locator('select').evaluateAll(es => es.map(e => [...e.options].map(o => o.text).join('/'))))
    const dd = page.getByRole('dialog').last()
    const sel = dd.locator('select').first(); if (await sel.count()) await sel.selectOption({ label: 'หนังสือรับรองบริษัท' }).catch(e => log('f15', 'sel fail', e.message.slice(0, 80)))
    for (const di of await dd.locator('input[type=date]').all()) await di.fill('2026-09-15')
    const fi = dd.locator('input[type=file]'); log('f15', 'file inputs', await fi.count())
    if (await fi.count()) { await fi.first().setInputFiles('uat/fixtures/files/C2-contract.pdf'); await page.waitForTimeout(1500) }
    log('f15', 'form tail:', (await dd.innerText()).replace(/\s+/g, ' ').slice(400, 1400)); log('f15', 'inputs', await dd.locator('input,textarea').evaluateAll(es => es.map(e => e.type + ':' + (e.value || '').slice(0, 20)))); log('f15', 'btn states', await dd.getByRole('button').evaluateAll(bs => bs.map(b => b.innerText.trim() + (b.disabled ? '[x]' : ''))))
    await dd.locator('textarea').fill('แนบหนังสือรับรองบริษัท (ด่าน 7)'); await page.waitForTimeout(300)
    const up = dd.getByRole('button', { name: /อัปโหลด|บันทึก|แนบ/ }).last(); if (await up.count() && !(await up.isDisabled())) await up.click()
    log('f15', 'upload', await collect(page, 5000), api.splice(0).filter(x => !x.includes('storage/v1')).map(x => x.slice(0, 300)))
    await page.waitForTimeout(800); log('f15', 'dlg after:', (await d.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 800))
    await shot(page, 'final/flow', 'f15-docs-co2-after', { fullPage: true })
  }
  await page.keyboard.press('Escape'); await page.waitForTimeout(500)
}
await page.goto('http://localhost:3000/settings/companies'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(800)
log('f15', 'CO2 card after:', (await card('บจก. ยูเอที แคปปิตอล').innerText()).replace(/\s+/g, ' ').slice(0, 300))
log('f15', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
