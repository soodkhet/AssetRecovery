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
| v2.4 | 05/10/2569 | **มติ PO 05/10/2569 (UAT U3–U8)**: §7.1 เพิ่ม `manage_wht_policy` (แก้ค่าตั้งภาษีหัก ณ ที่จ่าย) — Superadmin + บริหาร (นอก Functional Matrix 37 รายการ · seed บริหาร = manage) · อ่านค่าตั้งใช้ `view_master_data` |
| v2.5 | 05/10/2569 | **มติ PO 05/10/2569 (UAT U40/U41)**: §7.5 เพิ่ม `manage_customer_wht` (ติดตาม/บันทึกรับหนังสือ 50 ทวิ ที่ลูกค้าหักเรา) — ธุรการ/การเงิน/บัญชี = manage · บริหาร = view (นอก Functional Matrix 37 รายการ — ผู้ใช้: "ธุรการจะได้ช่วยตาม 50 ทวิ ได้ด้วย") · เงินรับรอตรวจสอบ (ย้ายเข้า/คืนเงินผู้โอน) ใช้ `manage_bank_reconciliation` เดิม (บัญชี manage · การเงิน view) |
| v2.8 | 05/10/2569 | **มติ PO 05/10/2569 (U14 — บันทึกใบลดหนี้ที่สำนักงานบัญชีออก)**: §7.3 เพิ่มแถวบันทึก/ยกเลิกใบลดหนี้ — **ไม่เพิ่ม capability ใหม่** ใช้ `manage_tax_invoice` (บัญชี manage) · การเงินดูทะเบียนผ่าน `manage_sales_expenses` (view) · ป้าย "รอใบลดหนี้" อ่านได้ด้วย `create_adjustment`/`approve_adjustment` |
| v2.6 | 05/10/2569 | **มติ PO 05/10/2569 (UAT U22/U23)**: §8.2 ใหม่ — สิทธิ์คลังสินค้า (นอก Functional Matrix · เจ้าของคือ `44` §13): ผู้จัดการ/หัวหน้าทีมทั้งสองฝั่งได้ `intake_asset` ระดับ `view` = อ่านคลังอย่างเดียวเฉพาะทรัพย์ของเคสในทีมตัวเอง (seed เติมแถวใหม่เท่านั้น ไม่ทับแถวที่ปรับไว้) · Export ใบส่งมอบเปิดให้ผู้ถือ `view_master_data` (การเงิน/บัญชี/บริหาร) + ธุรการ — ไม่รวมผู้ถือ `intake_asset` ระดับ view |
| v2.7 | 05/10/2569 | **มติ PO 05/10/2569 (UAT U30 · BUG-109)** — §7.2 เพิ่มแถว "เปลี่ยนวิธีคืน / บันทึกรับคืนเงินทดรองแยก" = การเงินเท่านั้น (`manage:approve_advance` — capability เดิม ไม่เพิ่มตัวใหม่) |
| v2.3 | 14/08/2569 | **แก้เชิงอรรถ §16.1 ตามมติ PO (Phase 1.6)**: "✅ only" = ล็อกกับ role ที่ติดสัญลักษณ์นั้น (ไม่ใช่ Superadmin เสมอไป) และมี **9 รายการ** (Superadmin 6 + บริหาร 3) ไม่ใช่ 7 — เดิมนับตกหล่นและเหมารวมเจ้าของสิทธิ์ผิด · **ช่องในตาราง §7 ไม่เปลี่ยนแม้แต่ช่องเดียว** |
| v2.2 | 05/07/2569 | **DEC-009 — เพิ่ม §16.1 mapping สัญลักษณ์ → ระดับสิทธิ์ในระบบ**: ✅ → `manage`, 👁️ → `view`, — → ไม่มี record · Superadmin = manage ทุกรายการโดยนิยาม · "✅ only" = ล็อกเฉพาะ Superadmin — **เนื้อหา matrix เดิมไม่เปลี่ยนแม้แต่ช่องเดียว** ไฟล์นี้ยังเป็น source of truth ของสิทธิ์รายฟังก์ชัน (UI ครบ 37 รายการใน `settings.html`) |
| v2.9 | 05/10/2569 | **มติ PO 05/10/2569 (U6/O43 D1/D2/D11) — §7.3 แถวพอร์ทัล**: "ดูยอดของบริษัทตัวเอง" ผูกกับ capability `portal_finance` (ค่าเริ่มต้น = ผู้จัดการบริษัท) + ตารางค่าเริ่มต้น capability พอร์ทัล 5 ตัวของ 3 role ผู้ใช้บริษัท · ไม่อยู่ในรายการ "✅ only" ของ §16.1 (Superadmin ปรับได้) · ผู้ใช้บริษัทไม่เข้า API ภายใน — sync `97` v5 / `07` v2.4 |
| v2.10 | 05/10/2569 | **มติ PO 05/10/2569 (U59) — §7.3 ดูพอร์ทัลในฐานะลูกค้า**: capability ใหม่ `view_client_portal_as` (นอก matrix · อ่านอย่างเดียว) ค่าเริ่มต้น ธุรการ 👁️ · Superadmin โดยนิยาม · role ภายในอื่นมอบได้ (ไม่ใช่ "✅ only" — รายการล็อกยังคง 9) · ผู้ใช้บริษัทผูกแล้วไม่มีผล — รายละเอียด `97` §13.1 |
| v2.11 | 06/10/2569 | **มติ PO 06/10/2569 (UAT U93)**: §7.1 เพิ่ม `manage_holidays` (ปฏิทินวันหยุด `13` §6.15) — ธุรการ/การเงิน/บัญชี ✅ · บริหาร 👁️ · Superadmin โดยนิยาม · ไม่ใช่ "✅ only" (มอบ role อื่นได้) · capability นอก Functional Matrix 37 รายการ |
| v2.12 | 06/10/2569 | **มติ PO 06/10/2569 (U97 — PDPA)**: §7.1 เพิ่ม `manage_data_retention` (ระยะเก็บเอกสารลูกหนี้ `13` §6.16) — บริหาร ✅ · Superadmin โดยนิยาม · ไม่ล็อก (ไม่ใช่ "✅ only") · ต้องมีเหตุผล |
| v2.13 | 06/10/2569 | **มติ PO 06/10/2569 (U99)**: §7.1 เพิ่มแถว "แก้ไขข้อมูลองค์กร/โลโก้" — ใช้ `manage_invoice_numbering` (✅ only Superadmin — ไม่เพิ่ม capability) · ดูด้วย `view_master_data` |
| v2.14 | 06/10/2569 | **มติ PO 06/10/2569 (UAT U102)**: แถว "แก้ไข Tax Invoice Numbering" ขยายเป็น **"แก้ไขเลขที่เอกสาร"** ครอบทุกชนิดเอกสารที่ระบบออกเลข (INV/BL/LOT/DLV/PV/WHT/ADV/RAV/CRT — `13` §6.12) · capability เดิม `manage_invoice_numbering` (✅ only Superadmin) ไม่เปลี่ยน |
| v2.15 | 06/10/2569 | **มติ PO 06/10/2569 (U104)**: §7.1 เพิ่ม `view_document_samples` (หน้าตัวอย่างเอกสารทั้งหมด — เมนูบัญชี → เมนูย่อย · `28` §6.5) — การเงิน/บัญชี/บริหาร 👁️ · Superadmin โดยนิยาม · ไม่ล็อก (ไม่ใช่ "✅ only" — มอบ role อื่นได้) · อ่านอย่างเดียว (`manage` มีผลเท่า `view`) · capability นอก Functional Matrix 37 รายการ |
| v2.15 | 06/10/2569 | **มติ PO 06/10/2569 (U100/U103)** — §7.2 เพิ่ม 3 แถว: ดาวน์โหลดใบเบิก/ใบรับคืนเงินทดรอง PDF (การเงิน + เจ้าของ) · ดาวน์โหลดใบรับรองแทนใบเสร็จ (เจ้าของ · การเงิน · ผู้จัดการทีมเฉพาะทีม) · อัปโหลดฉบับเซ็น (เจ้าของ + การเงิน) — ใช้ capability เดิม ไม่เพิ่มตัวใหม่ · นอก scope = 404 |

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
| แก้ไขค่าตั้งภาษีหัก ณ ที่จ่าย (`manage_wht_policy` — ฐาน/50 ทวิ/ประเภทเงินได้ · มติ PO 05/10/2569 UAT U8) | ✅ | — | — | — | ✅ |
| จัดการปฏิทินวันหยุด (`manage_holidays` — เพิ่ม/ลบ/นำเข้าวันหยุด ใช้เลื่อนกำหนดยื่นภาษี · มติ PO 06/10/2569 UAT U93 · ไม่ล็อก · reason บังคับ) | ✅ | ✅ | ✅ | ✅ | 👁️ |
| ตั้งระยะเก็บเอกสารลูกหนี้ (`manage_data_retention` — จำนวนปีหลังปิดเคสก่อนลบไฟล์บัตร/สัญญา/เอกสารลูกหนี้ · PDPA มติ PO 06/10/2569 U97 · ไม่ล็อก · reason บังคับ) | ✅ | — | — | — | ✅ |
| ดูตัวอย่างเอกสารทั้งหมด (`view_document_samples` — PDF ตัวอย่างทุกชนิดจาก renderer จริง ข้อมูลสมมติ + หัวเอกสารองค์กร · ไม่เดินเลขที่เอกสาร · มติ PO 06/10/2569 U104 · ไม่ล็อก) | ✅ | — | 👁️ | 👁️ | 👁️ |
| แก้ไข Period Lock Policy | ✅ only | — | — | — | — |
| แก้ไขเลขที่เอกสาร (Document Numbering — ทุกชนิด รวมใบกำกับภาษี, มติ PO U102) | ✅ only | — | — | — | — |
| แก้ไขข้อมูลองค์กร / โลโก้หัวเอกสาร (`13` §6.17 — ใช้ `manage_invoice_numbering` · มติ PO U99) | ✅ only | 👁️ | 👁️ | 👁️ | 👁️ |

