import { openAs, BASE, settle, log, txt, shot, step, toasts, sleep, q, fieldsOf, errText, track } from './_a.mjs'
const s = await openAs('superadmin'); const p = s.page; const res = track(p)
const dlg = () => p.getByRole('dialog').last()
const waitMut = () => p.waitForResponse(r => r.url().includes('/api/') && r.request().method() !== 'GET', { timeout: 20000 })
const mk = async (o) => {
  await p.getByRole('button', { name: '+ สร้างทีม' }).click(); await settle(p, 700)
  const d = dlg()
  await d.locator('#team-name').fill(o.name)
  await d.locator('#team-side').selectOption({ label: o.side }); await sleep(500)
  const plans = await d.locator('#team-plan option').allInnerTexts()
  const pl = plans.find(x => x.includes(o.plan)); await d.locator('#team-plan').selectOption({ label: pl })
  const sups = await d.locator('#team-supervisor option').allInnerTexts()
  await d.locator('#team-supervisor').selectOption({ label: sups.find(x => x.includes(o.sup)) })
  await d.getByLabel(new RegExp(o.mgr)).check()
  for (const pv of o.prov) await d.getByLabel(pv, { exact: true }).check()
  const taxBox = (await d.innerText()).split('\n').filter(l => /บุคคลธรรมดา:|นิติบุคคล:/.test(l))
  const ta = d.locator('textarea'); if (await ta.count()) await ta.last().fill('ตั้งทีมติดตามทรัพย์รอบ MT6')
  const btn = (await d.locator('[data-modal-footer] button').allInnerTexts()).pop().trim()
  const w = waitMut(); await d.getByRole('button', { name: btn, exact: true }).click(); const r = await w; const b = (await r.text()).slice(0, 200); await settle(p, 900)
  return { st: r.status(), b, plans, sups, taxBox }
}
try {
  await p.goto(`${BASE}/settings/teams`); await settle(p, 1200)
  const t1 = await mk({ name: 'ทีมกรุงเทพ-ปริมณฑล Inhouse (MT6)', side: 'Inhouse', plan: 'แผน Inhouse มาตรฐาน 2569 (MT6)', sup: 'สุริยา', mgr: 'ชัยวัฒน์', prov: ['กรุงเทพมหานคร', 'นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ'] })
  log('t1', t1)
  const t2 = await mk({ name: 'ทีมกรุงเทพ-ตะวันตก Outsource (MT6)', side: 'Outsource', plan: 'แผน Outsource เหมาจ่าย 2569 (MT6)', sup: 'วีระ', mgr: 'ธนา', prov: ['กรุงเทพมหานคร', 'นครปฐม', 'สมุทรสาคร'] })
  log('t2', t2)
  await shot(p, 'A5-teams-in')
  const inTxt = await txt(p.locator('main table'), 500)
  await p.locator('main').getByRole('button', { name: 'Outsource', exact: true }).click().catch(() => {}); await settle(p, 900)
  await shot(p, 'A5-teams-out'); const outTxt = await txt(p.locator('main table'), 500)
  step({ step: 'A5.teams', action: 'สร้างทีม Inhouse (ผจก. ชัยวัฒน์/uat.mgr.in · หัวหน้า สุริยา/uat.sup.in · กทม/นนทบุรี/ปทุมธานี/สมุทรปราการ · แผน Inhouse) + Outsource (ผจก. ธนา/uat.mgr.out · หัวหน้า วีระ/uat.sup.out · กทม/นครปฐม/สมุทรสาคร · แผน Outsource)', expected: '201 ×2 · dropdown แผนเฉพาะฝั่งเดียวกัน · กล่องกติกาภาษี', actual: `${t1.st}/${t2.st} · แผน(IN) ${JSON.stringify(t1.plans)} แผน(OUT) ${JSON.stringify(t2.plans)} · ภาษี IN ${t1.taxBox.join(' / ')} · OUT ${t2.taxBox.join(' / ')} · ตาราง IN ${inTxt} · OUT ${outTxt}`, status: t1.st === 201 && t2.st === 201 ? 'pass' : 'fail', evidence: ['A5-teams-in.png', 'A5-teams-out.png'] })
  log('5xx', s.serverErrors, 'console', s.consoleErrors)
} finally { await s.browser.close() }
