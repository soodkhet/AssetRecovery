# UAT STATE — อ่านไฟล์นี้ก่อนทุก session (คู่กับ UAT_PLAN.md + BUGS.md ส่วน open)

| ฟิลด์ | ค่า |
|---|---|
| รอบล่าสุดที่จบ | **R5 คลังสินค้า** (ธุรการ) — 03/10/2569 · 24/24 ✅ · ยืนยัน BUG-074…078 + ใหม่ 079…084 (ไม่บล็อก) · ไม่มี 500 · ล็อต LOT-2569-001 (CO1: C1,C2,C4) / LOT-2569-002 (CO2: C5) confirmed · expense active 15 แถว 1020000 ทั้งหมด pending_approval · revenue 0 · รายงาน `uat/report/R5-warehouse.md` · ภาพ 55 |
| snapshot ล่าสุด | `uat/snapshots/R5-end.dump` (ก่อนหน้า: `R4-v2-end`, `R3-end-v2`, …) |
| รอบปัจจุบัน | **หยุด R6** (มติ PO Q21: ค่าน้ำมันเหมา + เบี้ยเลี้ยง วันละครั้งต่อพนักงาน เฉลี่ยทุกเคสในวัน สร้างหลังจบวันด้วย job) · fixer G (การเงินก่อน R6, test3) + fixer H (Q21, test7) คู่ขนาน → merge ทั้งคู่ + generate/deploy/restart/verify → `uat/bin/restore.sh R3-end-v2` → ปรับ DATASET v3 + step sheet R4/R5 → เล่น R4–R5 ใหม่ (เช็คอินวันที่ 03/10) → **หลังเที่ยงคืน**: สั่ง job รายวัน (settle 03/10) + job `advance_overdue` → R6 |
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
- 03/10/2569 ~20:45 step sheet R6 เสร็จ (43 ขั้น) · มติ PO R6-A (หน้าคิวอนุมัติของผู้จัดการ) / R6-B (รายการไม่ผูกเคส → ผู้จัดการทีมของผู้เบิก) / Q21 (เหมาจ่ายรายวันต่อพนักงาน) · ข้อมูล R4–R5 เดิมคิดต่อเคส ⇒ ต้องเล่นใหม่
- 03/10/2569 merge fixer ครบ 5 ตัว (A/B/C/D/E) — migration ใหม่ 4 ตัว · verify 257 files / 3,253 tests · **หลัง merge ที่มี migration ต้อง `pnpm db:generate` + `pnpm db:deploy` + `db:deploy:test` + restart dev server** · restore R3-end → snapshot `R3-end-v2` · DATASET v2 + R4 v2 · ADV4 (out1 ฿1,000 → ใช้จริง ฿1,300 ใน R6 → เบิกส่วนเกิน ฿300 → OUT-2) · bank fixture IN-1 = 5231.00
- 03/10/2569 ถาม PO 20 ข้อ (ชุดตัวเลือก) → บันทึก `uat/PO-DECISIONS-2569-10-03.md` · merge fixer R4 + `pnpm db:seed` (สร้าง 1 แถว: การเงิน approve_advance) · restore.sh เพิ่ม db:deploy + seed · สร้าง `assetrecovery_test3/4/5` ให้ fixer คู่ขนาน · มติ Q2 (คอมมิชชันตอนปิดงาน) ⇒ ต้องเล่น R4 ใหม่บนโค้ดที่แก้แล้ว
- 03/10/2569 R4a จบ: C1/C2/C4/C5 closed_success, C3 closed_fail, C7 accepted_unscheduled · asset pending_intake 4 ใบ · ดับเบิลคลิก/race ปิดงานไม่ซ้ำ · บั๊กใหม่ BUG-062…068 (BUG-063 ไม่มี role คลัง บล็อก R5)
- 03/10/2569 R3 จบ: C1,C2,C7 → in1 · C3,C4 → in2 · C5 → out1 (ทุกใบ pending_accept, active 1 แถว/เคส) · BUG-038 race ไม่เกิดจริง · ยืนยัน BUG-039…044 · บั๊กใหม่ BUG-059…061 · fixer R4 เสร็จ (BUG-045/046/047/049/051/053) — seed ใหม่ทดสอบบน test2 แล้ว: แถวที่ถูกแก้ไม่ถูกทับ
- 03/10/2569 step sheet R4 เสร็จ (36 ขั้น แบ่ง R4a ภาคสนาม R4.01–R4.22 / R4b ตีกลับหลักฐาน+เงินทดรอง R4.23–R4.36) · มติ orchestrator: เล่น R4a ทันทีหลัง R3 · fixer แก้ BUG-045/046/047 (+048,049,051,052,053) คู่ขนาน → merge → เล่น R4b ผ่านหน้าจอจริง (ไม่ใช้ API แทน UI) · ADV3 ใช้วันครบกำหนดในอดีต (โค้ดยอม — BUG-058) · เพิ่ม hotel claim 1 ใบของ in1 ฿600 ใน R4b (payee มี Tax Profile แล้ว ไม่ชนหนี้ #3; ต่ำกว่า threshold ไม่หัก WHT ⇒ IN-1 net +60000)
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
- (ยังไม่มีบัญชี Auth กำพร้า)

## ไฟล์ทดสอบใน Storage ที่ตั้งใจให้ค้าง (ไว้ลบตอน go-live)
- `case-documents/cases/7de5741e-1dfd-4a5b-ad7b-7df4206d5314/field_evidence/video/4b1dcc07-6a53-4d69-9745-b62394b20e73-R4-fake-video.mp4` (R4a เดิม)
- `case-documents/cases/7de5741e-1dfd-4a5b-ad7b-7df4206d5314/field_evidence/video/aa8879c5-b474-4cd8-bf71-f8d170e48831-R4-fake-video.mp4` (R4a v2)
- R4b v2: `cases/d4d82f78…/field_evidence/product_photo/7d772c98-…-R4-C4-product-v2.jpg`, `expenses/88cb577d…/receipts/91324d20-…-R4-C1-photo.jpg` (ใช้งานจริง ไม่ใช่ขยะ)
- R5: รูปรับเข้า 13 + เอกสารล็อต 4 (ใช้งานจริง) · ขยะ: รูปปลอม C4 2 ไฟล์ (`…ccddbd4b…-R5-fake-photo.jpg` + อีก 1 ไม่ได้จด path) + ใบเซ็นปลอม 1 ไฟล์ (ไม่ได้จด uuid) — ดู `uat/report/R5-warehouse.md` · ตอนลบให้ลบ object ใต้ `assets/*/intake/` และ `handover-lots/*/` ที่ไม่มีแถว DB อ้างอิง
- หลักฐานของ R4a เดิม 14 ไฟล์ (ฐานถูกย้อนแล้ว — ไฟล์ไม่มีแถวอ้างอิง)
