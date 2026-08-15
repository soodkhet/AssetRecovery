# 24-finance-validation-rules.md

# 24 — Finance Validation Rules (กฎตรวจสอบรวมทั้งระบบ)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted — sync กับ Batch 3)
> Document Level: Finance Reference — เอกสารอ้างอิงเชิงเทคนิค ไม่มีหน้าจอ UI ของตัวเอง
> เอกสารอ้างอิง: สรุปรวม Validation Error Code ทั้งหมดจากไฟล์ 10, 12, 13, 15, 16, 17, 18, 19, 20, 30, 31, 32, 34, 35

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | สร้างไฟล์ครั้งแรก — รวม Error Code 30 ตัวจาก 14 ไฟล์ |
| v2 | 03/07/2569 | **แก้ไข §6.4**: `ADVANCE_PENDING_SETTLEMENT` เดิมอ้างถึง state `waiting_settlement` ที่ถูกตัดออกแล้ว — แก้ condition ให้ตรงกับ state ใหม่ (`approved`/`overdue`) + เพิ่ม `REJECTION_REASON_REQUIRED` ที่ตกหล่นจากไฟล์ 15 v2 — sync กับ Batch 3 |
| v3 | 04/07/2569 | (1) **ปิด Open Item §18**: ตรวจ error code หมวด §6.8 (ไฟล์ 31/32/33/34) เทียบกับไฟล์ต้นทาง v2 หลัง Batch 5 ครบแล้ว — ตรงกันทุกตัว ไม่พบ conflict (2) **เติม §6.7**: `NOT_READY_BILLING_REVENUE_MISMATCH` — Readiness Check ของไฟล์ 30 §6.2 มี 3 เงื่อนไข แต่เดิมมี error code รองรับแค่ 2 (ขาดเงื่อนไข "ยอดบิลตรงกับรายได้") (3) **อัปเดต §6.4**: `REJECTION_REASON_REQUIRED` ขยาย source ครอบคลุมไฟล์ 20 (ปฏิเสธ Adjustment) — ความหมายเดียวกัน ใช้ code ร่วมกันตาม pattern ของ `REJECT_REASON_REQUIRED` |
| v3.1 | 04/07/2569 | **เติม §6.8**: `WHT_CANCEL_REQUIRES_REASON` ตามไฟล์ 33 v3 (DEC-006/D4 — กลไกยกเลิก WHT Certificate) |
| v4.12 | 15/08/2569 | **เติม §6.10** (Phase 5.2 — หน้าบันทึกการใช้งาน `90` §8/§14): `AUDIT_LOG_NOT_FOUND` — `90` §11 ระบุไว้ 4 code ทั่วไป (`REQUIRED_MISSING`/`DUPLICATE_RECORD`/`PERMISSION_DENIED`/`INVALID_STATUS`) ซึ่งไม่ครอบคลุมกรณี 404 ของรายการ audit ที่เปิดดูรายละเอียด (id ไม่มีจริง/อยู่คนละองค์กร — ต้องตอบเหมือนกันเพื่อไม่ leak ว่ามีรายการนั้นอยู่) จึงระบุให้ตรงกับสิ่งที่ implementation ใช้จริงเหมือน v3.5–v4.11 · ตรวจแล้วไม่ซ้ำกับ code เดิมทุกตัว (§7) ไม่กระทบ business logic เดิม |
| v4.11 | 15/08/2569 | **ลบแถวซ้ำ 4 แถวใน §6.7/§6.8** (รีวิว Phase 4): `PERIOD_NOT_FOUND`, `PERIOD_INVALID_STATUS`, `EXCEPTION_NOT_FOUND`, `EXCEPTION_INVALID_STATUS` ถูกเติมซ้ำสองครั้งตอน v4.6 (คำอธิบายต่างกันเล็กน้อย) ขัดกับ §7 ที่ประกาศว่า "ไม่มี code ซ้ำ" — เก็บฉบับที่คำอธิบายครบกว่าไว้ **ไม่มี code ใดถูกเพิ่ม/ลบ ไม่กระทบ business logic และไม่กระทบ parity test** (`lib/api/error-catalog.test.ts` ใช้ `Set`) |
| v4.10 | 15/08/2569 | **เติม §6.8** (Phase 4.5 — WHT Data `33`): `WHT_CERTIFICATE_NOT_FOUND`, `WHT_CERTIFICATE_INVALID_STATUS`, `WHT_FILING_SUMMARY_NOT_FOUND`, `WHT_FILING_ALREADY_FILED` — `33` §11 ระบุไว้ 2 เคส (`FILING_OVERDUE_WARNING`/`WHT_CANCEL_REQUIRES_REASON`) ซึ่งไม่ครอบคลุมกรณี 404 ของตัวหนังสือรับรอง/สรุปรอบนำส่งเอง · การยกเลิกใบที่เป็น terminal แล้ว (`33` §10 · `02` §13) · และการ mark-filed ซ้ำ (`33` §9 — `pending → filed` ทางเดียว) จึงระบุให้ตรงกับสิ่งที่ implementation ใช้จริงเหมือน v3.5–v4.9 · ตรวจแล้วไม่ซ้ำกับ code เดิมทุกตัว (§7) ไม่กระทบ business logic เดิม |
| v4.9 | 15/08/2569 | **เติม §6.8** (Phase 4.4 — บัญชีค่าใช้จ่าย `32` / ข้อซักถาม `36`): `EXPENSE_RECORD_NOT_FOUND`, `ACCOUNTANT_QUESTION_NOT_FOUND`, `ACCOUNTANT_QUESTION_ALREADY_ANSWERED` — `32` §11 ระบุไว้ 2 code (`EDIT_AMOUNT_DIRECTLY`/`COST_CENTER_AUTO_EDIT`) และ `36` §10 ระบุแค่ `REQUIRED_MISSING` ซึ่งไม่ครอบคลุมกรณี 404 ของรายการค่าใช้จ่าย/ข้อซักถามเอง (ศูนย์ต้นทุนใช้ `COST_CENTER_NOT_FOUND` ของ `13` ที่มีอยู่แล้ว ไม่ประกาศซ้ำ) และการตอบข้อซักถามซ้ำ (`36` §8 — `answered` เป็นปลายทาง) จึงระบุให้ตรงกับสิ่งที่ implementation ใช้จริงเหมือน v3.5–v4.8 · ตรวจแล้วไม่ซ้ำกับ code เดิมทุกตัว (§7) ไม่กระทบ business logic เดิม |
| v4.8 | 15/08/2569 | **เติม §6.8** (Phase 4.3 — บัญชีขาย/ใบกำกับภาษี `31`): `SALES_RECORD_NOT_FOUND`, `TAX_INVOICE_NOT_FOUND`, `TAX_INVOICE_INVALID_STATUS`, `TAX_INVOICE_ALREADY_ISSUED` — `31` §11 ระบุไว้ 3 code (`TAX_INVOICE_FIELD_MISSING`/`INVOICE_NUMBER_GAP`/`CANCEL_REQUIRES_REASON`) ซึ่งไม่ครอบคลุมกรณี 404 ของรายการขาย/ใบกำกับภาษีเอง · การยกเลิกใบที่เป็น terminal แล้ว (`31` §9.1 — `cancelled` ห้าม reverse) · และการออกใบซ้ำให้รายการขายที่มีใบ `active` อยู่ (`31` §10 "ห้ามแก้ไขใบที่ active ต้องยกเลิกแล้วออกใหม่") จึงระบุให้ตรงกับสิ่งที่ implementation ใช้จริงเหมือน v3.5–v4.7 · ตรวจแล้วไม่ซ้ำกับ code เดิมทุกตัว (§7) ไม่กระทบ business logic เดิม |
| v4.7 | 15/08/2569 | **เติม §6.3** (Phase 4.2 — กระทบยอดธนาคาร `35`): `BANK_TRANSACTION_NOT_FOUND`, `BANK_TRANSACTION_INVALID_STATUS`, `STATEMENT_FILE_INVALID` — `35` §11 ระบุไว้แค่ 2 code (`MATCH_NOTE_REQUIRED`/`ALREADY_MATCHED`) ซึ่งไม่ครอบคลุมกรณี 404 ของรายการเดินบัญชีเอง / transition ที่ `23` §6.14 ไม่รองรับ (จับคู่รายการที่ `unmatched_resolved` ซึ่งเป็น terminal · ปิดรายการที่จับคู่ไปแล้ว) / ไฟล์ statement ที่อ่านไม่ออกตาม format ที่ตั้งไว้ (`13` §6.3/§6.8) จึงระบุให้ตรงกับสิ่งที่ implementation ใช้จริงเหมือน v3.5–v4.6 · ตรวจแล้วไม่ซ้ำกับ code เดิมทุกตัว (§7) ไม่กระทบ business logic เดิม |
| v4.6 | 15/08/2569 | **เติม §6.7/§6.8** (Phase 4.1 — ปิดงวด `30` / Exception `34`): `PERIOD_NOT_FOUND`, `PERIOD_INVALID_STATUS`, `EXCEPTION_NOT_FOUND`, `EXCEPTION_INVALID_STATUS` — `30` §11 ระบุไว้ 4 code และ `34` §11 ระบุไว้ 2 code ซึ่งไม่ครอบคลุมกรณี 404 ของตัวรอบบัญชี/ข้อยกเว้นเอง และ transition ที่ `23` §6.12/§6.13 ไม่รองรับ (เช่น ปลดล็อกรอบที่ยัง `collecting` / resolve รายการที่ `authorized` ไปแล้ว) จึงระบุให้ตรงกับสิ่งที่ implementation ใช้จริงเหมือน v3.5–v4.5 · ตรวจแล้วไม่ซ้ำกับ code เดิมทุกตัว (§7) ไม่กระทบ business logic เดิม |
| v4.5 | 15/08/2569 | **เติม §6.5 — `WHT_RATE_FALLBACK_TO_PLAN`** (มติ PO ตอนรีวิว Phase 3): `18` §6.3 และ Rule 01 บังคับว่า "fallback ไป Plan-level ได้ **แต่ต้องมี warning**" · `resolveWhtRate()` สร้างข้อความเตือนไว้แล้วแต่ไม่มี code กลางให้ส่งขึ้น envelope ⇒ รอบจ่ายถูกสร้างด้วยอัตราสำรอง**เงียบ ๆ** · เพิ่มเป็น code แบบ **เตือนไม่บล็อก** (status 200) ⇒ รายชื่อ code ที่ "เตือน ไม่ block" เพิ่มจาก 5 เป็น **6 ตัว** (sync `.claude/rules/04-state-validation.md` แล้ว) · เลือกเตือนแทนการบล็อก เพราะ `18` §9 ไม่ได้บังคับว่า Payee ที่ verified ต้องมี Tax Profile — บล็อกจะทำให้จ่ายเงินไม่ได้ทั้งรอบจากข้อมูลที่แก้ทีหลังได้ |
| v4.4 | 15/08/2569 | **เติม §6.7** (Phase 3.7 — Adjustment `20`): `ADJUSTMENT_NOT_FOUND`, `ADJUSTMENT_INVALID_STATUS`, `ADJUSTMENT_TARGET_NOT_FOUND` — `20` §11 ระบุไว้ 3 code (`REASON_REQUIRED`/`REJECTION_REASON_REQUIRED`/`INSUFFICIENT_APPROVAL_LEVEL`) ซึ่งไม่ครอบคลุมกรณี 404 ของตัว Adjustment เอง / สถานะที่ทำ action ไม่ได้ตาม `23` §6.9 (terminal แล้ว) / รายการต้นทางที่อ้างไม่มีอยู่จริงหรืออยู่นอก scope จึงระบุให้ตรงกับสิ่งที่ implementation ใช้จริงเหมือน v3.5–v4.3 · ตรวจแล้วไม่ซ้ำกับ code เดิมทุกตัว (§7) ไม่กระทบ business logic เดิม |
| v4.3 | 15/08/2569 | **เติม §6.6** (Phase 3.6 — Revenue/Billing `19`): `BILLING_BATCH_NOT_FOUND`, `BILLING_BATCH_INVALID_STATUS` — `19` §11 ระบุไว้ 3 code (`NO_REVENUE_TO_BILL`/`EDIT_BILLED_REVENUE`/`VAT_RATE_NOT_FOUND`) ซึ่งไม่ครอบคลุมกรณี 404 และกรณีที่ `19` §10 ห้ามไว้ตรง ๆ ("ห้ามลบ Billing Batch ที่ `status != draft`" / ส่งบิลซ้ำที่สถานะไม่ใช่ `draft` ตาม `23` §6.8) จึงระบุให้ตรงกับสิ่งที่ implementation ใช้จริงเหมือน v3.5–v4.2 · ตรวจแล้วไม่ซ้ำกับ code เดิมทุกตัว (§7) ไม่กระทบ business logic เดิม |
| v4.2 | 15/08/2569 | **เติม §6.5** (Phase 3.4 — Payout Batch `17`): `PAYOUT_BATCH_NOT_FOUND`, `PAYOUT_BATCH_INVALID_STATUS`, `NO_ITEMS_TO_PAY`, `PAYMENT_FILE_NOT_GENERATED` — `17` §11 ระบุไว้แค่ 3 code (`UNVERIFIED_PAYEE_IN_PAYOUT`/`DUPLICATE_PAYMENT_FILE`/`MIXED_SIDE_BATCH`) ซึ่งไม่ครอบคลุมกรณี 404 / สถานะทำ action ไม่ได้ตาม `23` §6.6 / ไม่มีรายการให้จ่าย / ขอไฟล์โอนที่ยังไม่เคยสร้าง ที่ implementation ต้องใช้จริง จึงระบุให้ตรงเหมือน v3.5–v4.1 · ตรวจแล้วไม่ซ้ำกับ code เดิมทุกตัว (§7) ไม่กระทบ business logic เดิม |
| v4.1 | 15/08/2569 | **เติม §6.4** (Phase 3.3 — Claims & Advances `15`): `ADVANCE_EXCEEDS_MAX` (มีอยู่ใน `15` §11 + `13` §6.2.1 อยู่แล้วแต่ตกหล่นจาก dictionary กลาง), `ADVANCE_NOT_FOUND`, `ADVANCE_INVALID_STATUS` — `15` §11 ระบุไว้ 5 code ซึ่งไม่ครอบคลุมกรณี 404 / สถานะไม่รองรับตาม `23` §6.4 จึงระบุให้ตรงกับสิ่งที่ implementation ใช้จริงเหมือน v3.5–v4.0 · ตรวจแล้วไม่ซ้ำกับ code เดิมทุกตัว (§7) ไม่กระทบ business logic เดิม |
| v4.0 | 15/08/2569 | **เติม §6.5** (Phase 3.2 — Payee & Tax Profile `18`): `PAYEE_NOT_FOUND`, `PAYEE_ALREADY_EXISTS`, `PAYEE_ID_DOCUMENT_REQUIRED` — `18` §11 ระบุไว้แค่ 3 code (`REQUIRED_MISSING`/`BANK_ACCOUNT_NAME_MISMATCH`/`UNVERIFIED_PAYEE_IN_PAYOUT`) ซึ่งไม่ครอบคลุมกรณี 404 / ซ้ำ (unique `(organization_id, user_id)` ของ `payee_profiles`) / เอกสารยืนยันตัวตนที่ `18` §10 บังคับผ่าน `13` §6.2.1 จึงระบุให้ตรงกับสิ่งที่ implementation ใช้จริงเหมือน v3.5–v3.9 · ตรวจแล้วไม่ซ้ำกับ code เดิมทุกตัว (§7) ไม่กระทบ business logic เดิม |
| v3.9 | 14/08/2569 | **เติม §6.1–6.3** (Phase 1.10 — ตั้งค่าการเงิน/บัญชี `13` ครบ 13 หมวด): `CYCLE_NOT_FOUND`, `DUPLICATE_CYCLE_NAME`, `APPROVAL_MATRIX_NOT_FOUND`, `COST_CENTER_NOT_FOUND`, `COST_CENTER_IN_USE`, `TAX_PROFILE_NOT_FOUND`, `DUPLICATE_TAX_PROFILE_NAME`, `TAX_PROFILE_IN_USE`, `NUMBERING_SEQ_NOT_EDITABLE`, `BANK_FILE_FORMAT_NOT_FOUND`, `BANK_ACCOUNT_NOT_FOUND`, `DUPLICATE_BANK_ACCOUNT`, `BANK_ACCOUNT_IN_USE` — `13` §10 ระบุไว้แค่ 5 code (`REQUIRED_MISSING`/`INVALID_WHT_RATE`/`VAT_RATE_OVERLAP`/`BANK_FILE_NOT_TESTED`/`PERIOD_LOCKED_DIRECT_EDIT`) ซึ่งไม่ครอบคลุมกรณี 404/ซ้ำ/ลบของ ที่ถูกใช้อยู่ จึงระบุให้ตรงกับสิ่งที่ implementation ใช้จริงเหมือน v3.5–v3.7 · `VAT_RATE_NOT_FOUND` ขยาย source ครอบคลุมไฟล์ 13 (อ้างอัตราที่ไม่มีในองค์กร) · ตรวจแล้วไม่ซ้ำกับ code เดิมทุกตัว (§7) ไม่กระทบ business logic เดิม |
| v3.8 | 14/08/2569 | **เติม §6.1** (Phase 1.9 — flow เชิญผู้ใช้ ตามมติ PO ที่ปิด open item D1): `INVITE_SEND_FAILED` — ส่งอีเมลคำเชิญตั้งรหัสผ่านผ่าน `inviteUserByEmail` ไม่สำเร็จตอนกด "ส่งคำเชิญอีกครั้ง" (502 เพราะเป็นความล้มเหลวของปลายทางภายนอก ไม่ใช่ข้อมูลผู้เรียกผิด) · ตอน **สร้าง** ผู้ใช้ถ้าเชิญไม่สำเร็จจะ**ไม่ reject** แต่คืน warning `USER_NOT_PROVISIONED` (code เดิม §6.9) แล้วบันทึกผู้ใช้ไว้ให้ส่งซ้ำได้ |
| v3.7 | 14/08/2569 | **เติม §6.1** (Phase 1.9 — ผู้ใช้งาน `08`): `USER_NOT_FOUND`, `DUPLICATE_USER_EMAIL`, `DUPLICATE_USER_PHONE`, `USER_HAS_HISTORY` (ชื่อตรงตามที่ `08` §11 ระบุไว้แล้ว), `INVALID_USER_STATUS_TRANSITION`, `INVALID_USER_SCOPE` — code เดิมของ `08` §11 เขียนกว้าง (`DUPLICATE_RECORD`/`INVALID_STATUS`) ไม่มีใน dictionary กลาง จึงระบุให้ตรงกับสิ่งที่ implementation ใช้จริงเหมือน v3.5/v3.6 · `ROLE_NOT_FOUND` มีอยู่แล้วใน §6.9 (ใช้ร่วมกัน) · ตรวจแล้วไม่ซ้ำกับ code เดิมทุกตัว (§7) ไม่กระทบ business logic เดิม |
| v3.6 | 14/08/2569 | **เติม §6.1** (Phase 1.8 — ทีม `09` / บริษัทไฟแนนซ์ `10`): `COMPANY_NOT_FOUND`, `TEAM_NOT_FOUND`, `DUPLICATE_TEAM_NAME`, `TEAM_HAS_ACTIVE_CASES` (ตาม default ของ D7 — ส่วน modal bulk reassign อยู่ Phase 2.6), `SUPERVISOR_ALREADY_ASSIGNED` (ปิด Open Item `09` §18 ตามมติที่ระบุไว้แล้วใน `09` §7.1/§17 ว่าหัวหน้าทีม 1 คน = 1 ทีม → **reject ไม่ใช่แค่เตือน**), `INVALID_TEAM_MEMBER`, `INVALID_PROVINCE` — code เดิมของ `09` §11 เขียนกว้าง (`DUPLICATE_RECORD`/`INVALID_STATUS`) ไม่มีใน dictionary กลาง จึงระบุให้ตรงกับสิ่งที่ implementation ใช้จริง · ตรวจแล้วไม่ซ้ำกับ code เดิมทุกตัว (§7) ไม่กระทบ business logic เดิม |
| v3.5 | 14/08/2569 | **เติม §6.1 หมวดข้อมูลพื้นฐาน** (Phase 1.7 — แผนค่าตอบแทน `11` / เทมเพลตค่าบริการ `12`): `DUPLICATE_TEMPLATE_NAME`, `PLAN_NOT_FOUND`, `TEMPLATE_NOT_FOUND`, `VERSION_NOT_CURRENT`, `PLAN_IN_USE` — code เดิมของ `11` §11 ที่เขียนไว้กว้าง ๆ (`DUPLICATE_RECORD`/`INVALID_STATUS`) ไม่มีใน dictionary กลาง จึงระบุให้ตรงกับสิ่งที่ implementation ใช้จริง · ตรวจแล้วไม่ซ้ำกับ code เดิมทุกตัว (§7) ไม่กระทบ business logic เดิม |
| v3.4 | 14/08/2569 | **เติม §6.9 หมวด Roles & Permissions** (Phase 1.6) — รวบ `SEED_ROLE_DELETE`/`SEED_ROLE_RENAME` (ต้นทาง `07` §11) เข้ามาใน dictionary กลาง + เพิ่ม code ที่ implementation ต้องใช้จริง: `ROLE_NOT_EDITABLE`, `CAPABILITY_LOCKED`, `CAPABILITY_NOT_FOUND`, `ROLE_IN_USE`, `DUPLICATE_ROLE_NAME`, `ROLE_NOT_FOUND` — ตรวจแล้วไม่ซ้ำกับ code เดิมทุกตัว (§7) ไม่กระทบ business logic เดิม |
| v3.3 | 14/08/2569 | **เพิ่ม §6.10 หมวด Audit (Platform)** (Phase 1.4) — `AUDIT_REASON_REQUIRED` (บังคับ `reason` ตาม `90` §13) และ `AUDIT_IMMUTABLE` (`02` §13 — ห้าม UPDATE/DELETE audit_logs) · ตรวจแล้วไม่ซ้ำกับ code เดิมทุกตัว (§7) ไม่กระทบ business logic เดิม |
| v3.2 | 14/08/2569 | **เพิ่ม §6.9 หมวด Auth & Access Control** (Phase 1.3) — รวบ `PERMISSION_DENIED` (05 §11) / `LAST_SUPERADMIN_REMOVAL` (07 §11) ที่กระจายอยู่ไฟล์ต้นทาง เข้ามาไว้ใน dictionary กลาง + เพิ่ม code ใหม่ที่ implementation ต้องใช้จริง: `UNAUTHENTICATED`, `SESSION_EXPIRED`, `INVALID_CREDENTIALS`, `ACCOUNT_INACTIVE`, `USER_NOT_PROVISIONED` — ตรวจแล้วไม่ซ้ำกับ code เดิมทุกตัว (§7) ไม่กระทบ business logic เดิม |