### 7.2 ฝั่งรายจ่าย (ไฟล์ 15, 16, 17, 18)

| Capability | Finance | Manager | Executive | Field Agent |
|---|---|---|---|---|
| อนุมัติ Claim ขั้น Manager | — | ✅ (เฉพาะทีมตัวเอง) | — | — |
| อนุมัติ/ตีกลับ Claim ขั้น Finance | ✅ | — | — | — |
| อนุมัติ Claim ที่เกินเพดาน | — | — | ✅ | — |
| ขอเงินทดรองจ่าย / เคลียร์ยอด | 👁️ (ตรวจสอบ) | — | — | ✅ (เจ้าของ) |
| เปลี่ยนวิธีคืน / บันทึกรับคืนเงินทดรองแยก (มติ PO U30 — `manage:approve_advance`) | ✅ | — | — | — |
| ดาวน์โหลดใบเบิก/ใบรับคืนเงินทดรอง PDF (มติ PO U100 — `view:approve_advance` หรือ `view:request_advance` + เจ้าของ · คนอื่น 404) | ✅ | — | — | ✅ (เจ้าของ) |
| ดาวน์โหลดใบรับรองแทนใบเสร็จรับเงิน PDF (มติ PO U103 — เงินทดรอง: `approve_advance` · ใบเบิก: `approve_expense_finance/executive` · ผู้จัดการ: ใบเบิกของทีมที่ดูแล · คนอื่น 404) | ✅ | ✅ (เฉพาะทีมตัวเอง) | ✅ (ใบเบิก) | ✅ (เจ้าของ) |
| อัปโหลดใบรับรองแทนใบเสร็จฉบับเซ็น (มติ PO U103 — เจ้าของ หรือการเงินที่เห็นทั้งองค์กร · ผู้จัดการทีมไม่ได้) | ✅ | — | ✅ (ใบเบิก) | ✅ (เจ้าของ) |
| จัดการ Payout Batch (รวมยกเลิกรอบจ่ายก่อนโอน — มติ PO U67 · `manage:manage_payout_batch`) | ✅ | — | — | — |
| สร้างไฟล์โอนเงิน | ✅ (การเงิน — ไม่มีการแบ่งระดับย่อยภายใน role นี้) | — | — | — |
| จัดการ Payee Profile | ✅ | — | — | 👁️ (ของตัวเอง) |

