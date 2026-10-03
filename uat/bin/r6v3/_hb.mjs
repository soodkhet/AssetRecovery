// ตัวช่วยเพิ่มของ R6b v3 (ต่อจาก _h.mjs ของ R6a)
export * from './_h.mjs'
import { q } from './_h.mjs'
export const T0B = '2026-10-03 19:14:00+00'
export const PY = { in1: '9df4509f-c201-4dcf-8939-e02e08df748f', in2: '7ec92197-6d90-488f-8eba-e249b59a1372', out1: 'bf36b3bb-4508-4c3a-984e-9b78eaa9f8ca' }
export const BFF = 'add7ece2-24bc-4166-bbf5-2f6c4b1702d7', BACC = 'c30800c4-52c6-431a-a357-b073cf077b89'
export const CO1 = 'e27e79bf-2344-4f52-8979-c58be09a9de6', CO2 = 'dd5c5017-775f-4e5f-8d5d-4735cc88ad56'
export const TODAY = '2026-10-04'
export const pbId = name => q(`select id from payout_batches where name='${name}'`).split('\n').map(s => s.trim()).find(s => /^[0-9a-f-]{36}$/.test(s)) ?? ''
export const SQLB = {
  pb: `select b.name,b.side,b.status,b.gross_satang g,b.wht_satang w,b.net_satang n,(select count(*) from payout_batch_items i where i.payout_batch_id=b.id) items,b.idempotency_key k,b.payment_file_url url from payout_batches b order by b.created_at`,
  auditB: `select to_char(a.created_at,'HH24:MI:SS') t,a.actor_role,a.action,a.target_type,left(a.target_id::text,8) tid,a.reason from audit_logs a where a.created_at > '${T0B}' and a.action not in ('login','logout') order by a.created_at`,
  auditNB: `select a.target_type,a.action,count(*),count(*) filter (where reason is null) no_reason from audit_logs a where a.created_at > '${T0B}' and a.action not in ('login','logout') group by 1,2 order by 1,2`,
  payee: `select u.username,p.is_verified,(select username from users where id=p.verified_by) vby,to_char(p.verified_at at time zone 'Asia/Bangkok','DD/MM HH24:MI') vat from payee_profiles p join users u on u.id=p.user_id order by 1`,
}
/** กรอก reason ใน dialog สุดท้ายแล้วกดปุ่ม name — คืน response ของ API (ถ้ามี) */
export async function dlgReasonConfirm(page, reason, btnName, urlPart) {
  const d = page.locator('[role="dialog"]').last()
  await d.locator('textarea').first().fill(reason)
  const btn = d.getByRole('button', { name: btnName })
  const [resp] = await Promise.all([page.waitForResponse(x => x.url().includes(urlPart) && x.request().method() !== 'GET', { timeout: 20000 }), btn.click()])
  return `${resp.status()} ${(await resp.text()).slice(0, 400)}`
}