ขอบเขตเอกสารนี้: รวม Error Code และเงื่อนไขการ validate ทั้งหมดของระบบไว้จุดเดียว เพื่อให้ frontend/backend ใช้ code เดียวกันสม่ำเสมอ และนักพัฒนาเช็คได้ว่ามี code ซ้ำ/ขัดแย้งกันหรือไม่

**ไม่รวมอยู่ในไฟล์นี้**: สูตรคำนวณ (ดู `22-finance-calculation-spec.md`), State machine (ดู `23-finance-state-machines.md`)

---

## 1. Summary

รวม Error Code และเงื่อนไขการ validate ทั้งหมดของระบบไว้จุดเดียว เพื่อให้ frontend/backend ใช้ code เดียวกันสม่ำเสมอ และนักพัฒนาเช็คได้ว่ามี code ซ้ำ/ขัดแย้งกันหรือไม่

## 2. Purpose

เป็น error code dictionary กลาง — แต่ละไฟล์ business logic อ้าง code จากที่นี่ ไม่ตั้งชื่อใหม่ซ้ำซ้อนหรือสะกดต่างกัน

## 3-5. (ไม่ใช้กับไฟล์ประเภทนี้)

เอกสารนี้เป็น technical reference ล้วน — ไม่มี Scope/Actor ของตัวเอง

