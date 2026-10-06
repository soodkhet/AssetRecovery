// R14.29 probe สิทธิ์สั้น (API ด้วย session ที่เก็บไว้ — ไม่ log รหัสผ่าน)
import { sess, call } from '../r10v3/_h.mjs'
import { log, q } from './_h.mjs'
const BL5 = 'a70fda0a-3022-481f-bee3-de7bd744b662', BL6 = '417ea137-1789-419f-a04f-8916e173d019'
const INV8 = 'a02be95b-e136-49cd-8396-4c838bb4cbdc', CR = 'f0278223-4d56-4394-909c-202ea716ec1a'
const T = new Date().toISOString()
const before = q(`select count(*), max(invoice_number) from tax_invoices`)
const show = (tag, r) => log(tag, r.status, r.code, (r.msg ?? '').slice(0, 120), 'keys', Object.keys(r.body?.error ?? r.body ?? {}).join(','))
const co = await sess('uat.co1.mgr')
show('co1.mgr portal BL-006 (CO2) invoice-pdf', await call(co, 'GET', `/api/portal/billing-batches/${BL6}/invoice-pdf`))
show('co1.mgr portal BL-005 (CO1 ตัวเอง ควบคุม)', await call(co, 'GET', `/api/portal/billing-batches/${BL5}/invoice-pdf`))
show('co1.mgr portal BL-ไม่มีจริง (เทียบไม่รั่ว)', await call(co, 'GET', `/api/portal/billing-batches/00000000-0000-0000-0000-000000000000/invoice-pdf`))
show('co1.mgr internal BL-005 invoice-pdf', await call(co, 'GET', `/api/billing-batches/${BL5}/invoice-pdf`))
const fin = await sess('uat.finance')
show('finance POST tax-invoices', await call(fin, 'POST', `/api/accounting/tax-invoices`, { cashReceiptId: CR }))
const adm = await sess('uat.admin')
show('admin(ธุรการ) POST tax-invoices', await call(adm, 'POST', `/api/accounting/tax-invoices`, { cashReceiptId: CR }))
show('finance PATCH INV-0008 cancel', await call(fin, 'PATCH', `/api/accounting/tax-invoices/${INV8}/cancel`, { reason: 'probe' }))
show('finance POST INV-0008 cancel', await call(fin, 'POST', `/api/accounting/tax-invoices/${INV8}/cancel`, { reason: 'probe' }))
log('tax_invoices before', before.replace(/\s+/g, ' '), 'after', q(`select count(*), max(invoice_number) from tax_invoices`).replace(/\s+/g, ' '))
log(q(`select status from tax_invoices where id='${INV8}'`).replace(/\s+/g, ' '))
log(q(`select a.action,a.target_type,u.username,a.after_data->>'code' code,a.after_data->>'path' path from audit_logs a left join users u on u.id=a.actor_id where a.created_at>'${T}' order by a.created_at`))
