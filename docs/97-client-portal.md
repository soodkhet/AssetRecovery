# 97-client-portal.md

# 97 — Client Portal (พอร์ทัลบริษัทไฟแนนซ์)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: **Draft — Spec/Mockup Ready** (เขียนสเปคและจะทำ HTML Mockup ต่อ — **ยังไม่ implement จริง** รอ Product Owner ยืนยัน Phase ก่อน deploy — ดู §22)
> Document Level: Platform Module — Pre-Build Spec
> เอกสารอ้างอิง: `07-roles-permissions.md` §5.3 (Finance Company Role Group), `10-finance-companies.md` §7.2 (Company User entity), `38-case-submission.md` (Case), `40-case-assignment-routing.md` / `41-field-tracker-mobile.md` (Field status), `19-revenue-billing-receivable.md` (Billing/AR), `31-accounting-sales-and-receipts.md` (Tax Invoice), `44-asset-custody-handover.md` (HandoverLot), `96-reports.md` (F2/F3), `06-menu-and-navigation-map.md`, `DECISIONS-NEEDED.md` §1.2, `00-project-overview.md` §18, `93-roadmap-open-items.md`
> Supersedes: v3 (03/07/2569)

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | 03/07/2569 | สร้างไฟล์ใหม่ — ร่างเฉพาะส่วนที่ตัดสินใจแล้วจากไฟล์ 07/10 ส่วนที่เหลือปักเป็น Open Item ทั้งหมด |
| v2 | 03/07/2569 | **ขยายเป็น Build Spec ตามที่ Product Owner ยืนยัน scope ในรอบสนทนานี้**: (1) ตัด "ส่งเคสผ่านพอร์ทัล" ออกจาก scope ถาวร — คงช่องทาง API/import/manual ตามไฟล์ 38 เดิม ไม่แก้ไฟล์ 38 (2) เพิ่ม §5-20 เต็มรูปแบบ ครอบคลุม 4 หมวดที่ยืนยัน: ติดตามสถานะเคส (แบบสรุป 3 สถานะ ไม่ลงรายละเอียด field-side), เอกสารการเงิน/บัญชี (Billing/AR, ใบกำกับภาษี, ใบส่งมอบทรัพย์), รายงานสรุป (scope เฉพาะบริษัทตัวเอง) (3) ยืนยัน: ไม่เพิ่มสิทธิ์ผู้จัดการบริษัทเชิญ/ปิดใช้งาน Company User เอง — คงผ่าน Superadมิน เท่านั้นตามไฟล์ 10 เดิม ไม่แก้ไฟล์ 10 (4) Phase, Auth method, Notification channel, ความแตกต่างสิทธิ์ 3 ระดับย่อย — ยังเป็น Open Item เดิม (ดู §22) |
| v3 | 03/07/2569 | **ปรับจาก feedback บน HTML Mockup เวอร์ชัน Mobile**: (1) Dashboard (ภาพรวม) ตัดรายการเคสออก รวมเนื้อหา Reports (แนวโน้ม 6 เดือน + AR Aging) เข้ามาเป็นหน้าเดียว — ตัดเมนู "รายงานสรุป" ออกจาก nav (2) เพิ่มตัวกรองสถานะให้ Billing Batch และ HandoverLot (3) หน้าส่งมอบทรัพย์ (§6.4): เพิ่ม drill-down ดูรายการ+รายละเอียดทรัพย์ทีละชิ้นในแต่ละ Lot รวมรูปถ่าย 7 มุมตอนรับเข้าคลัง (4) §6.1 (เคสของเรา): เคสสถานะ "ติดตามสำเร็จ" อนุญาตให้แสดงรูปสินค้าตอนรับเข้าคลัง (Asset.photos จับคู่ผ่าน case_ref) เพิ่มเติมจากเดิม — ยังคง**ไม่แสดง**หลักฐานปิดงานภาคสนาม (checkins/GPS, videos, audio) เนื่องจากอ่อนไหวกว่า (5) label ฝั่ง UI ปรับให้เป็นมุมมองบริษัทไฟแนนซ์: "สรุปรายได้"→"สรุปยอดเรียกเก็บค่าบริการ", ประเภทส่งมอบ "มารับที่คลัง/จัดส่งให้"→"รับเอง/จัดส่ง", Billing card "รับแล้ว/ค้าง"→"ชำระแล้ว/ค้างชำระ" |
| v4 | 04/07/2569 | **กลับคำตัดสินใจ Layout เดิม (v1/§21) ตามคำสั่ง PO**: (1) เปลี่ยนจาก Sidebar ฝั่งซ้าย → Top Bar Nav แบบเดียวกับ Back Office ทุกโมดูล (`finance.html`/`settings.html`/`warehouse.html`) — header 64px + tab strip แนวนอน underline style (2) ยกเลิกการขยาย base font-size เป็น 18px เฉพาะพอร์ทัลนี้ กลับไปใช้ 16px มาตรฐานเดียวกับหน้าอื่น (3) ปรับ `badge()`/`kpi()` component ให้ใช้ Tailwind class ตรงกับ `statusBadge()`/`kpi()` ของ `finance.html`/`settings.html` เป๊ะ (text-[10px] badge, การ์ด KPI ขอบสี) (4) ย้ายข้อความ "แสดงเฉพาะข้อมูลบริษัท / โหมดดูอย่างเดียว" จาก sidebar footer เดิม → บรรทัดท้ายเนื้อหาแต่ละหน้าแทน (5) แก้ §5 ให้ตรงกับโครงสร้างเมนูจริงใน mockup (flat 6 เมนู ไม่มี "การเงิน" parent/"รายงานสรุป" ซ้อนแล้วตาม v3 ที่เคยตัดไปแต่ §5 เดิมยังไม่ได้อัปเดตตาม) — Mobile mockup (`97-client-portal-mobile-mockup.html`) **ไม่เปลี่ยน** ยังคง bottom-nav + hamburger ตามเดิม เพราะคำสั่งนี้ระบุเฉพาะเวอร์ชัน Desktop |

