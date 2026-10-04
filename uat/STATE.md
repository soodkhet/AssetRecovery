# UAT STATE — อ่านไฟล์นี้ก่อนทุก session (คู่กับ UAT_PLAN.md + BUGS.md ส่วน open)

| ฟิลด์ | ค่า |
|---|---|
| รอบล่าสุดที่จบ | **R7a+R7b v3** — 04/10/2569 11:40–11:52 · 25/25 ✅ ตรง golden · บั๊กใหม่ BUG-111…115 (ไม่บล็อก) · bank 4 แถว (IN-1/UATL/UATC จับคู่ · 123.45 ค้างไว้ R7c) · payout 4 รอบ completed · billing paid 2 · AR 0 · ใบกำกับ INV-0001/0002 · 50 ทวิ 15 ใบ / 28500 · ภ.ง.ด.3 28500 · ADV3 **overdue** (asOf 2026-10-05 จำลอง) · งวด ต.ค. collecting · รายงาน `uat/report/R7ab-bankrecon-v3.md` · ภาพ 32 |
| snapshot ล่าสุด | `uat/snapshots/R7b-end-v3.dump` (ปลาย R7b = ต้น R7c) · `R6-end-v3-fixed` (ต้น R7) · `R6-end-v3` · `R6a-end-v3` · `R5-end-v3` (ปลาย R5 v2 = ต้น R6) · `R4-end-v3` (ปลาย R4 หลังแก้ hotel) · `R4a-end-v3` · `R3-end-v3b` (ต้น R4 — **ห้ามใช้ `R3-end-v3`**, BUG-094) · `R4-end-v3-hotel-approved` (ก่อนแก้ — ไม่ใช้) · เก่า (กติกาเดิม): `R5-end-v2`, `R5-end`, `R4-v2-end`, `R4a-v2-end`, `R3-end-v2`, `R4a-end` · ใช้ได้: `R3-end`, `R2-end`, `R1-end`, `R0-clean` |
| รอบปัจจุบัน | **R7c v3** (R7.26–R7.36 งานบัญชี: ยกเลิก-ออกแทน 50 ทวิ, ภ.ง.ด., Exception, ความพร้อมปิดงวด, Export Pack, ส่งสำนักงานบัญชี) → R8 (step sheet กำลังร่าง) → R9 → R10 · มติผู้ใช้: ไม่รอเที่ยงคืน (O10) |
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
- 04/10/2569 ~12:00 R7a+R7b จบ (ตารางบน) · มติผู้ใช้ O10 เล่นต่อไม่รอเที่ยงคืน → fixer K `ebd11e9` (dev trigger asOf) · step sheet R7 v1 `9841db2` · คำขอผู้ใช้ระหว่างรอบ: (1) กรอบโฟกัสแท็บ/เมนูย่อย → fixer L (2) เอกสารแนบรับเคสแบบชุดเดียว 25 MB → fixer M (3) แม่แบบนำเข้าภาษาไทยทุกจุด → fixer N
- 04/10/2569 ~03:00 ผู้ใช้อนุญาต fixer ชุดก่อน R7 → merge fixer I `2faed64` (BUG-095/105/107/108/110) + fixer J `46b31d4` (BUG-096/097/098/099/104 · migration `20261004100000_expense_resubmit_note` → ฐาน dev+test แล้ว) · verify typecheck/lint/260 files 3,330 tests ✅ · snapshot **`R6-end-v3-fixed`** = ต้น R7 · migration ใหม่จาก UAT รวม **8 ตัว** (ถึง `20261004100000`)
- 04/10/2569 ~02:35 R6b v3 จบ (ดูตารางบน) · มติ O8/O9 · Storage `payment-files` +5 bank file (ใช้งานจริง ไม่ใช่ขยะ) · สำเนาในเครื่อง `uat/fixtures/downloads-R6b/` · orchestrator หยุดรอเวลา R7
- 04/10/2569 ~02:20 R6a v3 จบ (ดูตารางบน) → เริ่ม R6b
- 04/10/2569 ~02:10 R5 v2 จบ (ดูตารางบน) · step sheet R6 v2 เสร็จ (R6a 20 / R6b 24 ขั้น · golden ลงตัว) · มติ orchestrator + บัญชี A1–A7 → `uat/PO-DECISIONS-2569-10-04.md` (A1/A2 ต้องแก้โค้ด — รอผู้ใช้รีวิว · UAT ยึดโค้ดปัจจุบัน) · ขยะ Storage +4
- 04/10/2569 ~01:40 R4b v3 จบ + R4.38b (PO เผลอใช้ admin อนุมัติค่าที่พักขั้น 1 → มติ PO ก.: ตีกลับผ่านหน้าจอ + in1 ส่งใหม่) · มติ PO BUG-095 = ก. · **ผู้ใช้อนุญาตให้ orchestrator เดินต่อเองข้ามคืน + ตัดสินเรื่องนักบัญชีตามมาตรฐานบัญชีไทย (จดเหตุผลไว้ให้รีวิว) + ซ่อมฐาน dev ในเครื่องได้** · ขยะ Storage +1
- 04/10/2569 00:50 R4a v3 จบ (ดูตารางบน) · ก่อนเริ่มพบฐาน dev ขาด 3 migration (BUG-094) → ผู้ใช้อนุญาตให้ orchestrator ซ่อมฐาน dev ในเครื่อง · snapshot `R3-end-v3b` + `R4a-end-v3` · สคริปต์ `uat/bin/r4v3/` (มี s11b-settle, s12–s17 ปรับเป็น R4v3 แล้ว) · ไฟล์ขยะ Storage +1
- 04/10/2569 00:00 merge fixer H (Q21: job `daily_field_allowance`, ตาราง `field_day_settlements`, เกตรายได้ `field_days_not_settled`, DEC-012) · verify 258 files / 3,313 tests · restore `R3-end-v2` → snapshot `R3-end-v3` · มติ PO: settle วันนี้ผ่าน dev trigger หลังเช็คอินครบ
- 03/10/2569 merge fixer G (R6-A/B, race รายได้, หน้าผู้รับเงิน …) + seed 2 แถว (บัญชี/บริหาร ดูรอบจ่าย) · migration `20261003160000` ล้มบนฐานทดสอบหลักเพราะรายได้ซ้ำจากเทสต์เก่า 33 กลุ่ม → soft-delete 462 แถวในฐานทดสอบ (ไม่ใช่ข้อมูลจริง) + `migrate resolve --rolled-back` + deploy ใหม่ · verify 258 files / 3,292 tests · **⚠️ ก่อน `db:deploy` staging: ตรวจ `select case_id, tracking_round, count(*) from revenues where deleted_at is null group by 1,2 having count(*)>1` ต้องว่าง**
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

