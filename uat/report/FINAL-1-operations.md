# Final Test ด่าน 1/7 — Ops E2E: เคส → มอบหมาย → ภาคสนาม → คลัง → ส่งมอบ

- วันที่: 06/10/2569 · ฐานทดสอบ `assetrecovery_test2` (ยืนยันด้วย `prisma migrate status` — 73 migrations, up to date)
- ฐานโค้ด: `staging` @ `aeb12ba` (merge แล้วใน worktree)
- วิธีทดสอบ: integration test จริง (`*.db.test.ts`) เดินผ่าน service จริง + อ่านโค้ดประกอบ
- Tests: **ก่อน 366 ไฟล์ / 5,107 tests → หลัง 367 ไฟล์ / 5,114 tests** — เขียวทั้งหมด · `pnpm typecheck` + `pnpm lint` ผ่าน

## ผลรายหัวข้อ

| หัวข้อ | สถานะ | หลักฐาน (ไฟล์ / test) | การแก้ |
|---|---|---|---|
| 1. Happy path เต็มสาย (ส่งเคสทีละเคส + นำเข้า → ตรวจ/รับ → มอบหมาย → รับงาน → ลงพื้นที่ → ปิดสำเร็จ → คลัง → ล็อต → ยืนยัน → ส่งมอบ) | ✅ | `tests/acceptance/e2e-operations.db.test.ts` "Happy path เต็มสาย…" (ใหม่) · `tests/acceptance/e2e-revenue-cycle.db.test.ts` | เพิ่ม E2E ฝั่งปฏิบัติการ |
| 1a. นำเข้า: ช่อง "IMEI หรือ Serial" (U54/U24) | ✅ | e2e-operations "นำเข้าเคส…" — `35 6938-03.5643809` → 15 หลัก · `/` หรือ 13 หลัก = แถวตก · มีตัวอักษร = serial · `lib/cases/case-workflow.db.test.ts` U54 | test ใหม่ |
| 1b. snapshot ค่าบริการ **ตอน approved ไม่ใช่ตอนสร้าง** | ✅ | e2e-operations: สร้างเคสตอนบริษัทผูก v1 (10%) → ย้ายเป็น v2 (20%) ก่อน accept → snapshot = v2 · ย้ายกลับหลัง accept ไม่ขยับ · รายได้ 200,000/14,000/214,000 สตางค์ (`22` §6.5) | gap เดิม (มีแต่เทสต์ "หลัง approved") — ปิดแล้ว |
| 1c. แถวรายวันน้ำมัน/เบี้ยเลี้ยงจาก job (DEC-012) | ✅ | e2e-operations: หลัง settle เคสสำเร็จมี `allowance/commission/fuel` = `pending_warehouse_confirm` ทั้งหมด · `warehouse-workflow.db.test.ts:1305+` | — |
| 1d. ค่าที่พัก + เพดานต่อคืน U89 + "พักร่วมกับ" U28 | ✅ | e2e-operations: เกินเพดาน 1 สตางค์ = `HOTEL_CLAIM_EXCEEDS_CAP` · พักร่วมกับหัวหน้าทีมในทีมเดียวกันผ่าน + dropdown (`listFieldTeammates`) ตรงกับยาม BE · `field-expense.db.test.ts:1195–1340` | — |
| 1e. เวลาปิดงาน U26 (เก็บเวลาปิดครั้งแรก) | ✅ | `lib/field/field-expense.db.test.ts:754` | — (U46 = ไม่ซ่อมข้อมูลเดิม ตามมติ) |
| 2. Lot confirmed = `$transaction` (ยึดล็อต + letterhead U111 + step 1–4) | ✅ | `warehouse-workflow.db.test.ts` T11 (step 2) + **ใหม่** "Final ด่าน 1 — step 4 (สร้าง Revenue) ล้ม…" / "step 3 (audit) ล้ม…" — lot/letterhead/template snapshot/asset/expense/revenue/audit ไม่ค้างครึ่งทาง แล้วกดใหม่ได้ครบในครั้งเดียว | test ใหม่ 2 ตัว |
| 3. Revenue trigger 8 เคส (`19` §16) + DEC-006/D6 + closed_fail + idempotent | ✅ | `lib/revenue/revenue-queries.db.test.ts:297–578` · warehouse T12/T13/D6 · e2e-operations "closed_fail (SUCCESS_FEE)…" (ไม่มีเครื่อง ไม่มีล็อต ไม่มีรายได้แม้ expense approved) | test ใหม่ (closed_fail ผ่าน service จริงครบสาย) |
| 3a. วันที่รับรู้รายได้ตาม U39 | ❌ → ⏸️ | `lib/warehouse/revenue-service.ts:275–277` ใช้ `closedAt` ของเคส แต่ U39/A7 = **วันยืนยันล็อตส่งมอบ** | ไม่แก้ — NEEDS_DECISION #1 (กระทบงวด VAT) |
| 4. IMEI ผ่าน `parseImei()` จุดเดียว (ส่งเคส/นำเข้า/รับเข้าคลัง) · ไม่ตรวจ Luhn | ✅ | `lib/warehouse/imei.ts` · caller: `lib/cases/case.ts:416–431`, `lib/warehouse/schemas.ts:90/106` · e2e-operations: intake ปฏิเสธ 14/16 หลัก/มีตัว O/มี `/` · รับค่าที่มีช่องว่าง+ขีด+จุด แล้วตรงสัญญา | — |
| 4a. 1 ล็อต = 1 บริษัท · ล็อต confirmed แก้/แนบไม่ได้ · เอกสารล็อตมี hash + ไม่ทับ | ✅ | warehouse T05/T14 + "แนบเอกสารผ่าน API = เก็บ hash…" · e2e-operations: แนบเอกสาร/ยืนยันซ้ำหลัง confirmed = `LOT_ALREADY_CONFIRMED` · `signed_doc_hash`/`delivery_proof_hash` เป็น SHA-256 | — |
| 5a. reassign 2 แบบ + timeout job + outbox U120 | ✅ | `assignment-workflow.db.test.ts:329–625` + **ใหม่** "Final ด่าน 1 (U120) — ส่งแจ้งเตือนล้มตอน job timeout…": การเปลี่ยนคน commit · แจ้งเตือน 3 แถวค้าง `pending` พร้อม `last_error` · รอบ cron ถัดไปส่งครบ 3 ไม่ซ้ำ | test ใหม่ |
| 5b. `resubmit_close` → expense เดิม `superseded` + สร้างใหม่ | ✅ | `field-expense.db.test.ts:640/700` | — |
| 5c. duplicate `case_ref` ภายใต้ concurrency | ✅ | `lib/cases/case-duplicate.db.test.ts:110` | — |
| 5d. recycle / tracking_round | ✅ | `case-workflow.db.test.ts:468–550` · `revenue-queries.db.test.ts:401` (U125) | — |
| 5e. ค่าที่พักปฏิเสธถาวรจาก `pending_approval`/`needs_revision`/`pending_finance_approval` + เหตุผล + คืนเพดานใบรับรอง (U117/U118) | ✅ | `substitute-receipts.db.test.ts:672` · `approval-payee.db.test.ts:513` | — |
| 5f. แถวรายวันอนุมัติบางขั้น (U75) | ✅ | `warehouse-workflow.db.test.ts:1803` (`fieldDayExpensesNotHeld`) | — |
| 6. LOT/DLV จาก `document_number_series` (U102) ปี พ.ศ. · ไม่ซ้ำ/ไม่ข้ามภายใต้ concurrency | ✅ | `document-numbering.db.test.ts:180` (ทุกชนิด) + **ใหม่** warehouse "Final ด่าน 1 (U102) — สร้างล็อตพร้อมกัน 5 คำขอ…": เลข `LOT/DLV-<พ.ศ.ปัจจุบัน>-NNN` ต่อเนื่อง · คำขอที่แพ้การแย่งเครื่อง rollback ไม่กินเลข | test ใหม่ |
| 6a. `NUMBERING_FORMAT_LOCKED` หลังออกเลขแล้ว | ✅ | `document-numbering.db.test.ts:289` — ตาม `24` §6.2/`13` §6.12 ล็อกเฉพาะเอกสารภาษี (INV/WHT) · LOT/DLV เปลี่ยนคำนำหน้าได้และเลขเดินต่อ (`:240` — ตามมติ U102) | — |
| 7. ระยะเก็บเอกสารลูกหนี้ (U97) | ✅ | `debtor-document-purge-job.db.test.ts` (ค่าตั้ง/idempotent/ลบไม่สำเร็จลองใหม่) + e2e-operations: เคสที่มีรายได้/ล็อต/expense approved — ลบเฉพาะสัญญา+บัตร · รูปสินค้า, evidence, ล็อต (เอกสาร+hash), asset, expense, revenue ไม่ถูกแตะ | — |
| ข้อสังเกต: IMEI ซ้ำกับเครื่องที่ยังไม่ส่งมอบ | ⚠️ | `lib/warehouse/asset-hook.ts:78` — ปิดงานสำเร็จเคสที่ IMEI ซ้ำกับเครื่องอื่นที่ยังไม่ `handed_over` ชน `uniq_assets_active_imei` ⇒ Prisma P2002 หลุดเป็น 500 (พนักงานปิดงานไม่ได้ ไม่มีข้อความบอกเหตุ) · พบระหว่างรัน E2E ซ้ำ | ไม่แก้ — NEEDS_DECISION #2 |

