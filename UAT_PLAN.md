# UAT_PLAN.md — แผนทดสอบใช้งานจริงทีละ Role ทีละขั้นตอน (AssetRecovery)

> เป้าหมาย 2 อย่างพร้อมกัน: (1) ได้ **ชุดข้อมูลตัวอย่างที่ผ่านการใช้งานจริง** ครบทั้งวงจรเงิน (2) **ล่าบั๊ก** ที่ unit/integration test ไม่เห็น — โดยเฉพาะจุดส่งต่องานข้าม role
> หลักการ: เดินตาม **เส้นทางของเงิน** (เคส → ภาคสนาม → คลัง → รายได้/ค่าตอบแทน → จ่าย/วางบิล → บัญชี → ปิดงวด) · ทุกก้าวมี "ค่าที่คาดหวัง" คำนวณไว้ล่วงหน้าจาก `22` · ทุกรอบมี snapshot ฐานข้อมูลให้ย้อนกลับได้

---

## 1. บทบาทของคนกับ Claude

| ใคร | ทำอะไร |
|---|---|
| **คุณ (ผู้ทดสอบ)** | ล็อกอินเป็น role นั้น ๆ แล้ว**คลิกจริง**ตาม step sheet ทีละข้อ · บอกสิ่งที่เห็น (หรือแปะ screenshot) เมื่อผิดจากที่คาด · Field Agent ทดสอบบน**มือถือจริง** |
| **Claude (test conductor)** | ก่อนรอบ: เตรียม step sheet + ค่าคาดหวัง + snapshot · ระหว่างรอบ: ตรวจหลังบ้านทุก step (DB state ตาม `23`, audit 9 field, notification, pm2 log, console) · หลังรอบ: สรุปบั๊กลง `uat/BUGS.md`, snapshot, เตรียมรอบถัดไป |
| **กติกาแก้บั๊ก** | บั๊กที่ **บล็อก** รอบ → แก้ทันที (commit แยก `fix(uat-R<n>)`) → restore snapshot ต้นรอบ → ทำรอบนั้นใหม่ · บั๊กไม่บล็อก → จดไว้ แก้หลังจบรอบ · เรื่องที่ต้องมีมติ (ขัด spec / กระทบภาษี) → `[[NEEDS_DECISION]]` ไม่แก้เงียบ ๆ |

---

## 2. สภาพแวดล้อม

- แอป: `dev asset` → http://localhost:3000 (pm2 `asset-web`) · มือถือใน Wi-Fi เดียวกันเข้า `http://<IP เครื่อง Mac>:3000`
- ฐานข้อมูล: Postgres บนเครื่อง `assetrecovery_dev` (ห้ามยิง staging) · Auth: Supabase (cloud) — บัญชี Auth อยู่**นอก** DB snapshot (ดู §2.2)
- Job เบื้องหลัง: ไม่มี cron บนเครื่อง → สั่งเองผ่าน `POST /api/dev/trigger-job` หรือหน้า **การตั้งค่า → งานเบื้องหลัง** (ปิดอัตโนมัติเมื่อ `NODE_ENV=production`)
- ล็อกอินหลาย role พร้อมกัน: ใช้ Chrome profile แยกต่อ role (หรือ incognito หลายหน้าต่าง) · Claude ใช้ browser ในแอปเป็น role คู่ขนานได้เมื่อต้องยิง 2 คนพร้อมกัน (race)

### 2.1 เตรียมก่อนเริ่ม (Round 0)

```bash
pnpm db:deploy && pnpm db:seed && pnpm auth:dev-admin
```

- ตรวจ `pnpm typecheck && pnpm test` เขียวก่อน (baseline — บั๊กที่เจอทีหลังจะได้มั่นใจว่ามาจาก UAT ไม่ใช่ของค้าง)
- สร้างโฟลเดอร์ `uat/` (ไม่ commit — เพิ่มใน `.gitignore`): `uat/snapshots/`, `uat/BUGS.md`, `uat/DATASET.md`, `uat/steps/R<n>.md`

### 2.2 Snapshot / Restore

```bash
pg_dump -Fc assetrecovery_dev > uat/snapshots/R<n>-<label>.dump
```

```bash
pg_restore -c -d assetrecovery_dev uat/snapshots/R<n>-<label>.dump
```

- snapshot **ต้นรอบ** และ **ปลายรอบ** ทุกรอบ · restore แล้วผู้ใช้ UAT ยังล็อกอินได้ (Auth อยู่ Supabase, `users.id` คงเดิมใน dump)
- ⚠️ ถ้า restore ย้อนไปก่อน Round 1 (ก่อนสร้างผู้ใช้) บัญชี Auth จะกำพร้า — DEC-010 ข้อ 7 ให้ระบบลบแล้วสร้างใหม่เองตอนสร้างผู้ใช้ซ้ำ (ถือเป็นจุดทดสอบด้วย)

---

## 3. ชุดบุคคล (Persona) — 1 คนต่อ role · username `uat.<role>`