## 6. Validation Rules แยกตามหมวด

### 6.1 หมวดข้อมูลพื้นฐาน (Master Data — ไฟล์ 08, 09, 10, 11, 12, 18)

| Code | Condition | Source File |
|---|---|---|
| REQUIRED_MISSING | ฟิลด์บังคับไม่ครบ (ใช้ร่วมกันทุกฟอร์มในระบบ) | ทุกไฟล์ |
| DUPLICATE_TAX_ID | `tax_id` ซ้ำกับบริษัท/payee อื่นที่มีอยู่ | 10 |
| INVALID_TAX_ID_FORMAT | `tax_id` ไม่ใช่ตัวเลข 13 หลัก | 10, 18 |
| SUSPEND_REASON_REQUIRED | เปลี่ยนบริษัทเป็น suspended โดยไม่กรอกเหตุผล | 10 |
| SUSPENDED_COMPANY_NEW_CASE | พยายามสร้างเคสใหม่จากบริษัทที่ suspended | 10 (บังคับใช้ที่ไฟล์ 38) |
| INVALID_RATE_RANGE | `rate` ของ Service Fee Template ไม่อยู่ระหว่าง 0-100 | 12 |
| TEMPLATE_IN_USE | พยายามปิดใช้งานเทมเพลตที่มีบริษัทผูกอยู่ | 12 |
| DUPLICATE_TEMPLATE_NAME | ชื่อแผนค่าตอบแทน/เทมเพลตค่าบริการซ้ำกับที่มีอยู่ในองค์กร (UNIQUE `organization_id, name, version` — `02` §5) | 11, 12 |
| PLAN_NOT_FOUND | อ้างแผนค่าตอบแทนที่ไม่มีในองค์กรของผู้เรียก (404 — ไม่ leak ข้ามองค์กร) | 11 |
| TEMPLATE_NOT_FOUND | อ้างเทมเพลตค่าบริการที่ไม่มีในองค์กรของผู้เรียก (404 — ไม่ leak ข้ามองค์กร) | 12 |
| VERSION_NOT_CURRENT | พยายามแก้เวอร์ชันเก่าของแผน/เทมเพลต — แก้ได้เฉพาะเวอร์ชันปัจจุบัน (`11` §10 · `12` §9) | 11, 12 |
| PLAN_IN_USE | พยายามปิดใช้งานแผนค่าตอบแทนที่มีทีมผูกอยู่ (คู่ขนานกับ `TEMPLATE_IN_USE` ของไฟล์ 12) | 11 |
| COMPANY_NOT_FOUND | อ้างบริษัทไฟแนนซ์ที่ไม่มีในองค์กรของผู้เรียก (404 — ไม่ leak ข้ามองค์กร) | 10 |
| TEAM_NOT_FOUND | อ้างทีมที่ไม่มีในองค์กรของผู้เรียก (404 — ไม่ leak ข้ามองค์กร) | 09 |
| DUPLICATE_TEAM_NAME | ชื่อทีมซ้ำกับทีมที่มีอยู่ในองค์กร (UNIQUE `organization_id, name` — `02` §5) | 09 |
| TEAM_HAS_ACTIVE_CASES | ปิดใช้งาน/ลบทีมที่ยังมีเคส active ค้างอยู่ (ต้อง reassign ก่อน — `09` §10 · D7) | 09 (bulk reassign ที่ไฟล์ 40) |
| SUPERVISOR_ALREADY_ASSIGNED | ตั้ง user เป็นหัวหน้าทีมทั้งที่เป็นหัวหน้าของอีกทีมอยู่แล้ว — หัวหน้าทีม 1 คนสังกัดได้ทีมเดียว (`09` §7.1/§17 · ต่างจากผู้จัดการที่ดูแลได้หลายทีม) | 09 |
| INVALID_TEAM_MEMBER | user ที่ตั้งเป็นผู้จัดการ/หัวหน้าทีมไม่มีอยู่จริง ไม่ active หรืออยู่นอก role group `inhouse`/`outsource` (`09` §7.1) | 09 |
| INVALID_PROVINCE | จังหวัดที่เลือกไม่อยู่ใน PROVINCE_DATA (`09` §8) | 09 |
| USER_NOT_FOUND | อ้างผู้ใช้ที่ไม่มีในองค์กรของผู้เรียก หรือถูก soft delete ไปแล้ว (404 — ไม่ leak ข้ามองค์กร) | 08 |
| DUPLICATE_USER_EMAIL | อีเมลซ้ำกับผู้ใช้ที่ยังไม่ถูกลบในองค์กรเดียวกัน — อีเมลใช้เป็น username ของ Supabase Auth (`08` §10) | 08 |
| DUPLICATE_USER_PHONE | เบอร์โทรซ้ำกับผู้ใช้ที่ยังไม่ถูกลบในองค์กรเดียวกัน (`08` §10 — เทียบหลังตัดตัวคั่นออก) | 08 |
| USER_HAS_HISTORY | พยายามลบผู้ใช้ที่มีประวัติการทำงาน (เคส/งานภาคสนาม/หลักฐาน/สายจ่ายเงิน/คลัง หรือยังถือตำแหน่งในทีม) — ต้องใช้ระงับการใช้งานแทนเสมอ (`08` §10/§11) | 08 |
| INVALID_USER_STATUS_TRANSITION | เปลี่ยนสถานะผู้ใช้นอก lifecycle `active ⇄ suspended → deleted` เช่น เปิดใช้งานบัญชีที่ถูกลบไปแล้ว (`08` §7.2) | 08 |
| INVITE_SEND_FAILED | ส่งอีเมลคำเชิญตั้งรหัสผ่าน (`inviteUserByEmail`) ไม่สำเร็จตอนสั่งส่งซ้ำ — บัญชีผู้ใช้ยังอยู่ ไม่ต้องสร้างใหม่ (มติ PO ปิด D1) | 08 |
| INVALID_USER_SCOPE | สังกัดไม่ตรงกับ role group: กลุ่ม inhouse/outsource ต้องมี `team_id` · กลุ่ม finance_company ต้องมี `company_id` · กลุ่ม system ต้องไม่มีทั้งคู่ (`08` §7.1) | 08 |
| BANK_ACCOUNT_NAME_MISMATCH | ชื่อบัญชีธนาคารไม่ตรงกับชื่อ payee (เตือน ไม่ reject) | 18 |
| CYCLE_NOT_FOUND | อ้างรอบบิล/รอบจ่ายที่ไม่มีในองค์กรของผู้เรียก (404 — ไม่ leak ข้ามองค์กร) | 13 |
| DUPLICATE_CYCLE_NAME | ชื่อรอบบิล/รอบจ่ายซ้ำกับรอบที่ยังใช้งานอยู่ในองค์กร (`13` §6.1) | 13 |
| APPROVAL_MATRIX_NOT_FOUND | อ้างสายอนุมัติที่ไม่มีในองค์กรของผู้เรียก (404) | 13 |
| COST_CENTER_NOT_FOUND | อ้างศูนย์ต้นทุนที่ไม่มีในองค์กรของผู้เรียก (404) | 13 |
| COST_CENTER_IN_USE | ลบศูนย์ต้นทุนที่มีรายการค่าใช้จ่ายผูกอยู่ — ปิดใช้งานแทน (`13` §6.6 · ไฟล์ 32) | 13 |

