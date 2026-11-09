import { openAs, BASE, settle, fieldsOf, buttons, txt, sleep } from './_a.mjs'
const [who, ...tabs] = process.argv.slice(2)
const s = await openAs(who)
const p = s.page
try {
  await p.goto(`${BASE}/settings/finance`); await settle(p, 1200)
  for (const t of tabs) {
    const [tab, add] = t.split('::')
    await p.locator('main').getByRole('button', { name: tab, exact: true }).first().click(); await settle(p, 900)
    console.log('\n==== TAB', tab, p.url())
    const panel = p.locator('main')
    console.log((await txt(panel, 4000)).split('ปฏิทินวันหยุด |').pop())
    console.log('BTN', (await buttons(panel)).slice(19).join(' / '))
    console.log((await fieldsOf(panel)).slice(1).join('\n'))
    if (add) {
      await panel.getByRole('button', { name: add }).first().click(); await settle(p, 800)
      const d = p.getByRole('dialog').last()
      console.log('-- DIALOG', await txt(d, 2500)); console.log((await fieldsOf(d)).join('\n'))
      await d.getByRole('button', { name: 'ยกเลิก' }).first().click().catch(() => p.keyboard.press('Escape')); await sleep(500)
      if (await p.locator('[role=alertdialog]').isVisible().catch(()=>false)) await p.getByRole('button', { name: 'ทิ้งข้อมูล' }).click()
    }
  }
  console.log('5xx', s.serverErrors, 'console', s.consoleErrors.slice(0, 5))
} finally { await s.browser.close() }