| # | Role (role_group) | username | สังกัด | ใช้ในรอบ |
|---|---|---|---|---|
| 0 | Superadmin | `admin` (dev alias) | — | ทุกรอบ (ตั้งค่า + สังเกตการณ์) |
| 1 | ธุรการ (system) | `uat.admin` | — | R2 |
| 2 | เจ้าหน้าที่อนุมัติเคส (system) | `uat.approver` | — | R2, R4 |
| 3 | ผู้จัดการทีม (inhouse) | `uat.mgr.in` | ทีม A + ทีม B | R3, R6 |
| 4 | หัวหน้าทีม (inhouse) | `uat.sup.in` | ทีม A | R3, R4 |
| 5 | พนักงานติดตามทรัพย์ (inhouse) ×2 | `uat.agent.in1`, `uat.agent.in2` | ทีม A | R4 (มือถือ) |
| 6 | ผู้จัดการทีม (outsource) | `uat.mgr.out` | ทีม C | R3, R6 |
| 7 | พนักงานติดตามทรัพย์ (outsource) | `uat.agent.out1` | ทีม C | R4 (มือถือ) — ผู้รับเงินถูกหัก WHT 3% |
| 8 | การเงิน (system) | `uat.finance` | — | R6 |
| 9 | บัญชี (system) | `uat.account` | — | R7 |
| 10 | บริหาร (system) | `uat.exec` | — | R6 (เกินเพดาน), R8 |
| 11 | ผู้จัดการ / หัวหน้า / แอดมิน (finance_company) | `uat.co1.mgr`, `uat.co1.sup`, `uat.co2.admin` | บริษัท 1 / บริษัท 2 | R10 (scope) — Portal ยังไม่มี (Phase 7) จึงทดสอบแค่ว่าเข้าเมนูภายในไม่ได้ |

หัวหน้าทีม/ผู้จัดการ outsource ไม่ครบทุก role ก็ได้ — ครบ **12 role ที่มีเมนูให้ใช้จริง** พอ · รหัสผ่านเริ่มต้นตั้งในฟอร์ม → ล็อกอินครั้งแรก**ต้องถูกบังคับเปลี่ยน** (ทดสอบ DEC-010 ข้อ 5 ไปด้วย)

---

## 4. ชุดข้อมูลเรื่องราว (Dataset) — ออกแบบให้ครอบคลุมทุกกิ่งของ state machine

จดลง `uat/DATASET.md` พร้อม **ค่าคาดหวังที่คำนวณมือ** (satang) ก่อนลงมือ — ใช้ตรวจรายงานใน R9

**Master data (R1)**
- บริษัทไฟแนนซ์ 2 แห่ง: **บริษัท 1** หักภาษี ณ ที่จ่ายก่อนโอน 3% (`wht_withheld_by_customer_pct = 3`) · **บริษัท 2** ไม่หัก (NULL) → ทดสอบ A1 ทั้งสองทาง
- Service Fee Template อย่างน้อย 2 โหมด (SUCCESS_FEE แบบ % และแบบ fixed) ผูกคนละบริษัท
- ทีม A (inhouse, กรุงเทพ), ทีม B (inhouse, ไม่มีสมาชิก — ไว้ทดสอบมอบหมายทีมว่าง), ทีม C (outsource)
- Compensation Plan: inhouse (น้ำมัน/เบี้ยเลี้ยง/คอมมิชชัน) และ outsource (เหมา + WHT plan-level) — **ให้ agent.out1 มี Tax Profile ระดับผู้รับเงิน** ด้วย เพื่อทดสอบ "Payee ชนะ Plan"
- Approval Matrix: ขั้น 1 ผู้จัดการทีม → ขั้น 2 การเงิน · เกินเพดาน (เช่น > 5,000 บาท) ต้องบริหาร
- งวดบัญชี: เดือนปัจจุบัน `collecting` · **เดือนก่อน** สร้างไว้แล้วล็อก (สำหรับ R8)

**เคส 8 ใบ (R2–R5)** — `case_ref` รูปแบบ `UAT-<บริษัท>-<เลข>`

