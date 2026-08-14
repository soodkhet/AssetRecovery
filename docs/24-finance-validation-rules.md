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
| INVALID_USER_SCOPE | สังกัดไม่ตรงกับ role group: กลุ่ม inhouse/outsource ต้องมี `team_id` · กลุ่ม finance_company ต้องมี `company_id` · กลุ่ม system ต้องไม่มีทั้งคู่ (`08` §7.1) | 08 |
| BANK_ACCOUNT_NAME_MISMATCH | ชื่อบัญชีธนาคารไม่ตรงกับชื่อ payee (เตือน ไม่ reject) | 18 |

### 6.2 หมวดภาษี/VAT (ไฟล์ 13, 19)

| Code | Condition | Source File |
|---|---|---|
| INVALID_WHT_RATE | `wht_rate` ติดลบหรือมากกว่า 100 | 13 |
| VAT_RATE_OVERLAP | ช่วงเวลา VAT Rate ใหม่ทับกับรายการเดิม | 13 |
| VAT_RATE_NOT_FOUND | ไม่มี vat_rate_history ครอบคลุมวันที่ revenue_date | 19 |

### 6.3 หมวดธนาคาร/ไฟล์ (ไฟล์ 13, 17, 35)

| Code | Condition | Source File |
|---|---|---|
| BANK_FILE_NOT_TESTED | ใช้ bank file format ที่ยังไม่ผ่านทดสอบไปสร้างไฟล์โอนจริง | 13 |
| DUPLICATE_PAYMENT_FILE | สร้างไฟล์โอนซ้ำสำหรับ batch ที่มี idempotency_key อยู่แล้ว (เตือน ไม่ reject ทันที) | 17 |
| MIXED_SIDE_BATCH | พยายามรวมรายการ inhouse และ outsource ในรอบเดียวกัน | 17 |
| MATCH_NOTE_REQUIRED | จับคู่ manual ที่ยอดไม่ตรงเป๊ะ โดยไม่กรอกหมายเหตุ | 35 |
| ALREADY_MATCHED | พยายามจับคู่ transaction ที่ matched ไปแล้ว (เตือน) | 35 |

### 6.4 หมวด Claim/Advance/Approval (ไฟล์ 15, 16) — แก้ไขแล้ว

| Code | Condition | Source File |
|---|---|---|
| ADVANCE_PENDING_SETTLEMENT | ขอ Advance ใหม่ทั้งที่มียอดเดิม **`approved` หรือ `overdue`** ค้างอยู่ (แก้จาก `waiting_settlement` เดิมที่ถูกตัดออก) | 15 |
| USED_EXCEEDS_REQUEST_NO_TOPUP | เคลียร์ยอด Advance ที่ used_amount > requested_amount | 15 |
| REJECTION_REASON_REQUIRED | ปฏิเสธ Advance หรือ Adjustment (`rejected`) โดยไม่กรอก rejection_reason | 15, 20 |
| REJECT_REASON_REQUIRED | กด reject_expense โดยไม่กรอกเหตุผล | 15, 16, 41 |
| APPROVAL_STEP_OUT_OF_ORDER | อนุมัติขั้นที่ยังไม่ถึงตา | 16 |
| SEGREGATION_OF_DUTIES_VIOLATION | ผู้อนุมัติคนเดียวกันอนุมัติซ้ำ 2 ขั้น ขณะ enforce_segregation_of_duties=true | 16 |

### 6.5 หมวด Payout/Payee (ไฟล์ 17, 18)

| Code | Condition | Source File |
|---|---|---|
| UNVERIFIED_PAYEE_IN_PAYOUT | รวม Payee ที่ unverified เข้า Payout Batch | 17, 18 |

### 6.6 หมวด Revenue/Billing (ไฟล์ 19)

| Code | Condition | Source File |
|---|---|---|
| NO_REVENUE_TO_BILL | สร้างรอบวางบิลแต่ไม่มี Revenue ที่ ready_for_billing | 19 |
| EDIT_BILLED_REVENUE | แก้ Revenue ที่ผูก Billing Batch ที่ไม่ใช่ draft แล้ว | 19 |

### 6.7 หมวด Adjustment / Period Lock (ไฟล์ 13, 20, 30)

| Code | Condition | Source File |
|---|---|---|
| PERIOD_LOCKED_DIRECT_EDIT | แก้ source record ตรงขณะรอบบัญชี locked | 13, 30 |
| REASON_REQUIRED | สร้าง Adjustment โดยไม่ระบุเหตุผล | 20 |
| INSUFFICIENT_APPROVAL_LEVEL | อนุมัติ Adjustment ของรายการ locked โดยไม่ใช่ Executive | 20 |
| NOT_READY_CRITICAL_OPEN | ปิดงวดขณะมี critical exception เปิดอยู่ | 30 |
| NOT_READY_RECONCILE_INCOMPLETE | ปิดงวดขณะ Bank Reconcile ยังไม่ครบ 100% | 30 |
| NOT_READY_BILLING_REVENUE_MISMATCH | ปิดงวดขณะยอด Billing Batch ยังไม่ sync ตรงกับ Revenue ของรอบนั้น (เงื่อนไขที่ 3 ของ Readiness Check ไฟล์ 30 §6.2) | 30 |
| UNLOCK_REQUIRES_EXECUTIVE | ปลดล็อกรอบ locked โดยไม่ใช่ Executive | 30 |

### 6.8 หมวดเอกสารทางการ/บัญชี (ไฟล์ 31, 32, 34)

| Code | Condition | Source File |
|---|---|---|
| TAX_INVOICE_FIELD_MISSING | ฟิลด์บังคับของใบกำกับภาษีไม่ครบ | 31 |
| INVOICE_NUMBER_GAP | generate invoice_number ไม่ต่อเนื่อง (ไม่ควรเกิดในทางปฏิบัติ) | 31 |
| CANCEL_REQUIRES_REASON | ยกเลิกใบกำกับภาษีโดยไม่ระบุเหตุผล | 31 |
| EDIT_AMOUNT_DIRECTLY | แก้ยอดเงินตรงในไฟล์ 32 (ต้องผ่าน Adjustment) | 32 |
| COST_CENTER_AUTO_EDIT | แก้ cost_center ของรายการที่ mapping_rule = auto | 32 |
| EXPORT_BLOCKED_CRITICAL | Export Pack ขณะมี critical exception เปิดอยู่ | 34, 37 |
| AUTHORIZED_EXCEPTION_REASON_REQUIRED | สร้าง Authorized Exception โดยไม่กรอกเหตุผล | 34 |
| FILING_OVERDUE_WARNING | เลยกำหนดนำส่งภาษีแต่ยัง pending (เตือน ไม่ block) | 33 |
| WHT_CANCEL_REQUIRES_REASON | ยกเลิก WHT Certificate โดยไม่กรอก cancel_reason | 33 |

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
