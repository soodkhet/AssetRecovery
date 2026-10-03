# UAT STATE — อ่านไฟล์นี้ก่อนทุก session (คู่กับ UAT_PLAN.md + BUGS.md ส่วน open)

| ฟิลด์ | ค่า |
|---|---|
| รอบล่าสุดที่จบ | **R2 รับเคส** (เล่นครั้งที่ 2) — 03/10/2569 · 32 ขั้น ✅22 🐞8 ⚠️1 ❓1 · ไม่มี S1–S2 / ไม่มี 500 · รายงาน `uat/report/R2-intake.md` · ภาพ 51 · อัปโหลด Storage 24 object |
| snapshot ล่าสุด | `uat/snapshots/R2-end.dump` (ก่อนหน้า: `R1-end`, `R0-clean`) |
| รอบปัจจุบัน | **R3 มอบหมายงาน** — role agent กำลังรัน · step sheet `uat/steps/R3.md` (26 ขั้น) · รายงาน `uat/report/R3-assign.md` · fixer R2 merge แล้วก่อนเริ่มรอบ |
| บั๊กเปิด | ดู BUGS.md (37 รายการ) — ชุด R2 (BUG-028…037) ยังไม่ได้แก้ · ไม่มีตัวบล็อก R3 |
| Supabase Storage | project `qgshdg…` = **localhost + Vercel staging ตัวเดียวกัน** · สร้าง bucket private 4 ตัว + policy `case-documents` แล้ว 03/10/2569 ด้วย `pnpm storage:setup --expect-ref qgshdgzzajmoytzymsqe --env .env.local --db-env .env.staging` (มติ PO) |
| Supabase (cloud) | ✅ ผู้ใช้อนุญาต 03/10/2569: สร้างบัญชี Auth + อัปโหลด Storage ได้ · **เก็บทุกอย่างเป็นข้อมูลตัวอย่าง ห้ามลบ** (ผู้ใช้จะสั่งลบเองก่อนใช้งานจริง) · บัญชีกำพร้าจาก restore ให้จดรายชื่อไว้ท้ายไฟล์นี้ |

## เครื่องมือ (R0)
- `node uat/bin/smoke.mjs` — login admin + screenshot (ตรวจว่าเครื่องมือพร้อม)
- `uat/bin/lib.mjs` — `openAs(username, {mobile, fresh, headed})`, `shot(page, round, name)` · Chrome ในเครื่อง (`channel:'chrome'`), session ต่อ role ที่ `uat/.auth/`
- `uat/bin/snap.sh <label>` · `uat/bin/restore.sh <label>` (หยุด/เปิด dev server ให้เอง ~4 วินาที) · `uat/bin/q.sh "<sql>"` (read-only) · `uat/bin/counts.sh`
- `uat/personas.json` — 14 persona (`initial` = รหัสตอนสร้าง, `password` = รหัสหลังบังคับเปลี่ยน) — gitignored ห้ามพิมพ์ค่าในแชท/รายงาน

## งบ context (UAT_PLAN §12)
role agent ≤ 250k · fixer ≤ 200k · orchestrator ≤ 350k แล้ว handoff (2–3 รอบ/session)

## Log
- 03/10/2569 R3: merge fixer R2 ก่อนเริ่ม (7 commit, verify 250 files / 3,124 tests) · มติ orchestrator: C7 ทดสอบ timeout แบบ "คำขอเปลี่ยนผู้รับผิดชอบรอความยินยอม" ตาม `40` · ทำให้หมดเวลาด้วยการ**รอจริง 1 ชม.** (ไม่ time-travel DB)
- 03/10/2569 R2 ครั้งที่ 2 จบครบ: เคส 8 ใบตรงตาราง (C1–C5,C7 approved · C6 pending_review · C8 rejected) · snapshot template v2 ทุกใบ · race/ดับเบิลคลิกไม่เกิดซ้ำ · scope บริษัทไม่รั่ว (มีแค่ฟิลด์ค่าบริการบางตัว — BUG-033)
- 03/10/2569 R2 ครั้งแรกหยุดที่ R2.02 (ไม่มี bucket) → restore R1-end · สร้าง Storage ใน `qgshdg…` · merge fixer ชุด R1 (BUG-003…021 + BUG-025 ช่องโหว่ค้นหาผู้ใช้ข้ามทีม) · mockup app-shell: ธุรการเห็น settings
- 03/10/2569 R2 เริ่ม: ไม่เพิ่ม C9 (ช่องว่าง: ไม่มีการเปลี่ยนทีมจริงพร้อมเหตุผล) · R2 = รอบแรกที่อัปโหลดขึ้น Supabase Storage (`case-documents`) — ไฟล์ค้างหลัง restore ให้จดไว้
- 03/10/2569 R1: จบครบ ไม่มีตัวบล็อก · 14 persona login + เปลี่ยนรหัสแล้ว (session อยู่ `uat/.auth/`) · template T1/T2 เป็น v2 · merge BUG-002 + verify เขียว (245 files / 3,072 tests) · ตัด `uat/bin/r*/**` ออกจาก eslint (สคริปต์ชั่วคราวต่อรอบ)
- 03/10/2569 R0: baseline เขียว (typecheck · 241 files / 3,039 tests · lint) · Playwright 1.63 (DEC-011) · snapshot+restore ทดสอบแล้ว

## ▶️ HANDOFF — session ถัดไปเริ่มตรงนี้ (เขียน 03/10/2569 หลังจบ R2)
อ่านแค่: `UAT_PLAN.md` (§5 แถว R3, §6, §10–§12) + ไฟล์นี้ + `uat/BUGS.md` (แถวที่ยังไม่ fixed)