ขอบเขตเอกสารนี้: พอร์ทัล **read-only** สำหรับ Company User ให้ดูสถานะเคส/เอกสารการเงิน-บัญชี/รายงานสรุปของบริษัทตัวเอง แทนการให้เจ้าหน้าที่ภายในส่งข้อมูลให้ทีละครั้ง — ไม่มีการสร้าง/แก้ไขข้อมูลใดๆ ผ่านพอร์ทัลนี้

**ไม่รวมอยู่ในไฟล์นี้**: การส่งเคส (ยังคงอยู่ที่ไฟล์ `38-case-submission.md` ผ่าน API/import/manual เท่านั้น — Company User **ไม่มี** direct access สร้างเคส), การสร้าง/จัดการ Company User (อยู่ที่ไฟล์ `10-finance-companies.md` §7.2 — Superadmin only, ไม่ทำซ้ำที่นี่), Workflow ภายในของเคส/การเงิน/บัญชี (อยู่ไฟล์ต้นทางแต่ละโมดูล — ไฟล์นี้อ้างอิงแบบ read-only view เท่านั้น)

---

## 1. Summary
พอร์ทัลสำหรับผู้ใช้งานฝั่งบริษัทไฟแนนซ์ (Company User) เข้าระบบเองเพื่อดูสถานะเคส เอกสารการเงิน/บัญชี และรายงานสรุปของบริษัทตัวเองแบบ read-only แทนการให้เจ้าหน้าที่ภายในส่งข้อมูลให้ทีละครั้ง

## 2. Purpose
ลดภาระงานฝั่งเจ้าหน้าที่ภายในที่ต้องคอยตอบคำถามสถานะเคส/ยอดวางบิลให้บริษัทไฟแนนซ์ด้วยตนเอง โดยให้บริษัทเข้าถึงข้อมูลที่ได้รับอนุญาตได้เองแบบ self-service ภายใต้ขอบเขตสิทธิ์ที่กำหนด

## 3. Scope

### 3.1 In Scope
- โครงสร้างสิทธิ์ 3 ระดับของ Company User (ผู้จัดการ/หัวหน้า/แอดมิน) — อ้างอิงไฟล์ 07 §5.3
- Entity `Company User` (id, company_id, name, email, phone, status) — อ้างอิงไฟล์ 10 §7.2
- หลักการ row-level scope ผ่าน `company_id`
- **ติดตามสถานะเคส** — มุมมองสรุป (ไม่ใช่ raw state machine) จากไฟล์ 38/40/41
- **เอกสารการเงิน/บัญชี** — Billing Batch + AR (ไฟล์ 19), ใบกำกับภาษี (ไฟล์ 31), ใบส่งมอบทรัพย์ (ไฟล์ 44)
- **รายงานสรุป** — Revenue Summary + AR Aging เฉพาะบริษัทตัวเอง (scope-down จากไฟล์ 96 §F2/§F3)
- ทุกหน้าจอเป็น **read-only** ทั้งหมด ไม่มี action สร้าง/แก้ไข/ลบ