| เคส | บริษัท | ทีม/ผู้รับ | เส้นทางที่ต้องเดิน | สิ่งที่พิสูจน์ |
|---|---|---|---|---|
| C1 | 1 | A / agent.in1 | สำเร็จ + มีค่าใช้จ่าย → ส่งคลัง → ยืนยันล็อต | Revenue trigger กรณีปกติ (expense.approved AND lot.confirmed) |
| C2 | 1 | A / agent.in1 | สำเร็จ ไม่ยื่นค่าที่พัก (มีแค่ fuel/allowance อัตโนมัติ) → ส่งคลัง | ต้องผ่านคลังเสมอ · revenue ไม่เกิดตอน lot confirmed ถ้า expense ยังไม่ approved |
| C3 | 2 | A / agent.in2 | ไม่สำเร็จ (closed_fail) | ไม่ผ่านคลัง · ค่าตอบแทนอย่างเดียว · ไม่มี revenue |
| C4 | 1 | A / agent.in2 | สำเร็จ → approver ตีกลับหลักฐาน → แก้แล้วส่งใหม่ | resubmit_close: expense เดิม superseded ไม่ซ้ำไม่หาย · revenue ยังไม่เกิดก่อนอนุมัติ |
| C5 | 2 | C / agent.out1 | สำเร็จ, เบิกยอดสูง > เพดาน | Approval ขั้นบริหาร · WHT payee-level ชนะ plan-level · ฝั่ง outsource แยกรอบจ่าย |
| C6 | 1 | — | ส่งซ้ำ `case_ref` เดิม (รอบติดตามเดียวกัน) | DUPLICATE ถูกปัด · กดส่งพร้อมกัน 2 แท็บ |
| C7 | 2 | A / in2 รับงานแล้ว → ผู้จัดการขอเปลี่ยนเป็น in1 → in2 ไม่ตอบจนหมดเวลา (timeout) → ระบบโอนให้ in1 อัตโนมัติ | reassign timeout job (`40` §8–§11 — timeout ใช้กับคำขอเปลี่ยนผู้รับผิดชอบที่รอความยินยอมเท่านั้น; "มอบหมายแล้วไม่มีใครรับ" ไม่มี timeout) | job idempotent · `timeout_auto` · แจ้งเตือน · วันเวลาบน list |
| C8 | 1 | A / agent.in1 | approver **ไม่รับเคส** (reject พร้อมเหตุผล) | reason บังคับ · ไม่เข้าคิวมอบหมาย |

**เงินทดรอง (R4/R6)**: agent.in1 ขอ 1 ใบ อนุมัติ → ขอใบที่ 2 ซ้อนต้องถูกปัด → ใช้จริงน้อยกว่าที่ขอ → ยอดคืน ≥ 0 · อีก 1 ใบปล่อยให้เกินกำหนด → สั่ง overdue job

**ธนาคาร (R7)**: เตรียม CSV 1 ไฟล์มี 4 แถว — เงินเข้าบริษัท 1 (ยอดถูกหัก 3% = ต้อง auto-match แบบ `total − wht`), เงินเข้าบริษัท 2 (ยอดเต็ม), เงินออกรอบจ่าย inhouse, แถวที่ไม่ตรงกับอะไรเลย (ต้อง manual/unmatched) · นำเข้าไฟล์เดิมซ้ำ → `DUPLICATE_PAYMENT_FILE` เตือนไม่บล็อก

---

## 5. ลำดับรอบ (Round) — จบรอบ = snapshot + สรุปบั๊ก + "ค่าคาดหวัง" ของรอบถัดไป

