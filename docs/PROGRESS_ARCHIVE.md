# PROGRESS_ARCHIVE.md — รายละเอียดเต็มของงานที่เสร็จแล้ว

> ย้ายรายละเอียดของ task ที่มาร์ค ✅ ใน `PROGRESS.md` มาไว้ที่นี่ เพื่อให้ PROGRESS.md บางอยู่เสมอ (≤50,000 ตัวอักษร)
> รูปแบบต่อรายการ: `## Phase <id> — <ชื่องาน>` + วันที่ + commit hash + สรุปสิ่งที่ทำ + การตัดสินใจระหว่างทาง + จุดที่คนถัดไปควรรู้

---

## Phase 3.2 — Payee & Tax Profile (18) + Compensation Approval Backend (16)

**วันที่**: 2026-08-15 · **commit**: `PENDING` · **branch**: `auto/phase-3.2`

### สิ่งที่ทำ

| ส่วน | ไฟล์ | จุดสำคัญ |
|---|---|---|
| Payee pure | `lib/payees/payee.ts` | **บ้านเดียวของ auto-reset unverified** (`18` §9) — แก้ `payee_type`/`national_id`/`tax_profile_id`/ธนาคาร ⇒ กลับเป็นรอยืนยัน · แนบเอกสารยืนยันตัวตน **ไม่** reset (ไม่ใช่ปลายทางของเงิน) · เปลี่ยนแค่รูปแบบเลขบัญชี (ขีด/ช่องว่าง) ไม่นับว่าแก้ |
| Payee errors/schemas | `lib/payees/errors.ts` · `schemas.ts` · `types.ts` | code ใหม่ 3 ตัวเข้า `24` §6.5 · `reason` บังคับทุก mutation (ตารางหมวด `bank`) |
| Payee DB | `lib/payees/queries.ts` | scope: `manage` เห็นทุกราย · `view` (พนักงาน) เห็นเฉพาะของตัวเอง + เลขบัญชี**ปิดบัง 4 ตัวท้าย** · scope แยกจาก filter ผู้เรียกด้วย `AND` (กับดัก `f188619`) |
| Payee API | `app/api/payees/{route,[id]/route,[id]/verify/route,candidates/route}.ts` | ครบตาม `18` §14 + `27` §6.3 · `BANK_ACCOUNT_NAME_MISMATCH` เดินทางมากับ `warning` ของ envelope ไม่ใช่ error |
| Payee FE | `components/settings/payee-tab.tsx` | แท็บที่ 14 ของหน้า `/settings/finance` (ตาม mockup `renderSettingsPayee`) — ตาราง 6 คอลัมน์ + ฟอร์ม + ปุ่มยืนยันผ่าน `<ReasonConfirmModal>` · ปุ่ม "ยืนยัน" disable เมื่อข้อมูลยังไม่ครบ (กติกาเดียวกับ API) |
| Approval pure | `lib/compensation/approval.ts` | ตัวเชื่อม **ขั้น ↔ สถานะ ↔ capability ↔ `approval_history`** · `buildRejectExpenseUpdate()` = บ้านเดียวของ "ตีกลับ ⇒ ขั้น 1 + ล้างรอยประทับ" |
| Approval DB | `lib/compensation/approval-queries.ts` | approve/reject ใน `$transaction` เดียวกับ audit · ผ่านครบขั้น ⇒ `expense.approved` + `tryCreateRevenue()` (2.13) |
| Approval API | `app/api/compensation/{route,[id]/approve,[id]/reject}.ts` | ตาม `16` §14 · `27` §6.5 |

### การตัดสินใจระหว่างทาง

- **สถานะเป็นฟังก์ชันของ "ขั้นที่กำลังรอ" ไม่ใช่ของจำนวนขั้น** — enum `expense_status` มีสถานะรออนุมัติแค่ 2 ตัว (`23` §6.3) แต่ Approval Matrix ตั้งสายได้ถึง 5 ขั้น (`13` §6.2) ⇒ กำหนดว่า รอขั้น 1 = `pending_approval` · รอขั้น ≥ 2 = `pending_finance_approval` · ไม่เหลือขั้น = `approved` — ครอบสาย 1/2/3+ ขั้นได้โดย **ไม่เพิ่ม enum ใหม่**
- **snapshot สายอนุมัติตอนอนุมัติขั้นแรก ไม่ใช่ตอนสร้างรายการ** — `13` §6.2 เขียนว่า "เมื่อสร้างรายการเบิก ระบบเช็ค threshold แล้วกำหนด flow" แต่การ resolve ตอนสร้างจะทำให้ **การปิดงานภาคสนามพัง** เมื่อองค์กรยังตั้ง Approval Matrix ไม่ครบ (`APPROVAL_MATRIX_NOT_FOUND` เป็น config error ของฝั่งการเงิน ไม่ใช่ของพนักงานที่ปิดงาน) ⇒ snapshot `approval_matrix_id` + `approval_step_total` ลงรายการ **ครั้งเดียวตอนอนุมัติขั้นแรก** แล้วใช้ชุดเดิมจนจบ (รวมหลังตีกลับ) — รายการที่ยังไม่มี snapshot แสดงสายแบบ **คาดการณ์** จาก matrix ปัจจุบัน
- **ตีกลับยังทำได้แม้ตั้งสายอนุมัติไม่ครบ** (วาล์วนิรภัย) — การอนุมัติต้องมีสายจริงเสมอ (matrix คือสิ่งที่บอกว่าใครต้องอนุมัติ) แต่ถ้าบล็อกการตีกลับด้วย ผู้รับเงินที่เอกสารผิดจะค้างคิวโดยไม่มีทางออก · สิทธิ์ยังถูกตรวจที่ API layer เสมอ
- **role ในสายอนุมัติ → capability ผ่านตารางตายตัว** — `approval_flow` เป็นข้อความอิสระ ⇒ ชื่อนอกรายการ (`ผู้จัดการทีมติดตามทรัพย์`/`การเงิน`/`บริหาร` + ชื่ออังกฤษที่ `13` §6.2 ยกตัวอย่าง) ถือเป็น **ตั้งค่าสายผิด** ⇒ `APPROVAL_MATRIX_NOT_FOUND` ไม่ใช่ "ใครก็อนุมัติได้"
- **`/api/field/expenses/:id/reject` (2.9) ถูกดึงมาใช้กติกาเดียวกัน** — เดิมตีกลับแล้วไม่ reset ขั้น/ไม่ลงประวัติ ⇒ ตอนนี้เรียก `buildRejectExpenseUpdate()` ตัวเดียวกับ `/api/compensation/:id/reject` และรับ capability ครบทั้ง 3 ขั้น (สายเกินเพดานมี Executive)
- **`expense.approved` เข้าทะเบียน event** (`lib/api/event-names.ts` + `EVENT_REGISTRY` module ใหม่ `finance`) — ที่มาคือ `16` §9 + `19` §6.1 ซึ่งเป็นไฟล์ต้นทางที่นิยาม trigger นี้ไว้แล้ว
- **`withApiPermission()` รับ capability หลายตัวได้แล้ว** (เหมือน `withEndpoint()`) — endpoint ของสายอนุมัติมีผู้ใช้ 3 บทบาทที่ถือ capability คนละตัว

### จุดที่คนถัดไปควรรู้

- **Phase 3.3 (FE ของ 16)**: API พร้อมแล้วทั้ง `GET /api/compensation` (มี `approvalStepCurrent`/`Total`/`pendingStepRole`/`approvalHistory` สำหรับ stepper) และ approve/reject — ใช้ `compensationApproveSchema`/`compensationRejectSchema` ที่แชร์ FE/BE แล้ว
- **Phase 3.4 (Payout)**: กัน `UNVERIFIED_PAYEE_IN_PAYOUT` ด้วย `PayeeDto.isVerified` ห้ามอ่านคอลัมน์ดิบเอง · ยอด WHT/Net ใน `CompensationApprovalDto` เป็น **ตัวเลขแสดงผล** ที่คิดสด ห้ามเอาไปเขียนลง `payout_batch_items` (ต้อง snapshot ตอนสร้างรอบตาม `92` §7.1)
- **Phase 3.6 (Revenue)**: จุดเสียบมี 2 ที่แล้ว — `confirmLot()` (2.13) และ `approveCompensationExpense()` (3.2) ทั้งคู่เรียก `tryCreateRevenue()` ตัวเดียวกัน ⇒ เสียบของจริงที่ `lib/warehouse/revenue-service.ts` ที่เดียวพอ
- **เทสต์ระดับ DB** `lib/compensation/approval-payee.db.test.ts` (19 เคส) ครอบ DoD ทั้ง `18` §9/§16 และ `16` §16 — ต้องมี `TEST_DATABASE_URL` (docker-compose.dev) ไม่งั้นถูก skip

---

## Phase 3.1 — Pure Finance Calculation Modules + Unit Tests (ไฟล์ 22 ครบ 13 สูตร)

**วันที่**: 2026-08-15 · **commit**: `0a05c48` · **branch**: `auto/phase-3.1`

### สิ่งที่ทำ
- **`lib/finance/*` pure ล้วน ไม่มี I/O ครบ 13 สูตรของ `22`** (+ เทสต์ 169 เคสใน 13 ไฟล์ รวมยาม `formula-coverage.test.ts` ที่อ่านหัวข้อ §6.x จากเอกสารจริงมาเทียบว่าทุกสูตรมีบ้าน)
  - `satang.ts` — เครื่องคิดเลขสตางค์กลาง: `pctOfSatang()` (ปัดครึ่งขึ้นครั้งเดียวที่ปลายสูตร), `vatIncludedInSatang()`, ยาม `assertSatang/assertNonNegativeSatang/assertPct`, `sumSatang()`
  - `compensation-calc.ts` — §6.1–6.3 **re-export** ของ `lib/field/expense-calc.ts` (2.9) + §6.4 `commissionSatang()` (exclusive ตาม outcome · ยอด 0 ไม่สร้าง record) + `directCostSatang()` ที่ §6.12 ใช้
  - `service-fee-calc.ts` — §6.5–6.7 `calculateServiceFeeRevenue()` ครบ 3 model × 2 outcome × `charge_on_fail` + `formula` สำหรับ modal "ดูสูตร" (`16` §8)
  - `vat-calc.ts` — §6.8 `calculateVat()` / `calculateVatForRevenue()` (ต่อกับ `resolveVatRateAt()` ของ 1.10) + snapshot `vatRatePctUsed`
  - `wht-calc.ts` — §6.9 + `18` §6.3 `resolveWhtRate()` (Payee ชนะ Plan + warning ตอน fallback) / `calculateWht()` / `calculateWhtForPayee()`
  - `payout-calc.ts` — §6.10 `summarizePayoutBatch()` + ยามความสอดคล้อง `net = gross − wht` รายรายการ
  - `ar-calc.ts` — §6.11 + `19` §6.4 `arOutstandingSatang()` / `daysOverdue()` / `agingBucketIndex()` / `summarizeArAging()`
  - `gross-profit.ts` — §6.12 `grossProfit()` / `summarizeGrossProfit()` (revenue = 0 ⇒ `marginPct = null`)
  - `advance-calc.ts` — §6.13 `advanceReturnSatang()` / `advanceSettlement()` / `assertSettlementAllowed()`
  - `approval-flow-resolver.ts` — `16` §6.1/§9 matrix → step list + เดินขั้น/รีเซ็ตขั้น/ยาม SoD
  - `adjustment-approval-policy.ts` — `20` §6.2 period_status → ระดับผู้อนุมัติ + `INSUFFICIENT_APPROVAL_LEVEL`
  - `errors.ts` — `FinanceError` 4 code จาก `24` §6.4/§6.7 (ผูกเข้า `lib/api/error-catalog.test.ts` แล้ว)
- **สูตร §6.1 (revenue trigger) ไม่ได้เขียนใหม่** — `revenue-trigger-rules.ts` ทำไปแล้วที่ 2.13 (lot confirm ต้องใช้ก่อนกำหนด)

### การตัดสินใจระหว่างทาง
- **`include_vat` ถอด VAT ออกจากราคาที่ตกลง** — `22` §6.8 บอก `total = revenue_gross` (ไม่บวกเพิ่ม) แต่ `19` §7.1 + `02` §5 บอก `gross` = ยอดก่อน VAT และ `total = gross + vat` ⇒ เก็บ `gross = ราคา − vat`, `total = ราคา` ทำให้ตรงทั้งสองฉบับพร้อมกัน (ลำดับเอกสาร `02` → `19` → `22`)
- **ยอดคืน Advance ใช้ฐาน `approved`** ตาม generated column ของ `02` §5 (`22` §6.13 เขียน `requested`) ส่วนการ reject ตอนเคลียร์ยอดยังเทียบ `requested` ตาม `24` §6.4 — แยกเป็นคนละฟังก์ชันแทนการเดารวมเป็นตัวเดียว · **ช่องว่างที่เหลือ**: `used` ที่อยู่ระหว่าง approved กับ requested ยังไม่มีกติกา (ให้ 3.3 ตัดสิน/ถาม PO)
- **`no_vat` snapshot อัตราเป็น 0** ไม่ใช่อัตราปัจจุบัน — เอกสารเก่าต้องอ่านย้อนหลังแล้วรู้ว่า "ใบนี้ไม่คิด VAT" ไม่ใช่ "คิด 7% แต่ยอดเป็น 0" · และบริษัท `no_vat` ต้องออกบิลได้แม้ยังไม่ตั้ง `vat_rate_history`
- **fallback WHT ระดับ Plan ใช้ฐาน `before_vat` + เกณฑ์ 1,000 บาทมาตรฐาน** — `02` §5 เก็บที่ Plan แค่ `wht_pct` ตัวเดียว ไม่มีฐานหัก/เกณฑ์ของตัวเอง
- **เคสที่ยังไม่มีฐานคำนวณ ⇒ `grossSatang = null` + `missingBasis`** แทนการคืน 0 เงียบ ๆ — 0 ที่ไหลเข้า Revenue คือการวางบิลขาดโดยไม่มีใครรู้
- **สายอนุมัติเลือกจากเพดานต่ำสุดที่ยังครอบยอด** (`null` = สายสุดท้ายสำหรับยอดที่เกินทุกเพดาน) · ไม่มีสายครอบเลย = `APPROVAL_MATRIX_NOT_FOUND` ไม่เดาสายให้เอง
- **code ที่โมดูลอื่นเป็นเจ้าของไม่ declare ซ้ำ** — `VAT_RATE_NOT_FOUND` / `INVALID_WHT_RATE` / `APPROVAL_MATRIX_NOT_FOUND` ยังโยนด้วย `SettingsError` (ข้อความไทยอยู่ที่เดียวตามกติกาของ `lib/api/error-catalog.ts`)

### จุดที่คนถัดไปควรรู้
- **ทุก service ของ Phase 3–4 ต้องเรียกสูตรจาก `lib/finance/*` เท่านั้น** — ห้ามคูณ/หารเปอร์เซ็นต์เอง (ใช้ `pctOfSatang()`) และห้ามคัดลอกกฎ Payee-ชนะ-Plan / Warehouse gate ไปเขียนซ้ำ
- ทุก export มีเทสต์ครอบ (ตรวจด้วยการไล่ symbol ต่อไฟล์) — repo **ยังไม่ได้ติดตั้ง `@vitest/coverage-v8`** จึงไม่มีรายงาน coverage เป็นตัวเลข ถ้าต้องการตัวเลขจริงต้องเพิ่ม dependency ก่อน
- `payout-calc` ยังไม่ทำ `MIXED_SIDE_BATCH` / `UNVERIFIED_PAYEE_IN_PAYOUT` (ต้องใช้ข้อมูลจาก DB — อยู่ 3.4 ตามแผน)

---

## Phase 2.15 — Warehouse Frontend ชุดที่ 2 (ส่งมอบ + แนบเอกสาร · ไฟล์ 44 §8.4–8.5)

**วันที่**: 2026-08-15 · **commit**: `557fc34` · **branch**: `auto/phase-2.15`

### สิ่งที่ทำ
- **pure modules + unit test ใหม่ 22 เคส**
  - `lib/warehouse/lot-filters.ts` — `buildLotListQuery()` (สถานะของแท็บติดไปเสมอ), `filterByDeliveredDate()`, ตัวเลือกบริษัทพร้อม fallback, `DELIVERED_STATUS_OPTIONS`
  - `lib/warehouse/lot-documents.ts` — path เอกสารตาม §6.4, `lotDocumentSlots()` (จุดเดียวที่ตัดสินว่าล็อตต้องมีเอกสารกี่ชิ้น/ครบหรือยัง), `lotDocumentMime()`, `checkLotDocumentCandidate()`
  - `lib/format/datetime.ts` — `toInputDateTime()`/`fromInputDateTime()` สำหรับ `<input type="datetime-local">` (อ่านค่าเป็นเวลาไทยเสมอ)
- **`uploadLotDocument()`** (browser) — อัปโหลดใบเซ็นรับ/หลักฐานจัดส่งขึ้น bucket `case-documents` prefix `handover-lots/{lotId}/`
- **หน้าจอครบวงจรบน `/warehouse`**
  - **Modal "นัดวันส่งมอบ"** (`<HandoverLotModal>`): เลือกรูปแบบ 2 แบบ → ช่องกรอกเปลี่ยนตามรูปแบบ (นัดรับ+ผู้ประสาน / กำหนดส่ง+ที่อยู่จัดส่งบังคับ+เลขพัสดุ) + กล่องเลขล็อต/ใบส่งมอบอ่านอย่างเดียว + ปุ่มดูตัวอย่างใบส่งมอบ (พิมพ์ได้) + รายการเครื่องแบบพับได้
  - **`<LotTab>` ครอบทั้งแท็บ "รอส่งมอบ" และ "ส่งมอบแล้ว"**: filter bar (ค้นหา/วันที่/บริษัท + สถานะเฉพาะแท็บส่งมอบแล้ว) + การ์ดล็อต (กรอบ amber/emerald + checklist เอกสาร ✅/⏳) + drill-down รายการเครื่อง + ปุ่มใบส่งมอบ PDF / Export Excel
  - **Modal แนบเอกสาร + ยืนยันส่งมอบ** (`<AttachDocModal>`) และ **Modal ดูเอกสารที่แนบ** (`<ViewAttachedDocModal>`)
- **backend เล็กน้อยที่จำเป็นตาม spec**: `listLots()` ค้นทะลุถึงเครื่องในล็อต (เลขสัญญา/ชื่อลูกหนี้ contains · IMEI/serial exact) ตาม §8.4 + เทสต์ระดับ DB · `lotCreateSchema` บังคับ `deliveryAddr` เมื่อ `we_deliver` ตาม §7.2

### การตัดสินใจระหว่างทาง
- **ไม่โชว์เลข `LOT-`/`DLV-` ล่วงหน้าในฟอร์ม** — mockup โชว์ "เลขถัดไป" ได้เพราะเป็นข้อมูลจำลอง แต่ของจริงเดินจาก sequence ระดับ DB ตอนสร้าง (`44` §6.2/§10 ห้าม recycle) การเดาเลขจะชนกันทันทีที่มีคนสร้างพร้อมกัน ⇒ แสดงเป็น `LOT-…… / DLV-……` พร้อมข้อความว่าออกอัตโนมัติตอนบันทึก
- **"ดูตัวอย่างใบส่งมอบ" เป็นร่างฝั่ง client** (`<HandoverNotePreview>` + คลาส `.print-area`) — ฉบับสมบูรณ์คือ PDF จาก `GET /api/handover-lots/:id/pdf` ซึ่งออกได้หลังล็อตเกิดเท่านั้น · คอลัมน์/ลำดับใช้ `documentIdentifier()`+`assetConditionLabel()` ชุดเดียวกับ PDF/Excel เพื่อไม่ให้ร่างกับฉบับจริงต่างกัน · **Export Excel ในโมดัลสร้างล็อตจึงไม่มี** (endpoint ต้องมี lot id) — ย้ายไปไว้ที่ drill-down ของล็อตหลังบันทึกแทน
- **แท็บ "รอส่งมอบ"/"ส่งมอบแล้ว" เป็น component เดียว** (`<LotTab tab=…>`) — §8.4/§8.5 มีโครงเดียวกัน ต่างแค่สถานะ/ตัวกรอง/ปุ่ม การแยกไฟล์จะทำให้กติกาสองแท็บเพี้ยนจากกันภายหลัง
- **"วันที่" ของสองแท็บคนละความหมาย** — §8.4 = วันนัด (ให้ API กรองผ่าน `dateFrom`/`dateTo` ที่ผูกกับ `scheduledAt`) · §8.5 = วันส่งมอบจริง (กรองฝั่ง client เพราะ `44` §15 ไม่มี filter `deliveredAt`) · mockup กรอง `createdAt` ในแท็บรอส่งมอบ ซึ่งไม่มีประโยชน์กับการนัดหมายจริง
- **เพิ่มการค้นทะลุถึงเครื่องใน `listLots()`** — §8.4 ระบุว่า filter bar ค้นด้วย "เลขล็อต / IMEI / ชื่อลูกหนี้" แต่ §15 เขียน `search` ไว้แค่ `lotNumber|docRef` · การ์ดล็อตไม่มีข้อมูลเครื่องให้ค้นฝั่ง client ⇒ ขยายที่ where ของ API (IMEI ยัง exact ตาม §6.5) แทนที่จะปล่อยให้ฟีเจอร์บนสเปคใช้ไม่ได้
- **`deliveryAddr` บังคับที่ Zod ไม่ใช่ error code ใหม่** — `44` §7.2 บอกว่าบังคับ แต่ §12 ไม่มี code สำหรับช่องนี้ ⇒ ตกที่ validation กลาง (`REQUIRED_MISSING` + field error) ตาม Rule 04 ห้ามตั้ง code เอง
- **วันนัด/วันส่งมอบจริงบังคับกรอกที่หน้าจอ** ทั้งที่ schema ยอม `null` — mockup ติด `*` ทั้งสองช่อง และทั้งสอง modal มีขึ้นเพื่อบันทึกเวลาเหล่านี้โดยตรง (API ยังยอม null ไว้สำหรับงาน ops/ย้อนหลัง)

### verify ที่รันจริง
`pnpm typecheck` ✅ · `pnpm lint` ✅ (0 warning) · `pnpm test` ✅ (120 ไฟล์ / 1,579 เคส รวมเทสต์ระดับ DB ของ `44` §17) · `next build` ✅

### จุดที่คนถัดไปควรรู้
- **วงจร `closed_success → intake → lot → confirm` ครบบนหน้าจอแล้ว** — ยืนยันล็อตคือจุดที่ปลดล็อก expense จริง (`44` §11) ส่วน Revenue ยังเป็น stub ของ 2.13 (`revenue-service.ts`) รอ Phase 3.6 เสียบตัวจริง
- ปุ่ม PDF/Excel เป็น `<a href>` ตรงไป endpoint (พา session cookie ไปเอง) — ถ้าเปลี่ยน endpoint ให้ต้องใช้ token ต้องเปลี่ยนวิธีดาวน์โหลดที่ `<LotTab>` ด้วย
- เอกสารแนบใช้ path ตายตัวต่อชนิด (`upsert: true`) ⇒ แนบทับได้เฉพาะก่อนยืนยัน หลัง `confirmed` ล็อตเป็น terminal ทั้งชั้น service และ trigger DB
- คลาส `.print-area` / `.no-print` ใน `app/globals.css` เป็นของกลาง — เอกสารพิมพ์ได้ตัวถัดไปใช้ซ้ำได้เลย

---

## Phase 2.14 — Warehouse Frontend ชุดที่ 1 (รับเข้าคลัง + ในคลัง · ไฟล์ 44 §8.1–8.3)

**วันที่**: 2026-08-15 · **commit**: `8d25403` · **branch**: `auto/phase-2.14`

### สิ่งที่ทำ
- **pure modules + unit test 40 เคสใหม่** (หน้าจอห้ามตัดสินใจเอง — เรียกตัวเดียวกับที่ API บังคับ)
  - `lib/warehouse/asset-filters.ts` — `buildAssetListQuery()` (state ฟอร์ม → query ที่ตรง contract), `statusesOnWarehouseTab()`, `groupCustodyByCompany()`, `isSelectableForLot()`/`selectableAssetIds()`/`keepSelectable()`, `matchesAssetSearch()`, `filterByReceivedDate()`, `optionsFromAssets()`/`filterOptionsOrFallback()`
  - `lib/warehouse/asset-actions.ts` — ปุ่มต่อแถวตามสถานะ + capability (`44` §8.2 Action Buttons)
  - `lib/warehouse/intake-photos.ts` — path/มุมของรูป 7 มุม + คำเตือนเมื่อไม่ครบ
- **`lib/warehouse/upload-client.ts`** (browser) — อัปโหลดรูปเข้ารับเข้าคลังขึ้น bucket `case-documents` ตัวเดิม แล้วส่งเฉพาะ path เข้า `photos[]`
- **หน้า `/warehouse` ของจริง** แทน `<ModulePlaceholder>` — shell 4 แท็บ + badge counts (`44` §8.1)
  - แท็บ **รับเข้าคลัง**: filter 7 ตัว + ตาราง 9 คอลัมน์ + card list บนจอเล็ก + ปุ่มตามสถานะ
  - **Modal รับเข้าคลัง 3 ขั้นในหน้าต่างเดียว**: เทียบ IMEI/serial (เขียว/แดง + force proceed) → สภาพ + note บังคับเมื่อไม่ปกติ → รูป 7 มุม
  - **Modal ตีกลับ / ดูเหตุผลตีกลับ** (`rejectReason` = `reason` ของ audit ด้วย)
  - แท็บ **ในคลัง**: การ์ดต่อบริษัท (พร้อมส่ง vs ใน Lot + breakdown สภาพ) → drill-down ตาราง + checkbox + ปุ่ม "นัดวันส่งมอบ (N)" + modal ดูรายละเอียดเครื่อง (รูปเปิดผ่าน `<FileViewerModal>` ขอ signed URL)

### การตัดสินใจระหว่างทาง
- **แท็บ "ในคลัง" ดึง `in_custody` + `handover_pending`** ตามตาราง `44` §8.1 — **ต่างจาก mockup** ที่กรองเฉพาะ `in_custody` · ถ้าทำตาม mockup การ์ดของ §8.3 จะโชว์ "ใน Lot แล้ว" เป็น 0 เสมอ (spec ชนะ mockup เมื่อขัดกัน) ⇒ แยกเป็น `statusesOnWarehouseTab()` ไม่ไปแก้ `statusesInAssetTab()` ของ §9.3 ที่ตอบคนละคำถาม
- **มุมของรูปเข้ารหัสไว้ใน path** (`assets/<assetId>/intake/<angle>/…`) — `assets.photos` เป็น `text[]` ล้วนและ contract ของ 2.13 ปิดแล้ว การเก็บมุมแบบนี้ทำให้แสดง "มุมไหนถ่ายแล้ว" ได้โดยไม่ต้องแก้ schema/`45`
- **IMEI ไม่ตรงต้องกดยืนยัน 2 ครั้ง** — mockup **disable** ปุ่มยืนยันเมื่อ IMEI ไม่ตรง แต่ `44` §8.2/§12 บอกชัดว่า "เตือน แต่ยังไปต่อได้ (force proceed)" ⇒ ทำตาม spec แล้วเปลี่ยนปุ่มเป็น "ยืนยันรับทั้งที่ IMEI ไม่ตรง" เพื่อให้เป็นการตั้งใจ ไม่ใช่เผลอกด
- **ไม่ทำปุ่ม "ใช้ IMEI ในสัญญา"** ที่มีใน mockup — เป็นทางลัดให้กดผ่านการตรวจโดยไม่ได้ดูเครื่องจริง ขัดเจตนาของ §6.5 และ spec ไม่ได้ระบุไว้
- **ตัวเลือก dropdown ทีม/พนักงาน/บริษัทมี fallback** — `/api/teams`+`/api/finance-companies` ขอ `view_master_data` และ `/api/users` ขอ `manage_users` ซึ่ง `44` §13 ไม่ได้ให้ธุรการคลัง ⇒ เรียกไม่ได้ก็ถอยไปรวมค่าจากแถวที่โหลดมา (`filterOptionsOrFallback()`) แทนที่จะปล่อย dropdown ว่าง
- **"วันที่รับเข้า" ของ drill-down กรองฝั่ง client** — `GET /api/assets` มี `dateFrom`/`dateTo` ที่ผูกกับ **วันปิดเคส** เท่านั้น (`44` §15) · ไม่เพิ่ม query param ใหม่เพราะจะกระทบ contract `45`; drill-down โหลด 200 แถว (เพดาน schema) และเตือนบนหน้าจอเมื่อ `total` เกินที่แสดง
- **แท็บ 3–4 เป็น placeholder** ตามขอบเขต 2.15 — `onScheduleHandover` ของ `<CustodyTab>` คือจุดเดียวที่ 2.15 ต้องเสียบ modal สร้างล็อต

### verify ที่รันจริง
`pnpm typecheck` ✅ · `pnpm lint` ✅ (0 warning) · `pnpm test` ✅ (118 ไฟล์ / 1,556 เคส) · `next build` ✅

### จุดที่คนถัดไปควรรู้
- Phase 2.15 เสียบต่อ 3 จุด: prop `onScheduleHandover` ของ `<CustodyTab>` · บล็อก placeholder ของแท็บ `pending_handover`/`handed_over` ใน `<WarehouseManager>` · badge 2 แท็บหลังนับล็อตอยู่แล้ว (`countLots()`)
- ปุ่ม/แท็บทั้งหมดอ่านจาก pure module — เพิ่มสถานะหรือปุ่มใหม่ต้องแก้ที่ `asset-actions.ts`/`asset-filters.ts` ไม่ใช่ใน JSX
- bucket `case-documents` ต้องมีอยู่แล้วต่อ environment (ตั้งไว้ตั้งแต่ 2.5) — รูปรับเข้าคลังใช้ bucket เดียวกัน คนละ prefix

---

## Phase 2.13 — Warehouse Backend (คลังสินค้า + ส่งมอบ · ไฟล์ 44)

**วันที่**: 2026-08-15 · **commit**: `6b119ba` (migration ที่ค้างจาก session ก่อน) + `32f6b4c` + `b9b1f0a` + (docs) · **branch**: `auto/phase-2.13`

### สิ่งที่ทำ
- **migration `20260814183000`** — SQL function `next_handover_number(prefix, be_year)` เดินเลข `LOT-`/`DLV-` ด้วย **PostgreSQL sequence 1 ตัวต่อ (prefix, ปี พ.ศ.)** สร้างแบบ lazy (`nextval()` ไม่ถูก rollback ⇒ ไม่ซ้ำ ไม่ recycle แม้ทรานแซกชันล้ม) + trigger `handover_lots` ที่ `confirmed` **ห้าม UPDATE/DELETE** (`02` §13)
- **pure modules** (ฟอร์ม 2.14/2.15 เรียกตัวเดียวกับ API — ห้าม if เงื่อนไขเองในหน้าจอ)
  - `asset-status.ts` state machine `44` §9.1 · `lot-status.ts` §6.3/§9.2/§9.3 (`we_deliver` เริ่มที่ `pending_delivery_proof` และอยู่แท็บ "ส่งมอบแล้ว" ทันที) · `imei.ts` exact 15 หลัก · `intake.ts` สภาพ/เหตุผล/คำเตือน · `lot-assets.ts` 5 ด่าน · `numbering.ts` เลข พ.ศ. · `warehouse-ui.ts` label/badge · `permissions.ts` capability ต่อ endpoint
  - `errors.ts` 14 code + `schemas.ts` (Zod ใช้ร่วม FE/BE) + `types.ts` DTO