### 3.2 Out of Scope (ยืนยันถาวร — ไม่ใช่ Open Item)
- **ส่งเคสผ่านพอร์ทัล** — ไม่ทำ ใช้ช่องทาง API/import/manual เดิมตามไฟล์ 38
- **Company User จัดการ Company User อื่นเอง** — ไม่ทำ คงผ่าน Superadmin ตามไฟล์ 10 §12
- **แก้ไขข้อมูลบริษัทตัวเอง** — ดูอย่างเดียว ต้องแจ้ง Admin ภายในให้แก้ (ตามไฟล์ 10 §5 เดิม)
- **สถานะ field-side ระดับละเอียด** (ชื่อ field agent, วันนัด, เส้นทาง, assigned/accepted/scheduled) — ไม่แสดง แสดงแค่สรุป 3 สถานะ (ดู §10.1)

### 3.3 รอการตัดสินใจ (ดู §22)
- Phase ที่จะเปิดใช้งาน (Phase 1 หรือ Phase 2)
- Authentication method
- Notification channel
- ความแตกต่างของสิทธิ์เห็นข้อมูลระหว่าง 3 ระดับ (ผู้จัดการ/หัวหน้า/แอดมิน) — **สมมติฐานชั่วคราวสำหรับ spec/mockup รอบนี้**: ทั้ง 3 ระดับเห็นข้อมูล scope เดียวกันทั้งหมดของบริษัท (company-wide) เพราะไฟล์ 07 §5.3 ยังไม่ระบุการแบ่งย่อยเชิง feature — เมื่อ PO ยืนยันความแตกต่างจริงจึงค่อยแก้ mockup ให้ตรง (ห้ามถือว่าเป็นค่า final)

## 4. Actors & Responsibilities

|Actor / Role|Responsibilities|Access Scope|Role Group|
|---|---|---|---|
|ผู้จัดการ (Company Manager)|เห็นข้อมูลทั้งหมดของบริษัทตัวเอง (ทุกเคส, ทุกยอดวางบิล, ทุก user ของบริษัท)|Company scope — เต็มรูป|finance_company|
|หัวหน้า (Company Supervisor)|เห็นเหมือนผู้จัดการ ณ ตอนนี้ (ยังไม่มีการแบ่งย่อย — ดู §3.3)|Company scope — เต็มรูป (ชั่วคราว)|finance_company|
|แอดมิน (Company Admin)|เห็นเหมือนผู้จัดการ ณ ตอนนี้ (ยังไม่มีการแบ่งย่อย — ดู §3.3)|Company scope — เต็มรูป (ชั่วคราว)|finance_company|
|Superadmin|สร้าง/แก้ไข Company User (ไฟล์ 10 §12) — ไม่ใช่ actor ของพอร์ทัลนี้โดยตรง|global|system|

## 5. Menu & Navigation

โครงสร้างเมนู: **Top Bar Nav** (v4 — เปลี่ยนจาก Sidebar ฝั่งซ้ายเดิม ให้ใช้ layout เดียวกับ Back Office ทุกโมดูล ตาม `finance.html`/`settings.html`/`warehouse.html` — header สูง 64px คงที่ด้านบน + แถบเมนูแนวนอนใต้ header แบบ underline tab (`border-b-2`) — ดู §21 การตัดสินใจ v4):

```
Header (สูง 64px, sticky): AssetRecovery + พอร์ทัลบริษัทไฟแนนซ์ · [ชื่อบริษัท]  |  ชื่อ user + role badge + logout
Tab Strip (แนวนอน ใต้ header):
├── ภาพรวม (Dashboard)          — สรุป KPI สั้นๆ 4 ใบ (เคสกำลังดำเนินการ/AR ค้าง/ใบกำกับภาษีล่าสุด/Lot รอส่งมอบ)
├── เคสของเรา                    — List + filter สถานะสรุป (ดู §10.1)
├── รอบวางบิล / ยอดค้างชำระ      — ไฟล์ 19 scope-down
├── ใบกำกับภาษี                  — ไฟล์ 31 scope-down
├── ใบส่งมอบทรัพย์               — ไฟล์ 44 scope-down
└── ข้อมูลบริษัท (ดูอย่างเดียว)   — ไฟล์ 10 §7.1 read-only
```