## [[NEEDS_DECISION]]

1. **วันที่รับรู้รายได้ (U39/A7 ขัดกับโค้ด)** — U39 เลือก "ก. วันที่ยืนยันล็อตส่งมอบ (TFRS 15) **ตามโค้ดปัจจุบัน**" และ A7 ระบุชัดว่า "ไม่ใช่ `closed_at`" แต่โค้ดจริงตั้ง `revenue_date = toBangkokDateOnly(cases.closed_at)` (`lib/warehouse/revenue-service.ts:275–277`) · spec เองก็ขัดกัน: `docs/19` บรรทัด 90 (U87) = "วันยืนยันล็อตส่งมอบ" แต่ตารางฟิลด์บรรทัด 123 = "= วันปิดงานของเคส" · ต่างกันเมื่อปิดงานกับยืนยันล็อตคนละวัน/คนละเดือน ⇒ กระทบอัตรา VAT ที่ใช้, งวดรายได้, รอบวางบิล, รายได้ค้างรับ (U87)
   [[OPTIONS]] ก (แนะนำ) ทำตาม A7/U39: `revenue_date` = วัน `lot.confirmed_at` (ตามปฏิทินไทย) สำหรับเคสผ่านคลัง · `closed_fail + charge_on_fail` (ไม่ผ่านคลัง) ใช้วัน settle/ปิดงาน + แก้ `docs/19` บรรทัด 123 | ข คงโค้ด (`closed_at`) แล้วแก้ U39/A7 + `docs/19` บรรทัด 90 ให้ตรง | ค ถามนักบัญชีก่อน