## ▶️ HANDOFF — session ใหม่เริ่มตรงนี้ (เขียน 04/10/2569 ~02:35 หลัง R6b v3)

### 0. สถานะ
- ฐาน dev = **`R6-end-v3-fixed`** (ปลาย R6 + fixer I/J + migration `20261004100000`) · staging HEAD = `git log -1` · ยังไม่ push (มติผู้ใช้: push ทีเดียวหลัง UAT จบ)
- รอบที่จบในคืน 04/10: R4a v3 → R4b v3 (+R4.38b) → R5 v2 → R6a v3 → R6b v3 · ทุกรอบเงินตรง golden · ไม่มี S1/S2 เปิด
- ⚠️ **รอผู้ใช้รีวิว**: `uat/PO-DECISIONS-2569-10-04.md` (O1–O9 + บัญชี A1–A7 — A1 ฐาน WHT ไม่รวมค่าใช้จ่ายจริงตามใบเสร็จ / A2 50 ทวิ 1 ใบต่อผู้รับต่อรอบ = ต้องแก้โค้ด เปลี่ยน golden IN-1 → ยังไม่ทำ) · คำถามนักบัญชี 3 ข้อเดิมใน `uat/PO-DECISIONS-2569-10-03.md` (orchestrator เปิดอ่านส่วนนั้นไม่ได้ — ให้ผู้ใช้ดูเอง) · BUGS needs-decision: 076, 078, 084, 090, 093, 100, 101, 102, 106, 109
- ✅ บั๊ก 095–099, 104, 105, 107, 108, 110 แก้แล้ว (fixer I/J) · ใน R7 ให้ role agent ยืนยันซ้ำแบบเบา ๆ: ลิงก์แจ้งเตือน, audit lot/superseded, หมายเหตุ resubmit (`resubmit_note`), ยอดเคลียร์เงินทดรองพิมพ์ตัวอักษรไม่ล่ม · ข้อสังเกต fixer: หน้าอนุมัติการเงินยังไม่แสดง `resubmit_note` · `expense.approved` ยังลิงก์ `/field/income` · ไม่มี DOM test infra (BUG-107 ใช้ unit test ของ pure fn)
- ⚠️ DATASET v3 ถ้อยคำยังไม่แก้ตามมติ O4 · step sheet R6.md v2 ยังไม่แก้ตาม O9 (R6.09 14→15 แถว, R6.41 บัญชีคาด redirect) · R5.md §0.6 asset id เก่า