- **`lib/finance/revenue-trigger-rules.ts`** — บ้านเดียวของเงื่อนไข "Revenue เกิดเมื่อไหร่" (`19` §6.1 · DEC-006/D6) เขียนก่อนกำหนดจาก Phase 3.1 เพราะ lot confirm ต้องใช้จริง
- **`asset-hook.ts`** — เครื่องเข้าคิว `pending_intake` อัตโนมัติในทรานแซกชันเดียวกับการปิดเคส `closed_success` **idempotent** (เสียบทั้ง `closeFieldCase()` และ `resubmitCloseCase()`)
- **`revenue-service.ts`** — step 4 ของ lot confirm: ตัดสินเคสที่ถึงเวลาเกิดรายได้ผ่าน `evaluateRevenueTrigger()` **idempotent ต่อ (เคส, รอบติดตาม)** · **stub ตามแผน** ยังไม่สร้างแถว `revenues`
- **`queries.ts`** — list/detail/intake/reject/create lot/**confirm 4 ขั้นใน `$transaction` เดียว** + scope ระดับแถว 4 แบบ
- **API 10 endpoint** ตาม `45` §6.4–6.5 ผูก contract ผ่าน `withEndpoint()` ทุกตัว
- **เอกสาร**: `handover-doc.ts` (แบบข้อมูลร่วมของ PDF+Excel) · `components/pdf/handover-note.tsx` (PDF ตัวแรกของระบบ · `28` §7) · `handover-excel.ts` (Excel ตัวแรก · `96` §15)

### การตัดสินใจระหว่างทาง
- **`intake_rejected → in_custody` ในขั้นตอนเดียว** (ไม่วิ่งผ่าน `pending_intake` ตาม diagram §9.1) — UI "รับใหม่" เปิด modal รับเข้าคลังตัวเดิม (§8.2) การเขียนสถานะกลางจึงเป็นขั้นที่ผู้ใช้ไม่เคยเห็น และถ้าทรานแซกชันล้มจะค้างสถานะกลาง · ตัวบอกว่าเป็นการรับใหม่คือ `isIntakeRetry()` ที่ทำให้ลง event `asset.intake_retry` เพิ่ม
- **RevenueService เป็น stub ที่ "ตัดสินครบแต่ไม่สร้างแถว"** — ยอดเงิน (gross/VAT/fee model) เป็นสูตรของ `22` §6.5–6.8 ที่ Phase 3.1/3.6 เป็นเจ้าของ · `eligibleCaseIds` = สัญญาที่ 3.6 ต้องทำตาม และ `revenue-service.test.ts` คือชุดเทสต์ที่ **ห้ามแก้** ตอนเสียบตัวจริง
- **เติม 3 error code ลง `44` §12 (v2.1)** — `ASSET_NOT_FOUND`/`ASSET_INVALID_STATUS`/`LOT_NOT_FOUND` เป็น code ระดับ "ไม่พบ/สถานะไม่ตรง" ที่ทุก endpoint ของ §15 ต้องใช้แต่ตารางเดิมไม่ได้ลิสต์ (Rule 04 — doc + code + catalog คอมมิตเดียวกัน)
- **สิทธิ์ดูคลังประกอบจาก capability ของหน้าที่** — `02` §12 ไม่มี "ดูคลัง" แยก จึงทำ `WAREHOUSE_READ_CAPABILITIES` แนวเดียวกับ `CASE_READ_CAPABILITIES` ให้ตรงกับผู้ที่เห็นเมนู `warehouse` ใน `06` §7.1.1 · **export PDF/Excel ไม่ให้บริษัทไฟแนนซ์** (§13 ระบุ ธุรการ/การเงิน/บัญชี — ช่องทางของบริษัทคือ Client Portal ไฟล์ 97)
- **`xlsx` ติดตั้งจาก CDN ของ SheetJS** ไม่ใช่ npm (npm ค้างที่ 0.18.5 + มีช่องโหว่ที่แก้แล้วในรุ่นหลัง — สำคัญเพราะ import เคสของ 2.5 จะ parse ไฟล์จากผู้ใช้)
- **ใบส่งมอบอ่านที่อยู่/เลขผู้เสียภาษี ณ เวลาออกเอกสาร ไม่ snapshot** — เป็นเอกสารปฏิบัติการ ไม่ใช่เอกสารการเงิน/ภาษีที่ `92` §7.1 บังคับให้ตรึงค่า

### verify ที่รันจริง
`pnpm typecheck` ✅ · `pnpm lint` ✅ · `pnpm test` ✅ (115 ไฟล์ / 1,520 เคส) · `next build` ✅ (จำลอง Vercel ด้วยการซ่อน `tools/`) · เทสต์ระดับ DB `warehouse-workflow.db.test.ts` ครบ T01–T15 ของ `44` §17 รวม **T11 rollback / T12–T13 เกต Revenue**

### จุดที่คนถัดไปควรรู้
- ต้องรัน **`pnpm db:deploy:test`** (และ `pnpm db:deploy` ต่อ environment) ก่อน — migration เดินเลข/immutable เป็นของใหม่
- **เคสที่ปิดสำเร็จต้องมี IMEI หรือ serial เสมอ** (CHECK `assets_identifier_required`) — ของจริงกันไว้แล้วที่ `missingRequiredFields()` แต่เทสต์ที่ seed เคสด้วย raw SQL ต้องใส่เอง และ cleanup ต้องลบ `assets` ก่อน `cases`
- Phase 3.6 เสียบ RevenueService ตัวจริงที่ `lib/warehouse/revenue-service.ts` (จุด `// ⬇️ Phase 3.6`) แล้วรันเทสต์ชุดเดิมให้ผ่านโดยไม่แก้สัญญา
- ที่เหลือของโมดูลคลังคือ **หน้าจอ** (2.14/2.15) — backend ครบทั้ง 10 endpoint แล้ว

---

## Phase 2.12 — Field Tracker Frontend ชุดที่ 3 (เบิกเงิน + รายได้ + จบงาน + PWA)

**วันที่**: 2026-08-14 · **commit**: `1af69ae` + `07b2744` + (docs) · **branch**: `auto/phase-2.12`

### สิ่งที่ทำ
- **ชุด 1 — pure logic + test (64 เคสใหม่) + ส่วนขยาย BE ที่ §7.11 ต้องใช้**
  - `lib/field/month-filter.ts` — ตัวกรองเดือนกลางของ 3 หน้าจอ · คีย์ **ค.ศ. `YYYY-MM`** (ค่าที่ส่ง API) แต่ป้าย **พ.ศ.** · `monthKeyOfInstant()` แปลงเป็นเวลาไทยก่อนหาเดือน (ปิดงาน 01/09 ตี 1 ไทย = เดือน 9 ไม่ใช่ 8)
  - `lib/field/expense-ui.ts` — ป้าย/สีครบทุกค่า `expense_status`/`expense_type` · `groupExpensesByCase()` (1 เคส = 1 แถวสรุป + แยกบล็อกรายการที่ถูกแทนที่) · `aggregateExpenseStatus()` (สถานะรวม ใช้ทั้ง §7.9 และ §7.11) · ตัวกรองคนละชุดต่อแท็บตาม mockup
  - `lib/field/closed-ui.ts` — pill 4 ตัว + เดือน · การ์ด `reassigned_away` ใช้ **เวลาที่ถูกโอน** แทนวันปิดงาน และคืน `null` เสมอสำหรับสถานะค่าใช้จ่าย
  - `lib/field/dashboard.ts` — 5 บล็อกของ §7.1 + กราฟ 7 วัน (คืน `heightPct`/`successPct` ให้ JSX) + `successRatePct()` ที่คืน `null` แทนหารศูนย์
  - `lib/field/push-client.ts` — `pushAvailability()` (iOS ยังไม่ A2HS = `needs_a2hs` ไม่ใช่ `unsupported`) · `urlBase64ToUint8Array()` · `notificationHref()` กัน open redirect · `unreadBadgeText()` (99+)
  - **BE**: `FieldCaseListItemDto` เพิ่ม `reassignedAway` (จาก `reassignment_history` ของรอบที่ผู้เรียกเป็นคนเดิม) + `expenseStatuses` — โหลด **เฉพาะแถวกลุ่ม `closed`** (2 query ต่อการเรียก 1 ครั้ง แท็บอื่นไม่จ่ายค่านี้)
  - **BE**: `GET /api/field/teammates` (contract + `45` §6.3) — ตัวเลือก "พักร่วมกับ" ต้องใช้เงื่อนไขเดียวกับยาม `assertSharedAgentInTeam()` ฝั่งฟอร์มที่พัก
  - upload ใบเสร็จ: รับรูป **หรือ PDF** เพดาน 10MB path `expenses/<userId>/receipts/` (แยกตามผู้เบิก ไม่ใช่ตามเคส)
- **ชุด 2 — 4 หน้าจอ + PWA**
  - `<ExpensesTab>` (§7.9): กล่องสรุปรอดำเนินการ/อนุมัติแล้ว (ยอดจาก BE ไม่ใช่ยอดหลังกรอง) · ขอบแท็บ "ผูกกับเคส" = การ์ด group ต่อเคส กดขยาย + บล็อก "รายการรอบก่อนหน้า (ถูกแทนที่แล้ว)" · ขอบแท็บ "เบิกแยก" = filter สถานะ+เดือน + ปุ่ม "เบิกที่พัก" · บล็อกส้ม "ถูกตีกลับ" บนสุดทั้ง 2 แท็บ
  - `<HotelClaimModal>` / `<ResubmitExpenseModal>`: 3 ฟิลด์บังคับ + ผู้พักร่วมจาก `field.teammates` · เงินกรอกบาท → ส่ง satang เสมอ · resubmit ของกลุ่มผูกเคสแก้ได้แค่หมายเหตุ (BE ก็ยามซ้ำ)
  - `<IncomeSummary>` (§7.10): default สะสมตลอด แล้วยิงใหม่เมื่อเลือกเดือน (ยอดต้องเป็นของ BE) + กล่องดำรวม + 2 กล่องสถิติ + รายการเคส
  - `<ClosedTab>` (§7.11): pill 4 + เดือน · การ์ด `reassigned_away` ขอบม่วง **กดไม่ได้** แสดงคนใหม่/เวลาที่โอน/เหตุผลแทนสถานะค่าใช้จ่าย
  - `<FieldDashboard>` (§7.1): แบนเนอร์ draft ค้าง · การ์ดดำเคสวันนี้ · สรุป 3 สถานะ · %สำเร็จสะสม + คอมมิชชั่นเดือนนี้ (จาก `field.incomeSummary` 2 ครั้ง) · กราฟแท่ง 7 วัน · desktop 2 คอลัมน์ (2/3 + 1/3)
  - **PWA/Push (§15)**: `app/manifest.ts` (`start_url=/field`, standalone) + `public/sw.js` + metadata `appleWebApp`/theme-color · `<FieldPwaProvider>` = ลงทะเบียน SW + แบนเนอร์ A2HS ของ iOS (ปิดแล้วจำ) + ปุ่มขอสิทธิ์แจ้งเตือน · `<NotificationBell>` = fallback หลัก (badge + dropdown + "อ่านทั้งหมด")

### การตัดสินใจระหว่างทาง
- **เพิ่ม `GET /api/field/teammates` แทนการปล่อยให้ฟอร์มเดารายชื่อ** — §6.6 บังคับว่าผู้พักร่วมต้องเป็นคนในทีมเดียวกัน แต่ `45` §6.3 ไม่มี endpoint ให้ ⇒ เติมตามแบบเดียวกับที่ 2.9 เติม `reject_expense`/push/notifications (แก้ทั้ง contract + `45` + เทสต์นับ endpoint 47 → 48)
- **ขยาย `field.caseList` แทนสร้าง endpoint ใหม่ให้แท็บจบงาน** — §7.11 ต้องการ "คนใหม่/เวลาที่โอน/เหตุผล" + "สถานะค่าใช้จ่าย" ซึ่งไม่มีใน DTO เดิม · เลือกเติมฟิลด์แล้วโหลดเสริมเฉพาะกลุ่ม `closed` (แท็บอื่นไม่มีต้นทุนเพิ่ม) ไม่แตะ path/contract
- **`needs_revision` ไม่อยู่ในตัวกรองสถานะใดเลย** — mockup ให้ตัวเลือกกรอง 3–4 ตัวที่ไม่มี "ถูกตีกลับ" ถ้าปล่อยไว้ในกองปกติงานค้างของพนักงานจะจมใต้ตัวกรอง ⇒ ยกขึ้นบล็อกส้มบนสุดเสมอแบบเดียวกับแท็บ "กำลังติดตาม" (§7.5)
- **service worker ไม่ทำ offline cache** — §15 ต้องการแค่ push · ข้อมูลภาคสนาม (สถานะเคส/รายการเบิก) ถ้าแคชแล้วพนักงานเห็นของเก่าจะทำงานผิด (§11 mobile/desktop ตรรกะเดียวกัน)
- **ไม่ขอสิทธิ์แจ้งเตือนอัตโนมัติตอนเปิดแอป** — เบราว์เซอร์บล็อกคำขอที่ไม่ได้มาจาก user gesture และ §15 ระบุว่าเป็นการ "แนะนำ" ⇒ ทำเป็นแถบพร้อมปุ่ม
- **ไอคอน PWA เป็น SVG** (`public/icons/app-icon.svg`) — ยังไม่มี asset PNG จริงในโปรเจกต์ · Chrome/Android รับ SVG ได้ · ถ้าต้องการ splash/ไอคอนคมบน iOS ควรเพิ่ม PNG 192/512 ภายหลัง (ไม่กระทบตรรกะ)

### verify ที่รันจริง
`pnpm typecheck` ✅ · `pnpm lint` ✅ · `pnpm test` ✅ (103 ไฟล์ / 1,344 เคส) · `pnpm build` ✅ (route `/field/*` ครบ 7 หน้า + `/manifest.webmanifest`)

### จุดที่คนถัดไปควรรู้
- **ต้องตั้ง env ก่อน push จริงถึงจะทำงาน**: `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` (server) **และ `NEXT_PUBLIC_VAPID_PUBLIC_KEY`** (browser ใช้ตอน subscribe — ต้องเป็นค่าเดียวกับ public key) · ยังไม่ได้เพิ่มลง `.env.example` เพราะ session อัตโนมัติเข้าถึงไฟล์ `.env*` ไม่ได้ (สิทธิ์เครื่อง) — **ฝากคนเพิ่มให้ 4 บรรทัดนี้**
- ไม่ตั้งคีย์ = ระบบยังทำงานครบ แค่ไม่มี push (กระดิ่งในแอปเป็น fallback หลักตาม §15) — ปุ่ม "เปิดการแจ้งเตือน" จะขึ้น toast บอกว่าเซิร์ฟเวอร์ยังไม่เปิด
- Field Tracker ครบทุกหน้าแล้ว (`<FieldComingSoon>` ไม่ถูกใช้ในหน้าใดอีก แต่คงไว้เป็น component กลางสำหรับโมดูลถัดไป)
- ยังไม่ได้ทดสอบบนมือถือจริง/staging (ต้อง push โดยคน) — จุดที่ควรดู: การติดตั้ง A2HS บน iOS แล้วรับ push จริง, badge กระดิ่งกับ safe area, กราฟ 7 วันบนจอเล็ก
- **Phase 2.13 ต่อ**: expense กลุ่ม `pending_warehouse_confirm` จะปลดล็อกได้จริงเมื่อคลังยืนยัน lot (`44` §11) — แถวสรุปต่อเคสในแท็บเบิกเงินคือจุดที่จะเห็นผลของ transaction 4 steps

---

## Phase 2.11 — Field Tracker Frontend ชุดที่ 2 (ฟอร์มปิดงาน + คำขอเปลี่ยนผู้รับผิดชอบ)

**วันที่**: 2026-08-14 · **commit**: `66be882` + `011318f` + (docs) · **branch**: `auto/phase-2.11`

### สิ่งที่ทำ
- **ชุด 1 — pure logic + test (51 เคสใหม่)**
  - `lib/field/close-form.ts` — โหมดฟอร์ม (`closeFormMode()`: ล็อก outcome/เช็คอิน + ปุ่มท้ายฟอร์มตามสถานะ) · ค่าเริ่มต้น (`closeFormFromDetail()`: draft autoload · โหมดตีกลับตั้งจาก `submittedEvidence`) · `closeFormMissing()`/`closeMissingSummary()` (บอกหลักฐานที่ขาด**ครบครั้งเดียว** §20) · `hasCloseFormRevision()`/`canSubmitCloseForm()` · payload ของ 3 ปุ่ม
  - `lib/field/reassignment-ui.ts` — `nextReassignmentPopup()` (auto-popup ทีละเคส + "ดูทีหลัง") · `declineReasonError()` · `reassignmentCountdown()` (รับ `now` เข้ามา) · `trackReassignments()` จับเคสที่ auto-resolve แล้ว toast ครั้งเดียว
  - `lib/field/map-pan.ts` — static map (OSM ตาม mockup ไม่ต้องมี API key) + `panCenter()` แปลงพิกเซลที่ลาก ↔ พิกัดด้วยสูตร Web Mercator (ผันกลับได้ มีเทสต์เทียบ `metersPerPixel`)
  - `lib/field/media-upload.ts` + `upload-client.ts` — accept/capture/เพดานขนาดต่อชนิดสื่อ + `fieldEvidencePath()` (bucket `case-documents` prefix `field_evidence/`)
  - `field.caseDetail` เพิ่ม `submittedEvidence` (ขยาย payload ไม่แตะ contract) — ฟอร์มโหมดตีกลับต้องเห็นชุดเดิมเพื่อแก้เฉพาะสื่อ + เทียบว่ามีการแก้จริง
- **ชุด 2 — หน้าจอ**
  - `<CloseCaseModal>` (`41` §7.6): กล่องจุดเริ่มเดินทาง (ดึง GPS อัตโนมัติทันทีที่เปิดฟอร์ม → บันทึกผ่าน `close-draft` · ลากแผนที่ปรับ = `manual_adjusted` · ปุ่ม "ดึง GPS ใหม่" เมื่อ GPS ล้ม · แสดงเฉพาะทีม `PER_KM`) · outcome picker การ์ดใหญ่ 2 ปุ่ม · เช็คอินจาก `navigator.geolocation` จริง + static map preview + ลิงก์ Maps (ล็อกทุกจุด) · รูป/วิดีโอ/รูปสินค้า (กล้อง + เลือกไฟล์ · thumbnail grid ลบได้) · เสียงไม่บังคับ · autosave draft ทุกครั้งที่แก้ · แถบสรุป "ยังขาด…" · โหมด `needs_revision` = banner เหตุผล + ล็อก outcome/เช็คอิน + ปุ่มเดียว "ส่งกลับยืนยันอีกครั้ง"
  - `<FieldReassignmentProvider>` ระดับ shell (`41` §7.8): auto-popup ทุกหน้าใต้ `/field` · "ดูทีหลัง" ปิดแค่ popup (**badge ม่วงยังค้าง**) · toast auto-dismiss เมื่อเคสถูกโอนเพราะตอบไม่ทัน · `<ReassignmentModal>` = สรุปคำขอ + countdown + ยินยอม/ไม่ยินยอม (บังคับเหตุผล) + `<FieldCaseDetailBody>` เต็มใต้กล่อง (ครบ 3 ที่ตาม §7.7)
  - แท็บกำลังติดตาม/รับงานแล้ว + หน้ารายละเอียดเคส ต่อปุ่มของจริงครบ (เลิกใช้ `notYet()` ของ 2.10) · เปิดฟอร์มปิดงานจะ `setPopupPaused(true)` กัน popup เด้งทับ

### การตัดสินใจระหว่างทาง
- **ไม่มีปุ่มลบจุดเช็คอิน** แม้ §7.6 เขียนว่ามี — §6.4/§6.4.1/§11 ระบุว่าเช็คอิน "ล็อกตลอด แก้ไขไม่ได้", §8 ไม่มี action ลบ และ `45` §6.3 ไม่มี endpoint (2.8 ทำ insert-only พร้อมเทสต์ยาม) ⇒ ยึดกฎธุรกิจ + สัญญา API · ถ้า PO ยืนยันภายหลังว่าต้องลบได้ ต้องเพิ่ม action + endpoint + error code ก่อน
- **ลากปรับตำแหน่งบนแผนที่โดยไม่เพิ่ม dependency** — mockup ทิ้ง `adjustTravelOrigin()` ไว้เป็น stub · เลือกทำเองด้วยรูป static map + สูตร Web Mercator (`panCenter()`) แทนการดึง Leaflet/Google Maps JS เข้ามา (ต้องมี DEC ใหม่ + ค่า API) — ได้ UX ลากจริงทั้ง touch/mouse และเทสต์คณิตศาสตร์ได้
- **ไฟล์หลักฐานใช้ bucket `case-documents` เดิม** prefix `cases/<id>/field_evidence/<kind>/` แทนการตั้ง bucket ใหม่ (จะกลายเป็นขั้นตอน ops เพิ่มต่อ environment) · เก็บเฉพาะ path แล้วเปิดดูด้วย `signedFileUrl()` ของ 2.5
- **จุดเริ่มเดินทางเดินทางมากับ `close-draft`** ตามที่ 2.8 ออกแบบไว้ (ไม่มี endpoint แยกใน `45`) ⇒ ทุกครั้งที่ปรับพิกัดต้องส่งสื่อทั้งชุดไปด้วย ไม่งั้น draft โดนเขียนทับด้วยค่าว่าง (บันทึกไว้ในกับดัก REUSE_INDEX)
- **toast เคสที่ถูกโอนอัตโนมัติจับจาก "คำขอที่เคยเห็นแล้วหายไป"** — รายการที่ shell โหลดมีแต่สถานะที่ยังทำงานอยู่ (`reassigned_away` ไปอยู่แท็บจบงาน) จึงเทียบข้ามรอบโหลดด้วย `trackReassignments()` และกันซ้ำด้วยรายการ `answered` (เคสที่ผู้ใช้ตอบเอง) + `notified`

### verify ที่รันจริง
`pnpm typecheck` ✅ · `pnpm lint` ✅ · `pnpm test` ✅ (98 ไฟล์ / 1,280 เคส — รวมเทสต์ระดับ DB ของ `submittedEvidence` ในโหมด `needs_revision`) · `pnpm build` ✅

### จุดที่คนถัดไปควรรู้
- **ยังไม่ได้ทดสอบบนมือถือจริง/staging** (ต้อง push โดยคน) — DoD ของ task นี้ที่เหลือคือ: กล้อง/ไมค์บนมือถือจริง, สิทธิ์ตำแหน่ง (ทั้งกรณีอนุญาตและปฏิเสธ), ลากแผนที่บนจอสัมผัส, ปิดงานจริงแล้วเช็คว่ารายการเบิกเกิดครบ
- **ต้องมี bucket `case-documents` ต่อ environment** (ข้อเดิมจาก 2.5) — ฟอร์มปิดงานใช้ bucket เดียวกัน ถ้าไม่มีจะอัปโหลดหลักฐานไม่ได้เลย
- **Phase 2.12 ต่อ**: แท็บเบิกค่าใช้จ่าย/สรุปรายได้/แท็บจบงาน/Dashboard/PWA+push — `<FieldComingSoon>` 4 หน้ายังคาอยู่ · flow คำขอเปลี่ยนผู้รับผิดชอบและฟอร์มปิดงานพร้อมใช้ซ้ำได้ทันที (`useReassignment()` / `<CloseCaseModal>`)
- ปุ่ม "แก้ไขหลักฐาน" ของบล็อกส้มในแท็บกำลังติดตามเปิด `<CloseCaseModal>` ตัวเดียวกัน — โหมดตีกลับตัดสินจาก `status` ไม่ใช่ prop (ห้ามส่ง flag เอง)

---

## Phase 2.10 — Field Tracker Frontend ชุดที่ 1 (shell + case detail + งานรายวัน + ปฏิทิน)

**วันที่**: 2026-08-14 · **commit**: `97afe2e` + `4d53196` + (docs) · **branch**: `auto/phase-2.10`

### สิ่งที่ทำ
- **ชุด 1 — pure logic + test (31 เคส)**
  - `lib/field/field-nav.ts` = SSOT ของเมนูไฟล์ 41 §5 (7 เมนู · bottom nav 4 ปุ่มเรียงตาม flow · 2 หมวด งานของฉัน/การเงิน · badge key + โทนสี · `activeFieldNavId()` จับด้วย href ยาวสุด)
  - `lib/field/field-ui.ts` = ป้ายสถานะ 7 ตัว + กลุ่มสี `04` §8.1 · `fieldCardAction()` (จุดเดียวที่ตัดสินปุ่มบนการ์ด) · `groupCasesByDate()`/`splitTrackingCases()`/`groupCasesByAgent()`/`casesScheduledOn()` · `reorderCaseIds()` · `teammatesInProvince()` · deep link `tel:`/LINE/Facebook/Maps + `formatFieldAddress()`/`assetSummary()`
  - `lib/field/calendar.ts` = grid ปฏิทินเอง (`41` §7.4) — `buildMonthGrid()`/`shiftMonth()`/`monthLabelTH()` (พ.ศ.)/`countCasesByDate()`/`withWeekdayPrefix()` · รับ `todayIso` เข้ามาแทนการอ่านนาฬิกาเอง
- **ชุด 2 — หน้าจอ**
  - `<FieldShell>`: mobile top bar (โลโก้กลับหน้าแรก + แฮมเบอร์เกอร์) + bottom nav 4 ปุ่มพร้อม badge (แดง/ม่วง) · desktop sidebar **260px `position: fixed`** + `margin-left:260px` + ข้อมูลผู้ใช้/ออกจากระบบล่างสุด
  - `<FieldCasesProvider>`/`useFieldCases()` = badge store + คลังเคส (โหลด `field.caseList?view=own` ครั้งเดียว ทุกแท็บกรองจากชุดเดียวกัน · `reload()` หลัง mutation)
  - `<FieldCaseDetailBody>`/`<FieldCaseDetailModal>` (`41` §7.7 ครบทุกบล็อก: สรุปเคส+รอบติดตาม · กล่องคำขอเปลี่ยนผู้รับผิดชอบ · กล่องคอมมิชชั่นเฉพาะ `pending_accept` · เลขบัตร/มูลหนี้/ทรัพย์+IMEI · 3 ที่อยู่ปุ่ม Maps แยกอิสระ · ช่องทางติดต่อกดโทร/LINE/FB · ผู้ติดต่ออื่น · เอกสาร/รูปสินค้าเปิดดูจริง · เช็คอิน · แบนเนอร์เหตุผลตีกลับ · ปุ่มรับงาน)
  - แท็บรอรับงาน (§7.2 + Agent Accept ของไฟล์ 40) · แท็บรับงานแล้ว toggle ของฉัน/ทีม (§7.3 — ทีมเป็นคอลัมน์ต่อคน **read-only**) · แท็บกำลังติดตาม (§7.5 — บล็อกส้ม `needs_revision` บนสุด + group ตามวัน + เลขลำดับ + ปุ่ม 3 สถานะ)
  - `<CalendarPickerModal>` (§7.4): grid เอง + badge ต่อวัน + วันย้อนหลัง disabled + popup ยืนยัน (ลิสต์เคสเดิม + "จะเป็นลำดับที่ N" จาก `nextScheduleOrder()` ตัวเดียวกับ BE) + banner ม่วงเพื่อนร่วมทีมจังหวัดเดียวกัน + รายละเอียดเคสเต็มใต้ปฏิทิน
  - หน้า `/field` + `/field/{pending,accepted,tracking,closed,expenses,income}` · layout guard `perform_field_work` (ไม่มีสิทธิ์ = เด้งแดชบอร์ด กันวนซ้ำ)

### การตัดสินใจระหว่างทาง
- **ไม่ reuse `<CaseDetailModal>` ของไฟล์ 38 ตามที่แผนเขียนไว้ — เพราะติดเรื่องสิทธิ์**: modal ตัวนั้นโหลดเอง 2 endpoint (`case.detail` + `case.teamOptions`) ที่บังคับ `CASE_READ_CAPABILITIES` ส่วนพนักงานภาคสนามถือ `perform_field_work` ตัวเดียว (`41` §13) ⇒ ได้ 403 ทุกครั้ง · ฝั่ง BE (2.8) ทำ `GET /api/field/cases/:id` + `FieldCaseDetailDto` ไว้ให้อยู่แล้ว (มีคอมมิชชั่น/เช็คอิน/คำขอเปลี่ยนผู้รับผิดชอบ ซึ่ง DTO ของไฟล์ 38 ไม่มี) จึงทำ `<FieldCaseDetailBody>` เป็น component เดียวของไฟล์ 41 แล้ว**ใช้ซ้ำ 3 ที่ตาม §7.7** · ส่วนที่ reuse ได้จริงคือ `<FileViewerModal>` — ขยายให้รับ `ViewableFile` (โครงร่วมขั้นต่ำ) แทนการผูกกับ `CaseDocumentDto`
- **ทุกแท็บอ่านจากคลังเดียวของ shell** แทนที่จะให้แต่ละแท็บยิง `field.caseList` ของตัวเอง — badge กับรายการจึงไม่มีทางไม่ตรงกัน และสลับแท็บไม่ต้องรอเน็ต (มุมมองทีมยังยิงแยกเพราะเป็นคนละ scope)
- **สลับลำดับมีทั้งลากและปุ่มลูกศร**: HTML5 drag ใช้ไม่ได้บน iOS Safari — ทั้งสองทางเรียก `reorderCaseIds()` แล้วยิง `field.reorderCases` ชุดเดียวกัน (logic เดียวกัน 100% ตาม §11 ต่างแค่วิธีสั่ง)
- **วันที่บนจอผ่าน `fmtDate` เสมอ** — `withWeekdayPrefix()` เติมแค่ชื่อวัน ("วันศ 14/08/2569") ไม่ format วันที่เอง (mockup เขียน "14 ส.ค. 2569" แต่ Rule 01 บังคับ `DD/MM/YYYY`)
- **ปุ่มของเฟสถัดไปบอกตรง ๆ ว่ายังไม่เปิด** (toast "อยู่ระหว่างพัฒนา Phase 2.11") แทนการซ่อนปุ่ม — โครงการ์ด/แท็บจึงตรง mockup ตั้งแต่รอบนี้ และไม่มีปุ่มหลอกที่กดแล้วเงียบ

### verify ที่รันจริง
`pnpm typecheck` ✅ · `pnpm lint` ✅ · `pnpm test` ✅ (94 ไฟล์ / 1,228 เคส) · `pnpm build` ✅ (route `/field/*` ออกครบ 7 หน้า)

### จุดที่คนถัดไปควรรู้
- **Phase 2.11 ต่อ**: ฟอร์มปิดงาน 3 ส่วน + Pending Reassignment flow — จุดเสียบคือ `notYet()` ใน `components/field/tracking-tab.tsx` และ prop `onRespondReassignment` ของ `<FieldCaseDetailBody>` (กล่องม่วงพร้อมแล้ว เหลือฟอร์มตอบ)
- **Phase 2.12 ต่อ**: `<FieldComingSoon>` 4 หน้า (`/field`, `/field/closed`, `/field/expenses`, `/field/income`) — เมนู/badge/shell พร้อมใช้แล้ว แค่เปลี่ยนเนื้อหาในหน้า
- กฎ lint `react-hooks/set-state-in-effect` ห้าม `setState` ตรง ๆ ใน effect (รวมถึงเรียกผ่าน `useCallback`) — ใช้ async IIFE + `key` remount (บันทึกไว้ในกับดักของ `REUSE_INDEX` แล้ว)
- ยังไม่ได้ทดสอบบนมือถือจริง/staging (ต้อง push โดยคน) — จุดที่ควรดูก่อน: bottom nav กับ safe area ของ iOS, การลากการ์ดบนมือถือ (ต้องใช้ปุ่มลูกศร), sidebar 260px บนจอ ≥1024px

---

## Phase 2.9 — Field Tracker Backend ชุดที่ 2 (เงิน + ตีกลับ + push — ไฟล์ 41)

**วันที่**: 2026-08-14 · **commit**: `dcb0fc3`+`f19cad0`+`71d8b8d`+`6af1d76` · **branch**: `auto/phase-2.9`

### มติ PO ที่ปลดล็อกงานนี้ (ตอบ `[[NEEDS_DECISION]]` ตอนเริ่ม task)
- **เพิ่มคอลัมน์/ตารางที่ `41` ใช้จริงแต่ `02` ยังไม่มี** พร้อมแก้ `02` (v4.3 + changelog) — `expenses` +5 คอลัมน์ (`expense_date`, `distance_km`, `shared_with_user_id`, `receipt_file_url`, `superseded_by_expense_id`) และตารางใหม่ `push_subscriptions`
- **D10 = ใช้ default** (ปิดงานสำเร็จเสมอ · fuel รอ job) — implement โดย**ไม่เพิ่มค่า enum ใหม่** (Rule 04): fuel `PER_KM` ที่ยังไม่รู้ระยะทาง = **ยังไม่สร้างแถว** + ตั้ง job `fuel_distance_retry` แทนสถานะ `pending_calculation` ที่ถ้อยคำเดิมของ default เขียนไว้
- **Google Maps API key ใส่ที่ Vercel/staging ทีหลังได้** — โค้ดไม่บล็อก (ไม่มี key = เดินเส้นทาง D10 เหมือน Maps ล่ม)

### สิ่งที่ทำ
1. **schema เงินภาคสนาม** (`dcb0fc3`) — 5 คอลัมน์บน `expenses` + `push_subscriptions` + index `idx_expenses_payee_date` + **partial unique `uniq_active_case_expense_per_assignment`** (1 รอบติดตามมีรายการเบิกที่ยังมีผลได้ชนิดละ 1 — กันกด submit/resubmit ซ้อนที่ระดับ DB) · ยาม `schema.test.ts` เปิดทาง Decimal(10,2) เฉพาะ `distanceKm`
2. **pure logic** (`f19cad0`) — `distance.ts` (ลำดับ origin→checkins ตามเวลาจริง, รวมทุกช่วง, เมตร→ร้อยของ กม.) · `expense-calc.ts` (สูตร `22` §6.1–6.3 + สถานะเริ่มต้นตาม outcome + ยอด 0 ไม่สร้าง record) · `expense-status.ts` (state machine `23` §6.3) · `hotel-claim.ts` · Zod ของ endpoint ที่เหลือ · error code ใหม่ 3 ตัวเข้า `41` §12
3. **service + route** (`71d8b8d`) — Google Distance Matrix ทีละช่วง + cache + retry · สร้าง fuel/allowance ในทรานแซกชันเดียวกับปิดงาน (snapshot แผนด้วย `resolvePlanVersionAt`) · `reject_evidence` + `resubmit_close_case` (supersede + สร้างใหม่ + ผูก `superseded_by_expense_id`) · `reject_expense` + `resubmit_expense` · เบิกที่พัก + รายการเบิก 2 แท็บ + สรุปรายได้ · respond reassignment ฝั่ง field · job `fuel_distance_retry` · Web Push (VAPID) + กล่องแจ้งเตือนในแอป · endpoint ใหม่ 6 ตัวเข้า `45` §6.2/§6.3 (รวมเป็น 47) + event `case.evidence_rejected` เข้า `41` §17.2
4. **เทสต์ระดับ DB** (`6af1d76`) — 16 เคสครอบ DoD ทั้งหมด (ดูหัวข้อถัดไป)

### DoD ที่พิสูจน์แล้ว (`lib/field/field-expense.db.test.ts`)
- `resubmit_close` → รายการเบิกรอบเดิม `superseded` ครบ + ชุดใหม่ชนิดละ 1 รายการ (**ไม่ซ้ำไม่หาย**) + `tracking_round` ไม่เพิ่ม + outcome ล็อกตามรอบแรก
- ทีม `DAILY_FLAT` **ไม่เรียก Distance Matrix เลยแม้แต่ครั้งเดียว** (spy ของ `fetch` = 0 ครั้ง) และ `distance_km` เป็น NULL
- เพดาน `max_per_case` ตัดยอดจริง (120 กม. × ฿5 = ฿600 → จ่าย ฿400) · ไม่มีเพดาน = จ่ายเต็ม
- D10: Maps ตอบ 500 → ปิดงานยังสำเร็จ, ไม่มีแถว fuel, job ถูกตั้ง · ปลายทางกลับมา job สร้างรายการให้ · **รันซ้ำไม่เกิดรายการซ้ำ** · ยอด 0 ไม่สร้าง record
- `reject_expense` ไม่กระทบ `assignment_status` · `resubmit_expense` โดยคนอื่น = `EXPENSE_NOT_FOUND` (ไม่ leak)
- เบิกที่พัก: ผู้พักร่วมนอกทีมถูกปฏิเสธฝั่ง BE · auto-mapping เคสวันเดียวกันแสดงผลแต่ไม่กระทบยอด

### ตัดสินใจเชิงเทคนิคที่ควรรู้
- **หน่วยระยะทางภายในเป็นจำนวนเต็ม** ("ร้อยของกิโลเมตร") ปัดครั้งเดียวตอนแปลงจากเมตร ⇒ ยอดที่ auditor คิดซ้ำจาก `distance_km × rate` ตรงกับที่บันทึกเสมอ
- **ยิง Distance Matrix ทีละช่วง** (1 element/ครั้ง) แทนเมทริกซ์ n×n — ค่าใช้จ่ายคาดเดาได้และ cache ต่อช่วงได้จริง · `ZERO_RESULTS` นับเป็น 0 เมตรของช่วงนั้น (retry อีกกี่รอบก็ได้ผลเดิม ไม่งั้น job ค้างถาวรจนไม่มีรายการเบิก)
- **I/O ภายนอกอยู่นอก `$transaction` เสมอ** (คำนวณระยะทางก่อนเปิดทรานแซกชัน · แจ้งเตือน/push หลัง commit)
- `ensureAgentPayeeId()` สร้าง `payee_profiles` โครงเปล่าให้พนักงานที่ยังไม่มี เพราะ `expenses.payee_id` เป็น NOT NULL ตาม `02` — ข้อมูลธนาคาร/ภาษีเป็นงานของ Phase 3.2 (`18`)
- ผู้รับการแจ้งเตือนมาจาก **capability** (`approve_expense_manager`) ไม่ใช่ชื่อ role
- **`reject_expense` ทำได้ตั้งแต่ `pending_approval` ขึ้นไป** ตาม `23` §6.3 ⇒ รายการของเคสสำเร็จที่ยัง `pending_warehouse_confirm` ตีกลับไม่ได้จนกว่าคลังจะยืนยัน (Phase 2.13)

### ค้าง/ต้องทำต่อ
- ⚠️ **ตั้ง env ที่ Vercel/staging ก่อนใช้จริง**: `GOOGLE_MAPS_API_KEY` (ไม่มี = fuel `PER_KM` รอ job) · `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` + `NEXT_PUBLIC_VAPID_PUBLIC_KEY` สำหรับ Web Push (ไม่มี = เหลือแต่แจ้งเตือนในแอป) — `.env.example` แก้ไม่ได้จาก session อัตโนมัติ (permission บล็อกไฟล์ `.env*`) ต้องเติมด้วยมือ
- scheduler ของ job (`fuel_distance_retry`) ยังไม่มี — Phase 5.3 ตาม `91` · ระหว่างนี้เรียก `runFuelDistanceRetryJob()` เองได้
- `EMPTY_PAYOUT_BATCH` ของ D10 เป็นของ Phase 3.4
- ฝั่งหน้าจอทั้งหมด (ฟอร์มเบิก/สรุปรายได้/PWA + service worker ของ push) = 2.10–2.12

---

## Phase 2.8 — Field Tracker Backend ชุดที่ 1 (core flow — ไฟล์ 41)

**วันที่**: 2026-08-14 · **commit**: `0465255`+`3f8328f`+`2122229` · **branch**: `auto/phase-2.8`

### สิ่งที่ทำ
- **Schema ภาคสนาม (sync `02` v4.2)** — migration 3 ใบ (`20260814150000_field_tracker_core` + 2 ใบปรับ FK action ให้ตรงแบบที่ Prisma สร้าง):
  - `assignment_status` **6 → 7 ค่าตาม `41` §10** (`pending_accept`/`accepted_unscheduled`/`scheduled`/`closed_success`/`closed_fail`/`needs_revision`/`reassigned_away`) — ของเดิมแยก "จัดวันแล้ว/ยังไม่จัดวัน" และผลการติดตามไม่ได้ · Postgres ลบค่า enum ไม่ได้ ⇒ สร้างชนิดใหม่แล้วย้ายคอลัมน์พร้อม mapping ของเก่า
  - `case_assignments.schedule_order` + index `idx_assignments_agent_schedule` · `case_evidences` เปลี่ยน `video_url` → `videos TEXT[]` + เพิ่ม `photos`/`audio_url` (§6.4 เก็บแยกประเภทเป็น array)
  - ตารางใหม่ **`travel_origins`** (§6.4.1 · enum `travel_origin_source`) และ **`close_case_drafts`** (§6.5) — UNIQUE ที่ `assignment_id` (1 รอบติดตาม = 1 จุด/1 draft)
- **pure module + unit test 36 เคส**: `field-status.ts` (transition table + `assertFieldAction`/`assertFieldStateAction` + `fieldGroupOf`/`statusesInGroup` 4 กลุ่มแท็บ) · `evidence.ts` (`missingCloseEvidence` คืน**ทุก**รายการที่ขาด + `assertDeviceCoordinates` + `hasEvidenceRevision`) · `schedule.ts` (`nextScheduleOrder` ต่อท้าย + `recomputeScheduleOrder` ทั้งวัน + `assertReorderCoversDay`)
- **API 8 endpoint ของ `45` §6.3**: list 4 กลุ่ม + `view=own|team` · detail เต็ม (3 ที่อยู่/ติดต่อ/เอกสาร/รูปสินค้า/เช็คอิน/draft/จุดเริ่มเดินทาง/คำขอเปลี่ยนผู้รับผิดชอบ/`rejectReason`) · accept · schedule · reorder · checkin · close-draft (พ่วง travel origin) · close
- **เทสต์ระดับ DB 22 เคส** (`field-workflow.db.test.ts`): flow เต็ม · error code ครบทุกตัวในขอบเขต · ลำดับต่อวัน · draft autoload/ลบตอน submit · travel origin ไม่ auto-fill ข้ามเคส · มุมมองทีม read-only

### การตัดสินใจระหว่างทาง
- **enum 7 ค่าเดินตาม `41` §10 แล้ว sync `02` (v4.2)** ตามแนวเดียวกับ v4.0/v4.1 (Group C เขียนไว้ก่อนไฟล์ 38/40/41 รอบ reformat) — โค้ด 2.6 ทั้งหมดย้ายมาใช้ค่าใหม่ผ่าน `assignmentStateOf()` โดยเพิ่ม `ACCEPTED_ASSIGNMENT_STATUSES` (ไม่มีที่ไหนอ่าน `status` ดิบ)
- **`needs_revision` นับว่า "ยังถือเคสอยู่"** และอยู่แท็บ **กำลังติดตาม** ไม่ใช่จบงาน — เป็นงานค้างที่พนักงานต้องแก้ (§7.6/§10.1)
- **`travel_origin` ไม่มี endpoint แยกใน `45`** ⇒ เดินทางมากับ `close-draft` (ตรงกับ §6.5 ที่ draft มี `travel_origin` อยู่ในโครงสร้าง) — ไม่เพิ่ม endpoint นอกสัญญา
- **body ของ `close` เป็นเจ้าของชุดหลักฐานสุดท้าย ไม่ merge กับ draft** (ไม่งั้นไฟล์ที่ผู้ใช้ลบทิ้งจะกลับมา) ส่วน**เช็คอินอ่านจาก DB เสมอ** เพราะล็อกแล้ว
- **`case.status` → `active` ตอนจัดวัน** และ → `closed_success`/`closed_fail` + `outcome` + `closed_at` ตอนปิดงาน (`02` §3 `case_status.active` = "กำลังดำเนินงาน")
- **detail เปิดกว้างกว่า `caseScopeWhere()` โดยตั้งใจ** — §7.3/§20 บังคับให้มุมมองทีมเห็นรายละเอียดเต็มไม่ปิดบัง จึงใช้เงื่อนไข "เคสตัวเอง **หรือ** ทีมเดียวกัน" ที่ระดับ assignment ส่วน mutation ทุกตัวยังผ่าน `loadOwnAssignment()` ที่บังคับ `agentId = ผู้เรียก`
- **วันย้อนหลังไม่ถูกบล็อกฝั่ง BE** — `41` §7.4 เป็นกฎของ Calendar Picker และ §12 ไม่มี error code รองรับ (ห้ามตั้ง code เอง — Rule 04)
- **`resubmit_close_case` / `reject_evidence` มีใน transition table แล้วแต่ยังไม่มี endpoint** — ตาม PLAN อยู่ Phase 2.9 คู่กับ expense

### จุดที่คนถัดไปควรรู้
- **การสร้างรายการเบิก fuel/allowance อัตโนมัติตอนปิดงาน (§6.6) ยังไม่มี** — Phase 2.9 ต้องต่อที่ `closeFieldCase()` (จุดเดียว) พร้อมคำนวณระยะทางจาก `travel_origins` + `check_ins` ตามลำดับเวลา
- `case_evidences.travel_origin_*` คือ **snapshot ณ เวลา submit** — ตัวคำนวณระยะทางของ 2.9 ต้องอ่านค่านี้ ไม่ใช่ค่าปัจจุบันในตาราง `travel_origins`
- FE 2.10–2.12 ต้องเรียก `fieldGroupOf()`/`assertFieldAction()` ชุดเดียวกับ API — ห้าม if สถานะเองใน JSX (แนวเดียวกับ `assignment-ui.ts` ของ 2.7)
- เทสต์ DB ของ 2.8 ใช้ 2 ทีม 2 แผนค่าตอบแทน (PER_KM / DAILY_FLAT) — เคสที่ต้องตรวจเงื่อนไขจุดเริ่มเดินทางให้ยืมชุด fixture นี้

### verify ที่รันจริง
`pnpm typecheck` ✅ · `pnpm test` (85 ไฟล์ / 1,126 เคส) ✅ · `pnpm lint` ✅ · `pnpm build` ✅

---

## Phase 2.7 — Case Assignment Frontend (ไฟล์ 40)

**วันที่**: 2026-08-14 · **commit**: `612e3b2` · **branch**: `auto/phase-2.7`

### สิ่งที่ทำ
- **หน้า `/cases/assign`** (`components/assignments/assignments-manager.tsx` · `40` §7.1/§7.2): KPI 3 ใบ + filter สถานะ/ทีม/ค้นหา + pagination · จอ < `md` สลับเป็น **card list** ที่ยังมีวันเวลากำกับและ badge ทีมครบ · ตารางมีคอลัมน์ทีม (**badge Inhouse/Outsource คนละบรรทัดกับชื่อทีม**) และคอลัมน์ผู้รับผิดชอบที่มี "มอบหมายเมื่อ … • รับงานเมื่อ …" เสมอ · badge `pending_reassignment` **แยกจาก badge สถานะหลัก** พร้อมบรรทัด "ขอเปลี่ยนเป็น X · เหลืออีก N ชม."
- **ปุ่มของหัวหน้าทีม = ซ่อน ไม่ใช่ disabled** (`40` §7.2 · Rule 05): page เป็น server component คำนวณ `canPerformAssignmentAction()` จาก settings §6.4 แล้วส่งเป็น prop · FE ต้องผ่านทั้ง prop นี้ **และ** capability `assign_case` จึงจะเห็นปุ่ม (ผู้บริหาร/การเงินที่เข้าด้วย `view_master_data` เห็นเป็นอ่านอย่างเดียว) — API ตรวจซ้ำเสมอ (DEC-002)
- **Assignment Modal (`40` §7.3) = reuse `<CaseDetailModal>` ของ 2.5** — เพิ่ม prop `size`/`title`/`description`/`headerSlot`/`extraSection`/`footerActions`/`hideWorkflowActions` แล้วต่อ Agent Picker + กล่องเหตุผล + ปุ่มยืนยันเข้าไปใน **modal เดียวกัน** (ไม่สลับ modal/หน้าใหม่) ลำดับ: รายละเอียดเคส → เอกสาร/รูปสินค้า → เลือกพนักงาน → ปุ่มยืนยัน
- **Agent Picker**: รายชื่อ **เฉพาะทีมของเคส** + ข้อมูล §6.2 (เคสในมือ · % สำเร็จ · จังหวัดที่รับผิดชอบ) · toggle "ดูเคสที่ถืออยู่" **ขยายพร้อมกันได้หลายคน** และแต่ละเคสมีปุ่ม "ดูรายละเอียด" เปิด `<CaseDetailModal>` แบบอ่านอย่างเดียวซ้อนขึ้นมา (ไม่มีปุ่ม assign/reassign ซ้อน)
- **Reassign flow UI**: reason บังคับทุกกรณี · คำบนปุ่ม + คำเตือนมาจาก `reassignConfirmLabel()`/`reassignWarning()` ซึ่งเรียก `reassignBranchOf()` ตัวเดียวกับ API (accepted = "ส่งคำขอเปลี่ยนผู้รับผิดชอบ" + เตือนว่าไม่เปลี่ยนทันที) · เคสที่มีคำขอค้างอยู่ = ปิดการเลือกพนักงาน + ซ่อนปุ่มยืนยัน
- **Kanban full-screen read-only** (`40` §7.5): แทนที่หน้ารายการทั้งหน้า (ไม่ใช่ modal) + ปุ่มกลับที่ตำแหน่งเดิม · 1 คอลัมน์ = 1 พนักงาน (ชื่อทีม + badge side + % สำเร็จ + เคสในมือ) · filter ทีม/ชื่อพนักงาน/จังหวัด/สถานะ — **สถานะกรองที่ระดับการ์ด คอลัมน์ว่างยังแสดง** · คลิกการ์ดเปิด Assignment Modal ตัวเดียวกับหน้ารายการ · จอเล็ก stack แนวตั้ง
- **pure module `lib/assignments/assignment-ui.ts` + unit test 18 เคส**: label/สีสถานะ · badge ทีม · `assignedTimeline()` · `assignmentRowActions()` (canAct=false → `[]`) · `kanbanCardMatches()` · `targetFromListItem()`/`targetFromKanbanCard()` · `expiresInText()`
- **ขยาย payload ของ endpoint เดิม (ไม่แตะ contract `45`)**: `assignment.list` ส่ง `teams[]` ที่ผู้ใช้เห็น · `teamAgents`/`teamKanban` ส่ง `teamSide` · การ์ดเคสมี `hasPendingReassignment` · คอลัมน์ Kanban มี `successRate` (จาก `successRate()` ตัวกลาง) + เทสต์ระดับ DB 2 เคสยาม
- **UI Kit**: `<Modal size="xl">` + body เลื่อนได้ (`max-h-[90vh]`, header/footer คงที่) — ได้ประโยชน์กับทุก modal ยาวในระบบ

### การตัดสินใจระหว่างทาง
- **ตัวเลือกทีมมากับ `GET /api/assignments` ไม่ใช่ `GET /api/teams`** — endpoint ทีมต้องมี `view_master_data` ซึ่งผู้จัดการ/หัวหน้าทีมไม่จำเป็นต้องมี (`25` §7.1) ⇒ เพิ่มฟิลด์ `teams[]` (scope-filtered) ในผลลัพธ์เดิมแทนการเพิ่ม endpoint นอก `45` · มีทีมเดียว (หัวหน้า) = ไม่แสดงตัวเลือกทีมเลยตาม §7.1
- **Kanban ไม่มีคอลัมน์ "รอมอบหมาย"** — mockup มี แต่ §7.5 ระบุชัดว่า "แบ่งคอลัมน์ตามพนักงาน (1 คอลัมน์ = 1 คน)" และ endpoint คืนเฉพาะคอลัมน์พนักงาน ⇒ ยึดสเปค (mockup ใช้ได้เฉพาะ UI ไม่ใช่ business logic) · เคสที่ยังไม่มอบหมายดูจากหน้ารายการด้วย filter "พร้อมมอบหมาย"
- **เลือกพนักงานคนเดิมซ้ำไม่ได้** — การ์ดของผู้รับผิดชอบปัจจุบันถูกล็อกพร้อม badge "ผู้รับผิดชอบปัจจุบัน" (สเปคไม่ได้ห้ามไว้ตรง ๆ แต่ไม่มีความหมายเชิงธุรกิจและทำให้เกิด history ขยะ)
- **`hideWorkflowActions` บังคับใช้ทุกจุดที่ 40 เปิด `<CaseDetailModal>`** — กันปุ่ม "รับเคส/ไม่รับ/ขอข้อมูลเพิ่ม" ของไฟล์ 38 โผล่ซ้อนกลาง flow มอบหมาย (สถานะ `approved` ปกติไม่มีปุ่มอยู่แล้ว แต่ล็อกไว้ให้ชัด)
- **Agent Accept UI (§7.4) ไม่ทำในรอบนี้** — ตาม PLAN §2.7 ทำครั้งเดียวที่ 2.10 ฝั่งไฟล์ 41

### จุดที่คนถัดไปควรรู้
- **`lib/assignments/assignment-ui.ts` = ที่เดียวที่ตัดสินปุ่ม/ข้อความของโมดูลนี้** — 2.10/2.11 (ฝั่งพนักงาน) ต้องเรียกซ้ำ ห้ามเขียนเงื่อนไขสถานะใน JSX
- `<CaseDetailModal>` มีทางเสียบครบแล้ว (`extraSection`/`footerActions`/`headerSlot`) — ไฟล์ 41 ที่ต้องใช้ Case Detail 3 จุดควรต่อทางนี้ ไม่ต้อง fork component
- Kanban รีโหลดผ่าน prop `reloadToken` (ไม่ remount) เพื่อไม่ล้าง filter ที่ผู้ใช้ตั้งไว้หลังมอบหมายสำเร็จ
- ยังไม่มีหน้า Settings ของ `assignment_policy_settings` (`40` §6.4) — ถ้าอยากทดสอบเคส "หัวหน้าถูกปิดสิทธิ์" ต้อง UPDATE ตารางตรงบน staging ไปก่อน (งาน Settings รอบถัดไป)

### verify ที่รันจริง
`pnpm typecheck` ✅ · `pnpm test` (81 ไฟล์ / 1,068 เคส) ✅ · `pnpm lint` ✅ · `pnpm build` ✅ (เห็น route `/cases/assign`)

---

## Phase 2.6 — Case Assignment Backend (ไฟล์ 40)

**วันที่**: 2026-08-14 · **commit**: `a79c64c` · **branch**: `auto/phase-2.6`

### สิ่งที่ทำ
- **Schema (sync `02` v4.1 — 57 ตาราง / 60 enum)**: `pending_reassignments` (คำขอเปลี่ยนผู้รับผิดชอบตาม `40` §6.1.1 + **partial unique `uniq_pending_reassignment_active`** = ตัวบังคับจริงของ `REASSIGNMENT_ALREADY_PENDING`) · `reassignment_history` (insert-only, เก็บเฉพาะการเปลี่ยนที่ **สำเร็จ** พร้อม `was_accepted_before_reassign`) · `assignment_policy_settings` (1 record/org — `reassign_timeout_hours` 3 ชม., `supervisor_can_assign_system/inhouse/outsource` default true, `accept_deadline_hours` NULL = ไม่จำกัดตาม §11) · enum ใหม่ `pending_reassignment_status` / `reassignment_resolution` · migration `20260814114904_assignment_reassignment_tables` (ตัดบล็อกพยศของ `migrate dev` ออก + เติม `updated_at DEFAULT NOW()` เอง)
- **Pure logic** (`lib/assignments/assignment.ts`): state machine ของการมอบหมาย (`ready_to_assign`/`assigned`/`accepted` เป็น sub-state ของ `case.status = approved`) · `reassignBranchOf()` = **จุดเดียว**ที่ตัดสินสาขาของ reassign · `reassignOutcome()` บังคับกติกา "สำเร็จแล้วรีเซ็ตเป็น assigned + ล้าง `accepted_at` เสมอ" · `reassignmentExpiresAt()`/`isReassignmentExpired()`/`assertRespondable()`/`assertDeclineReason()`/`assertAcceptable()`
- **`successRate()` = service กลาง** (`40` §6.2) พร้อม `SUCCESS_RATE_SOURCE` — สะสมตลอดการทำงาน, ไม่เคยได้รับมอบหมาย = `null` (ห้ามหารศูนย์ → `N/A`), Report ของ `96` ต้องเรียกตัวนี้ซ้ำ
- **API 8 endpoint ครบ `45` §6.2**: `GET /api/assignments` (filter สถานะทำที่ DB เพื่อให้ `total`/pagination ตรง) · `GET /api/teams/:id/agents` (decision support 3 ค่า) · `GET /api/teams/:id/agents/:agent_id/cases` · `GET /api/teams/:id/kanban` · `POST /api/cases/:id/{assign,reassign,accept}` · `POST /api/cases/:id/reassignment/respond`
- **reassign 2 สาขา (ห้ามสลับ)**: ยังไม่ accepted = เปลี่ยนทันที + ลง history ทันที (`consented` โดยปริยาย) · accepted แล้ว = สร้างคำขอ `waiting_consent` แล้ว **ไม่แตะ assignment เดิม** (เคสยังทำงานต่อได้ตามปกติ)
- **job `reassign_timeout`** (`lib/assignments/timeout-job.ts`): idempotent — claim ด้วย conditional update ก่อนทำงาน, แพ้การแข่งกับคำตอบของพนักงาน = นับเป็น `skipped` ไม่ใช่ error · actor = ระบบ (`actor_id = NULL`) ⇒ `reason` ใส่ job id ตาม `90` §13
- **ยาม settings §6.4**: `canPerformAssignmentAction()` คุมเฉพาะ **หัวหน้าทีม** ตาม Role Group — ผู้จัดการ/Superadmin ไม่ถูกคุม และ **ไม่คุมการมองเห็น** (agents/kanban/list เปิดให้หัวหน้าเสมอ)
- **เติม error code 2 ตัวเข้า `40` §12 + catalog** (Rule 04 — doc + code คอมมิตเดียวกัน): `ASSIGNMENT_NOT_FOUND` (404), `ASSIGNMENT_INVALID_STATUS` (400) · "คนอื่นตอบคำขอแทน" ใช้ `PERMISSION_DENIED` ตาม §12 ตรง ๆ
- **Test**: pure 26 เคส (`assignment.test.ts` / `success-rate.test.ts` / `policy.test.ts`) + DB workflow 20 เคสตาม `40` §20 — รวม **timeout job × respond ที่มาช้า** (DoD), job รันซ้ำผลไม่เปลี่ยน, ตอบหลัง `expires_at` แต่ job ยังไม่ทันรัน, หัวหน้าข้ามทีม = `PERMISSION_DENIED`, Kanban กรองแล้วคอลัมน์ยังอยู่

### การตัดสินใจระหว่างทาง
- **ไม่ลบแถว `pending_reassignments` ตอน resolve** — สเปค §6.1.1 เขียนว่า "ถูกย้ายไปบันทึกใน history ทันทีที่ resolve (ไม่ค้างอยู่ใน pending object)" ตีความเป็น "ไม่เหลือเป็น *คำขอที่รอผล*" ⇒ เปลี่ยน `status` แทนการลบ เพราะ §8 สั่งให้เก็บ log การปฏิเสธไว้ traceability (ถ้าลบแถวจะไม่เหลือ `decline_reason`) · "pending object" ของ API = แถวที่ `status = waiting_consent` เท่านั้น
- **`reassignment_history` เก็บเฉพาะการเปลี่ยนที่สำเร็จ** (`consented`/`timeout_auto`) ตาม §6.1 — การปฏิเสธดูจาก `pending_reassignments.status = declined` + audit log
- **สาขา immediate ก็ลง history** ด้วย `resolution = consented`, `was_accepted_before_reassign = false`, `pending_reassignment_id = NULL` (§8 ระบุว่า "resolution = consented โดยปริยาย เพราะไม่มีใครต้องยินยอม")
- **ตอบคำขอหลัง `expires_at` แต่ job ยังไม่รัน** → ปฏิเสธด้วย `REASSIGNMENT_ALREADY_TIMED_OUT` เหมือนกับกรณีที่ job รันไปแล้ว (ผลลัพธ์สุดท้ายเหมือนกัน ไม่ให้เวลาที่ job มาถึงกลายเป็นตัวแปรของ business rule)
- **`accept` ซ้ำ = `ASSIGNMENT_INVALID_STATUS`** ไม่ใช่ 200 เงียบ ๆ (สถานะเปลี่ยนไปแล้วต้องไม่เขียนทับ `accepted_at` เดิม)
- **endpoint ตั้งค่า `assignment_policy_settings` ยังไม่ทำ** — `45` ไม่มี endpoint นี้ และไฟล์ 13 ไม่มีแท็บนี้ ⇒ ตารางพร้อมใช้ + อ่านค่า default ได้เลย ส่วนหน้าจอ Superadmin เป็นงานของ Settings รอบถัดไป (บันทึกไว้ใน REUSE_INDEX)

### จุดที่คนถัดไปควรรู้
- **โฟลเดอร์ route ของทีมใช้ `[id]` ไม่ใช่ `[team_id]`** — Next.js ห้ามตั้งชื่อ dynamic segment ต่างกันในระดับเดียวกัน (มี `/api/teams/[id]` อยู่แล้ว) · URL ที่ได้ตรงกับ contract ทุกประการ
- **FE 2.7 ห้าม if สถานะเอง** — ปุ่มทั้งหมดต้องมาจาก `assignmentStateOf()` + `reassignBranchOf()` + `canPerformAssignmentAction()` (หัวหน้าที่ settings ปิด = **ซ่อนปุ่ม** ไม่ใช่ disable)
- **ตัว scheduler ของ job ยังไม่มี** — `resolveExpiredReassignments()` เป็น handler ล้วน ๆ ต่อเข้า Vercel Cron/ตาราง `jobs` ใน Phase 5.3 (`91` §6.1 · `job_type = reassign_timeout`)
- **ไฟล์ 41 (Field Tracker)** ต้องยึด hard gate ของ §11: เคสที่ยังไม่ `accepted` ห้ามถูกดึงเข้ารอบจัดเส้นทาง — ใช้ `assignmentStateOf()` ตัวเดียวกัน อย่าอ่าน `case_assignments.status` ดิบ
- Kanban: ตัวเลข workload บนหัวคอลัมน์นับเคสที่ถืออยู่ **จริง** ไม่ใช่จำนวนการ์ดหลังกรอง (มีเทสต์ยาม)

### verify ที่รันจริง
`pnpm typecheck` ✅ · `pnpm test` (80 ไฟล์ / 1,048 เคส ก่อนเพิ่มเทสต์ล็อตนี้ → รวมของ 2.6 อีก 46 เคส) ✅ · `pnpm lint` ✅ · `pnpm build` ✅ (เห็น route ใหม่ครบ 8 ตัว)

---

## Phase 2.5 — Case Submission FE ชุด 2 (เอกสาร + ทีมที่เสนอ + review modal + import)

**วันที่**: 2026-08-14 · **commit**: `07100c8` + `267b3f3` · **branch**: `auto/phase-2.5`

### สิ่งที่ทำ
- **ฟอร์มรับเคสครบลำดับ section ตาม `38` §7.3** — เพิ่มต่อจาก 2.4: **ผู้ติดต่ออื่น** (`<CaseContactsFields>` — dynamic list, ปุ่มลบต่อแถว, เบอร์กรอง non-digit 10 หลัก, แถวว่างทั้งแถวถูกตัดทิ้ง แถวกรอกไม่ครบ = error รายช่อง) → **ข้อมูลทรัพย์** → **เอกสารแนบ + รูปสินค้า** (`<CaseAttachmentsFields>` — 3 slot พร้อมป้าย "อัปโหลดแล้ว ✓ (n ไฟล์)"/"ยังไม่อัปโหลด" ต่อ slot · dropzone drag-drop + thumbnail grid + ปุ่ม ✕ ต่อรูป · เพดาน 8 รูปผ่าน `assertProductPhotoCapacity()` ตัวเดียวกับ API) → **ทีมที่เสนอ (ท้ายสุด)**
- **อัปโหลดไฟล์จริง** — `lib/cases/document-upload.ts` (pure: ชนิด/ขนาด/ชื่อไฟล์/`storagePath()`/`sha256Hex()`) + `lib/cases/upload-client.ts` (browser: ขึ้น Supabase Storage bucket `case-documents` → `POST /api/cases/:id/documents` ด้วย `fileUrl` = path + `fileHash` SHA-256) · **อัปโหลดหลังบันทึกเคสสำเร็จ** เพราะ endpoint ต้องมี `case_id` — ไฟล์ที่ล้มเหลวรายงานเป็น toast เตือน ไม่ทำให้เคสหาย
- **`<TeamSuggestionPanel>` (`38` §7.4)** — ทีมที่เสนอ 1 ทีมพร้อมป้าย "ระบบเสนอ" อัปเดต **real-time** ทันทีที่จังหวัดของที่อยู่ปัจจุบันเปลี่ยน (จับคู่ฝั่ง client ด้วย `matchTeamsByProvince()` pure ตัวเดียวกับ API — ไม่ยิง API ใหม่) · รายการทีมที่จังหวัดตรงแสดง **inline ทันที ไม่ใช่ dropdown** + toggle "ดูทีมอื่นทั้งหมด" (ซ่อน default) · **กล่องค่าใช้จ่ายทีมทุกใบในรายการ** จาก `describeTeamCost()` — น้ำมัน (PER_KM แสดงอัตรา+เพดาน / DAILY_FLAT แสดงเหมาจ่าย) · เบี้ยเลี้ยง · ค่าที่พัก · คอมมิชชั่น (สำเร็จ) · เบี้ยเสี่ยง (ไม่สำเร็จ) — **ไม่มีการคำนวณ/สรุปกำไร-ขาดทุนใดๆ** (มีเทสต์ยาม)
- **`<CaseDetailModal>` — shared component (`38` §7.5)** modal เดียวใช้ทั้งดูและพิจารณา 4 โหมดตาม `caseDetailMode()`: `pending_review` (3 ปุ่ม: ไม่รับเคส/ขอข้อมูลเพิ่ม/รับเคส & ยืนยันทีม) · `closed_fail` (ขอรีไซเกิล) · `pending_recycle_review` (ไม่อนุมัติ/อนุมัติรีไซเกิล) · อื่น ๆ อ่านอย่างเดียว · เนื้อหาครบ §7.5: สรุปเคส + `tracking_round` ทุกสถานะ, จังหวัด/มูลหนี้, ช่องทางติดต่อ 4 ทาง (มือถือเป็นลิงก์ `tel:`), ผู้ติดต่ออื่น, **เอกสารแนบเปิดดูได้จริง** ผ่าน `<FileViewerModal>` (PDF ใน iframe / รูป lightbox / signed URL ต่อครั้ง), thumbnail grid รูปสินค้า, **กล่องประมาณการรายได้ติดกับกล่องทีม**, ช่องเหตุผล, **ประวัติรีไซเกิล** (แสดงเมื่อมีประวัติ ไม่ว่าสถานะปัจจุบันจะเป็นอะไร)
- **เปลี่ยนทีมพร้อมเหตุผล** — กด "เลือกทีมนี้" (active เฉพาะคนที่กด `accept` ได้จริง) → `<ReasonConfirmModal>` → ส่ง `teamId` + `teamChangeReason` ไปกับ action `accept` (backend 2.3 บังคับเหตุผลอยู่แล้วที่ `assertStatusChange()`)
- **`<CaseImportWizard>`** — เลือกไฟล์ → mapping คอลัมน์จาก `IMPORT_COLUMNS` (auto-map + แก้ทับได้ + ยามฟิลด์บังคับ/จับคู่ซ้ำ/คอลัมน์ที่จะถูกข้าม) → preview ด้วย `dryRun: true` → ยืนยัน + **ผลรายแถว** (แถว/เลขที่สัญญา/ผล/รายละเอียด error รายช่อง)
- **`GET /api/cases/team-options`** (`45` §6.1 v1.4 — endpoint ที่ 41) + `lib/cases/team-options-queries.ts`
- **ปุ่ม workflow บนแถวรายการ** — "ส่งตรวจสอบ" (draft) / "กลับไปแก้ไขเป็นร่าง" (need_info) จาก `caseRowActions()` · ปุ่ม "พิจารณา"/"ดูรายละเอียด" เปิด detail modal · ปุ่ม Import เปิด wizard
- **เทสต์ใหม่ 4 ไฟล์** (`team-cost` · `case-actions` · `document-upload` · `import-wizard`) + ขยาย `case-form.test.ts` (ผู้ติดต่ออื่น 5 เคส) — รวม `pnpm test` 999 เคสเขียว

### การตัดสินใจระหว่างทาง
- **เพิ่ม endpoint `GET /api/cases/team-options` (แก้ `45` v1.4 ในคอมมิตเดียวกัน)** — §7.4 บังคับให้ฟอร์มแสดงทีมที่เสนอแบบ real-time ตั้งแต่ก่อนบันทึกเคส (ยังไม่มี `:id` ⇒ ใช้ `team-suggestion` ไม่ได้) และกล่องค่าใช้จ่ายต้องอ่านค่าแผนค่าตอบแทน ซึ่ง `GET /api/teams` + `GET /api/compensation-plans` ต้องใช้ `view_master_data`/`manage_compensation_plans` ที่ **เจ้าหน้าที่อนุมัติเคสไม่มี** (`25` §7.1) · endpoint ใหม่อ่านด้วย `CASE_READ_CAPABILITIES` · read-only ไม่มี business logic ใหม่
- **กล่องทีมบนฟอร์ม = อ่านอย่างเดียว** — schema ของ 2.2/2.3 ไม่มีช่องเก็บทีมตอน draft (`suggested_team_id` เขียนตอน `review`, `assigned_team_id` ตอน `accept`) และ §7.5 ระบุว่าปุ่มเปลี่ยนทีม "active เฉพาะตอน pending_review" ⇒ การเลือก/เปลี่ยนทีมจริงอยู่ใน Review Modal เท่านั้น ฟอร์มแสดงเป็นข้อมูลประกอบการกรอก
- **`review`/`return_to_draft` อยู่บนแถวรายการ ไม่ใช่บน modal** — §7.5 ล็อกให้ modal ของ draft/need_info เป็นอ่านอย่างเดียว แต่ §8 ยังต้องมีปุ่ม `review_case` ⇒ วางไว้ที่ปุ่มแถว (mockup ไม่มีปุ่มนี้เพราะ mockup ครอบเฉพาะฝั่งพิจารณา)
- **Import รอบนี้รองรับเฉพาะ CSV** — `xlsx` บน npm ค้างที่ 0.18.5 (มี CVE) ส่วนเวอร์ชันที่แก้แล้วอยู่บน `cdn.sheetjs.com` เท่านั้น ⇒ ไม่ติดตั้ง dependency เองใน session อัตโนมัติ · จุดเสียบอยู่ที่ `readRowsFromFile()` จุดเดียว และหน้าจอบอกผู้ใช้ให้ save เป็น CSV ก่อน
- **ชนิด/ขนาดไฟล์ไม่ออก error code ใหม่** — `24` ไม่มีหมวดไฟล์ และ payload ที่ส่งเข้า API เป็น metadata (ไม่ใช่ไฟล์) ⇒ เป็น UX guard ฝั่งฟอร์ม (ข้อความไทยธรรมดา) ส่วนกติกาธุรกิจจริง (8 รูป) ยังใช้ `CASE_PRODUCT_PHOTO_LIMIT` ตามเดิม

### จุดที่คนถัดไปควรรู้
- ⚠️ **ต้องสร้าง bucket `case-documents` ใน Supabase 1 ครั้งต่อ environment** (แนะนำ private + policy ให้ผู้ใช้ที่ล็อกอินอัปโหลด/อ่านได้) ไม่งั้นการแนบไฟล์จะล้มด้วยข้อความจาก Storage — สิทธิ์ระดับธุรกิจยังตรวจที่ API layer ตามเดิม (DEC-002)
- **ยังไม่มี endpoint ลบเอกสารของเคส** ใน `45` ⇒ ปุ่ม ✕ ใช้ได้เฉพาะไฟล์ที่ยังไม่อัปโหลด (staged) — ถ้าธุรกิจต้องการลบไฟล์ที่แนบแล้ว ต้องเพิ่ม endpoint + แก้ `38`/`45` ก่อน
- `<CaseDetailModal>` ออกแบบให้เรียกด้วย `caseId` อย่างเดียว — **Phase 2.7 (Assignment Modal) และ 2.10 (Field Detail) ใช้ตัวนี้ซ้ำ** อย่าสร้าง modal เคสใหม่
- ยังไม่มี event bus จริง — การเปลี่ยนสถานะจาก modal บันทึก event ลง audit ตามที่ 2.3 ทำไว้

---

## Phase 2.4 — Case Submission FE ชุด 1 (list + form + address component)

**วันที่**: 2026-08-14 · **commit**: `9c05e9e` · **branch**: `auto/phase-2.4`

### สิ่งที่ทำ
- **Master data ที่อยู่ (`38` §6.1.2)** — `lib/address/thai-address.ts` (pure): **77 จังหวัดครบ** จัดกลุ่ม 6 ภาค (ทำ `<optgroup>`), `getDistricts()`/`getSubDistricts()` cascading, `isValidPostalCode()`, `lookupPostalCode()` (**async ตั้งแต่วันแรก** เพื่อสลับไปเรียก Thailand Post API จริงได้โดยไม่แก้จุดเรียกใช้) · `lib/address/address-value.ts` (pure): `AddressValue`/`EMPTY_ADDRESS`/`addressFromDto()`/`isAddressEmpty()`
- **`<AddressFields>` (shared — ไฟล์ 41 ใช้ซ้ำ)** — `components/address/address-fields.tsx`: ลำดับช่องตาม §6.1.2 (บ้านเลขที่ → รหัสไปรษณีย์ auto-complete → จังหวัด → อำเภอ → ตำบล), กรอกครบ 5 หลัก/blur → ค้นแล้วเติม 3 ระดับ, เปลี่ยนจังหวัดล้างอำเภอ/ตำบลเสมอ, ไฮไลต์ + ป้าย "ใช้สำหรับ routing ทีม" บนที่อยู่ปัจจุบัน · **ไม่มี `useEffect`** ในไฟล์เลย (ทุกอย่างเป็น event handler)
- **หน้า `/cases/submit`** — `components/cases/cases-manager.tsx`: KPI 4 ใบ (ร่าง/รอพิจารณา/ขอข้อมูลเพิ่ม/รับเคสแล้ว — นับด้วย `case.list` limit=1 อ่าน `total` ไม่เพิ่ม endpoint), filter ครบ §7.2 (สถานะ · ช่องทาง · ไฟแนนซ์ · จังหวัด · ค้นหา) + pagination, ตารางบน `md` ขึ้นไป และ **card list บนจอเล็ก** (§7.2 Responsive), ปุ่มแก้ไขเช็ค `isCaseEditable()` + any-of `CASE_EDIT_CAPABILITIES`
- **ฟอร์มรับเคส/แก้ไขเคส** — `components/cases/case-form-modal.tsx` + ตรรกะ pure ที่ `lib/cases/case-form.ts`: 4 section ตาม mockup (ข้อมูลสัญญา → ลูกหนี้ → ที่อยู่ 3 ชุด → ทรัพย์), **สลับช่องเอกสารยืนยันตัวตนตามสัญชาติ** (ไทย = เลขบัตร 13 หลัก filter ตัวเลข / อื่น = passport free text + ช่อง "ระบุสัญชาติ" เมื่อ OTHER), เบอร์มือถือ/ที่ทำงาน filter ตัวเลข, เงินกรอกเป็นบาท → สตางค์ด้วย `parseBahtInput()`, `case_ref` ซ้ำ = **hard block พร้อมลิงก์เคสเดิม** (§7.3/§11)
- **ป้ายสถานะ/ช่องทางของเคส** — `lib/cases/status-display.ts` (pure): `CASE_STATUS_LABEL` ครบ 9 สถานะ + แมปเข้า 10 กลุ่มสีของ `04` §8.1 (ส่งเข้า `<StatusBadge group>` ไม่ใส่คลาสสีเอง) + ป้ายช่องทาง + ป้ายประเภททรัพย์
- **เมนู** — เปิด `cases.submit` (`available: true`) และให้ `/cases` เด้งไปแท็บย่อยแรกที่ผู้ใช้เข้าถึงได้ (role ที่ยังไม่มีหน้าจริงยังเห็น placeholder เดิม)
- **`callApi()` คืน `code`/`fields`/`payload` ของ error แล้ว** — จำเป็นสำหรับ inline error รายช่อง และลิงก์ "เปิดเคสเดิม" ของ `CASE_REF_DUPLICATE` (โครง `{title, message}` เดิมยังอยู่ หน้าจอ Phase 1 ไม่ต้องแก้)
- **เทสต์ใหม่ 32 เคส (3 ไฟล์ pure)**: `thai-address.test.ts` (77 จังหวัดไม่ซ้ำ · จังหวัดของทีมใน `09` §8 เป็นสับเซตจริง · ตารางไปรษณีย์ชี้ไปพื้นที่ที่มีอยู่) · `status-display.test.ts` (label ครบทุกสถานะของ state machine · ทุกกลุ่มสีมีจริงใน `04` §8.1) · `case-form.test.ts` (บาท→สตางค์เป็นจำนวนเต็ม · payload ผ่าน schema เดียวกับ backend · สลับสัญชาติล้างช่องของอีกแบบ · ฟอร์มเปล่าขาดแค่ `caseRef`/`financeCompanyId` ตาม §11 · อ่าน `existingCase` ของ error ซ้ำ)

### การตัดสินใจระหว่างทาง
- **อำเภอ/ตำบลเป็นช่องพิมพ์ได้ + `<datalist>`** ไม่ใช่ `<select>` ตายตัว — master data จริงยังไม่มี (Open Item `38` §22 ข้อ 5 มีแค่ 4 จังหวัดตัวอย่างจาก mockup) และ §6.1.2 เขียนไว้เองว่า "ถ้าไม่พบในระบบ ให้ผู้ใช้กรอกต่อแบบ manual ทีละขั้น" ⇒ จังหวัดที่มีข้อมูลได้ตัวช่วยเลือก จังหวัดที่ยังไม่มีก็กรอกเองได้ ไม่ block งานจริง · เติม master data ภายหลัง = แก้ `DISTRICT_DATA` ที่เดียว หน้าจอไม่ต้องแก้
- **ไม่เพิ่ม endpoint ค้นรหัสไปรษณีย์** — `45` ไม่มี endpoint นี้ และการเติม endpoint ต้องแก้สเปคคู่กัน ⇒ `lookupPostalCode()` เป็น async function ฝั่ง client ที่สลับไส้ในเป็น fetch ได้ทันทีเมื่อ PO เลือก provider (Open Item `38` §22 ข้อ 4)
- **จังหวัด 77 ตัวแยกจาก `PROVINCE_DATA` ของทีม (`lib/teams/provinces.ts`)** — คนละความหมาย (พื้นที่ให้บริการ vs ทะเบียนจังหวัดทั้งประเทศ) และ §6.1.2 ระบุชัดว่า dropdown ที่อยู่ **ไม่จำกัดเฉพาะจังหวัดที่มีทีม** · มีเทสต์ยามว่าจังหวัดของทีมทุกตัวต้องอยู่ในทะเบียน 77 จังหวัด
- **สีสถานะเคสอยู่ในโมดูล ไม่แก้ mapper กลาง** — `lib/ui/status-badge.ts` ยังไม่รู้จัก `pending_review`/`need_info`/`closed_*`/`pending_recycle_review` ⇒ ส่ง `group` เข้า `<StatusBadge>` ตามที่ mapper อนุญาตไว้เอง (คงสีตาม mockup: รอพิจารณา=เหลือง, ขอข้อมูลเพิ่ม=ม่วง) โดยไม่ไปตีความสถานะของโมดูลอื่นแทนเจ้าของ
- **ตรรกะฟอร์มแยกเป็น pure module** (`lib/cases/case-form.ts`) — repo ยังไม่มี jsdom/testing-library และการเพิ่ม dependency ทดสอบ UI ไม่อยู่ในสเปคของ task นี้ ⇒ ย้ายส่วนที่ต้องพิสูจน์ (payload/เงิน/สัญชาติ/pre-fill/duplicate) ออกมาเทสต์จริงแทนการเทสต์ผ่าน DOM
- **ปุ่ม Import แสดงแบบ disabled** พร้อม title บอกว่าเป็น Phase 2.5 — §7.1 กำหนดให้มีปุ่มนี้บนหน้า List แต่ wizard อยู่ชุดถัดไป (ไม่ซ่อนเพื่อไม่ให้ดูเหมือนสเปคหาย ไม่เปิดใช้เพื่อไม่ให้กดแล้วตาย)

### จุดที่คนถัดไปควรรู้
- **Phase 2.5 เสียบต่อที่ไหน**: `CasesManager` — ปุ่ม "ดูรายละเอียด" (ตอนนี้ disabled) → Case Detail/Review Modal · ปุ่ม Import → wizard · `CaseFormModal` — section ผู้ติดต่ออื่น/เอกสารแนบ/รูปสินค้า/ทีมที่เสนอ ต่อท้ายตามลำดับของ §7.3 (ในไฟล์มี comment ระบุจุดไว้แล้ว)
- **DoD ของ 2.4 ("สร้างเคส manual ครบ flow บน staging: ข้อมูล→เอกสาร→ส่งตรวจสอบ") ปิดได้เท่าที่ขอบเขต FE ชุด 1 ครอบ** — ส่วน "ข้อมูล" ครบแล้ว (สร้าง/แก้ไขเคสร่างได้จริงจากหน้าจอ) ส่วน "เอกสาร→ส่งตรวจสอบ" ต้องรอ UI อัปโหลดเอกสาร + ปุ่ม `review` ของ 2.5 เพราะแผน §2.5 กำหนดให้ document slot/photo อยู่ชุดนั้น
- `<AddressFields>` เป็น **controlled component ล้วน** (ไม่เก็บ state ของค่าที่อยู่เอง มีแค่สถานะการค้นรหัสไปรษณีย์) — ไฟล์ 41 นำไปใช้ได้ตรง ๆ โดยส่ง `value`/`onChange` ของตัวเอง
- ฟอร์มใช้ `key` จากตัวนับใน `CasesManager` เพื่อล้างค่าทุกครั้งที่เปิด — เปิด modal ซ้ำโดยไม่เปลี่ยน `key` จะเห็นค่าที่พิมพ์ค้างไว้รอบก่อน (กับดักเดิมของ modal ที่ mount ค้าง)

---

## Phase 2.3 — Case Submission BE ชุด 2 (state machine + routing + recycle + import + snapshot)

**วันที่**: 2026-08-14 · **commit**: `03b50e6` · **branch**: `auto/phase-2.3`

### สิ่งที่ทำ
- **State machine (`38` §9/§10)** — `lib/cases/state-machine.ts` (pure): 8 action (`review`/`accept`/`reject`/`request_more_info`/`return_to_draft` + recycle 3 ตัว) พร้อมตารางกฎ (from/to/reason/readiness), `allowedActionsFrom()` สำหรับ UI, `CASE_ACTION_CAPABILITIES` ต่อ action (`38` §13) และ `caseEventsFor()` ตาม `38` §16/§17.2
- **Routing (`38` §6.4/§7.4/§12)** — `lib/cases/team-suggestion.ts` (pure): จับคู่จาก `addr_province` ตัวเดียว, กรองทีมที่ไม่ `active`, คืนทีมที่ตรงทั้งหมด (UI มี toggle ดูทีมอื่น), ไม่ auto-assign · `GET /api/cases/:id/team-suggestion`
- **Projected revenue (`38` §6.5)** — `lib/cases/projected-revenue.ts` (pure): FLAT/SUCCESS_FEE/HYBRID แบบ best-case 100% (ไม่สนใจ `charge_on_fail`) + `calculation_source` อ้าง template/version · คำนวณใหม่ทุกครั้งที่ `review`/`accept`/`approve_recycle`
- **Service fee snapshot ตอน `approved` (`10` §9.2)** — เขียน 6 คอลัมน์ (`service_fee_template_id` + `model`/`base_satang`/`rate_pct`/`basis`/`charge_on_fail` snapshot) ที่ตัวเคส และ snapshot ใหม่ทุกครั้งที่อนุมัติรีไซเกิล (A3 `charge_per_tracking_round` — แต่ละรอบอิสระ)
- **Recycle (`38` §6.6)** — `create_recycle_request` (เฉพาะ `closed_fail`) → `pending_recycle_review` → `approve_recycle` (`tracking_round` +1, ล้าง `outcome`/`closed_at`, ข้าม `pending_review` ตรงเข้า `approved`) / `reject_recycle` (กลับ `closed_fail` รอบไม่ขยับ) + เขียน `recycle_requests` (`previous_round`/`new_round`) ใน transaction เดียวกับ audit
- **Import (`38` §8/§12)** — `lib/cases/import.ts` (pure): CSV parser ในตัว (BOM/CRLF/quote), `IMPORT_COLUMNS` 29 คอลัมน์รองรับหัวไทย/อังกฤษ/snake_case, แปลงบาท→สตางค์, สัญชาติ/ประเภทสินค้าเป็นคำไทยได้, validate ต่อแถวด้วย `caseCreateSchema` เดิม · `POST /api/cases/import` (รองรับ `rows` หรือ `csv`, มี `dryRun` สำหรับ preview) — **แถวผิดตกเฉพาะแถวนั้น**
- Endpoint ใหม่ 3 ตัวครบ `45` §6.1 (8/8): `PATCH /api/cases/:id/status`, `GET /api/cases/:id/team-suggestion`, `POST /api/cases/import`
- เทสต์: pure 4 ไฟล์ (state machine / team suggestion / projected revenue / import) + **เทสต์ระดับ DB จริง 11 เคส** (`case-workflow.db.test.ts`) ครอบ DoD: snapshot ไม่เปลี่ยนเมื่อบริษัทย้ายไปเทมเพลตใหม่, รีไซเกิล 3 รอบ → `tracking_round` = 4 + `recycle_history` 3 รายการ, gate เอกสาร, scope ข้ามบริษัท 404, สิทธิ์ accept 403, import สร้าง draft/ซ้ำในไฟล์/dryRun

### การตัดสินใจระหว่างทาง
- **recycle 3 action เดินผ่าน `PATCH /:id/status`** — `38` §17.1 และ `45` §6.1 ไม่มี endpoint แยกสำหรับ recycle แต่ทั้ง 3 action คือการเปลี่ยนสถานะตาม §10 จึงใช้ endpoint เดิมตาม contract (ไม่ต้องแก้ `45`)
- **เพิ่ม 2 error code เข้า `38` §12 (v3)**: `CASE_INVALID_STATUS_TRANSITION` (action ไม่ตรงตาราง §10) และ `CASE_STATUS_REASON_REQUIRED` (reject/need_info/เปลี่ยนทีมโดยไม่กรอกเหตุผล — §13 + body ของ `PATCH /:id/status` บังคับไว้แต่ไม่มี code) · เติมลง `lib/api/error-catalog.ts` ในคอมมิตเดียวกันตาม Rule 04
- **`return_to_draft`**: §10 ระบุ `need_info → draft` แต่ §8 ไม่ได้ตั้งชื่อปุ่มไว้ — ตั้งชื่อ action ตามความหมายของ transition ไม่สร้าง state ใหม่
- **audit `reason` ของ `accept`**: `90` §13 บังคับ reason เมื่อแตะฟิลด์ snapshot ค่าบริการ แต่ `38` ไม่บังคับให้ผู้พิจารณากรอกตอนรับเคส ⇒ เติมเหตุผลเชิงระบบที่ระบุ template/version ที่ใช้ (ยัง trace ได้ว่าใช้เงื่อนไขไหน) เมื่อผู้ใช้ไม่ได้กรอกเอง
- **`approve_recycle` ล้าง `outcome`/`closed_at`** เพราะเคสกลับเข้า pipeline รอบใหม่ (ถ้าค้างไว้ รายงานที่กรองด้วย outcome จะนับเคสที่กำลังทำงานอยู่เป็นเคสปิด) — ประวัติผลรอบก่อนอยู่ที่ `recycle_requests` + audit · **ทีมที่ดูแลคงไว้ตามเดิม** (มอบหมายพนักงานรอบใหม่เป็นงานของไฟล์ 40)
- **Import ไม่เพิ่ม dependency**: CSV แยกเองที่ backend · Excel ให้ wizard (2.5) แปลงด้วย SheetJS ฝั่ง client แล้วส่ง `rows` มา (ตรงกับ `38` §7.1 ที่ให้ผู้ใช้ทำ mapping + preview บนหน้าจอก่อนยืนยัน)
- **ประมาณการรายได้ ≠ Revenue จริง** — `lib/cases/projected-revenue.ts` แยกจากสูตร `22` §6.5–6.7 ของ Phase 3.1 อย่างชัดเจน (มีคำเตือนในหัวไฟล์ + REUSE_INDEX)

### จุดที่คนถัดไปควรรู้
- ยังไม่มี **event bus** จริงในระบบ — `caseEventsFor()` คืนรายชื่อ event ที่ต้องยิง และชั้น service บันทึกลง `after.events` ของ audit ไว้ก่อน · Phase 2.6 (consumer ฝั่ง 40) ต่อของจริงแล้วให้ย้ายมาใช้จุดนี้ ไม่ต้องเดาย้อนหลัง
- `PATCH /:id/status` ตรวจ capability **2 ชั้น**: route ตรวจขั้นต่ำ (ใครแตะ workflow เคสได้) → service ตรวจต่อ action ตาม `38` §13 — เพิ่ม action ใหม่ต้องเติมใน `CASE_ACTION_CAPABILITIES` ด้วย
- FE 2.4/2.5 ต้องอ่าน `allowedActions` จาก `CaseDetailDto` แทนการเขียนเงื่อนไขสถานะเอง และเรียก `IMPORT_COLUMNS` ทำหน้าจอ mapping
- เทสต์ DB ของ task นี้เรียก service จริง ⇒ ต้องมี `TEST_DATABASE_URL` + `pnpm db:deploy:test` (ข้ามอัตโนมัติถ้าไม่มี) · audit ที่มันเขียนลบไม่ได้ตาม `02` §13 (ค้างใน test DB โดยตั้งใจ)

---

## Phase 2.2 — Case Submission BE ชุด 1 (schema + CRUD + เอกสาร)

**วันที่**: 2026-08-14 · **commit**: `d5accc2` · **branch**: `auto/phase-2.2`

### สิ่งที่ทำ

- **Schema/migration** (`20260814090450_case_submission_fields` + `20260814092000_case_ref_unique_not_partial`) — เติมสิ่งที่ `02` §6 Group C ขาดเทียบกับไฟล์ 38 §6:
  `cases.case_ref_normalized` + unique index `uniq_cases_company_case_ref(org, company, case_ref_normalized)` · enum ใหม่ `debtor_nationality`/`asset_kind` + คอลัมน์สัญชาติ/passport/ประเภททรัพย์ · ที่อยู่ครบ 3 ชุด (`work_addr_*`, `id_card_addr_*`) · `projected_revenue_satang`/`projected_revenue_source` · **ปลด NOT NULL** ของ `debtor_name`/`asset_description` ตาม §11 · ตารางใหม่ `case_edit_history` (append-only) · `recycle_requests.previous_round`/`new_round`
- **Pure module** — `lib/cases/case-ref.ts` (`normalizeCaseRef` = uppercase+trim เท่านั้น) · `lib/cases/case.ts` (สัญชาติ→เอกสารยืนยันตัวตน, เบอร์โทร 10/9-10 หลัก, เลขบัตร 13 หลัก, slot เอกสาร + เพดานรูป 8 รูป, `missingRequiredFields`/`caseReadiness`, `splitAssetIdentifier` IMEI 15 หลัก vs serial, `assertCaseEditable`) · `lib/cases/errors.ts` (9 code) · `lib/cases/schemas.ts` (Zod ใช้ร่วม FE/BE) · `lib/cases/permissions.ts`
- **ชั้นข้อมูล** `lib/cases/queries.ts` — `listCases`/`getCase`/`createCase`/`updateCase`/`addCaseDocument` + `caseScopeWhere()` (scope ระดับแถว 4 แบบ) · mutation ทุกตัวอยู่ใน `$transaction` เดียวกับ `emitAudit()`
- **API 5 endpoint** ผ่าน `withEndpoint()` ทั้งหมด: `GET/POST /api/cases` · `GET/PATCH /api/cases/:id` · `POST /api/cases/:id/documents`
- **เทสต์ 51 เคส (4 ไฟล์)** — pure 3 ไฟล์ + **เทสต์ระดับ DB จริง** `case-duplicate.db.test.ts`: 3 ช่องทางยิงพร้อมกัน (manual/import/api) ด้วยเลขที่ต่างกันแค่ตัวพิมพ์/ช่องว่าง → สำเร็จ 1 ราย, เลขที่มี dash/underscore ต่างกันไม่ถือว่าซ้ำ, เลขเดียวกันคนละบริษัทได้, เคสจาก API ข้อมูลไม่ครบสร้าง draft ได้

### การตัดสินใจระหว่างทาง (ไม่มีข้อไหนขัดสเปค — บันทึกไว้ให้ตรวจย้อนได้)

1. **`02` §6 Group C ไม่ครบเทียบกับไฟล์ 38 §6** (เขียนไว้ก่อนไฟล์ 38 รอบ reformat) — เติมตาม PLAN §2.2 ที่ระบุ migration ชุดนี้ไว้แล้ว แล้ว sync `02` เป็น **v4.0** พร้อม changelog เต็ม ไม่มีการเปลี่ยน business logic
2. **`recycle_history` ไม่แยกตารางใหม่** — `recycle_requests` ของ `02` เก็บ `request_note`/`decision_note`/`decided_by/at` ครบแล้ว ขาดแค่เลขรอบ ⇒ เติม `previous_round`/`new_round` แทนการสร้างตารางซ้ำซ้อน (`38` §6.4 `recycle_history` = แถวที่ `status = approved`)
3. **`PATCH /api/cases/:id` เป็น endpoint ใหม่ใน `45` v1.3** — `38` §8/§12 นิยาม `edit_case` + `CASE_LOCKED_AFTER_APPROVAL` + `edit_history` ไว้ แต่ §17.1 ไม่เคยประกาศ endpoint ⇒ เติมเข้า `45` §6.1 พร้อมโค้ด (contract รวมเป็น **40 endpoints**)
4. **error code ใหม่ 2 ตัว** `CASE_NOT_FOUND` (404) / `CASE_PRODUCT_PHOTO_LIMIT` (400) เติมเข้า `38` §12 + catalog ในคอมมิตเดียวกันตาม Rule 04
5. **สิทธิ์อ่านเคสเป็น any-of** — `02` §12 ไม่มี capability "ดูเคส" แยก ⇒ เพิ่ม `requireAnyPermission()` + `withEndpoint({resource: [...]})` แล้วให้อ่านเคสได้เมื่อมี capability ตัวใดตัวหนึ่งใน `record_admin_data`/`approve_case`/`assign_case`/`view_master_data`/`view_own_company_data` (ตรงกับผู้ที่เห็นเมนู `cases.submit` ใน `06` §7.1.1) · **ไม่แตะ matrix ที่ seed ไว้**
6. **unique index ไม่ partial** — `cases` มี `UNIQUE(org, company, case_ref, tracking_round)` เดิมที่ไม่ partial อยู่แล้ว ⇒ ทำ index ใหม่ให้ความหมายตรงกัน (เคสที่ soft delete ยังจองเลขไว้) แทนที่จะสร้างพฤติกรรม "ลบแล้วใช้เลขซ้ำได้" ที่สเปคไม่ได้ระบุ
7. **`case_edit_history` เป็น append-only ที่ชั้น service ไม่ใส่ trigger DB** — ตารางนี้เป็นปลาย `ON DELETE CASCADE` ของ `cases` การใส่ trigger ห้าม DELETE จะไปบล็อก cascade ด้วย (บันทึกเหตุผลไว้ใน `02` §13)

### จุดที่คนถัดไปควรรู้

- **Phase 2.3** ต่อยอดตรง: `caseReadiness()` คือ gate ก่อน `pending_review` (ยังไม่มีใครเรียก) · คอลัมน์ `projected_revenue_*` + `previous_round`/`new_round` มีแล้วรอ logic · `case_edit_history` ถูกเขียนเฉพาะตอน `PATCH /:id`
- **ยังไม่มีในรอบนี้** (อยู่ใน 2.3/2.5 ตามแผน): `POST /api/cases/import`, `PATCH /:id/status`, `GET /:id/team-suggestion`, recycle flow, การลบเอกสาร (contract ไม่มี endpoint ลบ) และการอัปโหลดไฟล์จริงขึ้น Storage (endpoint รับ metadata + `file_hash` ที่ FE อัปโหลดเสร็จแล้ว)
- `source_channel` มาจาก payload — API ingestion ยังใช้ session ของผู้เรียกเป็น `created_by` (service account ตาม `38` §6.4 เป็นงานตอนต่อ API ingestion จริง)
- ห้ามลบแถว `users`/`organizations` ใน test DB (FK จาก `audit_logs` → trigger immutable) — ดูกับดักใน REUSE_INDEX

---

## Phase 2.1 — API Contract Infra (ไฟล์ 45): 39 endpoints + event registry + envelope + error catalog

**วันที่**: 2026-08-14 · **commit**: `4dba3a3` · **branch**: `auto/phase-2.1`

### สิ่งที่ทำ

- **Route contract** `lib/api/contract.ts` — `API_CONTRACT` ครบทุก endpoint ของ `45` §6.1–6.5 พร้อม `method/path/module/source/summary/query` · `apiPath(id, params, query)` สร้าง URL แบบ typed (ชื่อ path param มาจาก template literal type — พิมพ์ผิดไม่ผ่าน `tsc`) และ **ปฏิเสธ query key ที่สเปคไม่ได้ประกาศ**
- **Event registry** `lib/api/event-names.ts` (34 ชื่อ, literal บรรทัดละตัว) + `lib/api/events.ts` (metadata + `isDomainEvent()`/`assertDomainEvent()` + `EVENT_NAME_DIFFS`)
- **กฎ ESLint `assetrecovery/no-unregistered-event`** (`tools/eslint-rules/no-unregistered-event.mjs` + `.d.mts`) — จับชื่อ event นอกทะเบียนใน `emitEvent`/`publishEvent`/`recordEvent`/`assertDomainEvent` และ property `event`/`eventName`/`event_name` · เสียบใน `eslint.config.mjs` เป็น plugin `assetrecovery` ระดับ error
- **Response envelope กลาง** `lib/api/envelope.ts` ตาม `44` §15 — `{success, data, error{code,message,field}}` + ส่วนขยาย `error.title`/`error.fields`/`warning` (superset ของรูปแบบ Phase 1 จึงไม่ต้องแก้หน้าจอเดิม) · `toModuleErrorResponse()`/`validationErrorResponse()` ออก envelope นี้แล้วทั้งคู่ ⇒ **error ของ 50 route เดิมอัปเกรดอัตโนมัติ**
- **`withEndpoint()`** ใน `lib/api/http.ts` — ตัวห่อ route ของ endpoint ที่ผูก contract: เช็ค HTTP method ตรง contract → `requirePermission()` (DEC-002) → ห่อ envelope ให้เอง (handler คืน `{data, status?, warning?}` หรือ `Response` ตรง ๆ เมื่อส่งไฟล์ PDF/Excel)
- **Error catalog** `lib/api/error-catalog.ts` — 129 code (จาก `24` §6.1–6.10 + `38`/`40`/`41`/`44` §12) เก็บ `status` + `severity` + ที่มา · ข้อความไทยยังอยู่ที่ `lib/<module>/errors.ts` (ไม่ทำซ้ำสองที่)
- **เทสต์ 57 เคส (5 ไฟล์)** — จุดที่ต่างจากเทสต์ทั่วไปคือ **อ่านไฟล์ spec จริงมาเทียบ**: contract ↔ `45` §6 ทั้งสองทาง · event registry ↔ `38`/`40`/`41` §17.2 + `44` §14 · error catalog ↔ `24` + module docs ทั้งสองทาง + เทียบ status กับ 9 โมดูลที่ implement แล้ว · กฎ ESLint รันจริงผ่าน `RuleTester`

### ส่วนต่างชื่อ event ระหว่าง `45` §7 กับไฟล์ต้นทาง (ตาม PLAN §2.1 — บันทึกไว้ ห้ามเงียบ)

ทะเบียนยึด **ไฟล์ต้นทางของโมดูล** เสมอ (ลำดับเอกสารใน CLAUDE.md: module spec ชนะ reference กลาง) — บันทึกเป็นโค้ดไว้ที่ `EVENT_NAME_DIFFS` ด้วย

| ชื่อในทะเบียน | `45` §7 เขียนว่า | สรุป |
|---|---|---|
| `asset.intake` | `asset.intake_confirmed` | ยึด `44` §14 · `asset.intake_confirmed` จะโดนกฎ ESLint จับถ้ามีใครเขียน |
| `asset.intake_retry` | (ไม่ลิสต์) | มีใน `44` §14 — รับเข้าทะเบียน |
| `lot.doc_attached` | (ไม่ลิสต์) | มีใน `44` §14 — รับเข้าทะเบียน |
| `expense.case_bound_created` | (ไม่ลิสต์) | มีใน `41` §17.2 — รับเข้าทะเบียน |
| `expense.hotel_claim_submitted` | (ไม่ลิสต์) | มีใน `41` §17.2 — รับเข้าทะเบียน |
| `case.recycle_approved` | มี | `38` §17.2 ไม่ได้ลิสต์ แต่ flow recycle มีจริงที่ `38` §10 — รับเข้าทะเบียน |

### การตัดสินใจระหว่างทาง

- **จำนวน endpoint = 39 ไม่ใช่ 37** — PLAN §2.1 เขียน 37 เป็นตัวเลขประมาณ · นับจาก `45` §6.1–6.5 จริงได้ 7+8+14+4+6 = 39 (เทสต์ตรึงเลข 39 ไว้กับไฟล์เอกสาร)
- **ไม่ normalize verb** — คง POST สำหรับ action ที่มี side effect ตาม `45` §8/§17 (ไม่ทำให้เป็น PATCH แบบไฟล์ `27`)
- **ไม่ย้าย success response ของ 50 route เดิม** มาใช้ `apiSuccess()` ในคอมมิตนี้ — DoD ระบุว่า "endpoint หลังจากนี้" ใช้ contract · `callApi()` อ่านได้ทั้งสองรูปแบบอยู่แล้ว (`readEnvelope()`) จึงไม่มีหน้าจอไหนต้องแก้ · route เดิมย้ายทีละตัวได้เมื่อแตะไฟล์นั้นอยู่แล้ว
- **catalog เก็บเฉพาะ metadata ไม่เก็บข้อความ** — กันข้อความไทยเพี้ยนสองที่กับ `lib/<module>/errors.ts` ที่มีอยู่แล้ว 9 โมดูล
- **ทะเบียน event แยกไฟล์ `event-names.ts`** ออกจาก metadata — เพราะกฎ ESLint (JS ล้วน) อ่านด้วย regex ไม่ได้ import TS
- `ApiData`/`ApiErrorBody` มาร์ค `@deprecated` แต่ยังคงไว้ (หน้าจอ roles 2 ตัวยังอ่าน body ดิบเอง)

### verify ที่รันจริง

`pnpm typecheck` ✅ · `pnpm test` ✅ (796/796 · ใหม่ 57) · `pnpm lint` ✅ · `pnpm build` ✅ (กันกับดัก Prisma หลุดเข้า client bundle)
พิสูจน์ DoD ข้อ "lint จับ event นอก registry ได้จริง": สร้างไฟล์ probe ที่มี `{ event: 'lot.shipped' }` แล้วรัน `pnpm lint` → error จริง แล้วลบ probe ทิ้ง

### จุดที่คนถัดไปควรรู้

- **Phase 2.2 เป็นต้นไปเขียน route ด้วย `withEndpoint({endpoint: 'case.create', action, resource, handler})`** — ห้ามพิมพ์ path เอง ห้ามสร้าง envelope เอง
- เพิ่ม/แก้ endpoint หรือ event = แก้ `docs/45` (และไฟล์ต้นทาง) ในคอมมิตเดียวกัน ไม่งั้นเทสต์ spec-drift แดง
- `PATCH /api/field/cases/reorder` เป็น segment คงที่ระดับเดียวกับ `[id]` — ฝั่ง Next ต้องวางโฟลเดอร์ `reorder/` คู่กับ `[id]/` (static ชนะ dynamic)
- ต้องการใช้ชื่อ event นอกทะเบียนจริง ๆ (เช่นเทสต์ยาม) ให้ใส่ `// eslint-disable-next-line assetrecovery/no-unregistered-event -- <เหตุผล>`

---

## Phase 1.12 — Settings FE ชุดที่ 2: 8 แท็บที่เหลือ (ไฟล์ 13 §6.4/6.5/6.7/6.9/6.10/6.11/6.12/6.13)

**วันที่**: 2026-08-14 · **commit**: `fa00f40` · **branch**: `auto/phase-1.12`

### สิ่งที่ทำ

- **ครบ 13 แท็บของหน้า `/settings/finance`** — เปิด `available: true` ทั้ง 8 แท็บที่เหลือใน `lib/settings/finance-tabs.ts` แล้วเสียบ component ใน `finance-settings-shell.tsx` (ไม่มี placeholder เหลือแล้ว)
- **§6.4 กติกาภาษี (Tax Profile)** — `<TaxProfilesTab>` ตาราง + ฟอร์มสร้าง/แก้ + ปิดใช้งาน (soft delete) · ช่องเกณฑ์ขั้นต่ำกรอกเป็นบาท แปลงด้วย `parseBahtInput()` · capability `manage_tax_profiles`
- **§6.5 อัตรา VAT** — `<VatRatesTab>` timeline effective-dated + ไฮไลต์ช่วงที่ใช้อยู่ (`isCurrent`) + **เตือนช่วงทับซ้อนสดขณะกรอก** โดยเรียก `findOverlappingPeriods()` ตัวเดียวกับที่ API ใช้ (เตือนเท่านั้น — `VAT_RATE_OVERLAP` ตัดสินที่ API) · ไม่มีปุ่มลบ (ปิดช่วงด้วย `effectiveTo` แทน)
- **§6.7 / §6.9 แท็บ read-only 2 ตัว** — `<InternalDocumentsTab>` (เอกสารภายใน 5 รายการ) และ `<ExportFormatsTab>` (Accounting Pack 01–08) ดึงจาก catalog ที่ API ส่งมา **ไม่มีปุ่มเพิ่ม/แก้/ลบ** เพราะ endpoint มีแต่ GET
- **§6.10 Functional Permission Matrix** — `<FunctionalPermissionsTab>` sub-tab 4 กลุ่มฟังก์ชัน + แถว capability พร้อมชิป "บทบาท → ระดับ" + แก้ทีละแถวผ่าน modal (dropdown 3 ระดับต่อ role, ส่งเป็น batch พร้อม reason) · Superadmin ไม่อยู่ในตาราง · แถว 🔒 disable ทั้งปุ่มแก้และ dropdown · capability `manage_roles`
- **§6.11 การล็อกรอบและ Adjustment** — `<PeriodLockTab>` **banner เหลืองแสดงเสมอ** ตาม `13` §7 (ข้อความมาจาก API ไม่พิมพ์ซ้ำ) + ตารางนโยบาย 3 สถานะ read-only
- **§6.12 เลขที่ใบกำกับภาษี** — `<InvoiceNumberingTab>` การ์ดสรุป 4 ช่อง + ตัวอย่างเลขถัดไปที่คำนวณด้วย `previewNextNumber()` (pure ตัวเดียวกับตัวเดินเลขจริง) · `lastNumber`/`lastResetYear` **แสดงอย่างเดียว ไม่มีช่องกรอก** · warning จาก API (เปลี่ยนรูปแบบหลังออกเอกสารแล้ว) แสดงเป็น toast โทนเตือน · capability `manage_invoice_numbering`
- **§6.13 เทมเพลตเอกสารภาษี** — `<TaxDocTemplatesTab>` การ์ดคู่ (ใบกำกับภาษี / 50 ทวิ) บันทึกแยกกันพร้อม reason ต่อการ์ด + รายการฟิลด์บังคับตามกฎหมายที่ปิดไม่ได้ (`28` §6.2–6.3)
- **`MATRIX_LEVEL_LABEL`** ย้ายขึ้นเป็นค่าคงที่กลางใน `lib/roles/matrix.ts` — `<PermissionMatrixModal>` (1.6) กับแท็บใหม่ใช้ข้อความชุดเดียวกัน

### การตัดสินใจระหว่างทาง

- **§6.4 ยึดฟิลด์จาก `02` ไม่ใช่ตารางใน `13`** — `13` §6.4 มี `vat_mode`/`applies_to` แต่ `tax_profiles` ใน `02` ไม่มี (VAT mode เป็นของบริษัทไฟแนนซ์ฝั่งขาย · ชนิดผู้รับเงินสะท้อนผ่าน `filing_form`) เป็นข้อสรุปเดียวกับที่ Phase 1.10 ตัดสินไว้แล้ว จึงไม่เปิด `[[NEEDS_DECISION]]` ใหม่
- **§6.10 ไม่ทำเป็น grid 37×15 จริง** (ยืนยันแล้วหลังทวนเอกสาร — มติ PO 2026-08-14 "เลือกแนวที่ตรงเอกสารที่สุด") — `13` §6.10 เขียนไว้ว่า "UI เป็น dropdown 3 ระดับต่อ role ต่อ capability (**ดู mockup `settings.html`** — 37 รายการครบตามไฟล์ 25)" คือชี้ไป mockup ตรง ๆ และ mockup (`renderSettingsPermission`) เป็น **ตารางรายแถว + ชิปบทบาท + ปุ่มแก้รายแถว** ไม่ใช่ตารางกว้าง 15 คอลัมน์ · คำว่า "grid 37×role" ใน `01_PLAN` §1.12 เป็นคำย่อของแผนงาน ไม่ใช่ SSOT ด้าน UI (ลำดับ: `02` → spec module → reference กลาง → mockup) ⇒ ยึด spec+mockup แล้วให้ modal เป็นที่ที่มี dropdown 3 ระดับต่อ role ครบตาม DEC-009
- **แท็บ §6.11 ไม่มีปุ่มแก้ policy** — `02` ไม่มีตารางเก็บนโยบายนี้ (Phase 1.10 สรุปไว้แล้วว่า endpoint เป็น GET อย่างเดียว) การปลดล็อกรอบเป็น action ของไฟล์ 30 บนหน้างวดบัญชี (Phase 4.1)
- **mockup แสดง "อัปโหลดโลโก้/ลายเซ็น" เป็นกล่อง upload** แต่ `02` เก็บเป็น URL (`logo_url`/`signature_image_url`) และ Phase 1 ยังไม่มี Storage integration ⇒ **ยึด `02` เรื่องรูปแบบข้อมูล (ช่องกรอกลิงก์) แต่ยึด mockup เรื่องหน้าตา**: มีกล่อง dashed บอกสถานะ "✓ <ชื่อไฟล์> (ตั้งค่าแล้ว)" / "ยังไม่ได้ตั้งค่า" เหนือช่องกรอกเหมือน mockup · ชื่อไฟล์อ่านด้วย `documentAssetName()` (pure + เทสต์ 5 เคส) · ตัวอัปโหลดจริงต่อยอดตอน Phase 3.5/4.3 ที่ render PDF

### ความครบตาม Test Cases `13` §15 (ตรวจก่อนปิด task)

| Test Case ของ `13` §15 | อยู่ที่ไหน |
|---|---|
| เพิ่ม VAT Rate ทับช่วงเดิม → `VAT_RATE_OVERLAP` | `lib/settings/vat.test.ts` (+ FE เตือนสดด้วย pure module ตัวเดียวกัน) |
| ใช้ Bank File ที่ยังไม่ทดสอบ → `BANK_FILE_NOT_TESTED` | `lib/settings/bank-file.test.ts` |
| แก้ไขขณะ locked → `PERIOD_LOCKED_DIRECT_EDIT` | `lib/settings/period-lock.test.ts` |
| WHT ต่ำ/ถึงเกณฑ์ 1,000 บาท (800 → ไม่หัก · 1,200 → หัก) | **Phase 3.1** — สูตร WHT เต็ม (ฐานหัก + threshold gate) เป็นของ `22` §6.9 ห้าม implement ซ้ำนอกโมดูลนั้น (Rule 01) · ที่ 1.12 มีแค่ค่าตั้งต้น `DEFAULT_WHT_MIN_THRESHOLD_SATANG` + เทสต์ว่า = 100,000 สตางค์ |
| "37 รายการครบตามไฟล์ 25" (`13` §6.10) | `lib/roles/default-matrix.test.ts` (37 รายการ 4 กลุ่ม) + `lib/roles/capability-locks.test.ts` (ล็อก 9 รายการ) |

### จุดที่คนถัดไปควรรู้

- **กับดักใหม่**: `dateOnlySchema` transform string → `Date` ⇒ ส่ง `parsed.data` กลับเข้า API ตรง ๆ จะกลายเป็น ISO เต็มแล้วโดน 400 · ฟอร์มที่มีช่องวันที่ต้องส่ง **payload ดิบ** (บันทึกใน `REUSE_INDEX` แล้ว)
- แท็บที่ใช้ capability เฉพาะ (`manage_tax_profiles` / `manage_invoice_numbering` / `manage_roles`) ส่งให้ `<Can>` ตรงกับที่ route ตรวจแล้ว — ถ้าเพิ่มปุ่มใหม่ในแท็บเหล่านี้ต้องใช้ constant จาก `components/settings/shared.ts` อย่าพิมพ์สตริงเอง
- `StatCard` ไม่มี prop `mono` — ต้องการ font-mono ให้ห่อ `value` ด้วย `<span className="font-mono">` เอง
- เลขเอกสารล่าสุดบนแท็บ §6.12 แสดงเป็น **ลำดับ** ไม่ใช่เลขเต็ม เพราะเลขเต็มของฉบับล่าสุดผูกกับปีที่ออกจริง (โหมด `yearly_reset`) การเดาปีให้จะได้เลขที่ไม่มีอยู่จริง

---

## Phase 1.11 — Settings FE ชุดที่ 1: shell 13 แท็บ + 5 แท็บแรก (ไฟล์ 13)

**วันที่**: 2026-08-14 · **commit**: `0eb2e81` · **branch**: `auto/phase-1.11`

### สิ่งที่ทำ

- **Shell "ตั้งค่าบัญชี/การเงิน"** — หน้า `/settings/finance` (`app/(app)/settings/finance/page.tsx`) + `<FinanceSettingsShell>` แถบแท็บ **แนวตั้ง 13 แท็บ** โทน emerald ตาม mockup `settings.html` (`renderSettingsLayout`) · แท็บที่หน้าจริงยังไม่เกิดแสดงเป็น disabled พร้อมบอก phase (แนวเดียวกับ `<SubNav>`) ไม่พาไปหน้าว่าง
- **SSOT ของแท็บ** อยู่ที่ `lib/settings/finance-tabs.ts` (pure) + เทสต์ยาม 7 เคส — จำนวนต้องเป็น 13 เป๊ะ (`13` §16), id ห้ามซ้ำ, แท็บที่ยังไม่พร้อมต้องระบุ `plannedPhase` · `resolveFinanceSettingsTab()` ทำให้ `?tab=` ที่ชี้แท็บยังไม่เกิดตกกลับแท็บแรกเสมอ
- **5 แท็บแรกใช้งานได้จริง**: §6.1 รอบบิล/รอบจ่าย · §6.2 สายอนุมัติ + §6.2.1 นโยบายการเงิน (การ์ดในแท็บเดียวกัน) · §6.3 บัญชีธนาคาร · §6.6 ศูนย์ต้นทุน · §6.8 ไฟล์โอนธนาคาร — ทุกแท็บมี loading/empty/error state ผ่าน `<TableState>`
- **`<ReasonConfirmModal>`** (shared) — กล่องยืนยันที่บังคับกรอกเหตุผล ≥5 ตัวอักษร ใช้ซ้ำทุกแท็บ (ทุกตารางของไฟล์ 13 อยู่หมวด money/bank/tax ⇒ `reason` บังคับทุก mutation ตาม `90` §13)
- `/settings` เปลี่ยนจาก `<ModulePlaceholder>` เป็น **redirect ไปแท็บแรก** (`/settings/roles`) ตาม mockup ที่ไม่มีหน้า "ราก" + เพิ่มเมนู `settings.finance` และปลด `available: false` ของเมนู `settings`

### การตัดสินใจระหว่างทาง

- **Top-tab 2 ชั้นของ mockup ไม่ถูกลอกมาตรง ๆ** — mockup มีแถบแท็บบน 2 อัน ("ตั้งค่าทั่วไป" / "ตั้งค่าบัญชี/การเงิน") แต่แอปมี `<SubNav>` (จาก 1.5) ทำหน้าที่นี้อยู่แล้ว ⇒ เพิ่ม "ตั้งค่าบัญชี/การเงิน" เป็นแท็บย่อยตัวที่ 7 ของ `<SubNav>` แล้วเก็บ **แถบแนวตั้ง 13 แท็บ** ไว้ในหน้านั้น — ได้โครงเดียวกับ mockup โดยไม่มี nav ซ้อน 3 ชั้น
- **แท็บสลับด้วย state ไม่ใช่ URL routing** — server component อ่าน `?tab=` ส่งเป็น `initialTab` เข้ามา (deep link ได้) แล้วสลับต่อด้วย `useState` · เลี่ยง `useSearchParams()` ที่ต้องมี Suspense boundary
- **badge สถานะทั้งหมดผ่าน `<StatusBadge>`** พร้อม `group` จาก mapper กลาง (`04` §8.1) ไม่ใส่คลาสสีเอง — `passed`/`failed` ของไฟล์ธนาคารยังไม่อยู่ใน `STATUS_GROUP` จึงส่ง `group` ตรง ๆ (`success`/`critical`) ตามที่ `<StatusBadge>` เปิดทางไว้ · badge ที่เป็น **ประเภท** ไม่ใช่สถานะ (AR/AP, receive/pay/both, "บัญชีหลัก") ยังใช้ `<Badge>` ตาม precedent ของ `components/teams/*`
- **ฟอร์มซ่อนช่องของโหมดที่ไม่เลือกจริง** (ไม่ใช่ disable) และส่งค่าของอีกโหมดเป็น `[]`/`null` เสมอ — ให้ตรงกับ CHECK `cycles_cutoff_shape` / `cycles_due_rule_shape` ระดับ DB (ค่าค้างทำให้ API ปฏิเสธ)

### จุดที่คนถัดไปควรรู้

- **เพิ่มแท็บใน 1.12 = แก้ 2 ที่**: เปลี่ยน `available: true` ใน `lib/settings/finance-tabs.ts` แล้วเสียบ component ใน `finance-settings-shell.tsx` — เทสต์ `finance-tabs.test.ts` ล็อกรายชื่อ 5 แท็บของ 1.11 ไว้ ต้องอัปเดตรายการนั้นด้วยเมื่อเปิดแท็บใหม่
- **capability ต่างกันต่อแท็บ**: 1.11 ใช้ `manage_settings` ทั้งหมด แต่ 1.12 มีแท็บที่ใช้ `manage_tax_profiles` (ภาษี/VAT/เทมเพลตเอกสารภาษี) · `manage_invoice_numbering` · `manage_roles` (matrix) — ส่งให้ `<Can>` ให้ตรง ไม่งั้นปุ่มโผล่แล้ว API ตอบ 403
- **ความไม่ตรงกันที่พบระหว่างทำ (ยังไม่แก้ spec — บันทึกไว้ก่อน)**: `13` §6.6 และ mockup มีฟิลด์ `mapping_rule` (auto/manual) ของศูนย์ต้นทุน แต่ `02`/schema จริงไม่มี (Phase 1.10 ตัดสินไปแล้วโดยใช้ `description` + `is_active` แทน) ⇒ FE ไม่แสดงฟิลด์นี้ · ถ้าธุรกิจต้องการจริงต้องมี `[[NEEDS_DECISION]]` + migration ใหม่
- mockup `settings.html` มีแท็บที่ 14 "Payee Profile" — เป็นของ **ไฟล์ 18** ไม่ใช่ไฟล์ 13 จึงไม่อยู่ใน `FINANCE_SETTINGS_TABS` (จะเกิดใน Phase 3.2)
- mockup ไม่มีช่อง `reason` ในทุก modal และไม่มีปุ่มเพิ่ม/แก้ของแท็บไฟล์ธนาคาร — ยึด spec/API (บังคับ reason + CRUD ครบ) ตามลำดับความสำคัญของเอกสาร

---

## Phase 1.10 — Settings ไฟล์ 13: Backend ครบ 13 หมวด

**วันที่**: 2026-08-14 · **commit**: `c6848db` (กู้ไฟล์ pure ค้างจาก session ที่ถูกตัด) + `53f4c38` (pure + Zod + test + `24` v3.9) + `b00a5f9` (ชั้น DB + API 22 route) · **branch**: `auto/phase-1.10`

### สิ่งที่ทำ

**ชั้น pure (`lib/settings/*.ts`, ใช้ร่วม FE/BE)** — ครบ 13 หมวด: `cycles` (รูปร่าง cutoff/due rule ตรง CHECK ระดับ DB) · `approval-matrix` (เพดานเป็น satang + ยามสายอนุมัติซ้ำเมื่อบังคับแยกหน้าที่) · `finance-policy` (AR aging buckets + label 0-30/31-60/61-90/90+) · `bank-account` (`usage` เป็นตัวตัดสินเดียว, mask เลขบัญชี) · `tax-profile` (WHT 3% / ฐาน before_vat / เกณฑ์ 1,000 บาท = ค่าตั้งได้ ห้าม hardcode) · `vat` (overlap + resolver แบบ date-only) · `cost-center` (running code `CC-001`) · `bank-file` (ทดสอบ mapping แบบ deterministic + `assertBankFileUsable`) · `numbering` (เลข พ.ศ. + preview + warning) · `period-lock` (ตาราง policy + `assertPeriodEditable`) · `tax-doc-template` · `catalogs` (§6.7/§6.9 read-only)

**ชั้น DB (`lib/settings/queries/*`)** — 10 โมดูล · ทุก mutation อยู่ใน `$transaction` เดียวกับ `emitAudit()` + `reason` (ทุกตารางของไฟล์ 13 อยู่หมวด money/permission/bank/tax ตาม `lib/audit/reason-policy.ts`) · ทุก query กรอง `organization_id`

**API 22 route** ตาม `13` §13 + **2 endpoint ที่ spec ตกหล่น**: `/api/settings/finance-policy` (ค่านโยบายถูกย้ายออกจาก approval matrix ตั้งแต่ DEC-006/D1 แต่ §13 ไม่ได้เพิ่มแถว) และ `/api/settings/tax-document-templates` (§6.13 เป็น 1 ใน 13 หมวดแต่ไม่มีในตาราง API draft)

**เทสต์** — 13 ไฟล์ / 209 เคส unit (pure + Zod) + 1 ไฟล์ DB (`numbering-concurrency.db.test.ts`, 5 เคส)

### การตัดสินใจระหว่างทาง (ยึด `02` เหนือ spec module ตามลำดับความสำคัญเอกสาร)

1. **`/period-lock-policy` เป็น GET อย่างเดียว** — `13` §13 ร่างว่ามี PATCH แต่ `02` ไม่มีตารางเก็บ policy นี้ ⇒ เป็นกติกาตายตัวขององค์กร (แก้ = แก้สเปค + โค้ดคู่กัน ไม่ใช่ค่าตั้งค่า) · การ "ปลดล็อกรอบ" เป็น action ของไฟล์ 30 (Phase 4.1)
2. **`tax_profiles` ไม่มี `vat_mode`/`applies_to`** ตามที่ `13` §6.4 เขียน — `vat_mode` อยู่ที่ `finance_companies` (ฝั่งขาย) และชนิดผู้รับเงินอยู่ที่ `payee_profiles.payee_type` + สะท้อนที่ `filing_form` · ตรงกับ §6.4 ที่ยืนยันว่าไม่มี `inhouse_employee`
3. **`cost_centers` ไม่มี `mapping_rule`** ตามที่ §6.6 เขียน — การ map อัตโนมัติอยู่ฝั่งรายการค่าใช้จ่าย (`32`)
4. **`/vat-rates` มี PATCH แต่ไม่มี DELETE** — `vat_rate_history` เป็น insert-only *ด้านคอลัมน์* (ไม่มี `updated_at`/`updated_by`/`deleted_at`) แต่ไม่อยู่ในรายการ immutable ของ `02` §13 ⇒ แก้ได้เท่าที่ §13 ให้มี PATCH โดยมี audit+reason เสมอ · หยุดใช้อัตรา = **ปิดช่วงด้วย `effectiveTo`** ไม่ใช่ลบ
5. **บัญชีหลัก (`is_primary`) มีได้บัญชีเดียวต่อองค์กร** — ตั้งใหม่ปลดของเดิมในทรานแซกชันเดียวกัน (spec ไม่ได้ระบุ แต่ค่านี้กำกวมถ้ามีหลายบัญชี)
6. **`docs/24` v3.9** — เติม error code 13 ตัวที่ implementation ใช้จริงแต่ `13` §10 ระบุไว้แค่ 5 (ตามแนวเดียวกับ v3.5–v3.7)
7. `manage_settings` ยังไม่มี role ไหนถือ ⇒ แก้ตั้งค่าทั่วไป = **Superadmin เท่านั้น** ตรงกับ `13` §11 · ภาษี/VAT/เทมเพลตเอกสารภาษี = `manage_tax_profiles` · เลขใบกำกับ = `manage_invoice_numbering` · matrix = `manage_roles` (ทั้งสามเป็นรายการที่ล็อกกับ Superadmin)

### จุดที่คนถัดไปควรรู้

- **`reserveNextInvoiceNumber()`** (`lib/settings/queries/numbering.ts`) เดินเลขด้วย `UPDATE ... RETURNING` **ครั้งเดียว** (ล็อกแถว `organizations`) — Phase 4.3 ต้องเรียก**ภายใน `$transaction` เดียวกับการสร้าง `tax_invoices`** ไม่งั้น rollback ทิ้งเลขเป็น gap · ห้ามอ่านค่ามาบวกในโค้ดแล้วเขียนกลับเด็ดขาด · เทสต์ยิงพร้อมกัน 20 คำขอพิสูจน์แล้วว่าได้ 1..20 ครบ
- **VAT resolver พร้อมใช้แล้ว**: `resolveVatRate()` (DB) / `resolveVatRateAt()` (pure) — Phase 3.6/4.3 ต้องเรียกตัวนี้แล้ว snapshot `vat_rate_used` ลง record · ไม่เจอช่วงครอบคลุม = `VAT_RATE_NOT_FOUND` **ห้าม fallback 7%**
- **`assertBankFileUsable()`** = gate เดียวของ `BANK_FILE_NOT_TESTED` — Phase 3.4 (payout) ต้องเรียกก่อนสร้างไฟล์โอนจริง ห้าม inline เงื่อนไขเอง
- **`assertPeriodEditable()`** = โครง interceptor `PERIOD_LOCKED_DIRECT_EDIT` — Phase 4.1 ต่อเข้า write endpoint ของสายการเงิน/บัญชีทุกตัว
- FE ของ 13 หมวดนี้ยังไม่ทำ (Phase 1.11 = 5 แท็บแรก · 1.12 = 8 แท็บที่เหลือ) — DTO ที่ API ส่งออกนิยามไว้ครบแล้วที่ `lib/settings/types.ts` (type-only ฝั่ง client import ได้)
- กับดักใหม่ 4 ข้อบันทึกไว้ใน `REUSE_INDEX` แล้ว: คอลัมน์ `DATE` กับ `fromInputDate()` · `Prisma.TransactionClient` กับ client ที่ `$extends` · `audit_logs.target_id` เป็น UUID · ตารางตั้งค่าบางตัวไม่มี `updated_by`

---

## Phase 1.9 — Users (08) + flow เชิญ/ตั้งรหัสผ่านครั้งแรก (ปิด D1)

**วันที่**: 2026-08-14 · **commit**: `9e505ef` (โมดูลผู้ใช้) + `680159e` (provisioning ตามมติ PO) · **branch**: `auto/phase-1.9`

### สิ่งที่ทำ

**BE ผู้ใช้งาน (08)** — `lib/users/*`: `user.ts` (pure: normalize + conditional required ตาม role group + lifecycle + `assertUserDeletable`) · `schemas.ts` (Zod ใช้ร่วม FE/BE) · `errors.ts` · `queries.ts` (ชั้น DB + scope ระดับแถว) · endpoint: `GET/POST /api/users`, `GET/PATCH/DELETE /api/users/:id`, `PATCH /:id/suspend`, `PATCH /:id/reactivate`, `POST /:id/invite` และ `POST /api/finance-companies/:id/users` (เลื่อนมาจาก 1.8)

**Provisioning (มติ PO 14/08/2569 ปิด open item D1)** — `lib/users/invite.ts` (pure) + `lib/users/provisioning.ts` (Supabase admin) + หน้า `/auth/set-password` (`components/auth/set-password-form.tsx`) + `setPasswordSchema` ใน `lib/auth/schemas.ts` + `SET_PASSWORD_PATH` เข้า public paths ของ `proxy.ts`
- สร้างผู้ใช้ = เชิญด้วย `inviteUserByEmail` แล้วเก็บ `supabase_uid` ในธุรกรรมเดียวกับการสร้าง
- เชิญไม่สำเร็จ = **ไม่ล้มงาน** — บันทึกผู้ใช้โดย uid เป็น null + คืน `warning` (`USER_NOT_PROVISIONED`) ให้ FE เตือน แล้วส่งซ้ำผ่านปุ่ม "ส่งคำเชิญอีกครั้ง"
- อีเมลที่มีบัญชี Auth อยู่ก่อน = ผูก uid เดิม + เตือน `USER_LINKED_EXISTING_AUTH` (ไม่ส่งอีเมลใหม่)
- แก้อีเมลผู้ใช้ = ย้ายอีเมลฝั่ง Supabase Auth ให้ด้วย (ล้มเหลว = warning ไม่ rollback ข้อมูลธุรกิจ)

**สิทธิ์** — ผูก capability `manage_users` ครั้งแรก (`lib/roles/default-matrix.ts`): ธุรการ = manage · บริหาร + ผู้จัดการทีม inhouse/outsource = view · Superadmin ไม่มี record ตามนิยาม

**FE** — `/settings/users`: ตาราง 5 คอลัมน์ + `<RoleGroupTabs>` (reuse 1.6) + ค้นหา/กรอง role/สถานะ + ป้าย "รอตั้งรหัสผ่าน" + ปุ่มแก้ไข/ส่งคำเชิญ/ระงับ/เปิดใช้งาน/ลบ (ทุกปุ่มบังคับ `reason` ผ่าน `<ConfirmModal>`) · ฟอร์ม cascading (กลุ่ม → role → ทีม/บริษัท) · เพิ่มเมนูย่อย `settings.users`

**เอกสาร** — `24` v3.7 (+6 code หมวด 08) และ v3.8 (`INVITE_SEND_FAILED`) · `05` v3.2 (§17 Decision การตั้งรหัสผ่านครั้งแรก) · `02_OPEN_DECISIONS` D1 → ✅ · REUSE_INDEX

**เทสต์** — `lib/users/user.test.ts` · `lib/users/schemas.test.ts` · `lib/users/invite.test.ts` · `lib/auth/schemas.test.ts` · เพิ่มยาม binding `manage_users` ใน `lib/roles/default-matrix.test.ts` — รวมทั้ง repo 500 → 518+ เทสต์เขียว

### การตัดสินใจระหว่างทาง

- **Error code**: `08` §11 เขียนกว้าง (`DUPLICATE_RECORD`/`INVALID_STATUS`) ซึ่งไม่มีใน dictionary กลาง → ตั้ง code เฉพาะตามแบบเดียวกับ Phase 1.7/1.8 แล้วลง `24` §6.1 · ทีม/บริษัทที่อ้างไม่เจอใช้ `TEAM_NOT_FOUND`/`COMPANY_NOT_FOUND` ของโมดูลเจ้าของ ไม่ตั้ง code ซ้ำ
- **DELETE = soft delete เท่านั้น** และถูกปฏิเสธด้วย `USER_HAS_HISTORY` เมื่อมีร่องรอยการทำงาน — `countUserReferences()` **ไม่นับ audit log** (ทุกคนที่เคย login ก็มี ⇒ จะลบใครไม่ได้เลย) แต่นับทีมที่ยังถือตำแหน่งอยู่ด้วย
- **สถานะไม่อยู่ในฟอร์ม** — เปลี่ยนผ่าน `/suspend`,`/reactivate` ตาม `08` §14 + Rule 04 เพื่อบังคับ `reason` และยาม lifecycle ครบทุกทาง
- **D7 (suspend ตอนมีเคสค้าง)**: ทำตาม default — แสดงจำนวนงานค้างในกล่องยืนยัน ไม่ block (bulk reassign ยังเป็นงาน Phase 2.6) เหมือนที่ 1.8 ทำกับ `TEAM_HAS_ACTIVE_CASES`
- **เมนู**: `05` §12 ให้ธุรการจัดการผู้ใช้ได้ แต่ `06` §7.2 ไม่ให้ธุรการเห็นเมนู "การตั้งค่า" และแท็บย่อยกว้างกว่าเมนูแม่ไม่ได้ ⇒ คงตาม `06` (สิทธิ์ที่ API ยังมีจริง) พร้อมหมายเหตุในโค้ด
- **redirect ของลิงก์คำเชิญ** ประกอบจาก `origin` ของ request แทนการเพิ่ม env ใหม่ — ใช้ได้ทั้ง local/staging/production โดยไม่ต้องตั้งค่าเพิ่มฝั่งเรา

### จุดที่คนถัดไปควรรู้

- ต้องรัน **`pnpm db:seed`** ซ้ำ 1 ครั้งต่อ environment — `manage_users` เพิ่งถูก binding 4 แถวใหม่ ไม่งั้นธุรการ/บริหาร/ผู้จัดการจะเรียก `/api/users` ไม่ผ่าน (Superadmin ใช้ได้อยู่แล้ว)
- ต้องตั้งค่าฝั่ง **Supabase Dashboard** ก่อนทดสอบ flow เชิญจริง: (1) Authentication → URL Configuration → Redirect URLs เพิ่ม `<origin>/auth/set-password` ของทุก environment (2) ตั้ง SMTP จริงถ้าจะส่งอีเมลนอกทีม (ตัวส่งในตัวของ Supabase จำกัดโควตา) — ไม่ตั้ง = สร้างผู้ใช้ได้แต่ได้ warning และต้องกด "ส่งคำเชิญอีกครั้ง" ทีหลัง
- `warning` ใน response envelope (`lib/api/types.ts`) เป็นของใหม่ — โมดูลถัดไปที่มีงาน "สำเร็จแต่มีเรื่องต้องบอก" ใช้ช่องนี้ ห้ามยัดเป็น error
- D2 (ลืมรหัสผ่าน) ยังเปิดอยู่ — หน้า `/auth/set-password` รองรับ `type=recovery` ไว้แล้ว เหลือแค่ปุ่ม "ลืมรหัสผ่าน" + `resetPasswordForEmail`

---

## Phase 1.8 — Teams (09) + Finance Companies (10)

**วันที่**: 2026-08-14 · **commit**: `0565ff7` · **branch**: `auto/phase-1.8`

### สิ่งที่ทำ

**Schema / migration** (มติ PO 14/08/2569 ตอบ `[[NEEDS_DECISION]]` ตอนเริ่ม task)
- migration `20260814043410_finance_company_suspend_delivery_format`: enum `invoice_delivery_format` (`e_tax_invoice`/`paper_pdf`) + `finance_companies.suspended_reason` (TEXT null ได้) + `finance_companies.default_invoice_delivery_format` (NOT NULL DEFAULT `paper_pdf`)
- `02` v3.9 (§3 enum + §5 DDL + comment `status` = `active | suspended` คงชนิด TEXT) · `00_MAP` เลขบรรทัดของ `02` · `prisma/schema.test.ts` ยาม enum 55 → **56**
- `24` v3.6 — เพิ่ม code §6.1: `COMPANY_NOT_FOUND`, `TEAM_NOT_FOUND`, `DUPLICATE_TEAM_NAME`, `TEAM_HAS_ACTIVE_CASES`, `SUPERVISOR_ALREADY_ASSIGNED`, `INVALID_TEAM_MEMBER`, `INVALID_PROVINCE`
- `lib/audit/reason-policy.ts` — เพิ่ม `signer_name` ในฟิลด์อ่อนไหวของ `finance_companies` (`10` §13)

**BE ทีม (09)** — `lib/teams/*`: `provinces.ts` (PROVINCE_DATA master) · `team.ts` (pure guards) · `schemas.ts` (Zod) · `errors.ts` · `queries.ts` (ชั้น DB) · endpoint: `GET/POST /api/teams`, `GET/PATCH/DELETE /api/teams/:id`, `POST /api/teams/:id/managers`, `DELETE /api/teams/:id/managers/:userId`, `GET /api/teams/eligible-members`

**BE บริษัทไฟแนนซ์ (10)** — `lib/finance-companies/*`: `company.ts` (pure: tax id + suspend) · `schemas.ts` · `errors.ts` · `queries.ts` · endpoint: `GET/POST /api/finance-companies`, `GET/PATCH /:id`, `POST /:id/status`, `GET /:id/users`

**FE** — `/settings/teams` (ตาราง 5 คอลัมน์ + toggle Inhouse/Outsource + filter สถานะ/จังหวัด/ค้นหา + ฟอร์ม province picker แยกภาค) · `/settings/companies` (การ์ดตาม `10` §8 + ปุ่มระงับ/เปิดใช้งานพร้อม reason) · เพิ่ม 2 เมนูย่อยใน `lib/nav/menu-registry.ts`

**เทสต์** — `lib/teams/team.test.ts` + `schemas.test.ts` · `lib/finance-companies/company.test.ts` + `schemas.test.ts` · `lib/teams/teams-companies.db.test.ts` (ระดับ DB: UNIQUE ชื่อทีม, N:N ผู้จัดการ 2 ทีม, UNIQUE tax_id, ดีฟอลต์คอลัมน์ใหม่, ค่า enum) — รวมทั้ง repo 474 → 500 เทสต์เขียว

### การตัดสินใจระหว่างทาง

1. **`suspended_reason` + `default_invoice_delivery_format`** — `02` §5 ไม่มี 2 คอลัมน์นี้แต่ `10` §7.1 + mockup ใช้จริง → หยุดถาม PO ก่อนลงมือ (ตาม Rule 02) → PO เลือก "เพิ่ม migration + แก้ `02` พร้อม changelog" · บันทึกเป็น A7 ใน `02_OPEN_DECISIONS`
2. **`signer_phone` ยังไม่เพิ่ม** — เป็นช่องที่ `10` §7.1 มีแต่ `02` ไม่มี และอยู่นอกมติรอบนี้ → เปิดเป็น **A8 (⬜)** ใน `02_OPEN_DECISIONS` · ฟอร์ม/การ์ดของ 1.8 ไม่มีช่องนี้ไปก่อน
3. **หัวหน้าทีมซ้ำ 2 ทีม = reject ไม่ใช่แค่เตือน** — ปิด Open Item `09` §18 ตามที่ §7.1/§17 ระบุไว้แล้วว่า "1 คน = 1 ทีม" · code = `SUPERVISOR_ALREADY_ASSIGNED` (ผู้จัดการยังหลายทีมได้ตามเดิม)
4. **`POST /:id/users` (สร้าง company user) เลื่อนไป 1.9** — ต้อง provision Supabase Auth ซึ่งติด D1 (invite/first-login) ที่ระบุว่าบล็อก 1.9 อยู่แล้ว · 1.8 ทำ `GET /:id/users` + ตัวนับบนการ์ด
5. **ปิดทีมที่มีเคสค้าง = `TEAM_HAS_ACTIVE_CASES`** ตาม default ของ D7 · สถานะที่นับว่า "ยังไม่จบ" = `pending_review`/`need_info`/`approved`/`active`/`pending_recycle_review` (ไม่นับ `draft` ที่ยังไม่ผูกทีม) · **modal bulk reassign เป็นของ Phase 2.6**
6. **ระงับบริษัทเป็น endpoint แยก** (`POST /:id/status`) ไม่รวมใน PATCH — Rule 04 กำหนดว่า transition ใช้ `POST /:id/action-name` และการระงับมีกติกา reason ของตัวเอง · เหตุผลถูกเก็บ 2 ที่โดยตั้งใจ: คอลัมน์ `suspended_reason` (แสดงบนการ์ด) + audit log (ประวัติ)
7. **event `finance-company.suspended` ยังไม่ยิงจริง** — event bus เกิด Phase 2.1 (`45` §7) · ตัวบล็อกเคสใหม่อยู่ที่ไฟล์ 38 ซึ่งอ่าน `status` จากตารางตรง ๆ อยู่แล้ว
8. **ทีมใช้ enum `team_status` = `active | inactive`** ตาม `02` §3 (mockup เขียน "Suspended" แต่ schema เป็น SSOT) — ต่างจากบริษัทที่ใช้ `active | suspended`

### จุดที่คนถัดไปควรรู้

- **`migrate dev` แถม SQL พยศทุกใบ** — ต้อง `--create-only` แล้วลบ `ALTER COLUMN updated_at DROP DEFAULT` (ทุกตาราง) + `ALTER COLUMN return_satang SET NOT NULL` ออกก่อน apply เสมอ · รอบนี้พลาดไปครั้งหนึ่ง migration ล้มกลางคันและทำ default ของ 3 ตารางหาย ต้องซ่อมด้วยมือ + `migrate resolve --rolled-back` (บันทึกไว้ในหมวดกับดักของ REUSE_INDEX แล้ว)
- **scope ระดับแถวอยู่ในชั้น queries** — `getTeam()`/`getFinanceCompany()` รับ `SessionUser` (ไม่ใช่ `organizationId`) เพื่อเช็ค `isWithinScope()` ให้ครบทุกทางเข้า · โมดูลถัดไปที่มี scope ย่อยควรลอกรูปแบบนี้
- `PROVINCE_DATA` เป็นพื้นที่ให้บริการจาก mockup (ไม่ครบ 77 จังหวัด) — Address component ของ Phase 2.4 ที่ต้องการจังหวัด/อำเภอ/ตำบลครบทั้งประเทศต้องมี master ของตัวเอง อย่า reuse ตัวนี้
- `GET /api/teams/eligible-members` ต้องอยู่ก่อน `[id]` ใน routing (static ชนะ dynamic) — Users module (1.9) เรียกซ้ำได้เลย
- ทีมที่ผูกแผนค่าตอบแทนแล้ว ถูกย้ายไปเวอร์ชันใหม่อัตโนมัติเมื่อ PATCH แผน (โค้ดของ 1.7) — 1.8 จึงยอมผูกได้เฉพาะแผน `is_current = true` และยังไม่ถูกปิดใช้งาน

---

## Phase 1.7 — Compensation Plans (11) + Service Fee Templates (12)

**วันที่**: 2026-08-14 · **commit**: `ad5982a` (BE) + `8417ef1` (FE + docs) · **branch**: `auto/phase-1.7`

### สิ่งที่ทำ

- **ชิ้นส่วนกลางที่ดึงออกมาก่อน** (โมดูลถัดไปใช้ต่อได้ทันที)
  - `lib/api/errors.ts` — คลาส `ModuleError` (pure ล้วน) ที่ error ของทุกโมดูลสืบทอด
  - `lib/api/http.ts` — `withApiPermission()` / `readJsonBody()` / `validationErrorResponse()` / `toModuleErrorResponse()` (ย้ายมาจาก `lib/roles/http.ts` ซึ่งตอนนี้เหลือเป็นตัวห่อบาง ๆ ที่ผูก `toRoleErrorResponse` ให้)
  - `lib/api/validation.ts` — `reasonSchema` / `satangSchema()` / `pctSchema()` / `toFieldErrors()`
  - `lib/api/types.ts` — `callApi()` / `jsonRequest()` + envelope `ApiData`/`ApiErrorBody` (เดิมอยู่ `lib/roles/types.ts`)
  - `lib/format/money.ts` — `toBahtInput()` / `parseBahtInput()` สำหรับช่องกรอกเงินในฟอร์ม (บาท ↔ สตางค์)
- **Pure modules ของสองโมดูลใหม่** (ไม่แตะ DB — เทสต์ได้โดยไม่ต้องมี Postgres)
  - `lib/compensation/plan.ts` — `normalizePlanValues()` (บังคับ exclusive ของโหมดน้ำมันระดับข้อมูล), `diffPlanValues()`, `planNextVersion()`, **`resolvePlanVersionAt()` = snapshot resolver แบบ effective-dated**, `toCompensationSnapshot()`, `describeFuelRule()`
  - `lib/service-fee/template.ts` — `normalizeTemplateValues()`, `planNextTemplateVersion()`, `toServiceFeeSnapshot()`, `assertRateRange()` (`INVALID_RATE_RANGE`), **`describeServiceFeeFormula()` คืนองค์ประกอบสูตร 2 กรณี** (สำเร็จ/ไม่สำเร็จ) ตาม `22` §6.5–6.7
  - `lib/{compensation,service-fee}/schemas.ts` — Zod ชุดเดียวใช้ร่วม FE/BE พร้อม conditional validation เต็มตาราง `11` §7.1 และ `12` §7.1
- **ชั้น DB + API** — `lib/{compensation,service-fee}/queries.ts` + 8 endpoint (`GET/POST` list · `GET/PATCH/DELETE /:id` · `GET /:id/versions` ของทั้งสองโมดูล)
- **หน้าจอ** — `/settings/compensation` (การ์ดแผน + toggle โหมดน้ำมัน) และ `/settings/service-fee` (การ์ดตาม DEC-008 แสดงสูตร 2 กรณี) + `<VersionHistoryModal>` ที่ใช้ร่วมกัน + เมนู 2 แท็บใน `menu-registry`
- **เอกสาร** — `24` §6.1 เพิ่ม 5 code (`DUPLICATE_TEMPLATE_NAME`, `PLAN_NOT_FOUND`, `TEMPLATE_NOT_FOUND`, `VERSION_NOT_CURRENT`, `PLAN_IN_USE`) + changelog v3.5 · REUSE_INDEX เพิ่ม 12 แถว + กับดักใหม่ 1 ข้อ
- **เทสต์** — 4 ไฟล์ใหม่ (61 เทสต์) ครอบ conditional validation ครบทุกโหมด/ทุก model + versioning + resolver + สูตร 2 กรณี · รวมทั้ง repo 436 เทสต์เขียว · `pnpm build` ผ่าน

### การตัดสินใจระหว่างทาง

- **"1 เทมเพลต = แถวชื่อเดียวกันหลายเวอร์ชัน"** — `02` §5 มี `UNIQUE(organization_id, name, version)` และไม่มีคอลัมน์ group id ⇒ ประวัติเวอร์ชันจับกลุ่มด้วย `name` · ผลตามมา: **เปลี่ยนชื่อ = เปลี่ยนทุกแถวของชุดพร้อมกัน** ไม่งั้นเวอร์ชันเก่าจะหลุดกลุ่ม
- **PATCH ย้าย FK ของผู้ใช้งานมาชี้เวอร์ชันใหม่เสมอ** (`teams.compensation_plan_id`, `finance_companies.service_fee_template_id`) — จำเป็นเพื่อให้ `12` §9 เป็นจริง ("เคสที่ยังไม่ approved เห็นค่าใหม่ทันที") ส่วนแถวเก่ายังอยู่ครบให้ `expenses` ที่ snapshot ไว้แล้วอ้างถึงได้ (`92` §7.1) · ทั้งชุดอยู่ใน `$transaction` เดียวกับ `emitAudit()`
- **PATCH ที่ไม่มีฟิลด์ไหนเปลี่ยน = ไม่สร้างเวอร์ชัน ไม่ลง audit** — กันเวอร์ชันขยะจากการกดบันทึกซ้ำ (เทียบค่าหลัง normalize เพื่อไม่ให้ฟิลด์ของโหมด/model ที่ไม่ได้ใช้นับเป็นการเปลี่ยนแปลง)
- **`active` ของ `12` §7.1 map ไปที่ `deleted_at`** — `02` (schema, ชนะตามลำดับความสำคัญ) ไม่มีคอลัมน์ `active` แยก และ §2.4 กำหนดว่า soft delete = `deleted_at` (NULL = active) · ปิด/เปิดใช้งานผ่าน `DELETE /:id` body `{ isActive, reason }` และทำทีเดียวทุกเวอร์ชันของชุด
- **`INVALID_RATE_RANGE` ไม่ได้เช็คใน Zod** — ถ้าใส่ min/max ใน schema จะได้ `REQUIRED_MISSING` แทน code ที่ `24` §6.1 กำหนดไว้ ⇒ ปล่อยผ่าน schema แล้วดักด้วย `assertRateRange()` ในชั้น service
- **ผูก `manage_compensation_plans` ตาม `11` §12** (บริหาร/การเงิน = manage · บัญชี/ผู้จัดการทีม inhouse+outsource = view) — เป็น capability นอก Functional Matrix 37 รายการ ซึ่ง `default-matrix.ts` ระบุไว้ว่า "ให้ task ของโมดูลเจ้าของสิทธิ์ผูกเอง" · เพิ่มค่าคงที่ `BOUND_NON_MATRIX_CAPABILITIES` + ปรับเทสต์ยามให้ยังจับการผูกเงียบ ๆ ได้เหมือนเดิม
- **แท็บเมนูใหม่ใช้ audience เดียวกับเมนูแม่** (`superadmin`/`executive`) — `06` §7.2 ระบุชัดว่าเมนู "การตั้งค่า" เห็นได้แค่ 2 role นี้ · สิทธิ์ที่กว้างกว่าของการเงิน/บัญชี (`11` §12) ยังบังคับจริงที่ API ทุก endpoint (เมนูไม่ใช่ security — DEC-002)
- **เพิ่ม `GET /api/service-fee-templates/:id/versions`** ที่ `12` §14 ไม่ได้ระบุ — ตาราง `service_fee_templates` มี versioning เต็มรูปแบบใน `02` §5 และหน้าจอต้องแสดงประวัติเหมือนแผนค่าตอบแทน · เป็น read-only ใช้สิทธิ์ `view:view_master_data` เท่ากับ endpoint อ่านตัวอื่น

### จุดที่คนถัดไปควรรู้

- **Phase 1.8 (teams/companies)**: FK ต้องชี้แถวที่ `is_current = true` เสมอ — ดึงรายการจาก `GET /api/compensation-plans` / `GET /api/service-fee-templates` (คืนเฉพาะเวอร์ชันปัจจุบัน) · ยาม `PLAN_IN_USE`/`TEMPLATE_IN_USE` นับเฉพาะ team/company ที่ `deleted_at IS NULL`
- **Phase 2.3 / 2.9 / 3.2 (snapshot ของจริง)**: ใช้ `resolvePlanVersionAt(versions, onDate)` + `toCompensationSnapshot()` / `toServiceFeeSnapshot()` — **ห้ามอ่านเวอร์ชันปัจจุบันมาคำนวณย้อนหลัง**
- **Phase 3.1 (สูตรเงิน `22`)**: `describeServiceFeeFormula()` และ `describeFuelRule()` คืนแค่ *องค์ประกอบ* ของสูตร ไม่คูณอะไรเลย — สูตรจริง (ต้องรู้ระยะทาง/มูลหนี้/มูลค่าเครื่องของเคส) ยังเป็นงานของ 3.1 ตามแผน
- **กับดักที่เจอจริง**: `lib/<module>/errors.ts` ที่ import `lib/api/http.ts` จะลาก Prisma เข้า client bundle — typecheck/test ผ่านหมด พังเฉพาะตอน `next build` ⇒ **โมดูลใหม่ต้องรัน `pnpm build` อย่างน้อย 1 ครั้งก่อนปิด task** (บันทึกไว้ใน REUSE_INDEX แล้ว)
- ยังไม่มีข้อมูล seed ของแผน/เทมเพลต — หน้าจอจะเป็น empty state จนกว่าจะสร้างเองผ่าน UI (ตั้งใจ: ค่าเงินเป็นข้อมูลธุรกิจจริง ไม่ควร seed ค่าสมมติ)

---

## Phase 1.6 — Roles & Permissions module

**วันที่**: 2026-08-14 · **commit**: `a5ef75c` · **branch**: `auto/phase-1.6`

### สิ่งที่ทำ

- **มติ PO ก่อนลงมือ (จุดที่ 1.2 เลื่อนมาให้เคาะ)**: รายการ "✅ only" ที่ล็อกแก้ไม่ได้ = **9 รายการ** — Superadmin 6 (`manage_companies`, `manage_service_fees`, `manage_tax_profiles`, `manage_period_lock_policy`, `manage_invoice_numbering`, `manage_roles`) + **บริหาร (Executive) 3** (`approve_adjustment_locked`, `unlock_period`, `authorize_exception`) · แก้เชิงอรรถ `25` §16.1 (v2.3) และ `13` §6.10 (v3.2) ให้ตรงกับตารางจริงแล้ว
- **Pure modules** (`lib/roles/*` — ไม่มีอะไรแตะ DB, เทสต์ได้โดยไม่ต้องมี Postgres)
  - `capability-catalog.ts` — ย้ายรายการ capability 47 ตัวออกมาจาก `prisma/seed.ts` (เนื้อหาเดิมไม่เปลี่ยน) เพื่อให้ยามความสอดคล้องเทสต์ได้
  - `capability-locks.ts` — ตารางล็อก 9 รายการ + `capabilityLockOwner()`/`isCapabilityLocked()`/`ownsLockedCapability()`
  - `default-matrix.ts` — ค่าเริ่มต้นของ `role_capabilities` ถอดจาก `25` §7 ทุกช่อง (**57 แถว**) · Superadmin ไม่มี record (DEC-009) · capability นอก matrix (10 ตัว) ยังไม่ผูก ปล่อยให้ task ของโมดูลเจ้าของสิทธิ์ผูกเอง
  - `matrix.ts` — `buildRoleMatrix()` จัดกลุ่ม 4 กลุ่ม (`13` §6.10) + กลุ่ม "อื่นๆ" · `resolveLevel()` (Superadmin = manage ทุกแถว) · `isRowEditable()` · `countGrantedLevels()`
  - `role-groups.ts` — โครงแท็บ **3 tab** ตาม `07` §8 (แท็บเจ้าหน้าที่ติดตามทรัพย์มี sub-toggle Inhouse/Outsource)
  - `guards.ts` — `assertRoleRenamable` (`SEED_ROLE_RENAME`) · `assertRoleDeletable` (`LAST_SUPERADMIN_REMOVAL` → `SEED_ROLE_DELETE` → `ROLE_IN_USE`) · `assertRolePermissionsEditable` (`ROLE_NOT_EDITABLE`) · `assertCapabilityAssignable` (`CAPABILITY_LOCKED`) · `planPermissionChanges()` (คัดเฉพาะรายการที่เปลี่ยนจริง = idempotent)
  - `errors.ts` (8 code ตาม `24` §6.9 ที่เติมใหม่) · `schemas.ts` (Zod ใช้ร่วม FE/BE + `reason` บังคับ ≥5 ตัวอักษร) · `http.ts` (`withRolePermission()` + `validationErrorResponse()`)
- **ชั้น DB** `lib/roles/queries.ts` — `listRoles()` (พร้อม `userCount` + จำนวนสิทธิ์) · `getRole()`/`getRoleAssignments()`/`countRoleUsers()` · `applyRolePermissionChanges()` = `$transaction` (upsert/delete `role_capabilities` + `emitAudit` ใน tx เดียว) แล้ว `clearSessionCache()` · `createRole`/`updateRole`/`deleteRole` (soft delete) ครบ audit
- **API 7 endpoint**: `GET|POST /api/roles` · `PATCH|DELETE /api/roles/:id` · `GET|PATCH /api/roles/:id/permissions` · `GET /api/permissions` — อ่าน = `view:view_master_data`, แก้ = `manage:manage_roles`
- **Seed**: `prisma/seed.ts` ผูก `role_capabilities` ครบ (งานที่ 1.2 เว้นไว้) — รันจริงบน dev DB ได้ 57 แถว และรันซ้ำแล้วยังได้ 57 (idempotent)
- **FE** `/settings/roles`: `<RolesManager>` (ตารางบทบาทต่อกลุ่ม + Seed/Custom badge + สร้าง/ลบบทบาทพร้อม `reason`) · `<RoleGroupTabs>` (shared — Users module 1.9 ใช้ซ้ำ) · `<PermissionMatrixModal>` (dropdown 3 ระดับต่อ capability, แถว 🔒 disable, ปุ่มบันทึกล็อกจนกว่าจะกรอกเหตุผล) — ประกอบจาก UI Kit ทั้งหมด + loading/empty/error ครบ · เพิ่มแท็บย่อย `settings.roles` ใน menu registry
- **เอกสาร**: `24` §6.9 เพิ่ม 8 code (v3.4) · `25` §16.1 v2.3 · `13` §6.10 v3.2 · REUSE_INDEX เพิ่ม 11 แถว + กับดัก 2 ข้อ

### การตัดสินใจระหว่างทาง

- **อ่าน roles ใช้ `view_master_data` ไม่ใช่ `manage_roles`** — `07` §12 ให้ บริหาร/การเงิน/บัญชี ดู role ได้ แต่ `manage_roles` ถูกล็อกไว้กับ Superadmin (มอบให้ role อื่นไม่ได้) จึงใช้เป็นสิทธิ์ "ดู" ไม่ได้ · แถว "ดูข้อมูล Master Data" ของ `25` §7.1 (👁️ ให้ ธุรการ/การเงิน/บัญชี/บริหาร) ตรงกับเจตนานี้พอดี
- **ล็อก = ห้ามเปลี่ยนค่าของแถวนั้น ไม่ว่ากับ role ไหน** (รวมเจ้าของ) แต่ถ้า client ส่งค่าเดิมกลับมา (UI ส่งทั้งตาราง) ถือว่าไม่เปลี่ยน = ผ่าน — กัน false reject โดยไม่เปิดช่องแก้จริง
- **`clearSessionCache()` ไม่ใช่ `invalidateSessionCache(uid)`** — สิทธิ์เปลี่ยนที่ระดับ role กระทบผู้ใช้ทุกคนในบทบาทนั้น ซึ่ง cache เก็บเป็นราย `supabase_uid` จึงต้องล้างทั้งชุด (คอมเมนต์ในไฟล์ 1.3 ก็เขียนแนวนี้ไว้แล้ว)
- **`ROLE_IN_USE` / `DUPLICATE_ROLE_NAME` / `ROLE_NOT_EDITABLE` / `CAPABILITY_LOCKED` / `CAPABILITY_NOT_FOUND` / `ROLE_NOT_FOUND` เป็น code ใหม่** — `07` §11 ให้มาแค่ 2 ตัว (seed delete/rename) ที่เหลือจำเป็นจริงตอน implement จึงเพิ่มลง `24` §6.9 ใน commit เดียวกันตาม Rule 04
- **capability นอก Functional Matrix ยังไม่ผูก role** — `13` §6.10 คุมเฉพาะ 37 รายการสายการเงิน/บัญชี · เจ้าของสิทธิ์ของอีก 10 ตัว (users/teams/warehouse/settings ฯลฯ) อยู่ในสเปคโมดูลนั้น ๆ ที่ยังไม่ถึงคิว — เดาไว้ก่อนจะกลายเป็นสิทธิ์ผิดที่แก้ยากทีหลัง
- **role CRUD (POST/PATCH/DELETE) เพิ่มจาก 4 endpoint ใน `07` §14** — ไม่งั้นยาม `SEED_ROLE_DELETE`/`SEED_ROLE_RENAME` ไม่มีทางถูกเรียกจริง และ `07` §9 lifecycle เขียน "สร้าง role → assign permissions" ไว้ชัด

### verify ที่รันจริง (DoD ของ PLAN §1.6)

`pnpm typecheck` ✅ · `pnpm lint` ✅ (0 error) · `pnpm test` ✅ 370/370 (28 ไฟล์ — ใหม่ 6 ไฟล์ 52 เคส) · `pnpm build` ✅ · `pnpm db:seed` ✅ รัน 2 รอบได้ `role_capabilities` 57 แถวเท่ากัน · ตรวจยอดจริงใน DB: การเงิน manage 7/view 10 · บัญชี 9/3 · บริหาร 5/3 · Superadmin 0/0 (ไม่มี record ตามนิยาม) — ตรงกับ `25` §7 ทุกช่อง

### จุดที่คนถัดไปควรรู้

- **แก้รายการ capability ใหม่ให้แก้ที่ `lib/roles/capability-catalog.ts`** (seed import ไปใช้) และถ้าเป็นรายการที่ต้องล็อก ต้องเพิ่มที่ `capability-locks.ts` + มีมติ PO + แก้ `25`/`13` — เทสต์ยามจะแดงถ้าจำนวน/เจ้าของไม่ตรง
- **Users module (1.9)**: ใช้ `<RoleGroupTabs>` และ `assertRoleDeletable()`/`assertNotLastSuperadmin()` ซ้ำ ห้ามสร้างใหม่ · ตอนย้าย role ของ user ต้องเรียก `invalidateSessionCache(supabaseUid)` เอง
- **Settings shell ตัวจริง (1.11/1.12)** ยังไม่เกิด — ตอนนี้ `/settings` ยังเป็น placeholder และ `/settings/roles` เป็นแท็บย่อยตัวแรกใน registry · เมื่อทำ settings shell ให้ย้ายรายการแท็บทั้ง 9 (mockup `renderSettingsLayout`) เข้า registry ทีเดียว
- **หน้าใหม่ที่ fetch ข้อมูลเอง** ต้องเลี่ยง `setState` แบบ synchronous ใน `useEffect` (กฎ lint ใหม่) — ดู pattern ที่ `components/roles/roles-manager.tsx` (ฟังก์ชัน fetch ไม่มี setState + async IIFE + `cancelled`)

---

## Phase 1.5 — UI Kit + App Shell + Navigation

**วันที่**: 2026-08-14 · **commit**: `e4d56b4` · **branch**: `auto/phase-1.5`

### สิ่งที่ทำ

- **Utils กลาง (pure + unit test)**
  - `lib/format/datetime.ts` — `fmtDate`/`fmtDateTime`/`fmtTime`/`nowDate`/`nowDateTime`/`buddhistYear`/`toBangkokParts`/`toDate` + `toInputDate`/`fromInputDate` (ข้อยกเว้น `<input type="date">`) · แปลง UTC → Asia/Bangkok ด้วย `Intl` (ไม่ hardcode offset) แล้วแสดง **พ.ศ. เท่านั้น** (`03` §6.5 · DEC-005)
  - `lib/format/money.ts` — `fmtSatang`/`fmtSatangSymbol`/`fmtSatangRounded`/`fmtCount`/`fmtPercent`/`fmtRatioPct` · แปลง satang → ข้อความด้วยการหาร/มอดจำนวนเต็ม (ไม่มี float) · ส่งค่าไม่ใช่จำนวนเต็มเข้าไป = โยน `MoneyFormatError`
  - `lib/ui/status-badge.ts` — statusBadge mapper **10 กลุ่มสีตายตัว** ถอดจากตาราง `04` §8.1 ครบทั้ง 36 สถานะ · สถานะที่ยังไม่จัดหมวด → `neutral`
- **UI Kit** `components/ui/*` (barrel `@/components/ui`): `Button`/`Spinner` · `Card`/`CardHeader`/`PageHeader`/`StatCard` · `StatusBadge`/`Badge`/`RefText` · `Field`/`Input`/`Select`/`Textarea`/`Label` · `Table`/`THead`/`TBody`/`Tr`/`Th`/`Td`/`TableState` · `Modal`/`ConfirmModal` · `ToastProvider`/`useToast` · `LoadingState`/`EmptyState`/`ErrorState`/`InlineAlert`/`Skeleton` · `cn()` — คลาสทุกตัวถอดจาก `04` §8.1 + mockup
- **Menu registry** `lib/nav/menu-registry.ts` — SSOT ของเมนู 7 ตัว + แท็บย่อย "จัดการเคส" 3 ตัว พร้อม `resolveMenuAudience()`/`visibleMenus()`/`canViewMenu()`/`findMenu()` ถอดจาก `06` §7.2 + §7.1.1 ตรง ๆ · เทสต์ = ตารางในเอกสาร (9 คอลัมน์ × 7 เมนู + submenu matrix)
- **App Shell** `components/shell/*` + route group `app/(app)/` — Top Nav (desktop + จอเล็ก) → Sub-Nav (หาเมนูที่เปิดอยู่จาก pathname) → เนื้อหา · ห่อ `PermissionProvider` + `ToastProvider` ให้ทุกหน้าอัตโนมัติ
- **หน้าใหม่**: `/dashboard` (placeholder + session/menu panel), `/cases`, `/finance`, `/accounting`, `/warehouse`, `/reports`, `/settings` (ModulePlaceholder + `requireMenuPage()`), `/field` + `/portal` (placeholder นอก shell — กัน 404 หลัง login ของ Field Agent/Company User), `/` redirect ตาม `resolveLandingPath()`
- **`GET /api/meta/menu`** (`06` §14) + เทสต์ 5 เคส (matrix + 401)
- Font Inter + Noto Sans Thai ผ่าน `next/font` (self-host ตอน build) ผูกเข้า `@theme --font-sans` ของ Tailwind v4 · เพิ่ม `.no-scrollbar` + scrollbar บางใน `globals.css` · `LogoutButton` เปลี่ยนมาใช้ `<Button variant="secondary">`

### การตัดสินใจระหว่างทาง

- **กรองเมนูด้วย role ไม่ใช่ capability** — `06` §7.2 เป็น source of truth ของการมองเห็นเมนูและเขียนเป็นราย role · capability (DEC-009) ตอบคำถามคนละข้อ ("ทำอะไรได้ในหน้านั้น") ซึ่งบังคับที่ `requirePermission()` + `<Can>` อยู่แล้ว · อีกเหตุผลเชิงปฏิบัติ: `role_capabilities` ยังว่างจนถึง Phase 1.6 ถ้ากรองด้วย capability ตอนนี้ทุก role ที่ไม่ใช่ Superadmin จะไม่เห็นเมนูเลย
- **role "ธุรการ" ไม่มีในตาราง `06` §7.2** → ยึด mockup `app-shell.html` (`ROLE_CONFIG.admin_office`): แดชบอร์ด + จัดการเคส (แท็บรับเคส) ตามหน้าที่คีย์ข้อมูลเคส (`07` §5.1 อ้างไฟล์ 38) — บันทึกไว้เป็น assumption ในโค้ด + REUSE_INDEX
- **"มอบหมายงาน" ไม่ให้ Case Approver เห็น** — `06` §7.1 (บรรทัดบรรยาย) กับ §7.1.1 (ตาราง) ขัดกัน · §17 ของไฟล์ 06 ระบุชัดว่า §7.1.1 เป็น source of truth และ mockup ก็ให้ `caseSubmenus: ['submit']` เท่านั้น
- **custom role (ที่จะสร้างเพิ่มภายหลัง) → `resolveMenuAudience()` คืน `null`** = เห็นเฉพาะเมนูที่ทุกคอลัมน์เห็น (ปัจจุบัน = แดชบอร์ด) — least privilege จนกว่า Phase 1.6 จะผูก capability
- **`GET /api/meta/menu` ใช้ `requireSession()` ไม่ผูก capability** — ไม่มี capability code สำหรับ "เมนู" ใน `02` §12 และการสร้าง code ใหม่เป็นงานของ Phase 1.6 · endpoint คืนข้อมูลของผู้เรียกเองล้วน (เหมือน `GET /api/auth/session` ที่ทำแบบเดียวกันมาตั้งแต่ 1.3)
- **ไม่ใส่สูตรคำนวณเงินใน display layer** — ตัด `fmtMarginPct` ที่เคยร่างไว้ออก เหลือ `fmtRatioPct(value|null)` ที่รับผลลัพธ์จาก pure module ของ `22` มาแสดงอย่างเดียว (กันสูตรซ้ำก่อน Phase 3.1)
- **Field Tracker (41) / Client Portal (97) ไม่อยู่ใน route group `(app)`** — ทั้งสองมี shell ของตัวเองตามสเปก (mobile-first sidebar / portal nav) จึงวางเป็น route ระดับบนแยก

### verify ที่รันจริง (DoD ของ PLAN §1.5)

`pnpm typecheck` ✅ · `pnpm lint` ✅ (0 error 0 warning) · `pnpm test` ✅ 318/318 (21 ไฟล์ — ใหม่ 5 ไฟล์ 118 เคส) · `pnpm build` ✅ (17 route, font โหลดผ่าน `next/font` สำเร็จ)

### จุดที่คนถัดไปควรรู้

- **ทุกหน้าใหม่ต้อง import จาก `@/components/ui` เท่านั้น** — เขียนคลาส Tailwind เองในหน้าจอโมดูล = หลุด design system (`04` §8.1) · ตารางต้องใช้ `<TableState>` เพื่อให้ครบ loading/empty/error (`04` §9)
- **วันที่ทุกจุดต้องผ่าน `fmtDate`/`fmtDateTime`** และ **เงินทุกจุดผ่าน `fmtSatang`** — ห้าม format เอง (มีเทสต์ยามอยู่แล้วแต่กันได้เฉพาะใน util)
- เพิ่มเมนู/แท็บใหม่ = แก้ `lib/nav/menu-registry.ts` ที่เดียว แล้วอัปเดตตารางในเทสต์ให้ตรง `06` — เทสต์แดง = หลุด spec ไม่ใช่เทสต์พัง
- หน้า `/cases`, `/finance`, `/accounting`, `/warehouse`, `/reports`, `/settings` เป็น **placeholder** — โมดูลที่มาทำต่อให้แทนที่ `<ModulePlaceholder>` ด้วยของจริง และเปลี่ยน `available: true` ใน registry (แท็บย่อยที่ `available: false` ยัง disabled อยู่)
- ยังไม่ได้ทดสอบด้วยตาบน browser จริง (ต้องมี Supabase + DB ครบ) — build/typecheck/test เขียวทั้งหมด แต่การไล่ดู nav ต่อ role จริงควรทำตอน push ขึ้น staging
- กระดิ่งแจ้งเตือนบน header (`06` §8 · `90` §6.3) ยังไม่มี — เป็นงาน Phase 5.1

---

## Phase 1.4 — Audit Core Service (immutable)

**วันที่**: 2026-08-14 · **commit**: `09b283a` · **branch**: `auto/phase-1.4`

### สิ่งที่ทำ
- **Immutable guard 2 ชั้น** (`02` §13 · `90` §10/§17):
  - **ระดับ DB** — migration `20260814091702_audit_logs_immutable`: function `audit_logs_immutable()` + trigger 3 ตัว (`trg_audit_logs_no_update` / `_no_delete` / `_no_truncate`) แบบ **statement-level** ยกเว้น `AUDIT_IMMUTABLE` (ERRCODE 42501)
  - **ระดับ service** — `lib/audit/immutable.ts` (`auditLogImmutableExtension` = Prisma extension `$allOperations` ของ model `auditLog`) ต่อเข้า `lib/prisma.ts` แล้ว ⇒ `prisma.auditLog.update/updateMany/updateManyAndReturn/delete/deleteMany/upsert` โยน `AuditError('AUDIT_IMMUTABLE')` · `create`/read ผ่านปกติ
- **นโยบาย `reason`** — `lib/audit/reason-policy.ts` (pure) แปล `90` §13 เป็นกติกา 4 ข้อ: (1) action แทรกแซง `delete`/`reject`/`lock`/`unlock` ต้องมีเสมอทุกตาราง (2) ตาราง master/ตั้งค่า 17 ตัว ต้องมีทุก mutation (3) ตารางธุรกรรม 16 ตัว ต้องมีเมื่อ `update`/`delete` (แก้ย้อนหลังด้วยมือ) (4) `users`/`teams`/`finance_companies`/`organizations`/`cases` ต้องมีเมื่อฟิลด์ที่เปลี่ยนอยู่ในรายการอ่อนไหว + (5) actor = system (NULL) ต้องระบุ job id ใน reason ยกเว้น login/logout
- **before/after diff util** — `lib/audit/diff.ts` (pure): `diffRecords()` เก็บเฉพาะฟิลด์ที่เปลี่ยน (ข้าม `updated_at`) · `toAuditJson()` แปลง Date→ISO UTC, Decimal/BigInt→string, binary→marker, กัน circular · ปิดบัง password/token/apiKey ทุกชั้น (`90` §6.2 PDPA)
- **`emitAudit()` ตัวเต็ม** — `lib/audit/audit.ts`: validate ก่อนเขียน (`lib/audit/validate.ts`) → normalize JSON → create · รับ **tx client เป็น argument ที่ 2** เพื่อให้ audit อยู่ใน `$transaction` เดียวกับ mutation ได้ (`44` §11) · action `update` เก็บเฉพาะฟิลด์ที่เปลี่ยนอัตโนมัติ (`diffOnly: false` = snapshot เต็ม)
- **error code** — `lib/audit/errors.ts` (`AUDIT_REASON_REQUIRED` 400 / `AUDIT_IMMUTABLE` 403 / `REQUIRED_MISSING` 400) + เพิ่ม **`24` §6.10 หมวด Audit** (v3.3) ตาม Rule 04
- **โครงเทสต์ที่แตะ DB จริง** — `pnpm db:deploy:test` (`PRISMA_USE_TEST_DB=1` ใน `prisma.config.ts` → ชี้ `TEST_DATABASE_URL`) · `vitest.config.mts` ส่งต่อ **เฉพาะ** `TEST_DATABASE_URL` จาก `.env.local` · CI เพิ่มขั้น `Migrate test DB` และเปลี่ยนชื่อ DB ของ CI เป็น `assetrecovery_test`

### การตัดสินใจระหว่างทาง
- **trigger เป็น `FOR EACH STATEMENT` ไม่ใช่ `FOR EACH ROW`** — row trigger ไม่ยิงเมื่อ `WHERE` ไม่โดนแถวไหน ทำให้ `DELETE FROM audit_logs WHERE ...` ผ่านเงียบ ๆ · เพิ่ม trigger `TRUNCATE` ด้วยเพราะ TRUNCATE ข้าม row trigger โดยธรรมชาติ
- **ต้องมี guard ทั้ง 2 ชั้น** — Prisma extension กันได้เฉพาะทางที่ผ่าน Prisma Client (raw SQL / psql / งาน ops ยังลบได้) จึงยึด DB เป็นชั้นสุดท้ายตาม `90` §16 ("reject ที่ระดับ backend ไม่ใช่แค่ UI")
- **นโยบาย reason แยก "master data" กับ "ธุรกรรม"** — ถ้าบังคับ reason ทุก mutation ของตารางเงินทั้งหมด flow ปกติ (ระบบสร้าง expense/revenue เอง, agent ปิดเคส) จะต้องกรอกเหตุผลทั้งที่ spec ต้นทาง (`15`/`16`/`41`) ไม่มีช่องให้กรอก — จึงบังคับเฉพาะจุดที่เป็น "การแทรกแซงของคน"
- **ตารางกลุ่มข้อ 4 ไม่บังคับ reason ตอน `create`** — ฟอร์มสร้าง user/ทีม/บริษัทตามไฟล์ 08/09/10 ไม่มีช่องเหตุผล · แต่ถ้าไม่ส่ง before/after มาเลยตอน `update` จะถือว่า "อาจแตะฟิลด์อ่อนไหว" แล้วบังคับ reason ไว้ก่อน (fail-safe)
- **`REQUIRED_MISSING` ใช้ code เดิมจาก `24` §6.1** ไม่ตั้ง code ใหม่สำหรับ field ที่ขาดใน audit entry
- **ยามความครบถ้วนใน `reason-policy.test.ts`** — ไล่ `@@map` ทุก model ใน `schema.prisma` แล้วบังคับว่าต้องถูกจัดหมวด ⇒ ตารางใหม่ที่ยังไม่จัดหมวดจะทำให้เทสต์แดงแทนที่จะหลุดกติกาเงียบ ๆ

### verify ที่รันจริง (DoD ของ PLAN §1.4)
- `pnpm typecheck` เขียว · `pnpm test` **201 tests / 16 files** ผ่านหมด · `pnpm lint` เขียว
- **DoD ข้อ 1 (UPDATE/DELETE ถูก reject ที่ DB)**: `lib/audit/audit-immutable.db.test.ts` รันกับ Postgres จริง — UPDATE/DELETE ที่ไม่ match แถวไหนก็ถูกปฏิเสธ, TRUNCATE ถูกปฏิเสธ, trigger ครบ 3 ตัว, และ `prisma.auditLog.delete()/updateMany()` โดน guard ระดับ service
- **DoD ข้อ 2 (mutation ผ่าน helper แล้วมี record ครบ 9 fields)**: เทสต์ INSERT ผ่าน `$transaction` แล้ว rollback — ตรวจครบทั้ง 9 fields รวม `created_at` จาก DB default · ฝั่ง service ตรวจ payload ที่ `emitAudit()` เขียนใน `audit.test.ts`
- เทสต์ pure: `diff.test.ts` (16) · `reason-policy.test.ts` (52 รวมยามความครบถ้วนของตาราง) · `validate.test.ts` · `immutable.test.ts` · `audit.test.ts`

### จุดที่คนถัดไปควรรู้
- **ทุก mutation หลังจากนี้เรียก `emitAudit()` เท่านั้น** — ห้ามเขียน `prisma.auditLog.create()` ตรง · อยู่ใน `$transaction` ให้ส่ง tx client เป็น argument ที่ 2
- **เพิ่มตารางใหม่ใน `02` = ต้องจัดหมวดใน `lib/audit/reason-policy.ts` ด้วย** ไม่งั้น `pnpm test` แดง
- **`audit_logs` ลบไม่ได้จริง ๆ แม้ในเทสต์** — เทสต์ที่ต้อง insert audit ให้ทำใน `$transaction` แล้ว throw เพื่อ rollback (ดูตัวอย่างในไฟล์เทสต์)
- **เทสต์ที่แตะ DB ต้องรัน `pnpm db:deploy:test` ก่อน** และต้องมี `TEST_DATABASE_URL` (ไม่มี = ข้ามเทสต์นั้นเงียบ ๆ พร้อม warning) · guard ในไฟล์เทสต์ปฏิเสธ host ที่ไม่ใช่ localhost และ DB ที่ชื่อไม่มีคำว่า `test`
- ยังไม่ได้ทำในก้อนนี้ (ตาม PLAN): endpoint `GET /api/audit-logs` (+ detail) ของ `90` §14 และ Notification service — จะเกิดใน Phase 5 (`90`/`91`)

---

## Phase 1.3 — Auth & Access Control + Permission Middleware

**วันที่**: 2026-08-14 · **commit**: `edfdd9b` · **branch**: `staging`

### สิ่งที่ทำ
- **ชั้นสิทธิ์ (pure — ไม่แตะ DB/HTTP ทดสอบได้ล้วน)**: `lib/auth/permission.ts` (`hasCapability` / `canAccess` / `checkPermission` / `isSessionExpired`) · `lib/auth/scope.ts` (`resolveScope` / `isWithinScope`) · `lib/auth/superadmin-guard.ts` · `lib/auth/landing.ts` · `lib/auth/errors.ts`
- **จุดบังคับสิทธิ์เดียวของระบบ**: `lib/auth/require-permission.ts` — `requirePermission(action, resource, scope)` + `withPermission()` (ห่อ route handler) + `withAuthErrors()` · ลำดับปฏิเสธ: บัญชีไม่ active → session หมดอายุ → capability → scope ย่อย
- **Session**: `lib/auth/session.ts` — Supabase JWT = ตัวตน / role+scope จาก Prisma = สิทธิ์ (แยกกันตาม DEC-002 ไม่ใช้ RLS) · `lib/auth/session-cache.ts` cache role+scope TTL 5 นาทีต่อ instance + `invalidateSessionCache()`
- **Audit**: `lib/audit/audit.ts` — `emitAudit()` ครบ 9 fields + ip/user-agent · ใช้จริงที่ login สำเร็จ/ล้มเหลว/logout (ทั้ง 3 ทางตาม `05` §13–14)
- **API**: `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/session` (ตาม `05` §14)
- **Proxy**: `proxy.ts` refresh session cookie ของ Supabase + route guard หน้าเว็บ (redirect `/login?next=`) — `/api/*` ไม่ redirect เพราะต้องตอบ 401/403 เป็น JSON
- **FE**: `app/login/page.tsx` + `components/auth/login-form.tsx` (โครง/คลาสตาม mockup `login.html` รวม shake/fade-in/focus-ring ที่ย้ายมาไว้ใน `app/globals.css`) · `components/auth/permission-provider.tsx` (`<PermissionProvider>` / `usePermission()` / `<Can>`) · `components/auth/logout-button.tsx` · `app/dashboard/page.tsx` = placeholder ที่ guard จริงด้วย `requireSessionPage()`
- **เครื่องมือ**: `scripts/link-superadmin.ts` + `pnpm auth:link-superadmin` — ผูก seed user เข้ากับ Supabase Auth (idempotent)
- **spec**: `24` v3.2 เพิ่ม **§6.9 หมวด Auth & Access Control** (รวบ `PERMISSION_DENIED`/`LAST_SUPERADMIN_REMOVAL` เดิม + เพิ่ม `UNAUTHENTICATED`/`SESSION_EXPIRED`/`INVALID_CREDENTIALS`/`ACCOUNT_INACTIVE`/`USER_NOT_PROVISIONED`) · `REUSE_INDEX` เพิ่ม 15 รายการ + 2 กับดัก

### การตัดสินใจระหว่างทาง
- **Scope 4 แบบ map จาก role_group** (`05` §5 + `07` §6): `system` → `global` (ข้อจำกัดเชิงหน้าที่มาจาก capability ไม่ใช่ scope) · ผู้จัดการ/หัวหน้าทีม → `team` (union ของ `team_managers` + `teams.supervisor_id` + `users.team_id`) · พนักงานติดตามทรัพย์ → `self` · `finance_company` → `company`
- **Session timeout 24 ชม. วัดจาก `users.last_login_at`** ไม่ใช่ cookie แยก — ไม่ต้องเพิ่ม state ใหม่ ตรวจซ้ำได้ทุก request และ audit ย้อนกลับได้ (`05` §10/§17)
- **failed login ใช้ `action = login` + `after.result = 'failed'`** เพราะ enum `audit_action` ใน `02` §3 ไม่มี `login_failed` — ห้ามสร้าง enum ใหม่เอง (event ชื่อ `auth.login.failed` ตาม `05` §14 เก็บใน `after.code`)
- **failed login ของอีเมลที่ไม่มีในระบบ**: หา `organization_id` จาก user ที่อีเมลตรงก่อน ถ้าไม่มีใช้ organization เดียวของระบบ (`02` §12) — เพื่อให้ audit ลงได้ทุกครั้งตาม `05` §13 โดยไม่ leak ว่ามีอีเมลนี้จริงหรือไม่ (ข้อความตอบกลับเป็น `INVALID_CREDENTIALS` เสมอ)
- **`toAuthErrorResponse()` โยน error ที่ไม่ใช่ `AuthError` ต่อ** — ไม่กลืน DB error เป็น 401/403 ปลอม (มี test คุม)
- **แยก `superadmin-guard.ts` (pure) ออกจาก `superadmin-queries.ts` (Prisma)** เพราะ `lib/prisma.ts` สร้าง client ตอน import ⇒ ไฟล์ที่ import มันจะเทสต์ใน vitest ไม่ได้ถ้าไม่มี `DATABASE_URL`
- **`lib/supabase/server.ts` เรียก `await cookies()` ก่อน `getPublicEnv()`** — runtime API ต้องมาก่อน ไม่งั้น `next build` พยายาม prerender `/dashboard` แล้วตายที่ env (พังจริงตอน build ครั้งแรก)

### verify ที่รันจริง (DoD ของ PLAN §1.3)
- `pnpm typecheck` เขียว · `pnpm vitest run` **85 tests / 10 files** ผ่านหมด · `pnpm lint` เขียว · `pnpm build` (Next 16 + Turbopack) ผ่าน — route ทั้ง 5 เส้นเป็น dynamic ตามที่ควร
- **test ครอบ scope ทั้ง 4 แบบ** (`scope.test.ts`): global เห็นทุกแถว · team เฉพาะทีมที่ดูแล/แถวตัวเอง · company ข้ามบริษัทถูกปฏิเสธ · self เฉพาะของตัวเอง
- **test สิทธิ์ 3 ระดับ DEC-009** (`permission.test.ts`): ไม่มี record = มองไม่เห็น · `view` ดูได้แต่สั่งการไม่ได้ · `manage` ผ่านทั้งคู่ · Superadmin ผ่านทุก capability โดยไม่มี record
- **test endpoint ไม่มีสิทธิ์ตอบ 403 แม้เรียกตรง** (`require-permission.test.ts`): การเงิน/Field Agent เรียก endpoint ของ `manage_roles` → 403 + ไม่มี `data` ใน body · ไม่ได้ login → 401 · บัญชีถูกระงับ → 403 `ACCOUNT_INACTIVE`
- test session timeout ที่ขอบ 24 ชม. พอดี/เกิน · test cache หมด TTL แล้วโหลดใหม่ · test `LAST_SUPERADMIN_REMOVAL` ทั้งทางปิดใช้งานและย้าย role

### จุดที่คนถัดไปควรรู้
- **ทุก endpoint ที่เขียนต่อจากนี้ต้องขึ้นต้นด้วย `requirePermission()`** — ไม่มีข้อยกเว้น (DEC-002) · scope ย่อยส่งผ่านพารามิเตอร์ที่ 3 (`{ teamId }` / `{ companyId }` / `{ userId }`)
- **ต้องรัน `pnpm auth:link-superadmin <email> <password>` 1 ครั้งต่อ environment** (local/staging/production) ไม่งั้น seed user จะ login ไม่ได้ (`supabase_uid` เป็น NULL → ตอบ `USER_NOT_PROVISIONED`) — ยังไม่ได้รันบน staging ในเซสชันนี้ (ต้องใช้ service role key + ตั้งรหัสผ่านโดยคน)
- **ยังไม่ผูก role ↔ capability** (`role_capabilities` ว่างตามงาน 1.2) ⇒ ตอนนี้มีแต่ Superadmin ที่ทำอะไรได้จริง — role อื่นจะได้สิทธิ์เมื่อ **Phase 1.6** seed matrix เต็ม
- **เปลี่ยน role / สถานะ / ทีม / บริษัทของผู้ใช้ ต้องเรียก `invalidateSessionCache(supabaseUid)`** ไม่งั้นสิทธิ์เก่าค้างได้สูงสุด 5 นาที (Users module 1.9 / Roles module 1.6 ต้องไม่ลืม)
- ปลายทาง redirect `/portal` (บริษัทไฟแนนซ์) และ `/field` (พนักงานติดตามทรัพย์) **ยังไม่มีหน้าจริง** — เกิดใน Phase 6.x / 2.10 · ตอนนี้มีแต่ `/dashboard` (placeholder ที่ Phase 1.5 จะแทนที่ด้วย App Shell)
- Phase 1.4 ให้ **ต่อยอด `lib/audit/audit.ts`** ไม่ใช่สร้างไฟล์ใหม่ (validator `reason` + diff util + trigger กัน UPDATE/DELETE ระดับ DB)

---

## Phase 1.2 — Prisma Schema ชุดที่ 2: Group C–G + Seed Data

**วันที่**: 2026-08-14 · **commit**: `1eba90e` · **branch**: `staging`

### สิ่งที่ทำ
- `prisma/schema.prisma` — **+34 ตาราง** (Group C Case 7 · D Warehouse 2 · E Finance 8 · F Accounting 11 · G Platform 4 · +2 ตารางตามมติ PO) รวมทั้งระบบเป็น **53 ตาราง / 55 enums** · เติม back-relation ของ `created_by`/`updated_by` ครบทุกตารางใน Group A/B
- Migration `20260813231247_group_c_g_tables` — DDL + **raw SQL ที่ Prisma ไม่รองรับ**: generated column `advances.return_satang` · partial unique `uniq_active_advance_per_payee` + `uniq_assets_active_imei` · CHECK `assets_identifier_required` / `pbi_one_source` / `adjustments_one_target` / `bank_tx_one_match` / `bank_tx_status_fk_shape` / `bank_tx_alloc_shape` / `bank_tx_alloc_amount_positive` · DO block เติม `updated_at DEFAULT NOW()` ให้ตารางใหม่
- `prisma/seed.ts` — **idempotent (upsert ทุกจุด)**: organization 1 · **roles 15** (`is_seed=true`, ธุรการ = editable) · seed user Superadmin (`supabase_uid` ยัง NULL รอ 1.3) · VAT 7% (effective 2025-10-01) · tax profiles 2 · finance_policy_settings 1 · **capabilities 47** = 37 ใน Functional Matrix (`13` §6.10 + `25`: ops 6 / finance 12 / accounting 11 / admin 8) + 10 รายการนอก matrix ที่ `02` §12 ระบุ (warehouse/user/team/settings — `functional_group = NULL`)
- `prisma/schema.test.ts` — ขยายยาม: Decimal ใช้ได้เฉพาะ pct `(5,2)` และพิกัด GPS `(10,7)` · ทุก model ต้องมี `organizationId` (ยกเว้น 5 ตารางที่ `02` §2.4 ยกเว้น) · **CHECK/partial index/generated column ต้องยังอยู่ในโฟลเดอร์ migrations** (กัน `migrate dev` เขียนทับจนหาย)
- อัปเดต spec ตามมติ PO 2026-08-12: `02` v3.8 (+changelog +migration order) · `02_OPEN_DECISIONS` A2/A4/A6/B3 → ✅ · `00_MAP` (บรรทัดของ `02` เลื่อน) · `README` 51→53 tables · `REUSE_INDEX`

### สิ่งที่เพิ่มจากมติ PO (นอกเหนือ spec เดิม)
| ข้อ | ที่ไหน | สิ่งที่เพิ่ม |
|---|---|---|
| A1 | `billing_batches`, `cash_receipts` + ตารางใหม่ `customer_wht_certificates` | `wht_withheld_by_customer_satang` + ที่เก็บใบ 50 ทวิ **ฝั่งรับ** (ไฟแนนซ์ออกให้เรา = เครดิตภาษี) |
| A2 | ตารางใหม่ `bank_transaction_allocations` + `bank_transactions.is_split_allocation` | เงินเข้าก้อนเดียวตัดได้หลายรอบบิล/บางส่วน · ส่วนเกิน = แถว `is_credit` (ไม่ให้ AR ติดลบ) · CHECK `bank_tx_status_fk_shape` ขยายรองรับโหมดแบ่งยอด |
| A4 | `payout_batch_items`, `advances`, `bank_transactions` | `expense_id` เป็น nullable + `advance_id` + CHECK `pbi_one_source` · `advances.payout_batch_item_id` · `matched_advance_id` |
| A6 | `cases`, `assets` | `serial_no` / `serial_contract` / `serial_actual` · `imei_contract` nullable · partial unique แทน UNIQUE เต็มตาราง + CHECK ต้องมี identifier |
| B3 | `revenues`, `payout_batch_items` | `tracking_round` (default 1) |

### การตัดสินใจระหว่างทาง
- **ชื่อคอลัมน์ A4 ใช้ `expense_id`/`advance_id` ไม่ใช่ `source_*`** ตามข้อเสนอเดิม — `02` เป็น SSOT ของชื่อคอลัมน์และคอลัมน์เดิมชื่อ `expense_id` อยู่แล้ว (บันทึกไว้ใน changelog `02` v3.8)
- **A2 ต้องมี `is_split_allocation`** เพราะ CHECK `bank_tx_status_fk_shape` เดิมบังคับว่า matched ⇒ ต้องมี FK — ถ้าจับคู่ผ่านตารางกลางอย่างเดียว CHECK จะปฏิเสธทันที (CHECK มองข้ามตารางไม่ได้)
- **capabilities = 47 ไม่ใช่ 37**: 37 คือจำนวนแถวใน Functional Matrix (`13` §6.10) ส่วน `02` §12 ระบุ capability ฝั่ง warehouse/user/team/settings เพิ่ม — เก็บทั้งคู่โดยใช้ `functional_group = NULL` แยกกลุ่ม (คอลัมน์นี้ nullable มาตั้งแต่ v3.5)
- **ไม่ seed `role_capabilities`** — `02` §12 ไม่ได้กำหนด และการผูก role ↔ capability เต็ม matrix เป็นงาน Phase 1.6 (Superadmin ไม่มี record โดยนิยาม — DEC-009)
- `expenses.payout_batch_item_id` / `advances.payout_batch_item_id` ประกาศเป็น**คอลัมน์ UUID เปล่า ไม่ใช่ relation** ตาม DDL ของ `02` (เลี่ยง 1:1 วนกลับกับ `payout_batch_items.expense_id`)
- model `StoredFile` ↔ ตาราง `files` — เลี่ยงชื่อชนกับ `File` ของ Web API ในโค้ดอัปโหลด

### verify ที่รันจริง (DoD ของ PLAN §1.2)
- `prisma validate` เขียว · `migrate dev` ผ่าน · `migrate status` = up to date (3 migrations) · `pnpm db:seed` **รัน 2 รอบได้ผลเท่ากัน** (idempotent จริง)
- **ตรวจไขว้อัตโนมัติกับ spec**: สคริปต์เทียบ `CREATE TABLE` ใน `02` §6–§10 กับ `information_schema` → 34/34 ตาราง **ทุกคอลัมน์ตรง ไม่ขาดไม่เกิน**
- query DB จริง: 53 ตาราง · roles 15 (system 6 / inhouse 3 / outsource 3 / finance_company 3) · capabilities 47 (matrix 37 = ops 6 / finance 12 / accounting 11 / admin 8) · VAT 7% · tax profiles 2 · policy 1
- ทดสอบ constraint ด้วยข้อมูลจริง: INSERT `adjustments` ที่ไม่มี target → ถูกปฏิเสธด้วย `adjustments_one_target` · generated column `return_satang` มีจริงใน `information_schema` (`GREATEST(0, COALESCE(approved_satang,0) - used_satang)`)
- `pnpm typecheck` / `pnpm test` (35 เคส) / `pnpm lint` เขียวครบ

### จุดที่คนถัดไปควรรู้
- **`advances.return_satang` เขียนค่าไม่ได้** — Prisma ไม่รู้ว่าเป็น generated column จึงยอมให้ใส่ใน `create`/`update` แล้วไปตายที่ DB · เซ็ตแค่ `requestedSatang`/`approvedSatang`/`usedSatang`
- Immutable Rules (`02` §13) เขียนเป็นคอมเมนต์ `⚠️ Immutable` ไว้ที่ model ที่เกี่ยวแล้ว (`case_evidences`, `handover_lots`, `payout_batches`, `tax_invoices`, `wht_certificates`, `export_records`, `bank_transactions`, `audit_logs`, `accounting_periods`) — **การบังคับจริงเป็นงานของ task โมดูลนั้น ๆ**
- ⚠️ **spec ไม่ตรงกันเรื่องจำนวน "✅ only"**: `25` §16.1 เขียน 7 รายการ แต่ mockup `settings.html` ติดธง `superadminOnly` แค่ 6 (ad1/ad2/ad4/ad5/ad6/ad7) — ไม่บล็อก 1.2 (seed ไม่ได้เก็บ flag นี้) แต่ **ต้องเคาะตอน 1.6** ตอน implement การล็อกสิทธิ์จริง
- seed user `superadmin@assetrecovery.local` (`00000000-...-0002`) ยังไม่มี `supabase_uid` — งาน 1.3 ต้องผูกกับ Supabase Auth ก่อน login ได้จริง

---

## Phase 1.1 — Prisma Schema ชุดที่ 1: Enums + Group A + Group B

**วันที่**: 2026-08-14 · **commit**: `35dfb6e` · **branch**: `staging`

### สิ่งที่ทำ
- `prisma/schema.prisma` — **enum 55 ตัว** (54 ตามสเปค `02` §3 + `due_rule_type` ตามมติ A5) + **19 ตาราง**: Group A Identity 5 (`organizations`, `roles`, `users`, `capabilities`, `role_capabilities`) + Group B Master Data 14
- Migration 2 ใบ:
  - `20260813215646_init_enums_group_a_b` — DDL หลัก + **raw SQL ที่ Prisma ไม่รองรับ**: CHECK `cycles_cutoff_shape` (`02` §5) · CHECK `cycles_due_rule_shape` (A5) · แปลง FK ที่ปิดวง circular (users↔teams) 7 เส้นเป็น **DEFERRABLE INITIALLY DEFERRED** (`02` §11)
  - `20260813220500_updated_at_db_default` — เติม `DEFAULT NOW()` ให้ `updated_at` ครบ 15 ตาราง
- `prisma/schema.test.ts` — ยาม 8 เคส: satang ต้องเป็น Int · ห้าม Float · Decimal ได้เฉพาะ pct และต้อง `(5,2)` · DateTime ต้องระบุ `Timestamptz(6)`/`Date` · model/enum ต้องมี `@@map` snake_case · field camelCase ต้องมี `@map`
- `prisma.config.ts` — โหลด `.env` + `.env.local` (Next.js ใช้ตัวหลัง) ไม่งั้น Prisma CLI ไม่เห็น `DATABASE_URL`
- อัปเดต spec ตามมติ PO 2026-08-12 (`02` v3.7 + changelog + `02_OPEN_DECISIONS` A1/A5 → ✅, A3/B4/D12 ติ๊กในตารางมติ) + regenerate ช่วงบรรทัดของ `02` ใน `docs/00_MAP.md`

### คอลัมน์ที่เพิ่มจากมติ PO (นอกเหนือ spec เดิม — เฉพาะที่ตกอยู่ใน Group B)
| ข้อ | ที่ไหน | สิ่งที่เพิ่ม |
|---|---|---|
| A1 | `finance_companies` | `wht_withheld_by_customer_pct` NUMERIC(5,2) default 3.00 (NULL = ไม่หัก) — ส่วนที่เหลือของ A1 (billing/receipt + ใบ 50 ทวิฝั่งรับ) อยู่ที่ 1.2/3.6/4.2 |
| A3 | `service_fee_templates` | `charge_per_tracking_round` BOOLEAN default true |
| A5 | `billing_payout_cycles` | enum `due_rule_type` + `due_rule_value` INTEGER + คง `due_rule` เดิมเป็น label + CHECK |
| B4 | `finance_policy_settings` | `write_off_tolerance_satang` INTEGER default 5000 |
| D12 | `finance_policy_settings` | `advance_uncleared_to_employee_receivable` BOOLEAN default true |

### บั๊ก/กับดักที่เจอระหว่างทาง
1. **Prisma `@updatedAt` ไม่ออก DB default** — `updated_at` เป็น `NOT NULL` เปล่า ๆ ⇒ INSERT ด้วย SQL ตรง (seed/ops/psql) ล้มทันที ทั้งที่ `02` §2.4 กำหนด `DEFAULT NOW()` · เจอตอนทดสอบ CHECK ด้วย raw SQL แล้วโดน not-null violation ก่อนถึง CHECK
2. **แก้ migration ที่ apply แล้ว = checksum drift** → Prisma บังคับ `migrate reset` ซึ่งเป็นคำสั่งทำลายข้อมูลและต้องขอ consent · เลี่ยงด้วยการแยกเป็น migration ใบใหม่ (ไม่ต้อง reset ไม่ต้องขอ consent)
3. **`docker exec` ไม่มี `-i`** → heredoc ไม่ถูกส่งเข้า psql เลย คำสั่งจบเงียบ exit 0 ไม่มี output — เสียเวลาเข้าใจผิดว่า SQL ไม่ทำงาน
(ทั้งสามข้อบันทึกใน `docs/REUSE_INDEX.md` แล้ว)

### verify ที่รันจริง (DoD ของ PLAN §1.1)
- `prisma validate` เขียว · `prisma migrate dev` + `migrate deploy` ผ่าน · `migrate status` = up to date (2 migrations)
- **ตรวจไขว้อัตโนมัติกับ spec** (แทน subagent — ใช้สคริปต์เทียบตรง ๆ กับ DB จริง): ตาราง 19/19 ตรง · **ทุกคอลัมน์ทุกตารางตรง spec ไม่ขาดไม่เกิน** (ยกเว้น 5 คอลัมน์ตามมติ PO ที่ระบุไว้ข้างบน) · enum 54/54 **ค่าและลำดับตรงเป๊ะ** + `due_rule_type` ที่เพิ่มตามมติ
- **ทดสอบ constraint ด้วยข้อมูลจริง**: circular insert (org → user ที่ชี้ team ยังไม่เกิด + created_by ชี้ตัวเอง → team) ผ่านใน transaction เดียว = DEFERRABLE ทำงานจริง · CHECK ทั้ง 2 ตัวปฏิเสธข้อมูลผิดรูปจริง (`cycles_cutoff_shape`, `cycles_due_rule_shape`)
- ตรวจ `information_schema`: คอลัมน์ `%satang%` เป็น `integer` ทุกช่อง · `updated_at` มี default 15/15
- `pnpm typecheck` / `lint` / `test` (21 เคส) / `build` เขียวครบ

### จุดที่คนถัดไปควรรู้
- **ตารางที่เพิ่มใน 1.2 ต้องรัน `ALTER ... SET DEFAULT NOW()` สำหรับ `updated_at` ด้วย** (Prisma ไม่ทำให้เอง) — คัดลอก DO block จาก migration ใบที่สองได้เลย
- FK ที่เป็น DEFERRABLE มี 7 เส้น — ถ้า generate migration ใหม่ทับ `users`/`teams` ต้องเติมบล็อก DEFERRABLE ซ้ำ (Prisma ไม่รู้จัก attribute นี้)
- `cutoff_dates` เป็น `Int[]` ซึ่ง Postgres ทำให้ NOT NULL default `{}` เสมอ ⇒ CHECK ต้องเช็ค `array_length > 0` ไม่ใช่ `IS NOT NULL` (เขียนไว้แล้ว)
- ข้อ A2/A4/A6/B3-recycle ยัง ⬜ อยู่ — ตกอยู่ใน Group C–G ต้องเคาะ/ทำตอน **1.2**
- ยังไม่มี seed — `prisma/seed.ts` เป็น stub · master data จริง (15 roles + capabilities 37) อยู่ใน 1.2

---

## Phase 0.3 — Adapt Orchestrator + Dev Panel เข้าโปรเจกต์นี้

**วันที่**: 2026-08-14 · **commit**: `3a54bb2` · **branch**: `staging`

### สิ่งที่ทำ (adapt ตาม `promptmovetools.md` — ไม่เขียนใหม่ ไม่แตะ logic ที่มี comment บทเรียน)
**A. Orchestrator**
- `config.mjs`: **`baseBranch` = `staging`** (สายพัฒนาจริงตาม rules/06 — เดิม `main`) · verify 3 ด่านตรงกับโปรเจกต์นี้อยู่แล้ว (`pnpm typecheck` เต็ม + `vitest run --changed` + eslint ผ่าน xargs) · เขียน comment ด้าน release flow ใหม่ให้ตรงกับ staging→PR→main · `finalTestStages` 6 ด่านใหม่ · `uiTaskPrefixes` = ว่าง
- `lib/prompt.mjs`: แทน `RULES` ทั้งก้อนด้วยกติกาจาก CLAUDE.md ของโปรเจกต์นี้ (satang/พ.ศ./permission API layer/audit 9 fields/snapshot/idempotency/state+error code/ห้าม push) · แก้ชื่อโปรเจกต์ · path เอกสาร (`docs/REUSE_INDEX.md`, `docs/01_PLAN.md`, `docs/00_MAP.md`) · flow ตัวอย่างใน final test เป็นสายงานจริงของเรา · `${stage.key}/4` hardcode → `/${config.finalTestStages.length}`
- `review-prompt.md` + `final-test-prompt.md` + `final-tests/*.md` — เขียนใหม่ทั้งชุดตามธุรกิจนี้ (ลบไฟล์ RTB 5 ไฟล์ สร้างใหม่ 6 ไฟล์: operations / finance / accounting / security / ui-completeness / reliability)
- ข้อความแสดงผล "RTB" → "AssetRecovery" ใน `engine.mjs`, `notify.mjs`, `orchestrate.mjs`, `server.mjs`, `dashboard.html`, `scripts/*.sh`
- `README.md` / `REMOTE.md` / `ADAPT_GUIDE.md` — path เครื่อง, port 4174, ชื่อ container, `.env.local`, หมายเหตุว่าขั้นตอนแปลงเอกสาร 7 ข้อทำครบแล้ว

**B. Dev Panel**
- `server.mjs`: `SERVICES` เหลือตัวเดียว (`app` = Next.js dev :3000 — โปรเจกต์นี้ frontend+backend อยู่ด้วยกัน ไม่มี api/admin/worker แยก) · `TASKS` = generate/migrate/seed/typecheck/test/lint/build ของจริง · Studio = `pnpm db:studio` (Prisma :5555) · **docker ต้องส่ง `-f docker-compose.dev.yml`** เพราะไฟล์ไม่ใช่ชื่อ default · container = `assetrecovery-postgres-dev` · โหลด env จาก `.env` **และ `.env.local`** (Next.js ใช้ตัวหลัง)
- `index.html`: header/ปุ่ม/คำอธิบาย/URL เปิดเว็บตาม service ใหม่ + เพิ่มปุ่ม lint และ prisma generate

### การตัดสินใจเอง (ต้องรายงานตาม DoD ข้อ 7)
1. **`uiTaskPrefixes` = ว่าง** (ไม่เปิด rule "task UI → Fable 5") — task ในแผนนี้เกือบทุกตัวเป็นงานผสม BE+FE และถูกวางขนาดไว้กับงบ context 800k ของ Opus 5 · วิธีเปิดเขียนไว้ใน comment แล้ว
2. **คง env prefix `RTB_*` ทั้ง 33 ตัว** ตามคำแนะนำใน promptmovetools §A5 (เปลี่ยน = ต้อง grep ครบทุกไฟล์รวม docs, ได้ไม่คุ้มเสีย)
3. **คง `globalThis.__rtbHandoffTarget`** — เป็นสัญญาระหว่าง `engine.mjs` ↔ `prompt.mjs` เปลี่ยนชื่อแล้วพลาดจุดเดียว = prompt บอกเป้า context ผิดเงียบ ๆ
4. **เอา `orchestrator/lib/progress.test.mjs` เข้า `pnpm test`** (แก้ `vitest.config.mts` ให้ include `orchestrator/**/*.test.mjs` และเลิก exclude โฟลเดอร์นี้) — เดิมเทสต์นี้ไม่เคยถูกรันในโปรเจกต์นี้เลย ทั้งที่มันคือยามกันบั๊ก "dashboard โชว์ 100% ปลอม / orchestrator หยุดหยิบงาน" · มันรันกับ `PROGRESS.md` **จริง** จึงจับได้ทันทีถ้าแก้ฟอร์แมตพัง
5. **แก้เทสต์ 1 เคสใน `progress.test.mjs`** — เคส "รับ id ทุกแบบ" เดิม assert ว่า id ของโปรเจกต์เดิม (`RET-2b`, `OPS-1`, …) มีอยู่ใน PROGRESS.md จริง ซึ่งเป็นข้อมูลเฉพาะโปรเจกต์นั้น · เปลี่ยนไปทดสอบ parser กับ **ไฟล์ fixture** ที่มี id รูปแบบเดียวกันแทน — บทเรียนยังอยู่ครบและแข็งขึ้น (ไม่ผูกกับข้อมูลโปรเจกต์) ส่วนเคส "ไม่ทิ้งแถวเงียบ ๆ" ยังเทียบกับไฟล์จริงเหมือนเดิม

### verify ที่รันจริง (DoD 7 ข้อของ promptmovetools)
1. `node --check` ทุกไฟล์ `.mjs` ที่แก้ ✅
2. `orchestrate.mjs status` → **AssetRecovery — 2/60 (3%)** + งานถัดไป `Phase 0.3` ถูกต้อง ✅
3. `run --dry-run` → branch `auto/phase-0.3`, model `claude-opus-5`, prompt อ้าง `docs/00_MAP.md`/`docs/01_PLAN.md`/`docs/REUSE_INDEX.md` + กติกาโปรเจกต์นี้ ✅
4. dashboard :4174 → ไม่มี token = **401**, มี token = เห็นหัวข้อ AssetRecovery + `next.id=0.3` + `finalStages` 6 ด่านใหม่ ✅
5. dev panel :4600 → เปิด/ปิด `app` ได้จริง (เห็นสถานะ managed→listening ครบ 3 สถานะ), one-shot `lint` รันจบ, docker postgres up→**ตรวจเจอ container**→down, `/api/quit` ปิดสะอาด ✅ (ยืนยันว่า init script สร้าง `assetrecovery_dev` + `assetrecovery_test` จริง)
6. `grep -ri "RTB|Boonphone|zeegamemsg"` → เหลือเฉพาะ: env prefix `RTB_*`, path เครื่องนี้ใน plist/REMOTE (ตั้งใจ), `__rtbHandoffTarget`, และ false positive (`insertBefore`/`restartBtn`) ✅
7. รายงานการตัดสินใจ = หัวข้อด้านบน ✅

เพิ่มเติม: `pnpm typecheck` / `lint` / `test` (14 เคส) / `build` เขียวครบ · ไม่มี state เก่าจากโปรเจกต์เดิมติดมา (`queue/`, `logs/`, `.token`, `.run.lock`, `review-checkpoint.json` — ไม่มีเลย และ gitignore ครอบครบ)

### จุดที่คนถัดไปควรรู้
- **orchestrator ไม่มี `git push` โดยตั้งใจ** — auto-merge แตะแค่ `staging` ในเครื่อง (reset กลับได้) · เส้นแบ่ง production คือคนกด push เอง
- เริ่มใช้จริงครั้งแรกแนะนำตั้ง `RTB_AUTO_MERGE=false` ก่อน แล้วค่อยเปิดเมื่อมั่นใจ · `state.auto` default ปิดทุกครั้งที่ restart โดยตั้งใจ
- dashboard สั่งรันโค้ดได้ → **ห้ามเปิดออกอินเทอร์เน็ต** ใช้ Tailscale + token เท่านั้น (`REMOTE.md`)
- แก้ `PROGRESS.md` เมื่อไหร่ให้รัน `pnpm test` ด้วยเสมอ — ยาม parser จะจับฟอร์แมตพังให้ (บันทึกใน REUSE_INDEX แล้ว)

---

## Phase 0.2 — Deploy pipeline ฝั่ง Staging

**วันที่**: 2026-08-14 · **commit**: `6e3fedf` (setup) + `6cccf92` (fix build) + `04f5341` (ตรึง Node) · **branch**: `staging`

### สิ่งที่ทำ (ฝั่ง repo)
- `vercel.json` — ตรึง `framework: "nextjs"` ไว้ในโค้ด ไม่พึ่ง Framework Preset ใน UI อย่างเดียว
- `.vercelignore` — ตัด `docs/ reference/ orchestrator/ tools/ _to_delete/` + ไฟล์คุมงาน ออกจาก build context (**ยืนยันจาก build log จริงว่า Vercel เคารพไฟล์นี้บน Git integration** — `Removed 133 ignored files`)
- `docs/03_PRODUCTION_CHECKLIST.md` — checklist 6 หมวดที่ต้องครบก่อนเปิด PR แรกเข้า `main` (มติ PO 2026-08-12 ที่เลื่อน production ออกไป) + ลิงก์จาก `00_INDEX` และ `01_PLAN §0.2`
- **แก้ Vercel build ล้ม**: script `build` = `prisma generate && next build` (+ `postinstall: prisma generate`)
- ตรึง `engines.node` = `24.x` ให้ตรงกับ CI และเครื่อง dev

### สิ่งที่ทำ (ฝั่ง PO — นอก repo)
- Vercel project `asset-recovery` ผูกกับ repo · Production branch = `main` · `staging` เข้า Preview
- Branch ruleset บน `main`: require PR (approvals 0) + block force push + restrict deletion + merge method = Merge อย่างเดียว

### บั๊กที่เจอและแก้ (สำคัญ — อย่าให้เกิดซ้ำ)
Vercel build ล้มที่ `lib/prisma.ts(2,30): error TS2307: Cannot find module '@/lib/generated/prisma/client'`
- **สาเหตุ**: `lib/generated/` ถูก gitignore (Prisma Client เป็นไฟล์ generate) แต่ Vercel รัน `pnpm run build` ตรงๆ ซึ่งตอนนั้นเป็น `next build` เปล่าๆ ไม่มีขั้น generate — local/CI ไม่เจอเพราะมีขั้น `pnpm db:generate` แยกไว้ก่อนหน้า (**false negative ที่ปิดบังว่า `pnpm build` เดี่ยวๆ พังอยู่**)
- **วิธียืนยันสาเหตุ**: ลบ `lib/generated/` บนเครื่องแล้วรัน typecheck → ได้ error บรรทัดเดียวกับ Vercel เป๊ะ
- **แก้**: ให้ `build` เลี้ยงตัวเองได้ (`prisma generate && next build`) — เลือกแก้ที่ `package.json` ไม่ใช่ `buildCommand` ใน `vercel.json` เพื่อให้ Vercel/CI/local ใช้นิยามเดียวกัน
- **ข้อจำกัดของ `postinstall`**: ทดสอบแล้วพบว่าถ้า dependencies ครบอยู่แล้ว pnpm ข้าม lifecycle script ทั้งหมด (แม้ใส่ `--force`) — ตัวที่การันตีจริงคือ script `build`

### verify ที่รันจริง
`pnpm lint` / `typecheck` / `test` / `build` เขียวครบทุก commit · CI บน GitHub เขียว 4 รอบติด (`31732139912`, `31736505966`, `31740188322`, `31740725871`) · Vercel deployment เขียว 2 รอบติดหลังแก้ + เปิดหน้า staging เห็นจริง (PO ยืนยัน) · สแกน git history ทั้งหมดแล้ว **ไม่มี secret หลุด** (ที่ match เป็น localhost/dummy ของ `.env.example`, CI placeholder, test fixture เท่านั้น)

### จุดที่คนถัดไปควรรู้ — **ยังค้าง 2 อย่างฝั่ง Vercel UI (session อัตโนมัติทำแทนไม่ได้)**
1. **Domain ประจำของ staging** — ยังไม่ผูก: Settings → Domains → Add `asset-recovery-staging.vercel.app` → ตั้ง **Git Branch = `staging`** (ตอนนี้ URL ยังเปลี่ยนตาม deployment hash)
2. **env 5 ตัว** — ยังไม่ใส่: `DATABASE_URL` (Transaction pooler **6543**), `DIRECT_URL` (Session pooler **5432** — เลี่ยง direct `db.<ref>.supabase.co` ที่เป็น IPv6-only), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` · scope = **Preview → branch `staging`** เท่านั้น ห้ามติ๊ก Production · ใส่เสร็จต้อง **Redeploy** ค่าถึงมีผล
   - ⚠️ **บล็อก Phase 1.1** — `prisma migrate` ต้องใช้ `DIRECT_URL` จริง · ตอนนี้ยังไม่บล็อกเพราะหน้าแรกไม่เรียก `lib/env.ts`/`lib/prisma.ts` build เลยผ่านทั้งที่ env ว่าง
   - ห้ามใส่ `pgbouncer=true` / `connection_limit=1` — เป็น flag ของ Prisma engine เดิม ไม่มีผลกับ driver adapter (`PrismaPg`/node-postgres) · ขนาด pool คุมในโค้ดผ่าน `PoolConfig` (`PrismaPg` รับ `pg.PoolConfig` ได้ตรงๆ) เมื่อถึงเวลา tune