ข้อความ "แสดงเฉพาะข้อมูลของ [บริษัท] · โหมดดูอย่างเดียว (Read-only)" ย้ายจาก sidebar footer เดิม → แสดงเป็นบรรทัดเล็กท้ายเนื้อหาแต่ละหน้าแทน

Text size: ใช้ base font-size เดียวกับหน้าอื่น (16px มาตรฐาน — ยกเลิกการขยายเป็น 18px ที่เคยทำเฉพาะพอร์ทัลนี้ เพื่อความสอดคล้อง) badge/kpi component ใช้ class เดียวกับ `statusBadge()`/`kpi()` ของ `finance.html`/`settings.html` เป๊ะ (ดู `04-ui-ux-design-system.md` §8.1)

## 6. Data Requirements

### 6.1 เคสของเรา (จากไฟล์ 38)
| Field ที่แสดง | ที่มา | หมายเหตุ |
|---|---|---|
| case_ref | 38 §6.1 | เลขที่สัญญาที่บริษัทส่งมาเอง |
| debtor_name | 38 §6.1 | — |
| status_display | derived (ดู §10.1) | mapped label ไม่ใช่ raw enum |
| status_reason | 38 (`reject_case`/`request_more_info` reason) | แสดงเฉพาะสถานะ "ไม่รับเคส"/"ขอข้อมูลเพิ่มเติม" |
| created_at | 38 §6.1 | แสดงแบบ DD/MM/YYYY พ.ศ. |
| recycle_round | 38 §6.6 `tracking_round` | แสดงเฉพาะเคสที่เคย recycle |

**ไม่แสดง**: ชื่อ/เบอร์ field agent, ทีมที่มอบหมาย, วันนัดหมาย, เส้นทาง, **หลักฐานปิดงานภาคสนาม** (checkins/GPS, videos, audio ตามไฟล์ 41 §6.4), IMEI

**แสดงเพิ่มเติมสำหรับเคสสถานะ "ติดตามสำเร็จ" เท่านั้น** (v3): รูปสินค้า (`Asset.photos`) ที่แอดมินแนบตอนรับเข้าคลังตามไฟล์ 44 §7.1 — จับคู่ผ่าน `case_ref` — เป็นรูปคนละชุดกับหลักฐานปิดงานภาคสนามข้างต้น (ไม่มี GPS/วิดีโอ/เสียง เป็นภาพเครื่อง 7 มุมล้วนๆ) พร้อม `condition`/`condition_note` ถ้ามี

### 6.2 รอบวางบิล / AR (จากไฟล์ 19)
period, total_amount, received_amount, outstanding (= total - received), status_display (`draft`→ไม่แสดง เพราะยังไม่ส่งบริษัท / `sent`/`partially_paid`/`paid`), due_date

> **Business Rule**: Billing Batch ที่ `status = draft` **ห้ามแสดงในพอร์ทัล** — บริษัทเห็นได้ตั้งแต่ `sent` เป็นต้นไปเท่านั้น เพราะ draft ยังไม่ถูกยืนยันความถูกต้องจากฝั่งเรา

### 6.3 ใบกำกับภาษี (จากไฟล์ 31)
invoice_number, issue_date, total_amount, delivery_format, status (`active`/`cancelled`), ปุ่มดาวน์โหลด PDF

### 6.4 ใบส่งมอบทรัพย์ (จากไฟล์ 44)
lot_number, doc_ref, type (`finance_pickup`/`we_deliver`), status_display (ดู §10.2), จำนวนเครื่องใน Lot, ปุ่มดาวน์โหลดใบส่งมอบ (เฉพาะ Lot ที่ `confirmed` แล้ว)

> **Business Rule**: Lot ที่ `pending_attach`/`pending_delivery_proof` แสดงได้ (สถานะ "รอดำเนินการส่งมอบ") แต่ปุ่มดาวน์โหลดเอกสารจะ disable จนกว่าจะ `confirmed`