2. **IMEI ซ้ำกับเครื่องที่ยังอยู่ในคลัง/ระหว่างส่งมอบ** — ไม่มี error code ใน `24` สำหรับกรณีนี้ ⇒ ปิดงานสำเร็จได้ 500 แทนข้อความที่แก้ได้
   [[OPTIONS]] ก (แนะนำ) เตือนตั้งแต่ส่งเคส/รับเคส ว่า IMEI นี้มีเครื่องค้างอยู่ (warning ไม่ block) + ตอนปิดงานแปลง P2002 เป็น code ใหม่ใน `24` พร้อมข้อความให้ติดต่อคลัง | ข แปลงเป็น code ตอนปิดงานอย่างเดียว | ค คงเดิม (กรณีหายาก)

## งานใหม่ที่เสนอ
- ไม่มีฟีเจอร์ใหญ่ที่ขาดในขอบเขตด่าน 1

## ไฟล์ที่เพิ่ม/แก้ (test เท่านั้น — ไม่มีการแก้โค้ดแอป)
- `tests/acceptance/e2e-operations.db.test.ts` (ใหม่ · 3 tests)
- `lib/warehouse/warehouse-workflow.db.test.ts` (+3: rollback step 3/4 · เลข LOT/DLV พร้อมกัน)
- `lib/assignments/assignment-workflow.db.test.ts` (+1: outbox U120 ตอนส่งล้ม)