| รอบ | Role ที่เล่น | ขอบเขต (step sheet อยู่ `uat/steps/R<n>.md`) | จุดตรวจหลังบ้านโดย Claude |
|---|---|---|---|
| **R0** | — | §2.1 เตรียม + snapshot `R0-clean` | typecheck/test เขียว, seed 15 role ครบ |
| **R1 ตั้งค่า** | Superadmin | สร้างบริษัท 2 แห่ง, Service Fee Template, ทีม A/B/C, ผู้ใช้ทุก persona (§3), Compensation Plan + Tax Profile, Approval Matrix, นโยบายการเงิน, งวดบัญชี, ดู Roles/Permission · **ทุก persona ล็อกอินครั้งแรก + ถูกบังคับเปลี่ยนรหัส** | `audit_logs` ครบทุก mutation + reason ตอนแตะเงิน/สิทธิ์ · ผู้ใช้ทั่วไปตั้งรหัสให้กลุ่ม system ต้องได้ 403 · username ซ้ำ → `DUPLICATE_USERNAME` |
| **R2 รับเคส** | ธุรการ → เจ้าหน้าที่อนุมัติเคส | ส่งเคส C1–C8 (กรอกฟอร์ม + แนบเอกสาร/รูป) · C6 ส่งซ้ำ 2 แท็บพร้อมกัน · approver รับ C1–C5, C7 / ไม่รับ C8 (เหตุผล) / ระบบเสนอทีม → ยืนยัน/เปลี่ยน | ประมาณการรายได้ (`38` §6.5) ตรงค่าคำนวณมือ · service fee **ยังไม่ snapshot** จนกว่า approved แล้วตรงเทมเพลต ณ เวลานั้น · unique `(org, company, case_ref, round)` |
| **R3 มอบหมาย** | ผู้จัดการทีม / หัวหน้าทีม | มอบหมาย C1,C2→agent.in1 · C3,C4→agent.in2 (C8 ถูกปัดตั้งแต่ R2 ไม่ต้องมอบหมาย) · C5→agent.out1 · C7→ทีม A แล้ว**ไม่มีใครรับ** → trigger `assignment timeout` → มอบหมายใหม่ · ลองมอบหมายให้ทีม B (ว่าง) · หัวหน้าทีมเห็นปุ่ม assign ตาม settings (hide ไม่ใช่ disable) | state `23` §assignment · job รันซ้ำไม่สร้างซ้ำ (`JOB_DUPLICATE`) · notification ถึงคนถูกต้อง · วันเวลา พ.ศ. บน list |
| **R4 ภาคสนาม (มือถือ)** | agent.in1 / agent.in2 / agent.out1 → approver | รับงาน, นัดวัน, บันทึกติดตาม, ปิดงาน C1/C2/C4/C5 สำเร็จ (IMEI 15 หลักตรงสัญญา) / C3 ไม่สำเร็จ · เบิกน้ำมัน/เบี้ยเลี้ยง (C2 ไม่เบิก) · เงินทดรอง 2 ใบ · approver `reject_evidence` C4 → agent แก้ → ส่งใหม่ · ลองกรอก IMEI 14 หลัก/มีขีด ต้องถูกปัด | expense enum ตรง `23` §6.3 · C4: ใบเดิม `superseded` + ใบใหม่ 1 ใบ · **ยังไม่มี revenue แม้แต่แถวเดียว** · สูตร fuel/allowance/commission ตรง `22` §6.1–6.4 (satang) · Desktop กับ Mobile ให้ผลเดียวกัน |
| **R5 คลัง** | Superadmin/ผู้ดูแลคลัง (ตาม `44`) | รับทรัพย์ C1, C2, C4, C5 เข้าคลัง (IMEI exact) · สร้างล็อตบริษัท 1 (C1,C2,C4) และบริษัท 2 (C5) · ลองยัด C5 เข้าล็อตบริษัท 1 ต้องถูกปัด · แนบเอกสาร · **ยืนยันล็อต** · C3 ต้องไม่โผล่ในคลัง | ยืนยันล็อต = tx 4 ขั้น: assets `handed_over`, expense ปลดล็อก, audit, `tryCreateRevenue` · **ทุกเคสรวม C2 ยังไม่มี revenue** (expense อัตโนมัติยังไม่ approved — DATASET v1) · revenue เกิดใน R6 ครั้งเดียวต่อเคส · ⚠️ กิ่ง DEC-006/D6 "สำเร็จไม่มี expense เลย" ทำจริงใน UAT ไม่ได้ (ระบบสร้าง fuel/allowance อัตโนมัติเสมอ) — พึ่ง unit test `19` §16 · ล็อต confirmed แก้ไม่ได้ · ⚠️ หนี้ #1 (เอกสารล็อตทับได้) จดเป็น known |
| **R6 การเงิน** | ผู้จัดการทีม → การเงิน → บริหาร | อนุมัติค่าตอบแทน C1,C3,C4(ใบใหม่),C5 ตาม matrix · ตีกลับ 1 ใบดูว่า reset ขั้น 1 · C5 เกินเพดาน → บริหาร · ผูก Payee + Tax Profile + ยืนยันบัญชีธนาคาร (ปล่อย 1 คน unverified) · สร้างรอบจ่าย inhouse/outsource · สร้างไฟล์โอน (กดซ้ำต้องได้ไฟล์เดิม) · ทำรอบจ่าย `completed` · เงินทดรอง: อนุมัติ/ใบซ้อน/คืนเงิน/overdue job · สร้าง Billing Batch บริษัท 1 และ 2 → ส่ง | **revenue C1/C4/C5 เกิดตอนนี้ครั้งเดียว** (idempotent) · payee unverified ถูกกันออก · WHT: C5 ใช้อัตรา payee-level, ฐาน before_vat, ต่ำกว่า 1,000 ไม่หัก · `idempotency_key` · VAT จาก `vat_rate_history` ไม่ใช่ 7% ฝัง · ⚠️ หนี้ #3 (เบิกไม่มีอัตราภาษีทั้งสองระดับ → 500) — **ทดสอบจงใจ 1 ครั้ง** ด้วย Manual Claim แล้วจดเป็น reproduce |
| **R7 บัญชี** | บัญชี | รายการขาย → ออกใบกำกับภาษี (ดับเบิลคลิกต้องได้ใบเดียว, เลขไม่กระโดด) · นำเข้า Bank CSV (§4) → auto-match บริษัท 1 แบบ A1, บริษัท 2 เต็ม, รอบจ่ายออก · แถวค้าง manual match · นำเข้าซ้ำ → เตือน · ใบ 50 ทวิ ออกจากรอบจ่าย (ซ้ำไม่ได้) · ยกเลิกใบ 1 ฉบับ (เหตุผล) → ไม่นับยอด · สรุป ภ.ง.ด.3/53 · Exception list · ตรวจความพร้อมปิดงวด (ต้องถูกปัดถ้ามี critical/reconcile ไม่ครบ) · Export Accounting Pack 01–06+08 (กด 2 ครั้ง → version 2, SHA-256 ต่างกัน) · ส่งสำนักงานบัญชี · ตั้งคำถามนักบัญชี/ตอบ | Billing บริษัท 1: `received + wht = total` → `paid` (ไม่ค้าง partially_paid) · AR aging ถูก · เลขใบกำกับ/50 ทวิ ต่อเนื่อง · cancelled ไม่ถูกลบ · export ห้ามทับ · ⚠️ หนี้ #4 (เทมเพลตเอกสารภาษีไม่มีผล) จดเป็น known |
| **R8 บริหาร** | บริหาร (+บัญชี) | ยืนยันปิดงวดเดือนปัจจุบัน → `locked` · ลองแก้ revenue ในงวด locked ต้องได้ `PERIOD_LOCKED_DIRECT_EDIT` · สร้าง Adjustment อ้าง revenue นั้น → ต้องบริหารอนุมัติ · อนุมัติ exception · ปลดล็อกงวด (เหตุผล) | รายงานแสดงยอดสุทธิ (ต้นฉบับ + adjustment) โดยต้นฉบับไม่ถูกแก้ · audit reason บังคับทุกจุด |
| **R9 รายงาน** | ทุก role ที่มีเมนูรายงาน | เปิดรายงาน 17 ตัว ตาม role (การเงิน F1–F5, บัญชี A1–A4, ผู้จัดการ O1–O5 เฉพาะทีมตัวเอง) · ส่งออก Excel/PDF | **ตัวเลขทุกตัวเทียบ `uat/DATASET.md`** (golden values) · การเงินเรียก E1 ต้อง 403 · margin เมื่อ revenue=0 = N/A ไม่ใช่ 0/ไม่หารศูนย์ · ปีเป็น พ.ศ. ทุกที่ |
| **R10 สิทธิ์/ขอบเขต** | ทุก persona | แต่ละ role พิมพ์ URL ของเมนูที่ไม่มีสิทธิ์ตรง ๆ + ยิง API ของเมนูนั้น (curl ด้วย cookie ของ role) · Company User 3 คนล็อกอินแล้วเห็นอะไร (Portal ยังไม่มี → ต้องไม่หลุดเข้าเมนูภายใน, 403 ไม่ leak ว่ามีข้อมูล) · ผู้จัดการทีม C ต้องไม่เห็นเคสทีม A | ทุก endpoint ผ่าน `requirePermission` · scope ทีม/บริษัท ที่ business logic |