### 6.2 หมวดภาษี/VAT (ไฟล์ 13, 19)

| Code | Condition | Source File |
|---|---|---|
| INVALID_WHT_RATE | `wht_rate` ติดลบหรือมากกว่า 100 | 13 |
| VAT_RATE_OVERLAP | ช่วงเวลา VAT Rate ใหม่ทับกับรายการเดิม | 13 |
| VAT_RATE_NOT_FOUND | ไม่มี vat_rate_history ครอบคลุมวันที่ revenue_date (หรืออ้างอัตราที่ไม่มีในองค์กร — 404) | 19, 13 |
| TAX_PROFILE_NOT_FOUND | อ้าง Tax Profile ที่ไม่มีในองค์กรของผู้เรียก (404 — ไม่ leak ข้ามองค์กร) | 13 |
| DUPLICATE_TAX_PROFILE_NAME | ชื่อ Tax Profile ซ้ำในองค์กร (UNIQUE `organization_id, name` — `02` §5) | 13 |
| TAX_PROFILE_IN_USE | ลบ Tax Profile ที่ผูกกับ payee/รายการจ่ายไปแล้ว — แก้อัตราได้แต่ลบไม่ได้ (ยอดภาษีเดิมต้องอ้างอิงได้) | 13, 18 |
| NUMBERING_SEQ_NOT_EDITABLE | พยายามแก้ `tax_invoice_seq`/`last_reset_year` ด้วยมือ — ระบบเดินเลขให้เอง เลขต้องต่อเนื่องตามกฎหมาย (`13` §6.12) | 13, 31 |

