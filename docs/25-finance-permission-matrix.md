# 25-finance-permission-matrix.md

# 25 — Finance Permission Matrix (เมทริกซ์สิทธิ์รวมทั้งระบบ)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted)
> Document Level: Finance Reference — เอกสารอ้างอิงเชิงเทคนิค ไม่มีหน้าจอ UI ของตัวเอง (การตั้งค่าจริงอยู่ที่ไฟล์ 13 §6.10 Functional Permission Matrix)
> เอกสารอ้างอิง: สรุปรวมจากไฟล์ 07 §5, 10-21, 30-37 ทั้งหมด

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | สร้างไฟล์ครั้งแรก — Permission Matrix รวม 6 กลุ่มไฟล์ |
| v2 | 03/07/2569 | Reformat ตามมาตรฐานเอกสารชุดใหม่ + แยก Decisions/Open Items ชัดเจน — **เนื้อหาเดิมคงไว้ครบ ไม่มีการเปลี่ยน permission ใดๆ** (การแก้ไข Batch 3 ไม่กระทบสิทธิ์ ตรวจสอบแล้ว) |
| v2.2 | 15/08/2569 | **เพิ่ม §8.1 "endpoint ที่ผูกกับตัวผู้ใช้เอง (self-scoped)"** (พบตอนรีวิว Phase 5) — `/api/notifications*`, `/api/field/notifications*`, `/api/meta/menu` ใช้ `requireSession()` ไม่ผูก capability เพราะคืนเฉพาะข้อมูลของผู้เรียกและกรอง `user_id + organization_id` ที่ชั้น service · **ทุก role ต้องอ่านกล่องของตัวเองได้** (พนักงานภาคสนามไม่มี capability หลังบ้านเลย) ⇒ ผูก capability = ตัดคนที่ต้องใช้จริงออก · ไฟล์นี้ไม่เคยมีแถวของ notification จึงถูกหยิบเป็น finding ซ้ำทุกรอบรีวิว — บันทึกเงื่อนไขการเข้ากลุ่มนี้ไว้ให้ชัด · **ไม่กระทบ permission เดิมข้อใด** |
| v2.1 | 04/07/2569 | แก้จำนวน role อ้างอิง "14" → "15" ตามไฟล์ 07 v2.2 (แก้ตัวเลขอ้างอิงเท่านั้น ไม่กระทบ permission) |
| v2.3 | 14/08/2569 | **แก้เชิงอรรถ §16.1 ตามมติ PO (Phase 1.6)**: "✅ only" = ล็อกกับ role ที่ติดสัญลักษณ์นั้น (ไม่ใช่ Superadmin เสมอไป) และมี **9 รายการ** (Superadmin 6 + บริหาร 3) ไม่ใช่ 7 — เดิมนับตกหล่นและเหมารวมเจ้าของสิทธิ์ผิด · **ช่องในตาราง §7 ไม่เปลี่ยนแม้แต่ช่องเดียว** |
| v2.2 | 05/07/2569 | **DEC-009 — เพิ่ม §16.1 mapping สัญลักษณ์ → ระดับสิทธิ์ในระบบ**: ✅ → `manage`, 👁️ → `view`, — → ไม่มี record · Superadmin = manage ทุกรายการโดยนิยาม · "✅ only" = ล็อกเฉพาะ Superadmin — **เนื้อหา matrix เดิมไม่เปลี่ยนแม้แต่ช่องเดียว** ไฟล์นี้ยังเป็น source of truth ของสิทธิ์รายฟังก์ชัน (UI ครบ 37 รายการใน `settings.html`) |

ขอบเขตเอกสารนี้: รวม Permission Requirement ของทุกไฟล์ในโมดูล Finance/Accounting เป็น matrix เดียวตาม Role — ให้เห็นภาพรวมว่าแต่ละ role ทำอะไรได้บ้างทั้งระบบ

**ไม่รวมอยู่ในไฟล์นี้**: รายชื่อ Role เต็ม 15 role (ดู `07-roles-permissions.md`), การตั้งค่า Functional Permission Matrix จริง (ดู `13-accounting-finance-settings.md` §6.10)

---

## 1. Summary

รวม Permission Requirement ของทุกไฟล์ในโมดูล Finance/Accounting เป็น matrix เดียวตาม Role — ให้เห็นภาพรวมว่าแต่ละ role ทำอะไรได้บ้างทั้งระบบ

## 2. Purpose

ป้องกันสิทธิ์ขัดแย้งกันระหว่างไฟล์ และเป็นจุดอ้างอิงตอน implement role-based access control (RBAC)

## 3-5. (ไม่ใช้กับไฟล์ประเภทนี้)

