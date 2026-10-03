// R5.01 baseline
import { log, q, SQL } from './_h.mjs'
log('=== s01', new Date().toISOString())
for (const k of ['asset', 'lot', 'ev', 'ex', 'rev']) log(`-- ${k}\n` + q(SQL[k]))
log(q(`select status, count(*), sum(gross_satang), count(*) filter (where field_day_settlement_id is not null) daily from expenses group by 1 order by 1`))
log(q(`select (select count(*) from field_day_settlements) fds, (select sum(gross_satang) from expenses where status<>'superseded') active_sum, (select count(*) from expenses) exp_all`))
log(q(`select relname from pg_class where relname like 'seq_handover%'`))