> Dashboard (6.6) และ Portal (7.x) ยังไม่ได้สร้าง — ข้ามใน UAT รอบนี้ · เมื่อสร้างเสร็จให้เพิ่ม R11 (Dashboard ทุก role) และ R12 (Portal Company User 3 ระดับ) โดย**ใช้ dump ปลาย R10 เป็นต้นรอบ**ได้เลยไม่ต้องเริ่มใหม่

---

## 6. โปรโตคอลต่อ 1 step (ใช้ซ้ำทุกข้อใน step sheet)

```
[R<n>.<k>] <role> ทำ: <การกระทำ>  ·  ข้อมูลที่กรอก: <ค่าจริงจาก DATASET>
  คาดหวังบนจอ : สถานะ <state ตาม 23> · วันเวลา DD/MM/YYYY HH:mm (พ.ศ.) โผล่บน list · toast/ข้อความถูกต้อง
  คาดหวังหลังบ้าน (Claude ตรวจ):
    - แถวใน <table> status=<…> ยอด <…> satang (เทียบค่าคำนวณมือ)
    - audit_logs 1 แถว: actor/role/action/target/before/after/reason(ถ้าบังคับ)
    - notification ถึง <role ปลายทาง> (ถ้ามี) · job ไม่ error · pm2 log / browser console ไม่มี error/500
  ผล: ✅ ผ่าน | 🐞 BUG-<nnn> | ⚠️ known (หนี้ #1–#4) | ❓ NEEDS_DECISION
```

กฎเล็ก ๆ ที่ช่วยจับบั๊กได้มาก:
- ทุกปุ่มสำคัญ **กดซ้ำ/ดับเบิลคลิก 1 ครั้ง** และ **เปิด 2 แท็บทำพร้อมกัน 1 ครั้ง** (race) — รอบที่ผ่านมาบั๊กร้ายแรงล้วนมาจากจุดนี้
- ทุกช่องตัวเลขเงิน ลองทศนิยม `.50` และ `0` และติดลบ 1 ครั้ง
- ทุก reject/cancel ลองส่งโดยไม่กรอกเหตุผล 1 ครั้ง
- ทุกหน้า list: ดู loading / empty / error state (ปิดเน็ตมือถือกลางทาง 1 ครั้งใน R4)
- Field Agent ทดสอบใน Safari iOS หรือ Chrome Android จริง ไม่ใช่ DevTools emulate อย่างเดียว

---

## 7. บันทึกบั๊ก (`uat/BUGS.md`)

