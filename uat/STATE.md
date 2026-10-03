# UAT STATE — อ่านไฟล์นี้ก่อนทุก session (คู่กับ UAT_PLAN.md + BUGS.md ส่วน open)

| ฟิลด์ | ค่า |
|---|---|
| รอบล่าสุดที่จบ | **R1 ตั้งค่าระบบ** — 03/10/2569 · 45 ขั้น ✅39 🐞4 ❓2 · รายงาน `uat/report/R1-superadmin.md` · ภาพ 97 ไฟล์ |
| snapshot ล่าสุด | `uat/snapshots/R1-end.dump` (ก่อนหน้า: `R0-clean`) |
| รอบถัดไป | **R2 รับเคส** (ธุรการ → เจ้าหน้าที่อนุมัติเคส) — ต้องเขียน step sheet `uat/steps/R2.md` + ไฟล์แนบ fixture (PDF/JPG) |
| บั๊กเปิด | ดู BUGS.md (21 รายการ) — BUG-001 `898b123` / BUG-002 `c116827` merge แล้ว · ไม่มีตัวบล็อก R2 |
| Supabase (cloud) | ✅ ผู้ใช้อนุญาต 03/10/2569: สร้างบัญชี Auth + อัปโหลด Storage ได้ · **เก็บทุกอย่างเป็นข้อมูลตัวอย่าง ห้ามลบ** (ผู้ใช้จะสั่งลบเองก่อนใช้งานจริง) · บัญชีกำพร้าจาก restore ให้จดรายชื่อไว้ท้ายไฟล์นี้ |

## เครื่องมือ (R0)
- `node uat/bin/smoke.mjs` — login admin + screenshot (ตรวจว่าเครื่องมือพร้อม)
- `uat/bin/lib.mjs` — `openAs(username, {mobile, fresh, headed})`, `shot(page, round, name)` · Chrome ในเครื่อง (`channel:'chrome'`), session ต่อ role ที่ `uat/.auth/`
- `uat/bin/snap.sh <label>` · `uat/bin/restore.sh <label>` (หยุด/เปิด dev server ให้เอง ~4 วินาที) · `uat/bin/q.sh "<sql>"` (read-only) · `uat/bin/counts.sh`
- `uat/personas.json` — 14 persona (`initial` = รหัสตอนสร้าง, `password` = รหัสหลังบังคับเปลี่ยน) — gitignored ห้ามพิมพ์ค่าในแชท/รายงาน

## งบ context (UAT_PLAN §12)
role agent ≤ 250k · fixer ≤ 200k · orchestrator ≤ 350k แล้ว handoff (2–3 รอบ/session)

## Log
- 03/10/2569 R1: จบครบ ไม่มีตัวบล็อก · 14 persona login + เปลี่ยนรหัสแล้ว (session อยู่ `uat/.auth/`) · template T1/T2 เป็น v2 · merge BUG-002 + verify เขียว (245 files / 3,072 tests) · ตัด `uat/bin/r*/**` ออกจาก eslint (สคริปต์ชั่วคราวต่อรอบ)
- 03/10/2569 R0: baseline เขียว (typecheck · 241 files / 3,039 tests · lint) · Playwright 1.63 (DEC-011) · snapshot+restore ทดสอบแล้ว

## มติระหว่างทาง
- 03/10/2569 ผู้ใช้: เติม `wht_withheld_by_customer_pct` + `vat_mode` ในฟอร์มบริษัทก่อน R1 (BUG-001) · สร้างหน้าตั้งค่านโยบายมอบหมายงานก่อน R3 (BUG-002)
- orchestrator: ค่าคาดหวังยึด**พฤติกรรมโค้ดปัจจุบัน** ส่วนที่ขัด spec จดเป็น needs-decision (BUG-011/013/014) ไม่บล็อก UAT · ไม่ใช้ PER_KM (พึ่ง Google ภายนอก) · ไม่มีงวด ก.ย. (R8 ล็อก ต.ค.) · payee ทุกคนสร้างใน R1 ยังไม่ verify (verify ใน R6, in2 ปล่อย unverified) · M10–M12 (บัญชีธนาคาร/รูปแบบไฟล์/รอบ AR) อยู่ใน R1 · C4 → agent.in2, C8 ไม่มอบหมาย · IMEI ผิดรูปแบบเป็น probe ใน R5 (ระบบตรวจตอนรับเข้าคลัง ไม่ใช่ตอนส่งเคส)
- ฐานทดสอบที่สอง `assetrecovery_test2` (owner assetrecovery) ใช้กับ fixer ใน worktree: `TEST_DATABASE_URL=…/assetrecovery_test2 pnpm test`

- 03/10/2569 PO ยืนยันช่วงค่าหน้านโยบายมอบหมายงาน: timeout 1–168 ชม. · เส้นตายกดรับงาน 1–720 ชม. ⇒ เติมเป็น `docs/40` v2.3 แล้ว

## บัญชี Supabase Auth กำพร้า (สะสมจากการ restore — ไว้ลบตอน go-live)
- (ยังไม่มี)
