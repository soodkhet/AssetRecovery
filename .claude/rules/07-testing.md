# Rule 07 — Testing (vitest)

- **งานการเงินทุกก้อนต้องมี test ในก้อนงานเดียวกัน** — ห้ามผัดไป task อื่น
- สูตรเงิน = pure module + unit test **ก่อน** เขียน route/UI (Phase 3.1 คือชุดหลัก — coverage 100% ของ pure modules)
- ทุก task เทียบกับ Test Cases §16/§17/§20 ของไฟล์ spec ที่ implement — test ที่ spec ระบุชื่อไว้ต้องมีจริง
- Integration test จุดเชื่อมข้ามโมดูล 9 จุดตาม `29` §7 — เพิ่มทีละจุดเมื่อโมดูลปลายทางเกิด
- จุดที่ต้องมี test ก่อน merge เสมอ (จาก analysis): Revenue trigger ทั้ง 8 เคส (`19` §16) · Lot confirm transaction/rollback (`44` §17 T11–T13) · duplicate case_ref ภายใต้ concurrency (`38`) · reassign timeout race (`40`) · resubmit_close superseded (`41`) · Tax invoice number gap ภายใต้ concurrency (`31`) · WHT cancelled ไม่นับยอด (`33`) · Export block เมื่อ critical open (`34`/`37`) · Permission: Finance เรียก E1 ต้อง 403 (`96`)
- Verify ต่อ task: `pnpm typecheck` (เต็ม repo เสมอ) + `pnpm vitest run --changed <base> --passWithNoTests` + lint — ตาม `orchestrator/config.mjs`
- Test DB: ใช้ Postgres ใน docker-compose.dev (ห้ามยิง staging DB จริงใน unit test) · test ที่แตะ DB ต้อง reset/transaction-rollback ได้
- E2E acceptance เต็มระบบ = Phase 8.1 ตาม `29`