### 6.5 รายงานสรุป
- Revenue Summary: รายเดือน — รายได้รวม, จำนวนเคส, success/fail, revenue/เคสเฉลี่ย (scope เฉพาะบริษัทตัวเอง จากไฟล์ 96 §F2)
- AR Aging: buckets 0-30/31-60/61-90/90+ วัน (scope เฉพาะบริษัทตัวเอง จากไฟล์ 96 §F3)

### 6.6 ข้อมูลบริษัท (read-only)
ชื่อบริษัท, tax_id, ที่อยู่, ผู้ติดต่อ, ผู้ลงนาม, Service Fee Template ที่ผูกอยู่ (ชื่อ+model เท่านั้น ไม่แสดงอัตราละเอียด) — จากไฟล์ 10 §7.1

## 7. UI Requirements

- Layout ใช้ **Top Bar Nav เดียวกับ Back Office ทุกโมดูล** (v4 — ดู §5, §21) — ใช้ design token เดียวกันตาม `04-ui-ux-design-system.md` §8.1 (สี, font, badge, table/card component) เพื่อความสอดคล้องของแบรนด์ทั้งระบบ
- KPI card, table, badge pattern **reuse โครงสร้างเดียวกับ** `finance.html` (แท็บรายได้และวางบิล), `accounting.html` (modal ดูใบกำกับภาษี), `warehouse.html` (แท็บส่งมอบแล้ว), `reports.html` (F2/F3) — แต่ตัดคอลัมน์/ปุ่มที่เป็น internal action ออกทั้งหมด (ไม่มีปุ่มแก้ไข/ออกเอกสาร/จับคู่ ฯลฯ)
- Badge สถานะเคสใช้ชุดสีใหม่เฉพาะพอร์ทัลนี้ (ดู §10.1) ไม่ใช้ badge map เดิมของ `38-case-submission-mockup.html` เพราะ label ต่างกัน
- Top bar แสดงชื่อบริษัท + ชื่อผู้ใช้ + ปุ่ม logout เท่านั้น (ไม่มี notification bell จนกว่าจะตัดสินใจ channel — ดู §22)

## 8. Actions & Buttons

| Action | Trigger | Behavior | Permission |
|---|---|---|---|
| view_case_list | เมนู "เคสของเรา" | list + filter (status_display, ค้นหา case_ref/ชื่อลูกหนี้) | Company User (ทุกระดับ) |
| view_case_detail | คลิกแถว | เปิด drawer แสดงรายละเอียดตาม §6.1 | Company User |
| view_billing | เมนู "รอบวางบิล" | list (เฉพาะ `sent`+) | Company User |
| download_tax_invoice | ปุ่มดาวน์โหลดในแถวใบกำกับภาษี | โหลด PDF จาก Supabase Storage | Company User |
| download_handover_doc | ปุ่มดาวน์โหลดใน Lot ที่ `confirmed` | โหลด PDF ใบส่งมอบ | Company User |
| view_reports | เมนู "รายงานสรุป" | แสดง Revenue Summary / AR Aging scope ตัวเอง | Company User |

> ไม่มี action สร้าง/แก้ไข/ลบใดๆ ในพอร์ทัลนี้ทั้งหมด — ทุก action เป็น GET/download เท่านั้น

## 9. Workflow

```
Company User login → Dashboard (สรุป KPI) → เลือกเมนู → List/Filter → (ถ้ามี) ดูรายละเอียด/ดาวน์โหลดเอกสาร
```

ไม่มี multi-step workflow เพราะเป็น read-only ทั้งหมด

## 10. Status / State Machine

### 10.1 Case Status Mapping (ใหม่ — เฉพาะพอร์ทัลนี้ ไม่ใช่ state machine ใหม่ แค่ label mapping)

| Internal state (ไฟล์ต้นทาง) | Label ที่บริษัทเห็น | สี Badge |
|---|---|---|
| `draft`/`pending_review` (38) | อยู่ระหว่างตรวจสอบ | slate |
| `need_info` (38) | ขอข้อมูลเพิ่มเติม (ต้อง action) | purple |
| `rejected` (38) | ไม่รับเคส | red |
| `approved` (38) + ทุก assignment/field sub-state ที่ไม่ terminal รวม `needs_revision`, `pending_recycle_review` | กำลังดำเนินการติดตาม | amber |
| field `closed_success` (terminal, ไม่ถูกตีกลับ) | ติดตามสำเร็จ | emerald |
| field `closed_fail` (terminal, ไม่มี recycle ค้าง) | ติดตามไม่สำเร็จ | slate (outline) |

