# Rule 04 — State Machines, Validation, Idempotency (ไฟล์ 23/24/91)

- State machine ทุก entity ตาม `23` (16 ตัว) + enum ตรง `02` §3 **เป๊ะ** — ห้ามสร้าง state ใหม่ ห้ามข้ามขั้น · transition endpoint = `PATCH|POST /:id/action-name`
- Error code ใช้จาก `24` (33 codes / 8 หมวด) เท่านั้น — ต้องการ code ใหม่ให้เพิ่มใน `24` (doc) พร้อมโค้ด commit เดียวกัน · FE/BE share constant ชุดเดียว
- Code ที่เป็น "เตือน ไม่ block" มี 5 ตัวเท่านั้น: `BANK_ACCOUNT_NAME_MISMATCH`, `DUPLICATE_PAYMENT_FILE`, `ALREADY_MATCHED`, `FILING_OVERDUE_WARNING`, `WHT_RATE_FALLBACK_TO_PLAN` (+`IMEI_MISMATCH` ฝั่ง warehouse) — นอกนั้น reject · รายชื่อจริงถูกล็อกด้วย `WARNING_ONLY_CODES` ใน `lib/api/error-catalog.test.ts` — เพิ่มตัวใหม่ต้องมีมติ PO + แก้ `docs/24` ใน commit เดียวกัน
- Validation ด้วย **Zod schema เดียว** ใช้ร่วม FE/BE ต่อ resource · API validation fail → 400 + field errors
- Reject/cancel ทุกชนิดต้องมี reason (`REJECT_REASON_REQUIRED`/`REJECTION_REASON_REQUIRED`/`CANCEL_REQUIRES_REASON`/`WHT_CANCEL_REQUIRES_REASON`)
- จุด transition วิกฤตที่ต้องมี test เสมอ:
  - Revenue trigger 3 เงื่อนไข + DEC-006/D6 (`19` §6.1) — idempotent ต่อเคส
  - Lot confirmed `$transaction` 4 steps + rollback (`44` §11)
  - Approval reject → reset step 1 เสมอ (`16` §9)
  - resubmit_close → expense เดิม `superseded` + สร้างใหม่ ไม่ซ้ำไม่หาย (`41` §10.1)
  - Advance ห้ามเบิกซ้อน (approved|overdue) + auto-overdue job (`15`)
  - Period locked → ทุก write โดน `PERIOD_LOCKED_DIRECT_EDIT` ต้องไป Adjustment (`30`/`20`)
- **Idempotency**: payout `idempotency_key` · job ทุกตัว idempotent + `JOB_DUPLICATE` คืน job เดิม · export versioned + SHA-256 ห้าม overwrite · event consumer ต้องกัน duplicate delivery
- Event ชื่อตาม registry (`45` §7 + `27`) — เพิ่ม event ใหม่ต้องลง registry + lint ผ่าน