เอกสารนี้เป็น technical reference ล้วน — ไม่มี Scope แยกนอกเหนือจาก matrix ด้านล่าง

## 6. Roles ที่ใช้ในโมดูล Finance/Accounting (อ้างอิงจาก Master Role List ไฟล์ 07 §5)

| Role | คำอธิบาย |
|---|---|
| Superadmin | สิทธิ์สูงสุด — ตั้งค่าระบบ, ภาษี, Permission Matrix เอง |
| ธุรการ (Admin) | บันทึกข้อมูลและแนบเอกสารตามสิทธิ์ที่ได้รับมอบหมาย |
| การเงิน (Finance) | จัดการ Claim, Advance, Payout, Billing, Payee — งานประจำวันฝั่งการเงิน |
| บัญชี (Accounting) | จัดการ Sales/Receipts, Expenses, WHT, Bank Reconcile, Monthly Close — งานประจำวันฝั่งบัญชี |
| บริหาร (Executive) | อนุมัติขั้นสุดท้ายที่มีความเสี่ยงสูง (ปลดล็อกรอบบัญชี, Adjustment ของรอบ locked, รายการเกินเพดาน) |
| เจ้าหน้าที่อนุมัติเคส (Case Approver) | พิจารณารับ/ไม่รับเคส, อนุมัติ recycle — เกี่ยวข้องกับ Finance/Accounting ทางอ้อมผ่าน `reject_evidence` ที่กระทบ Revenue (ไฟล์ 19 §6.1) |
| Company User | ผู้ใช้ฝั่งบริษัทไฟแนนซ์ — เห็นเฉพาะข้อมูลของบริษัทตัวเอง (3 ระดับ: ผู้จัดการ/หัวหน้า/แอดมิน) |
| พนักงานติดตามทรัพย์ (Field Agent) | พนักงานภาคสนาม — ขอเงินทดรอง, ดูข้อมูล payee/ค่าตอบแทนของตัวเอง |
| ผู้จัดการทีมติดตามทรัพย์ (Manager) | อนุมัติขั้นต้นของค่าตอบแทนทีมตัวเอง (เฉพาะทีมที่ดูแล) |
| หัวหน้า (Supervisor) | ระดับรองจากผู้จัดการ — ไม่มี capability ฝั่ง Finance/Accounting โดยตรง |

## 7. Permission Matrix รวม (จัดกลุ่มตามไฟล์ต้นทาง)

### 7.1 Master Data (ไฟล์ 10, 12, 13)

| Capability | Superadmin | ธุรการ (Admin) | Finance | Accounting | Executive |
|---|---|---|---|---|---|
| จัดการ Finance Company | ✅ only | — | — | — | — |
| จัดการ Service Fee Template | ✅ only | — | — | — | — |
| ดูข้อมูล Master Data | ✅ | 👁️ | 👁️ | 👁️ | 👁️ |
| แก้ไข Tax Profile / VAT Rate | ✅ only | — | — | — | — |
| แก้ไข Period Lock Policy | ✅ only | — | — | — | — |
| แก้ไข Tax Invoice Numbering | ✅ only | — | — | — | — |

### 7.2 ฝั่งรายจ่าย (ไฟล์ 15, 16, 17, 18)

| Capability | Finance | Manager | Executive | Field Agent |
|---|---|---|---|---|
| อนุมัติ Claim ขั้น Manager | — | ✅ (เฉพาะทีมตัวเอง) | — | — |
| อนุมัติ/ตีกลับ Claim ขั้น Finance | ✅ | — | — | — |
| อนุมัติ Claim ที่เกินเพดาน | — | — | ✅ | — |
| ขอเงินทดรองจ่าย / เคลียร์ยอด | 👁️ (ตรวจสอบ) | — | — | ✅ (เจ้าของ) |
| จัดการ Payout Batch | ✅ | — | — | — |
| สร้างไฟล์โอนเงิน | ✅ (การเงิน — ไม่มีการแบ่งระดับย่อยภายใน role นี้) | — | — | — |
| จัดการ Payee Profile | ✅ | — | — | 👁️ (ของตัวเอง) |

### 7.3 ฝั่งรายรับ (ไฟล์ 19, 31)

| Capability | Finance | Accounting | Executive | Company User |
|---|---|---|---|---|
| จัดการ Billing Batch | ✅ | 👁️ | 👁️ | — |
| ออก/ยกเลิกใบกำกับภาษี | — | ✅ | — | — |
| ดูยอดของบริษัทตัวเอง | — | — | — | ✅ (own scope) |

### 7.4 Adjustment & Period Lock (ไฟล์ 20, 30)