### 1. R7 (ต้องหลัง 00:00 น. 05/10/2569)
1. ตรวจ dev server (`curl … /login` = 200) + `pnpm prisma migrate status` สะอาด
2. ปรับ `uat/steps/R7.md` ให้ตรง DATASET v3 + สถานะปลาย R6 จริง (subagent — ถ้ายังไม่มี v ที่ตรง): ต้น R7 = `advance_overdue` ผ่าน dev trigger (ADV3 ครบกำหนด 04/10 → overdue) · `uat/fixtures/bank-R7.csv` (IN-1 = 4891.50) แทน `{{R7_DATE}}` ก่อนนำเข้า · IN-1 ค้าง `file_generated` v2 รอจับคู่ → auto-match → 50 ทวิ รวมเป็น 15 ใบ / 28500 (E9) · ตรวจ W1: ภ.ง.ด.3 ไม่นับแถวเงินทดรอง
3. วงจรต่อรอบเหมือน HANDOFF เดิม §1 (prompt role agent แบบ R6b: ขอบเขต/สถานะต้นรอบ/ต้องยืนยัน/กติกา/คืนผล ≤ 1,200 tokens)
4. ต่อ R8 บริหาร (ปิดงวด ต.ค./Adjustment) → R9 รายงาน (golden DATASET v3 E10) → R10 สิทธิ์ (API ขนาน 12 persona) → รวมเล่มรายงาน (`UAT_PLAN.md` §11.3)

### 2. ก่อน push staging — ดู §6 ของ HANDOFF เก่าด้านล่าง (migration + ตรวจรายได้ซ้ำ + seed staging) · **เพิ่ม: ยืนยัน `CRON_SECRET` ตั้งบน Vercel staging/production (มติ O40)** · **Supabase: ตรวจ "Upload file size limit" ของ project ≥ 100 MB (วิดีโอ) และ ≥ 25 MB (เอกสารชุด)** · ไฟล์กำพร้า bucket `accounting-packs` จาก R7c (2 attempt) — ลบตอน go-live

## HANDOFF เก่า (04/10/2569 ~00:30 — ก่อน R4 v3 · เก็บไว้อ้างอิง §1 วงจรต่อรอบ + §6 ก่อน push)

### 0. สถานะ ณ ตอนส่งต่อ
- staging HEAD: ดู `git log -1` (ล่าสุดตอนเขียน = commit ที่มีไฟล์นี้) · ยังไม่ push · migration ใหม่ทั้งหมดตั้งแต่ R0 ต้อง deploy กับ staging ทีหลัง (ดู §6)
- ฐาน dev = `R3-end-v3` (ปลาย R3 + schema/สิทธิ์ล่าสุด) — **ยังไม่ได้เล่นอะไรต่อจากนี้** · C1,C2,C7 → in1 · C3,C4 → in2 · C5 → out1 ทุกใบ `pending_accept` · ไม่มี expense/asset/advance/revenue
- เอกสารที่ใช้: `uat/DATASET.md` **v3** · `uat/steps/R4.md` **v3** · `uat/steps/R5.md` **v2** · `uat/steps/R6.md` **v1 (ต้องปรับก่อนเล่น — §4)**
- มติทั้งหมด: `uat/PO-DECISIONS-2569-10-03.md` (Q1–Q21 + R6-A/B + มติจังหวะเวลา 04/10) — มีผลกับโค้ดแล้วทุกข้อ
- dev server: `~/bin/dev asset` (pm2) → http://localhost:3000 · **ตรวจก่อนเริ่มทุกครั้ง** `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login` ต้องได้ 200 (เคยหลุดหายจาก pm2 ระหว่างคืน) · smoke: `node uat/bin/smoke.mjs`

