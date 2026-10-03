# UAT STATE — อ่านไฟล์นี้ก่อนทุก session (คู่กับ UAT_PLAN.md + BUGS.md ส่วน open)

| ฟิลด์ | ค่า |
|---|---|
| รอบล่าสุดที่จบ | R0 (เตรียมระบบ) — 03/10/2569 |
| snapshot ล่าสุด | `uat/snapshots/R0-clean.dump` (seed + admin เท่านั้น) |
| รอบถัดไป | R1 ตั้งค่าระบบ (Superadmin) — step sheet `uat/steps/R1.md` |
| บั๊กเปิด | 0 |
| ข้อจำกัด/ต้องได้รับอนุญาต | การสร้างผู้ใช้ = สร้างบัญชีใน **Supabase Auth (cloud)** · อัปโหลดเอกสาร/รูป = เขียน **Supabase Storage (cloud)** — ต้องได้รับอนุญาตจากผู้ใช้ก่อน (memory: localhost-no-external-writes) |

## เครื่องมือ (R0)
- `node uat/bin/smoke.mjs` — login admin + screenshot (ตรวจว่าเครื่องมือพร้อม)
- `uat/bin/lib.mjs` — `openAs(username, {mobile, fresh, headed})`, `shot(page, round, name)` · Chrome ในเครื่อง (`channel:'chrome'`), session ต่อ role ที่ `uat/.auth/`
- `uat/bin/snap.sh <label>` · `uat/bin/restore.sh <label>` (หยุด/เปิด dev server ให้เอง ~4 วินาที) · `uat/bin/q.sh "<sql>"` (read-only) · `uat/bin/counts.sh`
- `uat/personas.json` — 14 persona (`initial` = รหัสตอนสร้าง, `password` = รหัสหลังบังคับเปลี่ยน) — gitignored ห้ามพิมพ์ค่าในแชท/รายงาน

## งบ context (UAT_PLAN §12)
role agent ≤ 250k · fixer ≤ 200k · orchestrator ≤ 350k แล้ว handoff (2–3 รอบ/session)

## Log
- 03/10/2569 R0: baseline เขียว (typecheck · 241 files / 3,039 tests · lint) · Playwright 1.63 (DEC-011) · snapshot+restore ทดสอบแล้ว