3. Framework Preset + Node 24 ใน UI ไม่จำเป็นแล้ว — `vercel.json` และ `engines` ในโค้ดคุมให้ทั้งคู่ (ตั้งใน UI ซ้ำได้ ไม่เสียหาย)

---

## Phase 0.1 — Bootstrap โปรเจกต์ Next.js + โครงสร้าง + CI

**วันที่**: 2026-08-13 · **commit**: `7eda8e3` · **branch**: `staging`

### สิ่งที่ทำ
- โครง Next.js 16.3 (App Router + TS strict + Tailwind v4) วางที่ root ของ repo เดิม (ไม่ใช้ `create-next-app` เพราะ repo มีไฟล์อยู่แล้ว — scaffold เองทุกไฟล์)
- ติดตั้ง: Prisma 7.9 + `@prisma/adapter-pg`, `@supabase/supabase-js` + `@supabase/ssr`, Zod 4, vitest 4, ESLint 9 + `eslint-config-next` 16, tsx, dotenv
- โครงโฟลเดอร์ตาม `docs/implementation-todo.md` §0.2: `app/` (layout+page "Staging OK"), `components/`, `lib/` (`prisma.ts`, `env.ts`, `constants.ts`, `supabase/{server,client}.ts`), `proxy.ts` (= `/middleware.ts` ของเอกสาร), `prisma/{schema.prisma,seed.ts}` + `prisma.config.ts`
- `.env.example` (DATABASE_URL/DIRECT_URL/Supabase 3 ตัว + TEST_DATABASE_URL) · `docker-compose.dev.yml` (Postgres 17 port **5433** + init script สร้าง `assetrecovery_test`)
- `.github/workflows/ci.yml` — push/PR เข้า `staging`+`main`: install → `db:generate` → lint → typecheck → test → build (มี service postgres รอไว้ให้ test ที่แตะ DB ตั้งแต่ Phase 1.1)
- scripts: `dev/build/start/lint/typecheck/test/test:watch/db:generate/db:migrate/db:deploy/db:seed/db:studio`
- test ชุดแรก 4 เคสที่ `lib/env.test.ts` (env ครบ/ขาด/URL ผิด + ตรึงค่า `DISPLAY_TIMEZONE`+`BUDDHIST_YEAR_OFFSET` ตาม Rule 01)