### 6.3 หมวดธนาคาร/ไฟล์ (ไฟล์ 13, 17, 35)

| Code | Condition | Source File |
|---|---|---|
| BANK_FILE_NOT_TESTED | ใช้ bank file format ที่ยังไม่ผ่านทดสอบไปสร้างไฟล์โอนจริง | 13 |
| BANK_FILE_FORMAT_NOT_FOUND | อ้างรูปแบบไฟล์ธนาคารที่ไม่มีในองค์กรของผู้เรียก (404) | 13 |
| BANK_ACCOUNT_NOT_FOUND | อ้างบัญชีธนาคารบริษัทที่ไม่มีในองค์กรของผู้เรียก (404) | 13 |
| DUPLICATE_BANK_ACCOUNT | เลขบัญชีซ้ำในองค์กร (UNIQUE `organization_id, account_number` — เทียบหลังตัด `-`/ช่องว่าง) | 13 |
| BANK_ACCOUNT_IN_USE | ลบบัญชีที่มีรอบจ่ายเงิน/รายการเดินบัญชีผูกอยู่ — แก้ไขได้แต่ลบไม่ได้ (`13` §9) | 13, 17, 35 |
| DUPLICATE_PAYMENT_FILE | สร้างไฟล์โอนซ้ำสำหรับ batch ที่มี idempotency_key อยู่แล้ว (เตือน ไม่ reject ทันที) | 17 |
| MIXED_SIDE_BATCH | พยายามรวมรายการ inhouse และ outsource ในรอบเดียวกัน | 17 |
| MATCH_NOTE_REQUIRED | จับคู่ manual ที่ยอดไม่ตรงเป๊ะ โดยไม่กรอกหมายเหตุ | 35 |
| ALREADY_MATCHED | พยายามจับคู่ transaction ที่ matched ไปแล้ว (เตือน) | 35 |
| BANK_TRANSACTION_NOT_FOUND | อ้างรายการเดินบัญชีที่ไม่มีในองค์กรของผู้เรียก (404) | 35 |
| BANK_TRANSACTION_INVALID_STATUS | ทำ action ที่สถานะปัจจุบันของรายการเดินบัญชีไม่รองรับตาม `23` §6.14 (จับคู่รายการที่ `unmatched_resolved` ซึ่งเป็น terminal · ปิดรายการที่จับคู่ไปแล้ว) | 35, 23 |
| STATEMENT_FILE_INVALID | ไฟล์ statement ที่นำเข้าอ่านไม่ออกตาม format ที่ตั้งไว้ — ไม่พบคอลัมน์วันที่/ยอดเงิน หรือไม่มีแถวที่ใช้ได้เลย (`13` §6.3/§6.8) | 35, 13 |

