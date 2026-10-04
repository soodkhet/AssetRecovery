#!/usr/bin/env bash
# Q-FP R12 — ลายนิ้วมือไม่มี mutation (read-only) · ใช้: uat/bin/r12/fp.sh <label>
cd "$(dirname "$0")/../../.."
OUT=$(PGPASSWORD=assetrecovery psql -h localhost -U assetrecovery -d assetrecovery_dev -XAt -F'|' -c "set default_transaction_read_only = on" -c "select (select count(*) from cases) cs, (select count(*) from case_assignments) ca, (select count(*) from assets) ast, (select count(*) from handover_lots) lot,
 (select count(*)||'/'||left(md5(string_agg(status::text,',' order by id)),8) from expenses) exp,
 (select count(*)||'/'||left(md5(string_agg(status::text,',' order by id)),8) from advances) adv,
 (select count(*) from payout_batches) pb, (select count(*) from billing_batches) bb, (select count(*) from revenues) rev,
 (select count(*) from tax_invoices) ti, (select count(*) from wht_certificates) wht, (select count(*) from adjustments) adj,
 (select count(*) from exceptions) exc, (select count(*) from export_records) expn,
 (select string_agg(status::text,',') from accounting_periods) per, (select count(*) from bank_transactions) bt,
 (select count(*)||'/'||count(read_at) from notifications) noti, (select count(*) from jobs) jobs, (select count(*) from files) files,
 (select left(md5(string_agg(role_id::text||capability_id::text||access_level::text, ',' order by role_id, capability_id)),8) from role_capabilities) rc,
 (select left(md5(string_agg(id::text||name||is_editable::text||coalesce(deleted_at::text,''), ',' order by id)),8) from roles) roles,
 (select left(md5(string_agg(id::text||status::text||role_id::text||coalesce(team_id::text,'')||coalesce(company_id::text,'')||must_change_password::text||coalesce(deleted_at::text,''), ',' order by id)),8) from users) usr,
 (select count(*) from team_managers) tm, (select left(md5(string_agg(id::text||status::text||coalesce(suspended_reason,''),',' order by id)),8) from finance_companies) fc, (select count(*) from push_subscriptions) push,
 (select count(*) from audit_logs where action not in ('login','logout')) audit_n,
 (select count(*) from audit_logs where action in ('login','logout')) audit_login" | grep -v '^SET$')
echo "$(TZ=Asia/Bangkok date '+%T') ${1:-fp} $OUT" | tee -a uat/bin/r12/fp.log