### 7.3 ฝั่งรายรับ (ไฟล์ 19, 31)

| Capability | Finance | Accounting | Executive | Company User |
|---|---|---|---|---|
| จัดการ Billing Batch | ✅ | 👁️ | 👁️ | — |
| ออก/ยกเลิกใบกำกับภาษี | — | ✅ | — | — |
| บันทึก/ยกเลิกใบลดหนี้ที่สำนักงานบัญชีออก (มติ PO U14 — capability เดียวกับใบกำกับ `manage_tax_invoice` · ดูทะเบียนด้วยสิทธิ์รายการขาย) | 👁️ | ✅ | — | — |
| ดูยอดของบริษัทตัวเอง (พอร์ทัล — `portal_finance`) | — | — | — | 👁️ ผู้จัดการ (own scope · ค่าเริ่มต้น) |

> **Company User = พอร์ทัลเท่านั้น** (มติ PO 05/10/2569 U6/O43 D1/D2): สิทธิ์ของผู้ใช้บริษัทไฟแนนซ์แยกตามหมวดด้วย capability `portal_*` 5 ตัว (อ่านอย่างเดียวเสมอ — `/api/portal/*` = GET) ค่าเริ่มต้นด้านล่าง Superadmin ปรับได้ (ไม่ใช่ "✅ only") · Company User **ไม่เข้าหน้า/API ภายใน** ของ Billing/ใบกำกับ/คลัง/เคส · Superadmin ไม่เข้าพอร์ทัล (D11) · รายละเอียด capability ↔ endpoint ที่ `97` §3.3/§17
>
> | Capability (พอร์ทัล) | ผู้จัดการ | หัวหน้า | แอดมิน |
> |---|---|---|---|
> | `portal_cases` — ภาพรวม + เคส | 👁️ | 👁️ | 👁️ |
> | `portal_finance` — วางบิล/ใบกำกับภาษี/ยอดค้าง/รายงานสรุป | 👁️ | — | — |
> | `portal_handover` — ล็อตส่งมอบ + รูปทรัพย์ | 👁️ | 👁️ | — |
> | `portal_profile` — ข้อมูลบริษัท | 👁️ | 👁️ | 👁️ |
> | `portal_download` — ดาวน์โหลดเอกสารของหมวดที่เห็น | 👁️ | 👁️ | 👁️ |
>
> **ผู้ใช้ภายในดูพอร์ทัลในฐานะลูกค้า** (มติ PO 05/10/2569 U59 · `97` §13.1): capability `view_client_portal_as` — ค่าเริ่มต้น **ธุรการ 👁️** · Superadmin โดยนิยาม · การเงิน/บัญชี/บริหาร/role อื่น = — (มอบได้ที่หน้าจัดการ Role — ไม่ใช่ "✅ only") · เห็นเหมือนผู้จัดการของบริษัทที่เลือก (ดูอย่างเดียว · ดาวน์โหลดได้) · ทุก endpoint `/api/portal/*?as=<companyId>` ตรวจสิทธิ์นี้ + บริษัทใน org เดียวกันทุก request · ผู้ใช้บริษัทถือสิทธิ์นี้ก็ไม่มีผล (403)

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
| เงินรับรอตรวจสอบ: ย้ายเข้า / จับคู่ภายหลัง / คืนเงินผู้โอน (`manage_bank_reconciliation` — มติ PO U41) | ✅ | 👁️ | — |
| ติดตาม/บันทึกรับหนังสือ 50 ทวิ ที่ลูกค้าหัก (`manage_customer_wht` — มติ PO U40 · **ธุรการ = ✅ ด้วย**) | ✅ | ✅ | 👁️ |
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