### 6.4 หมวด Claim/Advance/Approval (ไฟล์ 15, 16) — แก้ไขแล้ว

| Code | Condition | Source File |
|---|---|---|
| ADVANCE_PENDING_SETTLEMENT | ขอ Advance ใหม่ทั้งที่มียอดเดิม **`approved` หรือ `overdue`** ค้างอยู่ (แก้จาก `waiting_settlement` เดิมที่ถูกตัดออก) | 15 |
| ADVANCE_EXCEEDS_MAX | `requested_amount` เกิน `advance_max_amount_per_request` (`13` §6.2.1) — ค่าเป็น `null` = ไม่จำกัด ไม่ตรวจข้อนี้ | 15, 13 |
| ADVANCE_NOT_FOUND | อ้าง Advance ที่ไม่มีในองค์กร (หรือไม่อยู่ใน scope ของผู้เรียก) | 15 |
| ADVANCE_INVALID_STATUS | ทำ action ที่สถานะปัจจุบันของ Advance ไม่รองรับตาม `23` §6.4 (เช่น อนุมัติรายการที่ `cleared` แล้ว) | 15, 23 |
| USED_EXCEEDS_REQUEST_NO_TOPUP | เคลียร์ยอด Advance ที่ used_amount > requested_amount | 15 |
| REJECTION_REASON_REQUIRED | ปฏิเสธ Advance หรือ Adjustment (`rejected`) โดยไม่กรอก rejection_reason | 15, 20 |
| REJECT_REASON_REQUIRED | กด reject_expense โดยไม่กรอกเหตุผล | 15, 16, 41 |
| APPROVAL_STEP_OUT_OF_ORDER | อนุมัติขั้นที่ยังไม่ถึงตา | 16 |
| SEGREGATION_OF_DUTIES_VIOLATION | ผู้อนุมัติคนเดียวกันอนุมัติซ้ำ 2 ขั้น ขณะ enforce_segregation_of_duties=true | 16 |

### 6.5 หมวด Payout/Payee (ไฟล์ 17, 18)

| Code | Condition | Source File |
|---|---|---|
| UNVERIFIED_PAYEE_IN_PAYOUT | รวม Payee ที่ unverified เข้า Payout Batch | 17, 18 |
| PAYOUT_BATCH_NOT_FOUND | อ้างรอบจ่ายเงินที่ไม่มีในองค์กร (หรือไม่อยู่ใน scope ของผู้เรียก) — 404 ไม่ leak ว่ามีอยู่จริง | 17 |
| PAYOUT_BATCH_INVALID_STATUS | สั่ง action ที่สถานะปัจจุบันของรอบจ่ายทำไม่ได้ตาม `23` §6.6 (เช่น ยืนยันจ่ายสำเร็จก่อนสร้างไฟล์โอน) | 17 |
| NO_ITEMS_TO_PAY | สร้างรอบจ่ายแต่ไม่มีรายการที่ `approved` และยังไม่ถูกจ่ายภายในวันตัดรอบ/ฝั่งที่เลือก | 17 |
| PAYMENT_FILE_NOT_GENERATED | ขอดาวน์โหลดไฟล์โอนของรอบจ่ายที่ยังไม่เคยสร้างไฟล์ | 17 |
| PAYEE_NOT_FOUND | อ้าง Payee ที่ไม่มีในองค์กร (หรือไม่อยู่ใน scope ของผู้เรียก) | 18 |
| PAYEE_ALREADY_EXISTS | สร้าง Payee ให้ผู้ใช้ที่มี Payee Profile อยู่แล้ว (1 User = 1 Payee — `18` §6.1) | 18 |
| PAYEE_ID_DOCUMENT_REQUIRED | ยืนยัน Payee โดยไม่มี `id_document_url` ขณะที่ `require_payee_id_document = true` | 18, 13 |
| WHT_RATE_FALLBACK_TO_PLAN | **เตือน ไม่บล็อก** — สร้างรอบจ่ายที่มี Payee ยังไม่ผูก Tax Profile ⇒ ใช้อัตรา WHT จาก Compensation Plan เป็นค่าสำรอง (`18` §6.3 — Payee-level ชนะ Plan-level เสมอ · fallback ได้แต่ต้องเตือนทุกครั้ง) | 18, 17, 22 |

### 6.6 หมวด Revenue/Billing (ไฟล์ 19)

| Code | Condition | Source File |
|---|---|---|
| NO_REVENUE_TO_BILL | สร้างรอบวางบิลแต่ไม่มี Revenue ที่ ready_for_billing | 19 |
| EDIT_BILLED_REVENUE | แก้ Revenue ที่ผูก Billing Batch ที่ไม่ใช่ draft แล้ว | 19 |
| BILLING_BATCH_NOT_FOUND | อ้างรอบวางบิลที่ไม่มีในองค์กร (หรือไม่อยู่ใน scope ของผู้เรียก) — 404 ไม่ leak ว่ามีอยู่จริง | 19 |
| BILLING_BATCH_INVALID_STATUS | สั่ง action ที่สถานะปัจจุบันของรอบวางบิลทำไม่ได้ตาม `23` §6.8 (ส่งบิลซ้ำ / ลบรอบที่ `status != draft` ตาม §10) | 19 |

### 6.7 หมวด Adjustment / Period Lock (ไฟล์ 13, 20, 30)