### 1. วงจรต่อรอบ (ทำซ้ำทุกรอบ — orchestrator ห้ามอ่านไฟล์ใหญ่เอง ให้ subagent ทำ)
1. ปล่อย role agent (prompt §2) แบบ background
2. จบรอบ: `uat/bin/snap.sh <ชื่อ>` → รวมบั๊กเข้า `uat/BUGS.md` (เลขต่อจาก BUG-115) → อัปเดตตารางบนสุดของไฟล์นี้ + Log → commit (`test(uat): …` + บรรทัด Co-Authored-By) · ตรวจไม่มีรหัสผ่านหลุด: `! grep -rq "Uat-[A-Za-z0-9_-]\{8,\}" <ไฟล์ที่จะ commit>`
3. บั๊ก S1/S2 ที่บล็อก → fixer ใน worktree (`isolation: worktree`, ฐานทดสอบแยก test2…test7 ที่มีอยู่แล้ว, `git merge staging` + `pnpm install --frozen-lockfile` + `pnpm db:generate` ก่อน) → merge **ระหว่างรอบเท่านั้น** (ห้าม merge ขณะ role agent รัน)
4. หลัง merge ที่มี migration: `pnpm db:generate` → `pnpm db:deploy` → `PRISMA_USE_TEST_DB=1 pnpm db:deploy:test` → `pnpm db:seed` (ไม่ทับแถวเดิม) → `~/bin/dev restart asset` → `pnpm typecheck && pnpm lint && pnpm test`
5. คำถามที่ต้องให้ผู้ใช้ตัดสิน: ถามเป็นชุดตัวเลือกภาษาไทย (AskUserQuestion) พร้อมตัวอย่างตัวเลข — ผู้ใช้ชอบแบบนี้

### 2. Prompt ของ role agent R4a v3 (ใช้ได้ทันที)
> คุณคือ **role agent ของรอบ R4a v3 "ภาคสนาม (มือถือ)"** ใน UAT ของ AssetRecovery (~/AssetRecovery) — เล่นเป็นพนักงาน `uat.agent.in1`, `uat.agent.in2`, `uat.agent.out1` บนมือถือจำลอง (iPhone 14), ธุรการ `uat.admin` (ดูงานรอรับเข้าคลัง) และ `admin` (สั่ง job รายวัน R4.23b) ผ่านเบราว์เซอร์จริงด้วย Playwright แล้วผลิตรายงานแบบคู่มือพร้อมภาพหน้าจอ
> **ขอบเขต: R4.01–R4.23b ใน `uat/steps/R4.md` v3** (ห้ามทำ R4.24 ขึ้นไป) · ต้นรอบ = `R3-end-v3` (C1,C2,C7 → in1 · C3,C4 → in2 · C5 → out1 ทุกใบ pending_accept)
> **อ่าน**: `UAT_PLAN.md` §6 §7 §10.2 §11 · `uat/steps/R4.md` v3 (changelog + หัวไฟล์ + R4.01–R4.23b) · `uat/DATASET.md` v3 (golden: ปิดงานสร้างแค่ commission/no_success_fee · หลังสั่ง job รายวันต่อเคส in1 C1/C2 และ in2 C3/C4 = fuel 10000 + allowance 7500, out1 C5 = fuel 550000 · `field_day_settlements` 3 แถว) · `uat/report/_TEMPLATE.md` · ตัวอย่าง `uat/report/R4a-field-v2.md` (60 บรรทัดแรก) · สคริปต์เดิม `uat/bin/r4v2/` → **คัดลอกเป็น `uat/bin/r4v3/` แล้วแก้ตามตารางในหัว R4.md**
> **ต้องยืนยัน**: ปิดงานไม่สร้างค่าน้ำมัน/เบี้ยเลี้ยง + หน้าเบิกแสดง "รอคำนวณหลังจบวัน" · toast แสดงรายการที่สร้างจริง · C3 ต้องเลือกเหตุผลไม่สำเร็จ · บันทึกเพิ่มเติมถูกเก็บ · ไฟล์ปลอมถูก server ปัด (ฟอร์มเอาไฟล์ออกเอง) · แจ้งเตือนถูกคน · **R4.23b ต้องทำหลังเช็คอิน/ปิดงานของทุกคนครบ**: `admin` → `POST /api/dev/trigger-job` `{"jobType":"daily_field_allowance","payload":{"date":"2026-10-04"}}` (วันที่ต้องตรงวันที่เช็คอินจริงตามเวลาไทย — ถ้าเล่นข้ามเที่ยงคืน ให้ใช้วันที่ของเช็คอินจริงและรายงาน) → ตรวจแถวรายวัน/ผลรวมต่อพนักงาน/สั่งซ้ำ duplicate/วันอนาคต 400/การเงิน 403 · ข้อสังเกตในท้าย R4.md (R4v3-A/B/C) — ยืนยัน/หักล้าง
> **กติกา**: GPS `context.grantPermissions(['geolocation'],{origin})` + `setGeolocation` · วิดีโอสร้างด้วย Chrome MediaRecorder · เก็บไฟล์ Storage ทุกไฟล์ ห้ามลบ · session หมดอายุ `openAs` login ใหม่เอง · S1/S2 ที่บล็อก → หยุดรายงาน · **ห้าม**: แก้โค้ด/docs/, แก้ `uat/BUGS.md` `uat/STATE.md` `uat/DATASET.md` `uat/steps/`, restore DB, commit, ติดตั้งแพ็กเกจ, รีสตาร์ต server, เขียน DB ด้วย SQL, พิมพ์รหัสผ่าน
> **เครื่องมือ**: `uat/bin/lib.mjs` (`openAs(u,{mobile:true})`, `shot(page,'R4v3','NN-slug')`) · `uat/bin/q.sh` (read-only) · `uat/bin/counts.sh` · log `PATH=/opt/homebrew/bin:$PATH pm2 logs asset-web --nostream --lines 40` (ห้าม `~/bin/dev logs`)
> **รายงาน**: `uat/report/R4a-field-v3.md` แบบคู่มือสำหรับพนักงาน + ท้ายรายงาน "🐞 บั๊กที่พบ" (`R4v3-B01`…) + "❓ ต้องตัดสินใจ" · งบ context ≤ 250k
> **คืน (≤ 1,100 tokens)**: step ที่ทำถึง + ✅/🐞/⚠️/❓ · บั๊กละ 1 บรรทัด · ผลยืนยันแต่ละข้อ · ตารางปลายรอบ (expense ต่อเคส/ชนิด/ยอด/สถานะ, field_day_settlements, asset, case_evidences) · ผลรวม expense active เทียบ golden v3 (ผูกเคส 890000 ก่อนค่าที่พัก) · `counts.sh` · จำนวนภาพ/ไฟล์อัปโหลด