### การตัดสินใจระหว่างทาง (ไม่ใช่ระดับ DEC — เป็นรายละเอียดเชิงเครื่องมือ ไม่กระทบ tech stack ตาม DEC-001)
- **`middleware.ts` → `proxy.ts`**: Next 16 deprecate ชื่อ `middleware` แล้ว (build เตือนทุกครั้ง) — ใช้ชื่อใหม่ตาม framework แล้ว comment กำกับว่าเป็นไฟล์เดียวกับที่เอกสารเรียก `/middleware.ts` · ไฟล์นี้**ไม่ใช่**จุดบังคับสิทธิ์ (DEC-002 ยังยืน — permission อยู่ที่ API layer ใน Phase 1.3)
- **TypeScript ตรึง 5.9** ทั้งที่ latest = 7.0 (native port) — เลี่ยงความเสี่ยง toolchain (typescript-eslint / next plugin / prisma) ในงานฐานราก · อัปเป็น 7.x ได้ทีหลังเมื่อ ecosystem นิ่ง
- **ESLint ตรึง 9.39** — ESLint 10 พังกับ `eslint-plugin-react` ที่ `eslint-config-next` 16 ดึงมา
- **`next lint` ถูกถอดใน Next 16** → script `lint` = `eslint .` + flat config นำเข้า `eslint-config-next/core-web-vitals` และ `/typescript` ตรงๆ (FlatCompat ใช้ไม่ได้)
- **Prisma 7**: datasource url ย้ายไป `prisma.config.ts` (CLI ใช้ `DIRECT_URL` เพราะ migration ผ่าน pooler ไม่ได้) · runtime ต้องมี driver adapter (`PrismaPg` + `DATABASE_URL`) · client generate ไป `lib/generated/prisma` และ **gitignore ไว้** (CI generate เอง)
- **pnpm 11**: setting `allowBuilds` ย้ายไป `pnpm-workspace.yaml` (package.json `pnpm` field ถูกเมิน) — อนุญาต build script เฉพาะ prisma/engines/esbuild/unrs-resolver
- **ไม่ตั้ง `process.env.TZ` ใน next.config** โดยเจตนา — server เป็น UTC เสมอ, แปลง Asia/Bangkok + พ.ศ. ที่ display layer ผ่าน utils กลาง (Phase 1.5) ตาม Rule 01
- Postgres dev map ที่ port **5433** กันชนกับ Postgres ตัวอื่นบนเครื่อง