| ฟิลด์ | ความหมาย |
|---|---|
| `BUG-nnn` · รอบ/step | อ้าง `[R6.12]` |
| ระดับ | **S1** เงิน/ภาษีผิด หรือข้อมูลหาย/ซ้ำ · **S2** flow เดินต่อไม่ได้ / 500 · **S3** สิทธิ์-scope รั่ว · **S4** UI/ข้อความ/วันที่ ค.ศ. · **S5** เล็กน้อย |
| ชนิด | `code` (โค้ดหลุด spec) · `spec-gap` (spec ไม่ชัด → NEEDS_DECISION) · `mockup-vs-spec` · `known-debt #n` |
| reproduce | role + ข้อมูล + ลำดับกด · snapshot ที่ใช้ย้อนได้ |
| คาดหวัง vs เกิดจริง | อ้างเลข § ของ spec |
| สถานะ | open / fixed `<hash>` / needs-decision |

S1–S3 ที่บล็อก → แก้ทันทีตามกติกา §1 · ที่เหลือรวบแก้หลังรอบ แล้ว **รัน `pnpm typecheck && pnpm test`** ก่อน restore/เดินต่อ

---

## 8. ผลลัพธ์เมื่อจบ R10

1. `uat/snapshots/R10-final.dump` = ชุดข้อมูลตัวอย่างที่ผ่านการใช้งานจริงครบวงจร (ใช้ demo / seed staging / ทดสอบ 6.6 & Phase 7 ต่อ)
2. `uat/BUGS.md` = รายการบั๊กพร้อมสถานะ + commit ที่แก้
3. รายการ `[[NEEDS_DECISION]]` ที่สะสมได้ → ส่ง PO/นักบัญชี (รวมหนี้ 4 ข้อเดิมใน `PROGRESS.md`)
4. (ทางเลือก) แปลง dump เป็น `prisma/seed-demo.ts` เพื่อให้สร้างข้อมูลตัวอย่างซ้ำได้บนเครื่องอื่น — ค่อยตัดสินใจหลังเห็นข้อมูลจริง

---

## 9. ลำดับการเริ่มจริง (session ถัดไป)

1. Claude: R0 (§2.1) + สร้าง `uat/` + เขียน `uat/DATASET.md` (ค่าคาดหวังทุกตัวจาก `22`) + `uat/steps/R1.md`
2. คุณ: เปิด http://localhost:3000 ล็อกอิน `admin/admin` → เดิน R1 ทีละ step โดยบอก Claude ทุกครั้งที่จบ step หรือเจอสิ่งผิดคาด
3. จบ R1 → Claude snapshot + สรุป → เตรียม R2 → วนไปจน R10

---

## 10. โหมด Agent เล่นแทนคน (ไม่ต้องคลิกเอง)

**ทำได้** — session หลักเป็น orchestrator แล้ว spawn "role agent" ทีละตัวตามรอบใน §5 · ข้อจำกัดเชิงกลไกและทางแก้:

| เรื่อง | ความจริงของเครื่องมือ | ทางแก้ที่ใช้ |
|---|---|---|
| Session หลาย role พร้อมกัน | browser pane ในแอปมี cookie context เดียว → UI ล็อกอินได้ทีละ role | **UI = ทีละ role ตามลำดับรอบ** (ตรงกับ flow จริงอยู่แล้ว) · **API = ขนานได้** เพราะ `POST /api/auth/login` คืน Set-Cookie → agent ถือ `curl -c/-b uat/jars/<role>.txt` ของตัวเอง |
| Race (กด 2 แท็บพร้อมกัน) | ทำใน browser เดียวยาก | ยิง API ขนานด้วย curl 2 process จาก cookie jar เดียวกัน → ตรวจผลใน DB |
| แนบไฟล์ (เอกสารเคส/หลักฐาน/รูป) | browser pane ไม่มี file upload | agent อัปโหลดผ่าน API/route เดิมด้วย curl multipart (ไฟล์ fixture ใน `uat/fixtures/`) หรือใช้ Claude in Chrome ที่มี `file_upload` |
| มือถือ Field Agent | ไม่มีเครื่องจริง | `resize_window mobile` + reload (emulate touch/UA) — **ครอบคลุม layout/logic แต่ไม่ครอบคลุมกล้อง, offline, Safari จริง** → เว้นไว้ให้คนลองรอบท้าย 1 ครั้ง |
| สายตา "ดูแปลก" | agent เทียบกับสิ่งที่เขียนไว้ได้ แต่ไม่รู้สึกเหมือนคน | ทุก step บังคับ screenshot ลง `uat/shots/R<n>/` → คนไล่ดูภาพทีหลังได้ใน 10 นาที |
| รหัสผ่าน persona | กรอกบน localhost ของแอปตัวเอง ด้วยค่าที่สร้างในรอบนี้ = อนุญาต | เก็บที่ `uat/personas.json` (ไม่ commit) ไม่พิมพ์ในแชท |

### 10.1 โครงการรัน