| Capability | Finance | Accounting | Executive |
|---|---|---|---|
| สร้าง Adjustment | ✅ | — | — |
| อนุมัติ Adjustment (collecting/sent) | ✅ | — | ✅ (ถ้า sent) |
| อนุมัติ Adjustment (locked) | — | — | ✅ only |
| จัดการรอบบัญชี (collecting→sent) | — | ✅ | — |
| ปลดล็อกรอบ locked | — | — | ✅ only |

### 7.5 ฝั่งบัญชี (ไฟล์ 32, 33, 34, 35, 36, 37)

| Capability | Accounting | Finance | Executive |
|---|---|---|---|
| map Cost Center (manual) | ✅ | 👁️ | — |
| ออกหนังสือรับรอง WHT, mark filed | ✅ | 👁️ | — |
| จัดการ Exception | ✅ | 👁️ | — |
| สร้าง Authorized Exception | — | — | ✅ only |
| Import statement / จับคู่ Bank | ✅ | 👁️ | — |
| บันทึก/ตอบ Accountant Question | ✅ | 👁️ | — |
| Export Accounting Pack | ✅ | 👁️ | — |

### 7.6 รายงาน (ไฟล์ 14, 21)

| Capability | Finance | Accounting | Executive |
|---|---|---|---|
| ดู Dashboard / Profitability Report | 👁️ | 👁️ | 👁️ |

> สัญลักษณ์: ✅ = ทำได้เต็มสิทธิ์ | 👁️ = read-only | — = ไม่มีสิทธิ์

## 8. ข้อสังเกตเรื่องความสอดคล้อง

ตรวจสอบแล้วไม่พบสิทธิ์ขัดแย้งกันข้ามไฟล์ — หลักการที่ใช้สม่ำเสมอ:

- **Finance** ดูแลฝั่งเงิน (Claim, Advance, Payout, Billing, Payee) — เป็น operational role หลัก
- **Accounting** ดูแลฝั่งบันทึกบัญชี/เอกสารทางการ/ปิดงวด — เป็น operational role หลักอีกฝั่ง
- **Executive** ถูกเรียกใช้เฉพาะจุดที่มีความเสี่ยงสูง (ปลดล็อก, อนุมัติเกินเพดาน, ยกเว้น Critical Exception) — ไม่ใช่ operational role ประจำวัน
- **Superadmin** จำกัดเฉพาะ Master Data ที่กระทบทั้งระบบ (ภาษี, Permission Matrix เอง, Period Lock Policy)

### 8.1 ข้อยกเว้น: endpoint ที่ผูกกับตัวผู้ใช้เอง (self-scoped) — เพิ่ม 15/08/2569

endpoint กลุ่มนี้ **ไม่ผูกกับ capability ใดเลย** ใช้แค่ "ต้องล็อกอิน" (`requireSession()`) เพราะข้อมูลที่คืนเป็น *ของผู้เรียกคนนั้นคนเดียว* และถูกกรองด้วย `user_id + organization_id` ที่ชั้น service เสมอ — ไม่มีทางเห็น/แก้ของคนอื่นแม้เป็น Superadmin:

| Endpoint | เหตุผล |
|---|---|
| `GET /api/meta/menu` | เมนูของตัวเอง (คำนวณจาก role ของผู้เรียก) |
| `GET /api/notifications` · `PATCH /api/notifications/:id/read` · `PATCH /api/notifications/read-all` | กล่องแจ้งเตือนของตัวเอง — **ทุก role ต้องอ่านได้** รวมพนักงานภาคสนามที่ไม่มี capability หลังบ้านเลย ⇒ ผูก capability = ตัดคนที่ต้องใช้จริงออก |
| `GET /api/field/notifications` · `PATCH /api/field/notifications/read` | เหมือนข้างบน ฝั่ง Field Tracker |

> ⚠️ **ไม่ใช่ข้อยกเว้นของ DEC-002** — DEC-002 บังคับว่า "ตรวจสิทธิ์ที่ API layer ทุก endpoint" ซึ่งกลุ่มนี้ยังทำครบ (session + scope ที่ชั้นข้อมูล) เพียงแต่ *หน่วยของสิทธิ์* คือ "เจ้าของข้อมูล" ไม่ใช่ capability · การเพิ่ม endpoint เข้ากลุ่มนี้ต้องผ่านเงื่อนไขครบทั้งสองข้อ: (1) คืนเฉพาะข้อมูลของผู้เรียก (2) กรอง `user_id + organization_id` ที่ชั้น service ไม่ใช่รับ id จาก body/query · ระบุไว้ที่นี่เพื่อไม่ให้ถูกหยิบขึ้นมาเป็น finding ซ้ำทุกรอบรีวิว