| Code | Condition | Source File |
|---|---|---|
| PERIOD_LOCKED_DIRECT_EDIT | แก้ source record ตรงขณะรอบบัญชี locked | 13, 30 |
| REASON_REQUIRED | สร้าง Adjustment โดยไม่ระบุเหตุผล | 20 |
| INSUFFICIENT_APPROVAL_LEVEL | อนุมัติ Adjustment ของรายการ locked โดยไม่ใช่ Executive | 20 |
| ADJUSTMENT_NOT_FOUND | อ้าง Adjustment ที่ไม่มีอยู่ หรือผู้เรียกไม่มีสิทธิ์เห็น | 20 |
| ADJUSTMENT_INVALID_STATUS | อนุมัติ/ปฏิเสธ Adjustment ที่ไม่ได้อยู่สถานะ `pending_approval` (ไฟล์ 23 §6.9 — terminal แล้ว) | 20 |
| ADJUSTMENT_TARGET_NOT_FOUND | สร้าง Adjustment โดยอ้างรายการต้นทาง (Revenue/Expense/Billing/Payout) ที่ไม่มีอยู่หรืออยู่นอก scope | 20 |
| NOT_READY_CRITICAL_OPEN | ปิดงวดขณะมี critical exception เปิดอยู่ | 30 |
| NOT_READY_RECONCILE_INCOMPLETE | ปิดงวดขณะ Bank Reconcile ยังไม่ครบ 100% | 30 |
| NOT_READY_BILLING_REVENUE_MISMATCH | ปิดงวดขณะยอด Billing Batch ยังไม่ sync ตรงกับ Revenue ของรอบนั้น (เงื่อนไขที่ 3 ของ Readiness Check ไฟล์ 30 §6.2) | 30 |
| UNLOCK_REQUIRES_EXECUTIVE | ปลดล็อกรอบ locked โดยไม่ใช่ Executive | 30 |
| PERIOD_NOT_FOUND | อ้างรอบบัญชีที่ไม่มีในองค์กร (หรือไม่อยู่ใน scope ของผู้เรียก) — 404 ไม่ leak ว่ามีอยู่จริง | 30 |
| PERIOD_INVALID_STATUS | สั่ง action ที่สถานะปัจจุบันของรอบบัญชีทำไม่ได้ตาม `23` §6.13 (ส่งซ้ำ / ล็อกรอบที่ยัง `collecting` / ปลดล็อกรอบที่ยังไม่ `locked`) | 30 |

### 6.8 หมวดเอกสารทางการ/บัญชี (ไฟล์ 31, 32, 34)

| Code | Condition | Source File |
|---|---|---|
| TAX_INVOICE_FIELD_MISSING | ฟิลด์บังคับของใบกำกับภาษีไม่ครบ | 31 |
| SALES_RECORD_NOT_FOUND | อ้างรายการขายที่ไม่มีในองค์กรของผู้เรียก (404 — ไม่ leak ข้ามองค์กร) | 31 |
| TAX_INVOICE_NOT_FOUND | อ้างใบกำกับภาษีที่ไม่มีในองค์กรของผู้เรียก (404 — ไม่ leak ข้ามองค์กร) | 31 |
| TAX_INVOICE_INVALID_STATUS | ยกเลิกใบที่ `cancelled` ไปแล้ว หรือพยายามย้อนสถานะ (`31` §9.1 — `cancelled` เป็น terminal) | 31 |
| TAX_INVOICE_ALREADY_ISSUED | ออกใบกำกับภาษีให้รายการขายที่มีใบ `active` อยู่แล้ว (ต้องยกเลิกใบเดิมก่อน) | 31 |
| INVOICE_NUMBER_GAP | generate invoice_number ไม่ต่อเนื่อง (ไม่ควรเกิดในทางปฏิบัติ) | 31 |
| CANCEL_REQUIRES_REASON | ยกเลิกใบกำกับภาษีโดยไม่ระบุเหตุผล | 31 |
| EDIT_AMOUNT_DIRECTLY | แก้ยอดเงินตรงในไฟล์ 32 (ต้องผ่าน Adjustment) | 32 |
| COST_CENTER_AUTO_EDIT | แก้ cost_center ของรายการที่ mapping_rule = auto | 32 |
| EXPENSE_RECORD_NOT_FOUND | อ้างรายการค่าใช้จ่ายที่ไม่มีในองค์กรของผู้เรียก (404 — ไม่ leak ข้ามองค์กร) | 32 |
| ACCOUNTANT_QUESTION_NOT_FOUND | อ้างข้อซักถามที่ไม่มีในองค์กรของผู้เรียก (404 — ไม่ leak ข้ามองค์กร) | 36 |
| ACCOUNTANT_QUESTION_ALREADY_ANSWERED | ตอบข้อซักถามที่ `is_resolved = true` ไปแล้ว (`36` §8 — ตอบได้ครั้งเดียว) | 36 |
| EXPORT_BLOCKED_CRITICAL | Export Pack ขณะมี critical exception เปิดอยู่ | 34, 37 |
| EXPORT_RECORD_NOT_FOUND | อ้างประวัติการส่งมอบที่ไม่มีในองค์กรของผู้เรียก (404 — ไม่ leak ข้ามองค์กร) | 37 |
| EXPORT_INVALID_STATUS | mark-sent/accept ผิดลำดับ (`37` §9 — `generated → sent → accepted` ทางเดียว ข้ามขั้นไม่ได้) | 37 |
| EXPORT_PAYEE_TAX_ID_MISSING | สร้าง Accounting Pack ขณะที่ payee ในไฟล์ `05_WHT_Data.csv` ยังไม่มีเลขประจำตัวผู้เสียภาษี 13 หลัก (`37` §6.1 · DEC-006/D10) | 37 |
| AUTHORIZED_EXCEPTION_REASON_REQUIRED | สร้าง Authorized Exception โดยไม่กรอกเหตุผล | 34 |
| EXCEPTION_NOT_FOUND | อ้าง Exception ที่ไม่มีในองค์กร (หรือไม่อยู่ใน scope ของผู้เรียก) — 404 ไม่ leak ว่ามีอยู่จริง | 34 |
| EXCEPTION_INVALID_STATUS | แก้ไข/resolve/authorize Exception ที่ไม่ได้อยู่สถานะ `open` (ไฟล์ 23 §6.12 — `resolved`/`authorized` เป็น terminal) | 34 |
| FILING_OVERDUE_WARNING | เลยกำหนดนำส่งภาษีแต่ยัง pending (เตือน ไม่ block) | 33 |
| WHT_CANCEL_REQUIRES_REASON | ยกเลิก WHT Certificate โดยไม่กรอก cancel_reason | 33 |
| WHT_CERTIFICATE_NOT_FOUND | อ้างหนังสือรับรองหัก ณ ที่จ่ายที่ไม่มีในองค์กรของผู้เรียก (404 — ไม่ leak ข้ามองค์กร) | 33 |
| WHT_CERTIFICATE_INVALID_STATUS | ยกเลิกใบที่ `cancelled` ไปแล้ว (terminal — ห้ามลบ/ห้าม reverse ตาม `02` §13) | 33 |
| WHT_FILING_SUMMARY_NOT_FOUND | อ้างสรุปรอบนำส่ง ภ.ง.ด.3/53 ที่ไม่มีในองค์กรของผู้เรียก (404) | 33 |
| WHT_FILING_ALREADY_FILED | mark-filed รอบที่ `filed` ไปแล้ว (`33` §9 — `pending → filed` ทางเดียว) | 33 |