> Mapping นี้ประมวลผลที่ backend (ไม่ใช่ frontend) เพื่อไม่ให้ portal เห็น raw enum ของ 38/40/41 เลย

### 10.2 HandoverLot Status Mapping
| Internal (44) | Label ที่บริษัทเห็น |
|---|---|
| `pending_attach` | รอดำเนินการส่งมอบ (รอเราแนบเอกสาร) |
| `pending_delivery_proof` | จัดส่งแล้ว รอยืนยัน |
| `confirmed` | ส่งมอบสำเร็จ — ดาวน์โหลดเอกสารได้ |

### 10.3 Tax Invoice / Billing Batch
ใช้ status เดิมจากไฟล์ 31/19 ตรงๆ ได้เลย (`active`/`cancelled`, `sent`/`partially_paid`/`paid`) ไม่ต้อง map เพราะคำเหล่านี้เป็นคำที่ภายนอกเข้าใจอยู่แล้ว — ยกเว้น `draft` ของ Billing Batch ที่ไม่แสดงเลยตาม §6.2

## 11. Business Rules

- **Row-level scope ผ่าน `company_id` บังคับทุก query** — middleware ต้อง inject `WHERE company_id = :current_user.company_id` ทุก endpoint ของพอร์ทัลนี้ ไม่มีข้อยกเว้น
- **ทุก endpoint เป็น read-only (GET เท่านั้น)** — ห้ามมี POST/PATCH/DELETE ใดๆ ในพอร์ทัลนี้
- **Billing Batch `draft` ต้องถูกกรองออกเสมอ** ก่อนถึง response (ดู §6.2)
- **ไม่ expose raw enum ของ case/assignment/field status** — ต้อง map เป็น label ตาม §10.1 เสมอที่ backend
- **3 ระดับสิทธิ์เห็นข้อมูล scope เดียวกันทั้งหมด** จนกว่า PO จะยืนยันการแบ่งย่อย (ดู §3.3 — เป็นสมมติฐานชั่วคราว ไม่ใช่กฎถาวร)
- **ห้ามมีปุ่ม/endpoint สร้างเคสในพอร์ทัลนี้เด็ดขาด** — ผูกกับการตัดสินใจถาวรใน §3.2

## 12. Validation & Error Handling

| Code / Scenario | Condition | System Behavior |
|---|---|---|
| PERMISSION_DENIED | Company User พยายามเข้าถึงข้อมูลของ `company_id` อื่น | reject 403 — ไม่ leak ว่ามีข้อมูลนั้นอยู่จริงหรือไม่ |
| COMPANY_SUSPENDED | บริษัทที่ user สังกัดมีสถานะ `suspended` (ไฟล์ 10) | บล็อก login พร้อมข้อความแจ้งให้ติดต่อเจ้าหน้าที่ |
| USER_DEACTIVATED | Company User มีสถานะ `deactivated` (ไฟล์ 10 §7.2) | บล็อก login |
| NO_DATA | ไม่มีข้อมูลในหมวดนั้น (เช่น ยังไม่มีเคสเลย) | แสดง empty state ปกติ ไม่ใช่ error |

## 13. Permissions

| Capability | ผู้จัดการ | หัวหน้า | แอดมิน | Superadmin |
|---|---|---|---|---|
| ดูเคสของบริษัทตัวเอง | ✅ | ✅ (ชั่วคราว เหมือนผู้จัดการ) | ✅ (ชั่วคราว) | — (ไม่ใช่ actor ของพอร์ทัลนี้) |
| ดู Billing/AR ของบริษัทตัวเอง | ✅ | ✅ (ชั่วคราว) | ✅ (ชั่วคราว) | — |
| ดาวน์โหลดใบกำกับภาษี/ใบส่งมอบ | ✅ | ✅ (ชั่วคราว) | ✅ (ชั่วคราว) | — |
| ดูรายงานสรุปของบริษัทตัวเอง | ✅ | ✅ (ชั่วคราว) | ✅ (ชั่วคราว) | — |
| แก้ไขข้อมูลบริษัท/จัดการ Company User | ❌ (ต้องแจ้ง Superadmin) | ❌ | ❌ | ✅ (ที่ไฟล์ 10) |