## 9. Workflow / Lifecycle

ไม่มี — เป็นเอกสารอ้างอิงสิทธิ์ ไม่มี state ของตัวเอง

## 10-16. (ไม่ใช้กับไฟล์ประเภทนี้)

ดูรายละเอียดเชิง business ของแต่ละ permission ที่ไฟล์ต้นทาง

---

### 16.1 Mapping สัญลักษณ์ในไฟล์นี้ → ระดับสิทธิ์ในระบบ (DEC-009, 05/07/2569)

| สัญลักษณ์ในตาราง matrix | ค่าในระบบ (`role_capabilities.access_level`) | ความหมาย |
|---|---|---|
| ✅ | `manage` | ทำได้ — เข้าถึงและแก้ไข/สั่งการฟังก์ชันนั้นได้เต็ม |
| 👁️ | `view` | ดูอย่างเดียว — เห็นข้อมูลแต่กดสั่งการไม่ได้ |
| — | ไม่มี record | ไม่มีสิทธิ์ — มองไม่เห็นเมนู/ข้อมูลของฟังก์ชันนั้น |
| ✅ only | **ล็อกกับ role ที่ติดสัญลักษณ์นั้นเท่านั้น** | มอบให้ role อื่นไม่ได้ + แก้ระดับของเจ้าของไม่ได้ (**9 รายการ** — Superadmin 6 + บริหาร 3) — UI แสดง 🔒 แก้ไขไม่ได้ |

> **แก้ตัวเลข 14/08/2569 (มติ PO — Phase 1.6)**: เดิมเชิงอรรถนี้เขียนว่า "7 รายการ ล็อกเฉพาะ Superadmin"
> ซึ่งนับตกหล่นและเหมารวมเจ้าของสิทธิ์ผิด — นับรายแถวจริงในตาราง §7 ได้ `✅ only` **8 แถว**
> (คอลัมน์ Superadmin 5: จัดการ Finance Company / จัดการ Service Fee Template / แก้ไข Tax Profile-VAT /
> แก้ไข Period Lock Policy / แก้ไข Tax Invoice Numbering · คอลัมน์ **บริหาร** 3: อนุมัติ Adjustment (locked) /
> ปลดล็อกรอบ locked / สร้าง Authorized Exception) บวก **จัดการ Role/Permission** ที่เป็นของ Superadmin
> ตาม `07` §12 (อยู่นอกตารางนี้ แต่อยู่ในรายการ 37 ข้อของ `13` §6.10 และ mockup `settings.html` ad7)
> ⇒ รวม **9 รายการ** · implementation: `lib/roles/capability-locks.ts` (มีเทสต์ยามจำนวนและเจ้าของ)
> **เนื้อหา matrix §7 ไม่เปลี่ยนแม้แต่ช่องเดียว** — แก้เฉพาะคำอธิบายสัญลักษณ์ให้ตรงกับตาราง

> Superadmin มีสิทธิ์ `manage` ทุกรายการโดยนิยาม — enforce ที่ permission middleware (DEC-002) ไม่เก็บ record · UI ตั้งค่าเป็น dropdown 3 ระดับต่อ role ดู `settings.html` (37 รายการ 4 กลุ่มครบตามไฟล์นี้) · scope ย่อย (เช่น "เฉพาะทีมตัวเอง", "own scope") ยังบังคับที่ business logic เพิ่มจากระดับสิทธิ์

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **แบ่งบทบาทชัดเจน 2 operational role หลัก**: Finance (ฝั่งเงิน) กับ Accounting (ฝั่งบันทึกบัญชี) ไม่ทับซ้อนกัน (§8)
- **Executive จำกัดเฉพาะจุดความเสี่ยงสูง** ไม่ใช่ operational role ประจำวัน (§8)
- **Superadmin จำกัดเฉพาะ Master Data ที่กระทบทั้งระบบ** (ภาษี, Permission Matrix, Period Lock Policy) (§8)
- **ไม่พบสิทธิ์ขัดแย้งข้ามไฟล์** — ตรวจสอบครบทุกไฟล์ต้นทางแล้ว (§8)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- ไม่มี Open Item ใหม่ — เป็นการรวบรวมจาก Permission ที่กำหนดไว้แล้วในไฟล์ต้นทางทั้งหมด ไม่พบความขัดแย้ง

---

*เอกสารนี้เป็นไฟล์ที่ 4 ในหมวด Finance Reference (22–29) ต่อจาก `24-finance-validation-rules.md` และก่อน `26-finance-data-model.md`*