### 8.2 สิทธิ์คลังสินค้า (นอก Matrix — เจ้าของ `44` §13) — เพิ่ม 05/10/2569 (มติ PO U22/U23)

| สิทธิ์ | Capability ที่ใช้ | Role ค่าเริ่มต้น |
|---|---|---|
| อ่านคลังทั้งองค์กร | `view_master_data` (view) | การเงิน, บัญชี, บริหาร, ธุรการ |
| ทำงานคลัง (รับเข้า/ตีกลับ/สร้างล็อต/ยืนยัน) | `intake_asset` / `reject_asset_intake` / `create_handover_lot` / `confirm_handover_lot` (manage) | ธุรการ |
| อ่านคลังเฉพาะทรัพย์ของเคสในทีมตัวเอง | `intake_asset` (**view**) + scope ทีม | ผู้จัดการทีม, หัวหน้าทีม (in-house/outsource) |
| Export ใบส่งมอบ Excel/PDF | `create_handover_lot` หรือ `view_master_data` | ธุรการ, การเงิน, บัญชี, บริหาร (อ่านอย่างเดียว ไม่แก้ล็อต) |

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
> แก้ไข Period Lock Policy / แก้ไขเลขที่เอกสาร · คอลัมน์ **บริหาร** 3: อนุมัติ Adjustment (locked) /
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