### 6.9 หมวด Auth & Access Control (ไฟล์ 05, 07, 08)

| Code | Condition | Source File |
|---|---|---|
| UNAUTHENTICATED | เรียก endpoint/หน้าที่ต้องล็อกอินโดยไม่มี session (401) | 05 |
| SESSION_EXPIRED | session เกิน 24 ชั่วโมงนับจาก login ล่าสุด — บังคับ re-login (`05` §10/§17) | 05 |
| INVALID_CREDENTIALS | อีเมลหรือรหัสผ่านไม่ถูกต้อง (ข้อความห้าม leak ว่ามีอีเมลนี้ในระบบหรือไม่) | 05 |
| ACCOUNT_INACTIVE | user ที่ `status ≠ active` พยายาม login หรือใช้งานต่อ (`05` §10, §16) | 05, 08 |
| USER_NOT_PROVISIONED | auth user ของ Supabase ยังไม่ถูกผูกกับ `users.supabase_uid` ในระบบ | 05 |
| PERMISSION_DENIED | ไม่มีสิทธิ์ทำ action (403) — UI hide/disable + API reject เสมอ | 05, 07, 25 |
| LAST_SUPERADMIN_REMOVAL | ถอด role หรือปิดใช้งาน Superadmin คนสุดท้ายที่ยัง active | 07 |
| SEED_ROLE_DELETE | พยายามลบ seed role (15 ตัวตาม `07` §5) — ปฏิเสธทุกกรณี | 07 |
| SEED_ROLE_RENAME | พยายามเปลี่ยนชื่อ seed role — ชื่อถูกอ้างอิงข้ามไฟล์ทั้งระบบ | 07 |
| ROLE_NOT_EDITABLE | แก้ Permission Matrix ของ role ที่ `is_editable = false` หรือของ Superadmin (implicit manage ไม่เก็บ record) | 07, 13 §6.10 |
| CAPABILITY_LOCKED | มอบ/แก้ระดับ capability ที่ติด "✅ only" ให้ role อื่น (9 รายการ — `25` §16.1) | 25, 13 §6.10 |
| CAPABILITY_NOT_FOUND | อ้าง capability code ที่ไม่มีในระบบ (`02` §12) | 07 |
| ROLE_IN_USE | ลบ role ที่ยังมีผู้ใช้ผูกอยู่ (1 user ต้องมี role เสมอ — `07` §10) | 07, 08 |
| DUPLICATE_ROLE_NAME | สร้าง/เปลี่ยนชื่อ role ชนกับชื่อเดิมใน Role Group เดียวกัน (ชื่อซ้ำข้ามกลุ่มได้ — `07` §6) | 07 |
| ROLE_NOT_FOUND | อ้าง role ที่ไม่มีในองค์กรของผู้เรียก หรือถูกลบไปแล้ว (404 — ไม่ leak ข้ามองค์กร) | 07 |

> `PERMISSION_DENIED` และ `LAST_SUPERADMIN_REMOVAL` มีอยู่แล้วในไฟล์ต้นทาง (05 §11 / 07 §11) — รวบมาไว้ที่นี่เพื่อให้ dictionary ครบตาม §2 · `REQUIRED_MISSING` ใช้ร่วมกับ §6.1 (ฟอร์ม login ที่กรอกไม่ครบ)

### 6.10 หมวด Audit (Platform — ไฟล์ 90)

| Code | Condition | Source File |
|---|---|---|
| AUDIT_REASON_REQUIRED | บันทึก audit ของรายการที่กระทบ เงิน/สิทธิ์/ธนาคาร/ภาษี/lock period โดยไม่มี `reason` (รวมกรณี background job ที่ไม่ระบุ job id) | 90 |
| AUDIT_IMMUTABLE | พยายาม UPDATE/DELETE/TRUNCATE `audit_logs` — ปฏิเสธทั้งระดับ service และ DB trigger แม้ผู้เรียกเป็น Superadmin | 90, 02 §13 |
| AUDIT_LOG_NOT_FOUND | เปิดรายละเอียด audit (`GET /api/audit-logs/{id}`) ที่ไม่มีอยู่จริง หรืออยู่นอกองค์กรของผู้เรียก | 90 §14 |

> เงื่อนไขว่า mutation ไหนต้องมี `reason` implement ไว้ที่ `lib/audit/reason-policy.ts` (จัดหมวดทุกตารางใน `02`) — โมดูลที่ต้องการเข้มกว่านี้ใช้ code เฉพาะของตัวเอง เช่น `SUSPEND_REASON_REQUIRED` (§6.1), `REJECT_REASON_REQUIRED` (§6.4), `CANCEL_REQUIRES_REASON` (§6.8) · `REQUIRED_MISSING` (§6.1) ใช้กับ audit entry ที่ field บังคับไม่ครบ

## 7. Validation Code Naming Convention

ตรวจสอบแล้วไม่มี code ซ้ำกันข้ามไฟล์ — ใช้ pattern `[ENTITY/CONTEXT]_[CONDITION]` เป็นภาษาอังกฤษตัวพิมพ์ใหญ่ คั่นด้วย underscore เสมอ ทุก code ใหม่ที่เพิ่มทีหลังต้องเช็ค list นี้ก่อนว่าซ้ำหรือไม่

## 8-16. (ไม่ใช้กับไฟล์ประเภทนี้)

ดูรายละเอียดเชิง business ของแต่ละ validation ที่ไฟล์ต้นทาง

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **Error code ทุกตัวใช้ pattern `[ENTITY/CONTEXT]_[CONDITION]`** ภาษาอังกฤษตัวพิมพ์ใหญ่ underscore คั่น — ไม่มี code ซ้ำข้ามไฟล์ (§7)
- **ไฟล์นี้เป็น single source of truth ของ error code ทั้งระบบ** — code ใหม่ต้องเช็คที่นี่ก่อนตั้งชื่อ

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- ไม่มี Open Item ค้าง — Error code หมวด §6.8 ตรวจสอบกับไฟล์ต้นทาง (31/32/33/34 v2) หลัง Batch 5 ครบแล้วเมื่อ 04/07/2569: `TAX_INVOICE_FIELD_MISSING`/`INVOICE_NUMBER_GAP`/`CANCEL_REQUIRES_REASON` (31 §11), `EDIT_AMOUNT_DIRECTLY`/`COST_CENTER_AUTO_EDIT` (32 §11), `FILING_OVERDUE_WARNING` (33 §11), `EXPORT_BLOCKED_CRITICAL`/`AUTHORIZED_EXCEPTION_REASON_REQUIRED` (34 §11) — ตรงกันทุกตัว (ปิด flag ที่ค้างจาก v2)

---

*เอกสารนี้เป็นไฟล์ที่ 3 ในหมวด Finance Reference (22–29) ต่อจาก `23-finance-state-machines.md` และก่อน `25-finance-permission-matrix.md`*