### 3. หลัง R4a
snapshot `R4a-end-v3` → R4b (R4.24–R4.38: ใช้ prompt แบบเดียวกับ §2 เปลี่ยนขอบเขต + ยืนยัน: ตีกลับหลักฐาน C4 ผ่านหน้าจอ, resubmit แทนที่เฉพาะ commission (แถวรายวันไม่ถูกแทน), ค่าที่พัก in1 ฿600 ผ่านหน้าจอ + ตรวจไฟล์ใบเสร็จฝั่ง server, เงินทดรอง ADV1/ADV2/ADV3 (วันเคลียร์ 04/10)/ADV-MAX/ADV4 ผ่าน `/field/advances` ทุกใบค้าง pending) → snapshot `R4-end-v3` → R5 v2 (prompt แบบ R5 เดิมในประวัติ: ธุรการทำคลัง, ไม่กด "ยืนยันรับทั้งที่ IMEI ไม่ตรง", ยืนยันล็อตต้องปลดล็อกแถวรายวันด้วย) → snapshot `R5-end-v3`

### 4. ก่อน R6
- ปรับ `uat/steps/R6.md` → v2 ด้วย subagent: golden ตาม DATASET v3 (IN-1 495000/5850/489150 · IN-2 305000/3150/301850 · OUT-1 730500 · OUT-2 30000 · 50 ทวิ 15 ใบ 28500) + หน้าจอใหม่ของ fixer G (ผู้จัดการ: เมนู "การเงิน" → แท็บ "ค่าตอบแทน" ปุ่ม "อนุมัติขั้น {n}"/"ตีกลับ" · การเงิน: `/finance?tab=payee`) + รายการไม่ผูกเคส → ผู้จัดการทีมของผู้เบิก + payee unverified = **ปฏิเสธการสร้างรอบทั้งรอบ** (`UNVERIFIED_PAYEE_IN_PAYOUT`) + bank file format ต้องกด "ทดสอบ" ก่อน · ⚠️ ฐาน WHT ของ in2 เกินเกณฑ์แค่ ฿50 — ทุกรายการของ in2 ต้อง approved ก่อนสร้าง IN-2
- R6 แบ่ง R6a/R6b · IN-1 ค้าง `file_generated` ไว้ถึง R7
### 5. R7 ขึ้นไป
- ต้น R7: ADV3 overdue (`advance_overdue` ผ่าน dev trigger) — ต้องหลังเที่ยงคืนของวันเคลียร์ (05/10 เป็นต้นไป)
- `uat/fixtures/bank-R7.csv` IN-1 = 4891.50 แล้ว · แทนค่า `{{R7_DATE}}` ก่อนนำเข้า
- R8 บริหาร (ปิดงวด/Adjustment) → R9 รายงาน (golden ใน DATASET v3 E10) → R10 สิทธิ์/ขอบเขต (API ขนาน 12 persona) → รวมเล่มรายงานคู่มือ (`UAT_PLAN.md` §11.3)

