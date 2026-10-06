// R14.04 settle รายวัน 06/10 ผ่านทางลัด dev (admin)
import { log, q, login, call } from './_h.mjs'
const ctx = await login('admin', { save: false })
const r1 = await call(ctx, 'POST', '/api/dev/trigger-job', { jobType: 'daily_field_allowance', payload: { date: '2026-10-06' } })
log('run1', r1.status, JSON.stringify(r1.body).slice(0, 600))
log(q(`select u.username,s.field_date,s.fuel_total_satang,s.allowance_total_satang,s.case_count,(select count(*) from expenses x where x.field_day_settlement_id=s.id) n from field_day_settlements s join users u on u.id=s.agent_id where s.field_date='2026-10-06'`))
log(q(`select c.case_ref,x.expense_type,x.gross_satang,x.status from expenses x join cases c on c.id=x.case_id where c.case_ref in ('UAT-CO1-006','UAT-CO2-R14') order by 1,2`))