```
orchestrator (session นี้)
 ├─ R0  เตรียม env + DATASET (ค่าคาดหวัง) + fixtures + snapshot
 ├─ R1  agent:superadmin ──► รายงานโครงสร้าง (step ✅/🐞 + screenshot + SQL ที่ตรวจ)
 │        orchestrator: ตรวจ invariant ข้ามรอบ (psql) → triage → fix/restore ถ้าบล็อก → snapshot
 ├─ R2  agent:admin  →  agent:approver         (ส่งต่อกันในรอบเดียว หรือแยก 2 agent ต่อกัน)
 ├─ R3  agent:manager / agent:supervisor
 ├─ R4  agent:agent.in1 / in2 / out1 (viewport mobile) → agent:approver (ตีกลับ C4)
 ├─ R5  agent:warehouse
 ├─ R6  agent:manager → agent:finance → agent:exec
 ├─ R7  agent:accounting
 ├─ R8  agent:exec
 ├─ R9  agent ต่อ role ที่มีรายงาน  (UI ทีละตัว)
 └─ R10 12 agent **ขนาน** ยิง API ด้วย cookie jar ของตัวเอง (ไม่แตะ browser)
```

### 10.2 สัญญาของ role agent (prompt template)

- **รับ**: persona (username + path ไฟล์รหัส), step sheet `uat/steps/R<n>.md`, ค่าคาดหวังจาก `uat/DATASET.md`, snapshot ต้นรอบ, รายการ known debt
- **ทำ**: ล็อกอินผ่าน UI (browser pane) → เดินทีละ step → ทุก step: screenshot + ตรวจหลังบ้านด้วย `psql assetrecovery_dev` (read-only) + `pm2 logs asset-web --nostream` + console → ไม่แก้โค้ด ไม่ commit ไม่ restore DB
- **คืน**: ตารางผลต่อ step (`✅/🐞/⚠️/❓`), รายการบั๊กตามฟอร์ม §7, จุดที่ตัดสินใจเองไม่ได้ (ให้ orchestrator ชี้ขาด)
- หยุดทันทีเมื่อเจอ S1/S2 ที่ทำ step ถัดไปไม่ได้ → รายงานกลับ (orchestrator จะ fix → restore → spawn ใหม่ตั้งแต่ต้นรอบ)

### 10.3 สิ่งที่ยังควรให้คนทำ 1 รอบท้าย
มือถือจริง (R4 ย่อ 20 นาที) · ดูภาพ screenshot ทั้งชุด · ชี้ขาด `[[NEEDS_DECISION]]` ที่ agent สะสมไว้

---

## 11. รายงานผลแบบคู่มือ (Report-as-Manual)

ทุก step ที่ agent ทำ = 1 หัวข้อย่อยในคู่มือ (ภาพหน้าจอ + สิ่งที่กรอก + ผลที่ได้) · เมื่อจบทุกรอบจะได้ **คู่มือใช้งานทีละ role ที่ทุกขั้นผ่านการใช้งานจริง** พร้อมหมายเหตุบั๊กที่เจอและสถานะแก้

### 11.1 โครงไฟล์

```
uat/
├─ report/
│  ├─ UAT_REPORT.md          ← เล่มรวม (orchestrator ประกอบจาก R*.md ตอนจบ)
│  ├─ R1-superadmin.md       ← agent ของรอบนั้นเขียนเองก่อนส่งรายงานกลับ
│  ├─ R2-admin-approver.md
│  └─ …
├─ shots/R<n>/<step>-<slug>.png   ← ภาพหน้าจอจริง อ้างด้วย path สัมพัทธ์ในรายงาน
├─ BUGS.md · DATASET.md · STATE.md · personas.json(ไม่ commit) · fixtures/ · snapshots/
```

### 11.2 รูปแบบ 1 step ในคู่มือ

```markdown
### 6.3 อนุมัติค่าตอบแทนขั้นที่ 1 (ผู้จัดการทีม)
**เมนู**: การเงิน → อนุมัติค่าตอบแทน → แท็บ "รออนุมัติ"
![](../shots/R6/03-approve-step1.png)
**ทำ**: เลือกรายการ C1 ค่าน้ำมัน 450.00 บาท → กด "อนุมัติ" → ยืนยัน
**ผลบนจอ**: สถานะเป็น "รออนุมัติขั้น 2" · เวลา 16/10/2569 14:02 แสดงบนรายการ
**ผลหลังบ้าน**: `expenses.status = pending_approval_step2` · audit_logs 1 แถว action `expense.approve_step` reason "—" (ไม่บังคับ)
**สถานะ**: ✅ ผ่าน    (หรือ 🐞 BUG-014 ลิงก์ไป BUGS.md · ⚠️ known #3 · ❓ NEEDS_DECISION)
```

### 11.3 เล่มรวม `UAT_REPORT.md`
1. สรุปผู้บริหาร (รอบที่ทำ, จำนวน step ผ่าน/ไม่ผ่าน, บั๊กตามระดับ S1–S5, commit ที่แก้)
2. ชุดข้อมูลที่ใช้ (จาก DATASET) + ค่าคาดหวัง vs ค่าจริงในรายงาน R9
3. บั๊กทั้งหมด + สถานะ · รายการ `[[NEEDS_DECISION]]`
4. คู่มือทีละ role (รวมจาก R1–R10 เรียงตาม flow) — ส่งออกเป็น HTML/Docx ได้ทีหลังเมื่อต้องการแจก