### 6. ก่อนผู้ใช้ push ขึ้น staging (แจ้งผู้ใช้ทุกครั้งที่ถาม) — **มติผู้ใช้ 04/10/2569: ยังไม่ push จนกว่า UAT จบทุกรอบ แล้วค่อย push ทีเดียว** (ห้ามเสนอ push ระหว่างทาง เว้นแต่พบช่องโหว่ร้ายแรงใหม่)
- migration ใหม่จาก UAT **8 ตัว** (ตั้งแต่ `20261003113300` ถึง `20261004100000`) → ตรวจก่อนด้วย `PRISMA_ENV_FILE=.env.staging pnpm prisma migrate status` → `PRISMA_ENV_FILE=.env.staging pnpm db:deploy` · ก่อนนั้นตรวจรายได้ซ้ำ (BUG-089) ต้องว่าง · แล้ว seed staging (คำสั่งใน memory `staging-migrations-manual`) เพื่อเพิ่มสิทธิ์ใหม่ (การเงิน approve_advance, ธุรการคลัง 4 ตัว, บัญชี/บริหารดูรอบจ่าย)
- Storage ของ staging ตั้งแล้ว (`qgshdg…` = localhost + staging) · cron: `vercel.json` ไม่ต้องแก้ — `/api/cron/jobs` ตั้งคิว `daily_field_allowance` เองหลังเที่ยงคืนไทย (`schedule: { kind: "daily" }`)

### รอมติ PO / นักบัญชี (ไม่บล็อก — ถามรวดเมื่อสะดวก)
ดูท้าย `uat/PO-DECISIONS-2569-10-03.md` (คำถามนักบัญชี 3 ข้อ + ข้อสังเกตหลังแก้: ผู้จัดการรับเข้าคลังได้ไหม, `38` §13 แถว edit_case, วันที่รายได้หลัง resubmit ข้ามเดือน, เพดานค่าที่พักต่อคืน, ภาพแผนที่จริง) + BUGS ที่สถานะ needs-decision (BUG-076, 078, 084, 090 (`25` ให้ตรง `17`), 093)

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
- R4a v3: `case-documents/cases/7de5741e-1dfd-4a5b-ad7b-7df4206d5314/field_evidence/video/c6a8bc1e-c486-41f1-99e2-66424183fdd4-R4-fake-video.mp4` (ขยะ) · หลักฐานจริง 14 ไฟล์ใช้งานอยู่
- R4b v3: `case-documents/expenses/88cb577d-32b4-49ff-96fb-06a2e093d339/receipts/f7f77b14-26af-40f1-9883-73f4d694a9c2-R4b-fake-receipt.jpg` (ขยะ)
- R5 v2 (ขยะ 4): `assets/aa1a2872-d1c0-46c7-98a0-44c3f84fea1f/intake/front/69ba4721-5567-4c24-8eff-7c5693f3105b-R5-fake-photo.jpg` · `assets/5cad8233-fbe1-4ba6-ab92-f886e4434689/intake/front/<uuid>-R5-fake-photo.jpg` · `handover-lots/15db3c66-d183-4a3a-bbb0-2d9decee40af/signed-doc/ffc7dd0c-….pdf` (ปลอม) · `handover-lots/15db3c66-d183-4a3a-bbb0-2d9decee40af/signed-doc/c4826624-a978-4a7b-af42-b93a3a4c68b3.pdf` (v2 แรก ถูกแทน)
- หลักฐานของ R4a เดิม 14 ไฟล์ (ฐานถูกย้อนแล้ว — ไฟล์ไม่มีแถวอ้างอิง)