## 14. Audit Log

- บันทึก login/logout ของ Company User (`actor_id`, `role`, `company_id`, `ip`, `created_at`) ตามมาตรฐานกลาง (ไฟล์ 90)
- **ไม่บันทึก audit log ของการ "ดู" ข้อมูลรายแถว** (view-only) — จะทำให้ log ใหญ่เกินจำเป็นโดยไม่มี actor เปลี่ยนแปลงข้อมูลจริง เว้นแต่ PO ต้องการ compliance log ระดับนั้น (ยังไม่ระบุ — ถือเป็นค่าเริ่มต้น)
- บันทึก event `PERMISSION_DENIED` ทุกครั้งที่เกิด (เพื่อตรวจจับความพยายามเข้าถึงข้ามบริษัท)

## 15. Notifications
- ยังไม่ออกแบบ — ขึ้นกับ Open Item เรื่อง Notification channel โดยรวม (`DECISIONS-NEEDED.md` §1.3) — ดู §22

## 16. Integration Points
- ไม่มี integration ภายนอกใหม่ — ดึงข้อมูลจาก entity ที่มีอยู่แล้วทั้งหมด (38, 19, 31, 44, 96) ผ่าน read-only query layer เฉพาะของพอร์ทัลนี้

## 17. API / Event Contract Draft

> Namespace ใหม่ `/api/portal/*` แยกจาก internal API เดิม (27/45) โดยสิ้นเชิง เพื่อให้บังคับ `company_id` scope ที่ middleware ชั้นเดียวได้ง่าย — ทุก endpoint ด้านล่างเป็น **GET เท่านั้น**

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/portal/dashboard | KPI สรุปหน้าแรก |
| GET | /api/portal/cases | list เคสของบริษัทตัวเอง (filter: status_display, search) |
| GET | /api/portal/cases/:id | รายละเอียดเคส (mapped fields ตาม §6.1) |
| GET | /api/portal/billing-batches | list รอบวางบิล (กรอง `draft` ออกเสมอ) |
| GET | /api/portal/tax-invoices | list ใบกำกับภาษี |
| GET | /api/portal/tax-invoices/:id/download | ดาวน์โหลด PDF |
| GET | /api/portal/handover-lots | list Lot ของบริษัทตัวเอง |
| GET | /api/portal/handover-lots/:id/download | ดาวน์โหลดใบส่งมอบ (เฉพาะ `confirmed`) |
| GET | /api/portal/reports/revenue-summary | รายงานสรุปรายได้ |
| GET | /api/portal/reports/ar-aging | รายงานอายุหนี้ |
| GET | /api/portal/company-profile | ข้อมูลบริษัทตัวเอง (read-only) |

## 18. Export / Document Requirements
- ดาวน์โหลดใบกำกับภาษี PDF — ใช้ไฟล์ที่มีอยู่แล้วจากไฟล์ 31/28 (ไม่ generate ใหม่)
- ดาวน์โหลดใบส่งมอบทรัพย์ PDF — ใช้ไฟล์ที่มีอยู่แล้วจากไฟล์ 44 (`signed_doc_url`)
- ไม่มี export format ใหม่เฉพาะพอร์ทัลนี้ (ไม่มี Excel/CSV export ในรอบนี้)

## 19. Acceptance Criteria
- Company User เห็นเฉพาะข้อมูลของ `company_id` ตัวเองในทุกหน้าจอ ทดสอบข้าม company แล้วต้อง 403
- Billing Batch สถานะ `draft` ไม่ปรากฏในพอร์ทัลเด็ดขาด
- Case status ที่แสดงเป็น label ที่ map แล้วเท่านั้น ไม่มี raw enum หลุดออกมา
- ทุก endpoint เป็น read-only จริง — ไม่มี mutation endpoint ใดๆ หลุดเข้ามาใน namespace `/api/portal/*`
- Company ที่ถูก suspend หรือ user ที่ deactivated ไม่สามารถ login ได้

## 20. Test Cases