### 11.4 เครื่องมือถ่ายภาพลงไฟล์ — ต้องเพิ่ม Playwright (รออนุมัติ)
browser pane ในแอปคืนภาพเข้า context ของ agent **ไม่ได้บันทึกเป็นไฟล์** · เครื่องนี้ไม่มี Playwright/puppeteer (มี Chrome) ⇒ แนะนำเพิ่ม `@playwright/test` เป็น devDependency (dev-only, ไม่แตะ runtime) เพราะได้ครบ 4 เรื่องในตัวเดียว:
- `page.screenshot({ path })` ลงไฟล์โดยไม่กินโทเคน · agent ตรวจด้วย locator/text แล้วเปิดดูภาพเฉพาะตอนสงสัย
- `storageState` ต่อ role → **หลาย role ล็อกอินพร้อมกันได้** (แก้ข้อจำกัด §10 เรื่อง cookie context เดียว) และ race test ทำใน browser จริงได้
- `setInputFiles` อัปโหลดเอกสาร/รูป · `devices['iPhone 14']` จำลองมือถือ · trace viewer เก็บทุก action ไว้ย้อนดู
- ใช้กับ `tests/` ไม่ได้โดยอัตโนมัติ (vitest ยังเป็นตัวหลัก) — UAT script อยู่ `uat/` ไม่ปนกับ unit test
ถ้าไม่อนุมัติ: ใช้ browser pane ต่อ + ให้ agent บันทึก screenshot ด้วย `scale 0.5` แล้วบรรยายเป็นข้อความแทนภาพ (คู่มือจะไม่มีรูป)

---

## 12. บริหาร Session / Context (ไม่ปล่อยให้เต็ม 1M)

หลักการ: **orchestrator ผอม, งานหนักอยู่ใน subagent** — subagent มี context ของตัวเอง สิ่งที่ไหลกลับเข้า orchestrator คือรายงานสรุปไม่เกิน ~3k tokens ต่อรอบ · ภาพหน้าจออยู่บนดิสก์ไม่เข้า context ใคร

| ชั้น | งบ context | กติกา |
|---|---|---|
| **Role agent** (1 ตัวต่อรอบ/role) | ≤ 250k | รับเฉพาะ step sheet + ค่าคาดหวังของรอบ (ไม่อ่าน spec เอง) · ตรวจด้วย text/DOM/psql ก่อน ดูภาพเฉพาะตอนสงสัย · เขียน `report/R<n>.md` เอง · คืนรายงานสรุป ≤ 3k · ถ้าใกล้งบแล้วยังไม่จบรอบ → เขียน report ถึง step ล่าสุด + บอก step ที่เหลือ → orchestrator spawn ตัวใหม่ทำต่อจาก step นั้น (DB ยังอยู่ ไม่ต้อง restore) |
| **Fixer agent** (เมื่อมีบั๊กบล็อก) | ≤ 200k | รับ BUG-nnn + reproduce + ไฟล์ที่เกี่ยว → แก้ + test + typecheck → commit `fix(uat-R<n>)` → คืน hash + สรุป 5 บรรทัด · orchestrator ไม่อ่าน diff |
| **Orchestrator** (session นี้/ถัดไป) | เพดาน **~350k** | ทำ 2–3 รอบต่อ session · หลังทุกรอบเขียน `uat/STATE.md` (รอบปัจจุบัน, snapshot ล่าสุด, บั๊กเปิด, step ถัดไป) · แตะ 350k → commit งานที่ค้าง + อัปเดต STATE + `[[HANDOFF]]` · session ใหม่เริ่มด้วยการอ่าน **แค่** `UAT_PLAN.md` + `uat/STATE.md` + `uat/BUGS.md` (ส่วน open) |

เทคนิคประหยัดที่บังคับใช้:
- ไม่ `Read` ไฟล์รายงาน/screenshot เข้า orchestrator — ใช้ `grep -c "✅"`/`tail` ดึงเฉพาะสรุป
- snapshot/restore/psql ตรวจ invariant ทำผ่าน script สั้นใน `uat/bin/` (เขียนครั้งเดียวใน R0) คืนผล 1–5 บรรทัด
- step sheet ของรอบถัดไปให้ **agent วางแผน** (Plan agent) เขียนลงไฟล์ ไม่ร่างใน orchestrator
- รอบที่ยาว (R4 ภาคสนาม, R6 การเงิน, R7 บัญชี) แตกเป็น a/b ตั้งแต่ต้น ให้ agent 1 ตัวจบใน 1 งบ

จุด checkpoint ที่ปลอดภัยเสมอ = "จบรอบ + snapshot + STATE อัปเดต" — ถูกตัดกลางคันตรงไหนก็กลับมาที่ snapshot ปลายรอบล่าสุดได้