### verify ที่รันจริง
`pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm test` ✅ (4/4) · `pnpm build` ✅ · `pnpm dev` ขึ้นจริง (curl 200 + เห็นข้อความ "Staging OK") · `docker compose -f docker-compose.dev.yml config` ✅

### จุดที่คนถัดไปควรรู้
- **ยังไม่ได้ push** — ตาม Rule 06 การ push `origin staging` เป็นงานของคน
- CI ยังไม่เคยรันจริงบน GitHub (DoD ข้อ "CI ผ่านบน PR แรก" จะพิสูจน์ตอนคน push) — env ใน workflow เป็นค่า placeholder ทั้งหมด ไม่แตะ DB จริง
- ยังไม่มี `.env.local` บนเครื่อง — ก่อนเริ่ม Phase 1.1 ต้อง `cp .env.example .env.local` + `docker compose -f docker-compose.dev.yml up -d` และเติมค่า Supabase staging จริง
- ตารางจริงทั้งหมดยังไม่มี — `prisma/schema.prisma` มีแค่ generator+datasource, `prisma/seed.ts` เป็น stub (ของจริง Phase 1.1/1.2)
- ของที่ reuse ได้ทั้งหมดบันทึกไว้ใน `docs/REUSE_INDEX.md` แล้ว (รวมกับดัก 4 ข้อของ Next 16 / Prisma 7 / ESLint / CLAUDE.md auto-block)

---