1. **ปล่อยคู่ขนาน 2 agent**
   - **step-sheet writer R3** → `uat/steps/R3.md` (prompt แบบ R2: ใช้ 80 บรรทัดแรกของ `uat/steps/R2.md` เป็นแบบ, probe อ่านอย่างเดียว, งบ ≤ 200k) · เนื้อหา: `uat.mgr.in`/`uat.sup.in` มอบหมาย C1,C2 → `uat.agent.in1` · C3,C4 → `uat.agent.in2` · `uat.mgr.out` C5 → `uat.agent.out1` · C7 → ทีม A แล้ว**ไม่มีใครรับ** → admin ตั้ง timeout ต่ำสุดที่ `/settings/finance?tab=assignment` (กรอกเหตุผล) → สั่ง job `reassign_timeout` ผ่าน `POST /api/dev/trigger-job` → มอบหมายใหม่ให้ `uat.agent.in1` · ปิด "หัวหน้าทีมกลุ่ม Inhouse มอบหมายได้" แล้วตรวจว่าปุ่มของ `uat.sup.in` **ซ่อน** (ไม่ใช่ disable) แล้วเปิดคืน · ลองมอบหมายให้ทีม B (ว่าง) · race มอบหมายเคสเดียวกัน 2 แท็บ · `uat.mgr.out` ห้ามเห็น/มอบหมายเคสทีม A · วันเวลามอบหมาย พ.ศ. บน list · notification ถึงพนักงาน · job รันซ้ำต้องไม่สร้างซ้ำ (`JOB_DUPLICATE`) · ⚠️ `accept_deadline_hours` บันทึกได้แต่ระบบยังไม่บังคับ อย่าทดสอบการบังคับ
   - **fixer batch R2** ใน worktree (`isolation: worktree`; ก่อนเริ่ม `git merge staging` + `pnpm install --frozen-lockfile`; เทสต์ด้วย `TEST_DATABASE_URL=postgresql://assetrecovery:assetrecovery@localhost:5432/assetrecovery_test2`) → BUG-028, 029, 030, 031, 032, 034, 035 (+036 ถ้ามีแหล่งรหัสไปรษณีย์ที่ไม่ต้องดึงจากภายนอก ไม่งั้นรายงานกลับ) · 1 commit ต่อ 1 บั๊ก · ห้ามแตะ BUG-033/037 (รอมติ)
2. ปล่อย **role agent R3** (prompt แบบ R2 replay) → รายงาน `uat/report/R3-assign.md` · ระหว่างรันห้าม merge อะไรเข้า staging
3. จบ R3: `uat/bin/snap.sh R3-end` → รวมบั๊ก → merge fixer (`git merge --no-ff`) → `~/bin/dev restart asset` → verify เต็ม (typecheck + lint + test) → commit → ต่อ R4 (ภาคสนาม: มือถือจำลอง `openAs(u,{mobile:true})`, fixture รูป/วิดีโอหลักฐาน, พิกัด GPS ผ่าน `context.setGeolocation` + `permissions:['geolocation']`)
4. งบ orchestrator: 2–3 รอบต่อ session แล้ว handoff แบบนี้

### รอมติ PO (ไม่บล็อก UAT — สะสมไว้ถามรวด)
BUG-009 แผน/หัวหน้าข้ามฝั่ง · BUG-010 คอมมิชชันไม่ถูกสร้างเป็น expense (S1 — ยืนยันใน R4/R6) · BUG-011 สูตรคืนเงินทดรอง · BUG-013 DAILY_FLAT ต่อเคส/ต่อวัน · BUG-014 WHT threshold ต่อรายการ · BUG-015 snapshot vat_mode · BUG-022 PDPA การเงิน/บัญชีเห็นข้อมูลลูกหนี้ · BUG-023 ผู้จัดการเห็นเคส pending · BUG-033 บริษัทเห็นโมเดลค่าบริการ · BUG-037 hash เอกสารจาก browser

## มติระหว่างทาง
- 03/10/2569 ผู้ใช้: เติม `wht_withheld_by_customer_pct` + `vat_mode` ในฟอร์มบริษัทก่อน R1 (BUG-001) · สร้างหน้าตั้งค่านโยบายมอบหมายงานก่อน R3 (BUG-002)
- orchestrator: ค่าคาดหวังยึด**พฤติกรรมโค้ดปัจจุบัน** ส่วนที่ขัด spec จดเป็น needs-decision (BUG-011/013/014) ไม่บล็อก UAT · ไม่ใช้ PER_KM (พึ่ง Google ภายนอก) · ไม่มีงวด ก.ย. (R8 ล็อก ต.ค.) · payee ทุกคนสร้างใน R1 ยังไม่ verify (verify ใน R6, in2 ปล่อย unverified) · M10–M12 (บัญชีธนาคาร/รูปแบบไฟล์/รอบ AR) อยู่ใน R1 · C4 → agent.in2, C8 ไม่มอบหมาย · IMEI ผิดรูปแบบเป็น probe ใน R5 (ระบบตรวจตอนรับเข้าคลัง ไม่ใช่ตอนส่งเคส)
- ฐานทดสอบที่สอง `assetrecovery_test2` (owner assetrecovery) ใช้กับ fixer ใน worktree: `TEST_DATABASE_URL=…/assetrecovery_test2 pnpm test`

- 03/10/2569 PO ยืนยันช่วงค่าหน้านโยบายมอบหมายงาน: timeout 1–168 ชม. · เส้นตายกดรับงาน 1–720 ชม. ⇒ เติมเป็น `docs/40` v2.3 แล้ว

## บัญชี Supabase Auth กำพร้า (สะสมจากการ restore — ไว้ลบตอน go-live)
- (ยังไม่มี)