| Test Case | Steps | Expected Result |
|---|---|---|
| Cross-company access | Login บริษัท A แล้วเรียก `/api/portal/cases/:id` ของเคสบริษัท B | reject 403 PERMISSION_DENIED |
| Billing draft ถูกกรอง | บริษัทมี Billing Batch สถานะ draft 1 รายการ | ไม่ปรากฏใน list `/api/portal/billing-batches` |
| Case status mapping ถูกต้อง | เคสสถานะ `need_info` พร้อม reason | portal แสดง "ขอข้อมูลเพิ่มเติม" พร้อม reason ไม่ใช่ raw enum |
| ดาวน์โหลด Lot ที่ยังไม่ confirmed | Lot สถานะ `pending_attach` | ปุ่มดาวน์โหลด disabled |
| User deactivated | Company User สถานะ `deactivated` พยายาม login | บล็อก พร้อมข้อความแจ้งเหตุผล |
| Company suspended | บริษัทสถานะ `suspended` | ทุก user ของบริษัทนั้น login ไม่ได้ |

## 21. การตัดสินใจที่เกี่ยวข้อง (Decisions — ยืนยันในรอบสนทนานี้ 03/07/2569)

- **Layout ใช้ Top Bar Nav เดียวกับ Back Office ทุกโมดูล** (v4 — กลับคำตัดสินใจ v1/§21 เดิมที่เคยแยก layout สิ้นเชิง) ตาม pattern `finance.html`/`settings.html`/`warehouse.html`: header 64px + tab strip แนวนอนใต้ header, base font-size และ component class (badge/kpi) ให้ตรงกับหน้าอื่นทุกจุด (§5)
- **ไม่มีฟอร์มส่งเคสในพอร์ทัล** — ใช้ API/import/manual เดิมตามไฟล์ 38 ถาวร ไม่แก้ไฟล์ 38 (§3.2)
- **สถานะ field-side แสดงแบบสรุปเท่านั้น** (3 label: กำลังดำเนินการ/สำเร็จ/ไม่สำเร็จ) ไม่ลงรายละเอียด assigned/accepted/scheduled (§10.1)
- **ไม่เพิ่มสิทธิ์ผู้จัดการบริษัทจัดการ Company User เอง** — คงผ่าน Superadmin ตามไฟล์ 10 §12 เดิม ไม่แก้ไฟล์ 10 (§3.2)
- **ทุก endpoint เป็น read-only (GET เท่านั้น)** ไม่มี mutation ใดๆ ในพอร์ทัลนี้ (§11, §17)
- **Billing Batch สถานะ `draft` ต้องถูกกรองออกจากพอร์ทัลเสมอ** (§6.2, §11)
- **โครงสร้าง Role/Entity Company User มีอยู่แล้ว** ไม่ต้องออกแบบใหม่ (§3.1, §4)
- **Row-level scope ผ่าน `company_id` เป็นหลักการบังคับทุก endpoint** (§11, §17)

## 22. สิ่งที่ยังต้องตัดสินใจ (Open Items)

1. **Phase ของ Client Portal (Phase 1 หรือ Phase 2)** — สเปคนี้เขียนพร้อม implement ได้ทันทีที่ตัดสินใจ Phase (`DECISIONS-NEEDED.md` §1.2, `00-project-overview.md` §18)
2. **Authentication method** — ใช้ระบบ login เดียวกับ internal user (Supabase Auth เดิม) หรือแยกต่างหาก (เช่น magic link) ยังไม่ตัดสินใจ — กระทบ §5 (Login screen) และ Auth flow ที่ยังไม่ได้ออกแบบในไฟล์นี้
3. **Notification channel** — ขึ้นกับผลตัดสินใจ `DECISIONS-NEEDED.md` §1.3 (Email/LINE OA/SMS/Push) (§15)
4. **ความแตกต่างของสิทธิ์เห็นข้อมูลระหว่าง 3 ระดับ** (ผู้จัดการ/หัวหน้า/แอดมิน) — สเปคนี้ใช้สมมติฐานชั่วคราวว่าเหมือนกันหมด (§3.3, §4, §13) ต้องแก้เมื่อ PO ยืนยันการแบ่งย่อยจริง
5. **Audit log ระดับ "การดู" ข้อมูล** — ตอนนี้ไม่บันทึก (§14) ต้องยืนยันถ้าต้องการ compliance log ละเอียดกว่านี้

---

*เอกสารนี้พร้อมขยายเป็น HTML Mockup ตามลำดับ workflow (§5 Ask for Permission) — รอ confirm ก่อนเริ่มสร้าง mockup*
