# 38-case-submission.md

# 38 — Case Submission (รับเคส)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted — แก้ reference ไฟล์ 43 ที่ล้าสมัย)
> Document Level: Case & Field Operations Module — Build Spec / Implementation-ready
> เอกสารอ้างอิง: `06-menu-and-navigation-map.md` §7.1, `07-roles-permissions.md`, `10-finance-companies.md` §9, `12-service-fee.md`, `40-case-assignment-routing.md`, `41-field-tracker-mobile.md`, `02-database-schema-design.md` §6 (cases table)
> Supersedes: เวอร์ชัน Baseline เดิม (status: Pending detailed UI & workflow redesign)

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | Build Spec Round 1 — ตกลงร่วมกับผู้ใช้งานจริง (สัมภาษณ์รอบที่ 1) แทนที่ Baseline เดิม |
| v2 | 03/07/2569 | Reformat ตามมาตรฐานเอกสารชุดใหม่ + **แก้ reference "ไฟล์ 42/43" ที่ล้าสมัย** (ทั้งคู่ merge เข้าไฟล์ 41 แล้วตาม `README.md`) เป็น "ไฟล์ 41" ทุกจุด + **เพิ่ม `pending_recycle_review` เข้า enum `case_status`** ใน `02-database-schema-design.md` ที่ขาดหายไป (comment เดิมของ `closed_fail` ใบ้ไว้แล้วว่า "รอ recycle" แต่ไม่มี enum value รองรับจริง) — แยก Decisions/Open Items ชัดเจน — **เนื้อหา business logic เดิมคงไว้ครบ 100% ไม่มีการเปลี่ยนแปลง**

ขอบเขตเอกสารนี้: รับเคสติดตามทรัพย์จากบริษัทไฟแนนซ์เข้าสู่ระบบ ผ่าน 3 ช่องทาง (API / Import ไฟล์ / กรอกฟอร์มมือ) ตรวจสอบความครบถ้วนและความซ้ำซ้อนของข้อมูล จากนั้นระบบเสนอทีมที่ดูแลพื้นที่ให้เจ้าหน้าที่อนุมัติเคสพิจารณารับเคสและยืนยัน/เปลี่ยนทีมเอง — รวมถึง Recycle Flow สำหรับเคสไม่สำเร็จที่ไฟแนนซ์ขอให้ลองใหม่

**ไม่รวมอยู่ในไฟล์นี้**: OCR/Document AI extraction (ยกไป sprint ถัดไป — ดู Open Items), Routing algorithm แบบ multi-criteria (ใช้แค่จับคู่จังหวัดในรอบนี้), รายละเอียดขั้น Assignment เจาะจง (ดู `40-case-assignment-routing.md`), Field evidence policy (ดู `41-field-tracker-mobile.md`)

---

## 1. Summary

รับเคสติดตามทรัพย์จากบริษัทไฟแนนซ์เข้าสู่ระบบ ผ่าน 3 ช่องทาง (API / Import ไฟล์ / กรอกฟอร์มมือ) ตรวจสอบความครบถ้วนและความซ้ำซ้อนของข้อมูล จากนั้นระบบเสนอทีมที่ดูแลพื้นที่ให้เจ้าหน้าที่อนุมัติเคสพิจารณารับเคสและยืนยัน/เปลี่ยนทีมเอง

## 2. Purpose

สร้างจุดเริ่มต้นของ pipeline งานติดตามทรัพย์ที่มีข้อมูลครบถ้วนเพียงพอสำหรับการมอบหมายงานและการคำนวณการเงินในขั้นตอนถัดไป (Assignment → Field Tracking → Outcome → Finance Trigger)

## 3. Scope

### 3.1 In Scope

- รับเคสผ่าน 3 ช่องทาง: API, Import ไฟล์ (Excel/CSV), Manual form
- Document checklist สำหรับเอกสารแนบเคส (อัปโหลดได้ แยกตามประเภทเอกสาร)
- ตรวจสอบ case_ref ซ้ำ
- เสนอทีมตามจังหวัดที่อยู่ปัจจุบันของลูกหนี้ (suggestion, ไม่ auto-assign)
- เจ้าหน้าที่อนุมัติเคสพิจารณารับ/ไม่รับเคสแบบ manual judgment (ไม่มี auto-reject threshold)

### 3.2 Out of Scope (ยกไป Sprint ถัดไป / เอกสารอื่น)

- OCR / Document AI extraction จากไฟล์สแกน (Sprint หลัง — ดู Open Items §18)
- Routing algorithm แบบ multi-criteria (workload, ทักษะ, ระยะทางจริง) — ใช้แค่จับคู่จังหวัดในรอบนี้
- รายละเอียดขั้น Assignment เจาะจง (ดูไฟล์ 40)
- Field evidence policy (ดูไฟล์ 41)

## 4. Actors & Responsibilities

| Actor / Role | Responsibilities | Access Scope | Role Group |
|---|---|---|---|
| Superadmin | ตั้งค่าและแก้ไขได้ทุกส่วน | global | system |
| บริหาร / Executive | อนุมัติ policy, exception, scope decision | organization | system |
| เจ้าหน้าที่อนุมัติเคส (Case Approver) | พิจารณารับ/ไม่รับเคส, ยืนยัน/เปลี่ยนทีมที่ระบบเสนอ | Global — ดูแลทุกเคสในระบบ ไม่ผูกกับทีมหรือพื้นที่ใดพื้นที่หนึ่ง | **system** — คนละ role กับ "ผู้จัดการ" ของ inhouse/outsource ในไฟล์ 40 แม้ชื่อ role จะคล้ายกัน (ดูไฟล์ 06 §7.1 และไฟล์ 07 §7.1) |
| ธุรการ / Admin | คีย์ข้อมูลเคสจากเอกสาร/ไฟล์ที่ไฟแนนซ์ส่งมา, แนบเอกสาร | assigned scope | system |
| ระบบ (System) | สร้าง case draft อัตโนมัติเมื่อรับผ่าน API, เสนอทีมตามจังหวัด, ตรวจ case_ref ซ้ำ | automated | — |
| บริษัทไฟแนนซ์ (ภายนอก) | ส่งเคสผ่าน API หรือส่งไฟล์/เอกสารสัญญาให้ฝั่งเราคีย์ | external, ไม่มี direct access เข้าระบบในรอบนี้ | finance |

> **เมนู**: หน้าจอนี้อยู่ใต้เมนู "งานติดตามทรัพย์ > รับเคส" — เห็นได้เฉพาะ Role Group `system` (role "ผู้จัดการ") เท่านั้น ผู้จัดการของทีม inhouse/outsource **ไม่เห็นเมนูนี้** (ดู Navigation Map ไฟล์ 06 §7.1 สำหรับ matrix เต็ม)

## 5. Menu & Navigation

- เมนู: `งานติดตามทรัพย์ > รับเคส`
- เป็นจุดเข้าแรกของ pipeline เคส — ไม่มีเมนูย่อย ใช้หน้าเดียวแบบ List + Modal/Drawer สำหรับ Create/Edit
- จาก List นี้ เคสที่ผู้จัดการ "รับ" แล้วจะย้ายสถานะไปปรากฏในเมนู `มอบหมายและวางแผนงาน` (ไฟล์ 40)

## 6. Data Requirements

### 6.1 Required Fields — ข้อมูลลูกหนี้/คู่สัญญา

| Field | Type | Required | Description / Rule |
|---|---|---|---|
| case_id | uuid | yes | PK ของเคสในระบบเรา |
| case_ref | string | yes | เลขที่สัญญา/เลขอ้างอิงจากไฟแนนซ์ ตามที่ไฟแนนซ์ส่งมา (เก็บค่าดิบ ไม่ถูกแก้ไข) — ต้องไม่ซ้ำภายใน finance_company_id เดียวกัน เพราะหมายถึงเลขที่สัญญาจริง |
| case_ref_normalized | string | yes (auto) | ค่า case_ref ที่ผ่าน normalize แล้ว ใช้สำหรับเทียบซ้ำเท่านั้น ไม่แสดงต่อผู้ใช้ — generate อัตโนมัติตอนบันทึก ดูกฎ normalize ใน §11 |
| finance_company_id | uuid | yes | FK ไปบริษัทไฟแนนซ์ (คู่ค้า) |
| source_channel | enum | yes | `api` \| `import` \| `manual` |
| debtor_name | string | yes | ชื่อ-นามสกุลลูกหนี้/ผู้ผ่อนชำระ |
| debtor_nationality | enum | yes | `TH` (ไทย) \| `MM` (พม่า) \| `LA` (ลาว) \| `KH` (กัมพูชา) \| `OTHER` (อื่นๆ ระบุ) — กำหนดว่าฟอร์มจะแสดง field เอกสารยืนยันตัวตนแบบไหนต่อ (ดู §6.1.1) |
| debtor_nationality_other | string | conditional | ระบุชื่อสัญชาติ เมื่อ `debtor_nationality = OTHER` เท่านั้น |
| debtor_national_id | string | conditional | เลขบัตรประชาชนไทย — **required เมื่อ `debtor_nationality = TH` เท่านั้น** ความยาวคงที่ 13 หลัก ตัวเลขเท่านั้น (ไม่รับตัวอักษร/เครื่องหมาย) |
| debtor_passport_no | string | conditional | เลข Passport หรือเอกสารอื่น (ใบอนุญาตทำงาน ฯลฯ) — **required เมื่อ `debtor_nationality ≠ TH`** เป็น free text ไม่จำกัดรูปแบบ/จำนวนหลัก เนื่องจากแต่ละประเทศมี format ต่างกัน |
| debtor_phone_mobile | string | yes | เบอร์โทรมือถือลูกหนี้ — ความยาวคงที่ **10 หลัก** ตัวเลขเท่านั้น ไม่รับขีด/วงเล็บ/เว้นวรรค |
| debtor_phone_work | string | no | เบอร์โทรที่ทำงาน — **9-10 หลัก** ตัวเลขเท่านั้น (รองรับเบอร์บ้าน/เบอร์ต่อสายที่อาจสั้นกว่ามือถือ) |
| debtor_line_id | string | no | LINE ID |
| debtor_facebook | string | no | ชื่อ/ลิงก์ Facebook |
| debtor_address_current | object | yes | ที่อยู่ปัจจุบัน (ที่อยู่จริงที่พักอาศัยตอนนี้) — โครงสร้างตาม §6.1.2 **field `province` ใช้เป็นหลักเดียวสำหรับ routing พื้นที่** — แสดงเป็นช่องแรกในฟอร์ม |
| debtor_address_work | object | no | ที่อยู่ทำงาน — โครงสร้างเดียวกับที่อยู่ปัจจุบัน แต่เป็นข้อมูลเสริม ไม่ใช้ตัดสิน routing — แสดงเป็นช่องที่สอง |
| debtor_address_id_card | object | yes | ที่อยู่ตามบัตรประชาชน — โครงสร้างเดียวกัน เก็บแยกจากที่อยู่ปัจจุบันเพราะอาจไม่ใช่ที่เดียวกัน ใช้เป็นข้อมูลอ้างอิงทางกฎหมาย/ติดตาม ไม่ใช้ทำ routing — แสดงเป็นช่องที่สาม (ลำดับท้ายสุด) |

### 6.1.1 Identity Document — Conditional ตามสัญชาติ

ฟอร์มต้องสลับ field เอกสารยืนยันตัวตนตามค่า `debtor_nationality` ที่เลือก:

- **สัญชาติไทย (`TH`)**: แสดงช่อง "เลขบัตรประชาชน" — บังคับ 13 หลัก ตัวเลขล้วน (input ต้อง filter ตัวอักษรที่ไม่ใช่เลขออกทันทีที่พิมพ์ และจำกัด maxlength=13)
- **สัญชาติอื่น (`MM`/`LA`/`KH`/`OTHER`)**: สลับช่องเป็น "เลข Passport / เอกสารอื่น (ใบอนุญาตทำงาน ฯลฯ)" — เป็น free text ไม่จำกัดความยาวหรือรูปแบบ เพราะเอกสารแต่ละประเทศมี format ไม่เหมือนกัน
- เมื่อเลือก `OTHER` ต้องมีช่อง `debtor_nationality_other` ปรากฏเพิ่มให้ระบุชื่อสัญชาติ

### 6.1.2 Address Structure (ใช้ร่วมกันทั้ง 3 ที่อยู่)

แต่ละที่อยู่ (ปัจจุบัน, ที่ทำงาน, ตามบัตรประชาชน) ใช้โครงสร้างฟอร์มเดียวกัน เรียงลำดับฟิลด์จากบนลงล่างดังนี้ เพื่อความสอดคล้องและลดความผิดพลาดจากการพิมพ์:

1. `detail` — free text สำหรับบ้านเลขที่/หมู่บ้าน/ถนน (**อยู่ก่อนจังหวัดเสมอ** ตามลำดับการกรอกที่ลูกหนี้คุ้นเคย คือเริ่มจากบ้านเลขที่ก่อน)
2. `postal_code` — เลข 5 หลัก พร้อม **auto-complete** จังหวัด/อำเภอ/ตำบล โดยเรียก **Thailand Post API ภายนอก** ทันทีที่กรอกครบ 5 หลัก (onblur หรือ debounce) — ถ้าค้นพบ ระบบเติม `province`/`district`/`subdistrict` ให้อัตโนมัติ ถ้าไม่พบในระบบ ให้ผู้ใช้กรอกต่อแบบ manual ทีละขั้น (ดู Open Items สำหรับการ integrate จริง)
3. `province` — dropdown เลือกจาก master data จังหวัดมาตรฐานทั้งประเทศ (77 จังหวัด) — **เหมือนกันทุกช่อง ไม่จำกัดเฉพาะจังหวัดที่มีทีมดูแล** (auto-fill ได้จาก postal code หรือเลือกเองได้)
4. `district` — dropdown แบบ cascading ตาม `province` ที่เลือก (อำเภอ/เขต)
5. `subdistrict` — dropdown แบบ cascading ตาม `district` ที่เลือก (ตำบล/แขวง)

ลำดับการแสดง section ที่อยู่ในฟอร์ม: **ที่อยู่ปัจจุบัน (บนสุด) → ที่อยู่ที่ทำงาน → ที่อยู่ตามบัตรประชาชน (ล่างสุด)** — เพราะที่อยู่ปัจจุบันสำคัญต่อ routing งานมากที่สุด ควรกรอกก่อน

เฉพาะ `province` ของที่อยู่ปัจจุบันเท่านั้นที่ผูกกับการคำนวณทีมที่เสนอ (เปลี่ยนค่าแล้ว trigger คำนวณทีมใหม่ทันที ไม่ว่าจะเปลี่ยนด้วย dropdown ตรงหรือผ่าน auto-complete จาก postal code)

### 6.1.3 Contact Persons (ผู้ติดต่ออื่น) — Repeatable

- เก็บเป็น array แยกตาราง ไม่ผูกกับ case แบบ field เดียว เพราะต้องเพิ่มได้มากกว่า 1 คน
- แต่ละรายการเก็บ: `contact_name` (string, required), `relationship` (string, required — เช่น บุตร, คู่สมรส, เพื่อน, นายจ้าง), `contact_phone` (string, required — ใช้กฎความยาวเดียวกับเบอร์มือถือ คือ 10 หลักตัวเลขล้วน)
- ไม่จำกัดจำนวนขั้นสูง — ฟอร์มต้องมีปุ่ม "เพิ่มผู้ติดต่อ" ให้กดเพิ่มแถวได้เรื่อยๆ และปุ่มลบต่อแถว
- อย่างน้อย 0 คนได้ (ไม่ required ทั้ง list) แต่ถ้าเพิ่มแถวมาแล้วต้องกรอกครบทั้ง 3 field ต่อแถว

### 6.2 Required Fields — ข้อมูลทรัพย์/สินค้า

| Field | Type | Required | Description / Rule |
|---|---|---|---|
| asset_type | enum | yes | `smartphone` \| `tablet` (ตาม scope ผลิตภัณฑ์ปัจจุบัน คือสมาร์ทโฟนและ iPad) |
| asset_brand_model | string | yes | ยี่ห้อ/รุ่นเครื่อง |
| asset_imei_serial | string | yes | IMEI หรือ Serial Number |
| outstanding_debt_amount | decimal | yes | มูลค่าหนี้/มูลค่าสินค้าคงเหลือ — ไม่มี auto-reject threshold ในระบบ ใช้เป็นข้อมูลให้ผู้จัดการพิจารณาเองเท่านั้น |

### 6.3 Document Checklist (เอกสารแนบ)

- เอกสารแนบของเคสต้องอัปโหลดแบบ **แยกตามประเภท** ไม่ใช่กล่องอัปโหลดรวม เพื่อให้ระบบรู้ว่ามี/ขาดเอกสารประเภทใด
- ประเภทเอกสารขั้นต่ำที่ต้องมีช่องแยกในฟอร์ม (mapping 1 ไฟล์ = 1 เอกสาร ต่อ slot):

  | Document Type | Slot Key | Required ก่อนเข้าสถานะ pending_review |
  |---|---|---|
  | สัญญาเช่าซื้อ/สัญญาผ่อนชำระ | `contract_doc` | yes |
  | บัตรประชาชนลูกหนี้ (หรือ Passport/เอกสารอื่นถ้าไม่ใช่สัญชาติไทย) | `national_id_doc` | yes |
  | เอกสารอื่นที่ไฟแนนซ์ส่งมา (ใบรับรองสินค้า, ใบเสร็จ ฯลฯ) | `other_doc` | no, อัปโหลดได้หลายไฟล์ |

- แต่ละ slot รองรับไฟล์ได้มากกว่า 1 ไฟล์ (เช่น `national_id_doc` อาจมีหน้า-หลัง 2 ไฟล์)
- เก็บ field ต่อไฟล์: `document_type`, `file_id`, `file_hash`, `uploaded_by`, `uploaded_at` (ตาม object storage rule ในไฟล์ 01)
- OCR auto-extract จากไฟล์เหล่านี้: **ไม่ทำในรอบนี้** — ดู Open Items

### 6.3.1 Product Photo (รูปสินค้า) — แยกเป็น Section ของตัวเอง

- แสดงเป็น section ท้ายสุดของฟอร์ม (หลังข้อมูลทรัพย์/สินค้า) เพราะเป็นขั้นตอนสุดท้ายที่ผู้กรอกมักมีรูปพร้อมถ่ายจากเครื่องจริง
- UI ต้องเป็น **drag-and-drop dropzone** พร้อมคลิกเพื่อเลือกไฟล์ได้ด้วย
- แสดง **thumbnail preview แบบ grid** ของรูปที่อัปโหลดแล้วทันทีที่เลือกไฟล์ (ไม่ต้องรอ submit ฟอร์ม)
- อัปโหลดได้หลายรูปต่อ 1 เคส **สูงสุด 8 รูป** — ถ้าครบ 8 แล้ว dropzone ต้อง disable หรือแจ้งเตือนไม่รับไฟล์เพิ่ม
- แต่ละรูปมีปุ่มลบ (✕) ที่ thumbnail เพื่อนำออกจากรายการก่อน submit ได้
- slot key: `product_photo` — required อย่างน้อย 1 รูปก่อนเข้าสถานะ `pending_review`
- เก็บ field ต่อไฟล์เหมือน document slot อื่น: `file_id`, `file_hash`, `uploaded_by`, `uploaded_at`

### 6.4 Derived / Computed Fields

- Monetary fields ต้องเก็บแยก source amount, tax amount, withholding amount, net amount ตามกฎกลาง (อ้างอิงไฟล์ 02 §7)
- ทุก record ที่คำนวณได้ต้องเก็บ `calculation_source` และ `template_version`
- ทุก record ในรอบบัญชี/การเงินต้องเก็บ `period_id` เมื่อเข้าเงื่อนไข
- ทุก record ที่ export ได้ต้องเก็บ `export_status`, `export_id`, `exported_at`
- `suggested_team_id` — ทีมที่ระบบเสนอจากการจับคู่จังหวัด (เก็บไว้แยกจาก `assigned_team_id` จริงที่ผู้จัดการยืนยัน เพื่อ audit ว่าระบบเสนออะไร ผู้จัดการเปลี่ยนหรือไม่)
- `created_at` (timestamptz, UTC), `created_by` (uuid → actor) — ตาม Common Columns กลางในไฟล์ 02 §5 ทุกเคสต้องมีเสมอไม่ว่าช่องทางไหน:
  - Manual/Import → `created_by` คือผู้ใช้จริงที่กรอก/อัปโหลด (ธุรการ/แอดมิน)
  - API → `created_by` คือ **service account ของระบบ** ไม่ใช่ชื่อบุคคล (เช่น "ระบบ — สยามไฟแนนซ์ API") เพราะเป็นการสร้างอัตโนมัติ ไม่มีผู้ใช้กดสร้างจริง
  - ต้องแสดง `created_at`/`created_by` ทั้งในหน้า List (column ใหม่) และหน้ารายละเอียดเคส — แสดงผลด้วย format `DD/MM/YYYY HH:mm` **พ.ศ.** ตามมาตรฐานกลางใน `03-non-functional-requirements.md` §6.5 (ปรับจาก "ปฏิทินสากล" เดิมให้ตรงกับ DEC-005)
- `edit_history` — array ของ object `{ edited_by, edited_at, note }` เก็บ**ทุกครั้ง**ที่มีการแก้ไขเคส (ไม่ใช่แค่ overwrite `updated_at`/`updated_by` ล่าสุดอันเดียว) เพื่อให้ดูย้อนหลังได้ว่าใครแก้อะไรไปบ้างเมื่อไหร่ — แสดงเป็น log ในหน้ารายละเอียดเคส
- `projected_revenue_amount` — **รายได้ที่คาดว่าจะได้รับถ้าเคสสำเร็จ** คำนวณจาก `Service Fee Template` ที่ผูกกับ `finance_company_id` ของเคส (ดู §6.5) — เป็นค่าประมาณการ (projection) ไม่ใช่รายได้จริง ไม่บันทึกเข้าบัญชี/Revenue จริงตามไฟล์ 19 จนกว่าเคสจะปิดจริงตามไฟล์ 41 — เก็บไว้แสดงประกอบการพิจารณารับเคสเท่านั้น พร้อม `calculation_source` อ้างอิง template/version ที่ใช้คำนวณ
- `tracking_round` — **เลขรอบการติดตามสะสมของเคส** (เริ่มที่ 1 เสมอตอนสร้างเคสครั้งแรก) ผูกกับเคสตลอดอายุของเคส ไม่ขึ้นกับการมอบหมาย/รีไซเกิลกี่ครั้งก็ตาม — เพิ่มขึ้นอีก 1 ทุกครั้งที่เคสถูกอนุมัติให้กลับเข้า pipeline ใหม่หลังไม่สำเร็จ (ดู §6.6) ฟิลด์นี้แสดงคู่กับเคสในทุกหน้าที่เกี่ยวข้อง (ไฟล์ 38, 40, 41) เพื่อให้ผู้ใช้ทุกฝ่ายรู้ว่ากำลังดูเคสรอบที่เท่าไหร่
- `recycle_history` — array เก็บประวัติการรีไซเกิลแต่ละครั้ง object `{ requested_note, approved_by, approved_at, previous_round, new_round }` — บันทึกทุกครั้งที่เจ้าหน้าที่อนุมัติเคสอนุมัติให้เคสกลับเข้า pipeline ใหม่

### 6.5 Projected Revenue Calculation (ประมาณการรายได้ก่อนรับเคส)

ทุกบริษัทไฟแนนซ์ต้องมี `Service Fee Template` ผูกไว้ตั้งแต่ตอนสร้างเข้าระบบเสมอ (บังคับตามไฟล์ 10 §9 — ไม่มีกรณีไฟแนนซ์ไม่มี template ผูกไว้) ดังนั้นไฟล์นี้สามารถคำนวณ `projected_revenue_amount` ได้ทุกเคสโดยไม่ต้องมี fallback/error handling สำหรับกรณี "ไม่มี template"

**สมมติฐานการคำนวณ**: คำนวณบนพื้นฐาน **"ถ้าเคสสำเร็จ 100%"** เสมอ — ไม่มีการคูณลดด้วยค่าความน่าจะเป็น/อัตราความสำเร็จสะสมใดๆ เป็นค่าประมาณการแบบ best-case ไม่ใช่ expected value

สูตรคำนวณตามโมเดลของ `Service Fee Template` (อ้างอิงไฟล์ 12 §7):

| Model | สูตรคำนวณ `projected_revenue_amount` |
|---|---|
| `FLAT` | = `base` (ค่าคงที่ตาม template ไม่ขึ้นกับมูลหนี้ของเคส) |
| `SUCCESS_FEE` | = `outstanding_debt_amount` × `rate` (อ้างอิง `basis` ของ template ว่าใช้ฐานคำนวณจากมูลหนี้คงเหลือหรือมูลค่าสินค้า — ตามที่ template กำหนด) |
| `HYBRID` | = `base` + (`outstanding_debt_amount` × `rate`) |

แสดงผลใน Case Detail / Review Modal (§7.5) เป็นตัวเลขประกอบการพิจารณา — ไม่ใช่ field ที่แก้ไขมือได้ (read-only, คำนวณอัตโนมัติจาก template เสมอ)

### 6.6 Re-track / Recycle Flow (เคสไม่สำเร็จ — ไฟแนนซ์ขอให้ลองใหม่)

เมื่อเคสปิดงานในไฟล์ 41 ด้วยผล **ไม่สำเร็จ** (`closed_fail`) และไฟแนนซ์ติดต่อมา**นอกระบบ** (โทร/อีเมล — ไม่ใช่ผ่านระบบ) เพื่อขอให้ลองติดตามใหม่ เจ้าหน้าที่อนุมัติเคสเป็นผู้ตัดสินใจอนุมัติ/ไม่อนุมัติคำขอนี้เอง เพราะเป็นผู้รับผิดชอบความสัมพันธ์กับไฟแนนซ์เจ้านั้นโดยตรง:

- **ไม่มี automation ส่งคำขอเข้าระบบเอง** — เจ้าหน้าที่อนุมัติเคสเป็นคนสร้างคำขอรีไซเกิลขึ้นมาเองในระบบ (เพราะไฟแนนซ์ติดต่อมาทางช่องทางนอกระบบ) ไม่มีการแจ้งเตือนอัตโนมัติจากไฟแนนซ์เข้ามา
- **เคสที่รีไซเกิลได้ต้องมีสถานะ `closed_fail` เท่านั้น** (มาจากไฟล์ 41) — เคสที่ `closed_success` ไม่มีสิทธิ์รีไซเกิล เพราะถือว่าจบงานสำเร็จไปแล้ว
- **แสดงปนอยู่ใน List เดียวกับเคสอื่นในไฟล์นี้** ไม่แยกเมนู/แท็บใหม่ — ใช้สถานะใหม่ `pending_recycle_review` กรองดูได้ผ่าน filter สถานะเดิม
- **ไม่จำกัดจำนวนรอบ** — เคสเดิมสามารถถูกรีไซเกิลกลับเข้า pipeline ได้ไม่จำกัดจำนวนครั้ง ตราบใดที่รอบก่อนหน้าปิดด้วย `closed_fail` เสมอ
- **อนุมัติแล้วเพิ่ม `tracking_round` ทันที** (+1 จากค่าเดิม) บันทึกลง `recycle_history` พร้อมเหตุผล/หมายเหตุที่ผู้จัดการกรอก แล้วส่งเคสกลับเข้า state `ready_to_assign` ของไฟล์ 40 ทันที (ข้าม pending_review เพราะเคสนี้ผ่านการพิจารณารับเคสไปแล้วตั้งแต่รอบแรก ไม่ต้องพิจารณาซ้ำ)
- **ไม่อนุมัติ**: เคสจบที่ `closed_fail` ตามเดิม ไม่มีการเปลี่ยนแปลงสถานะใดๆ — ผู้จัดการสามารถกลับมาสร้างคำขอรีไซเกิลใหม่ได้อีกในอนาคตถ้าไฟแนนซ์ติดต่อมาอีก

## 7. UI Requirements

### 7.1 Page Layout

- หน้า List แสดงเคสทั้งหมดพร้อม status badge, source_channel badge, จังหวัด, ทีมที่เสนอ/ยืนยันแล้ว
- ปุ่ม "รับเคส" เปิด Modal/Drawer สำหรับกรอกฟอร์มแบบ manual
- ปุ่ม "Import" เปิดหน้าอัปโหลดไฟล์ Excel/CSV พร้อม mapping column และ preview ก่อนยืนยัน

### 7.2 Table Behavior

- Tables ต้องรองรับ loading state, empty state, search, filter (by status, source_channel, finance_company, province), pagination, row-level actions
- คอลัมน์มูลค่าเงิน (outstanding_debt_amount) จัดชิดขวา ใช้ Thai Baht format
- คอลัมน์ status ใช้ badge color ตาม HTML mockup
- case_ref, case_id ใช้ monospace styling
- Row hover ต้อง indicate ว่า click ดูรายละเอียดได้
- **Responsive / Mobile**: หน้าจอขนาดเล็ก (breakpoint ต่ำกว่า `md`) ต้องสลับจาก table เป็น **card list** แทน ไม่ใช่แค่ scroll แนวนอน — แต่ละ card แสดงข้อมูลสำคัญแบบย่อ (เลขเคส, ลูกหนี้, จังหวัด, สถานะ, ทีมที่เสนอ, ปุ่ม action หลัก) เพื่อให้เจ้าหน้าที่อนุมัติเคสใช้งานผ่านมือถือได้สะดวกตอนอยู่นอกสถานที่

### 7.3 Form / Modal Behavior (Manual Entry)

- ฟอร์มกรอกเคสแบ่งเป็น section ตามลำดับ: ข้อมูลสัญญา → ข้อมูลลูกหนี้ (ชื่อ/สัญชาติ/เลขเอกสารยืนยันตัวตน/ช่องทางติดต่อ) → ที่อยู่ (เรียง: ปัจจุบัน → ที่ทำงาน → ตามบัตรประชาชน) → ผู้ติดต่ออื่น (เพิ่มได้หลายคน) → ข้อมูลทรัพย์ → เอกสารแนบ → รูปสินค้า → **ทีมที่เสนอ (ท้ายสุดของฟอร์ม)**
- ที่อยู่ทั้ง 3 ส่วนใช้โครงสร้างเดียวกันตาม §6.1.2 (บ้านเลขที่ → รหัสไปรษณีย์ auto-complete → จังหวัด→อำเภอ→ตำบล) — มีเพียง `province` ของที่อยู่ปัจจุบันเท่านั้นที่ trigger การคำนวณทีมที่เสนอใหม่ทันทีที่เปลี่ยนค่า (ไม่ว่าจะมาจาก dropdown ตรงหรือ auto-fill จากรหัสไปรษณีย์)
- ส่วนผู้ติดต่ออื่นแสดงเป็น dynamic list พร้อมปุ่ม "+ เพิ่มผู้ติดต่อ" และปุ่มลบ (ถังขยะ) ต่อแถว
- แต่ละ document slot แสดงสถานะ "อัปโหลดแล้ว ✓" / "ยังไม่อัปโหลด" แยกต่อประเภท
- Submit action ต้อง validate inline:
  - case_ref ซ้ำ → **block การบันทึกทันที** แสดง error พร้อมลิงก์ไปเคสเดิม (hard block ตาม §11-12 ไม่ใช่ warning)
  - debtor_address_current.province ต้องเลือกจาก dropdown จังหวัดมาตรฐาน 77 จังหวัด (ไม่จำกัดเฉพาะจังหวัดที่มีทีม — ถ้าไม่มีทีมตรงจังหวัด ระบบแจ้ง CASE_NO_TEAM_MATCH ตาม §12 แทนการจำกัด choice)
  - debtor_national_id (เมื่อสัญชาติไทย) ต้องเป็นตัวเลข 13 หลักพอดี — input filter ตัวอักษรที่ไม่ใช่เลขออกทันทีที่พิมพ์ ไม่ปล่อยให้พิมพ์เกิน 13 หลัก
  - debtor_phone_mobile และ contact_phone (ของผู้ติดต่ออื่นทุกคน) ต้องเป็นตัวเลข 10 หลักพอดี; debtor_phone_work ต้องเป็นตัวเลข 9-10 หลัก — input filter ตัวอักษรที่ไม่ใช่เลขออกทันที
- Destructive actions (ลบเคส draft) ต้อง confirm

### 7.4 Team Suggestion UI

- แสดงเป็น section **ท้ายสุดของฟอร์ม** (หลังรูปสินค้า) — หลังกรอกที่อยู่ปัจจุบันครบ ระบบแสดง **ทีมที่เสนอ 1 ทีม** (จับคู่จากจังหวัด) พร้อม label ชัดเจนว่า "ระบบเสนอ" อัปเดตแบบ real-time ทันทีที่ province ของที่อยู่ปัจจุบันเปลี่ยน
- **เปลี่ยนทีมผ่านรายการแบบ inline ไม่ใช่ dropdown**: ใต้กล่องทีมที่เลือกอยู่ แสดง**รายการทีมอื่นที่จังหวัดตรงกับเงื่อนไข**ทันที (ไม่ต้องกดเปิดอะไรก่อน) แต่ละทีมในรายการแสดงค่าใช้จ่ายของตัวเองด้วย (ตามด้านล่าง) เพื่อให้เทียบกันได้ในหน้าเดียว — มี**ปุ่ม/ลิงก์ toggle "ดูทีมอื่นทั้งหมด"** เผื่อกรณีอยากเลือกทีมที่ไม่ตรงจังหวัด (ซ่อนไว้เป็น default ไม่โชว์ปนกับทีมที่ตรงเงื่อนไข) — เรียงลำดับทีมในรายการตามชื่อ/ลำดับ ไม่จัดอันดับตามค่าใช้จ่าย
- เลือกทีมใหม่จากรายการ → ต้องกรอก reason ก่อนยืนยัน (ตาม audit rule กลางในไฟล์ 01 §13 ที่ระบุว่าข้อมูลกระทบเงิน/สิทธิ์ต้องมี reason — การเปลี่ยนทีมกระทบ assignment จึงควรมี reason เพื่อ traceability) — ยืนยันแล้วกล่องทีมที่เลือกอยู่และกล่องค่าใช้จ่ายอัปเดตเป็นทีมใหม่ทันที พร้อมบันทึก edit history
- **กล่อง "ค่าใช้จ่ายของทีม" (แสดงข้อมูลเท่านั้น ไม่คำนวณกำไร/ขาดทุน)**: แสดงในทุกทีมที่ปรากฏในรายการ (ทั้งทีมที่เลือกอยู่และทีมตัวเลือกอื่น) ดึงค่าตั้งไว้ของ `Compensation Template` ที่ผูกกับทีมนั้น (ไฟล์ 11) — **ไม่มีการคำนวณหรือสรุปกำไร/ขาดทุนใดๆ ทั้งในข้อมูลและใน UI** (ไม่แสดงข้อความ disclaimer ใดๆบนหน้าจอ เพราะกล่องนี้อยู่คนละที่กับกล่องรายได้อยู่แล้ว ไม่ทำให้สับสนได้ง่าย) เพราะต้นทุนจริงต่อเคส (เช่น ค่าน้ำมันตามระยะทางจริง) คำนวณไม่ได้จนกว่าจะลงพื้นที่จริง — แสดงเฉพาะค่าที่ตั้งไว้ของ template ได้แก่:
  - ค่าน้ำมัน: โหมดที่ทีมนี้ใช้ (PER_KM แสดงอัตรา บาท/กม. + เพดานต่อเคส, หรือ DAILY_FLAT แสดงอัตราเหมาจ่าย บาท/วัน)
  - เบี้ยเลี้ยง และค่าที่พัก: แสดงอัตราเต็ม (บาท/วัน, บาท/คืน) ตามที่ template กำหนด
  - คอมมิชชั่น (จ่ายเมื่อสำเร็จ) และเบี้ยเสี่ยง/ค่าออกพื้นที่ (จ่ายเมื่อไม่สำเร็จ) — แสดงทั้งสองค่าแยกกันชัดเจน

### 7.5 Case Detail / Review Modal (Consolidated)

ไม่มี modal แยกระหว่าง "ดูรายละเอียด" กับ "พิจารณาเคส" อีกต่อไป — ใช้ modal เดียวกัน โดยพฤติกรรมเปลี่ยนตามสถานะของเคส:

- **เคสสถานะ `pending_review`**: modal แสดงข้อมูลครบทุกอย่าง **พร้อมปุ่ม action 3 ปุ่มในหน้าเดียวกัน** — "ไม่รับเคส" (reject), "ขอข้อมูลเพิ่ม" (need_info), "รับเคส & ยืนยันทีม" (accept) — ผู้จัดการไม่ต้องสลับไปหน้าอื่นเพื่อตัดสินใจ
- **เคสสถานะ `closed_fail`**: modal แสดงข้อมูลเคสแบบอ่านอย่างเดียว **พร้อมปุ่มเพิ่ม 1 ปุ่ม** — "ขอรีไซเกิล (re-track)" เปิดช่องกรอกหมายเหตุแล้วเปลี่ยนสถานะเป็น `pending_recycle_review`
- **เคสสถานะ `pending_recycle_review`**: modal แสดงข้อมูลเคสครบ **พร้อมปุ่ม action 2 ปุ่ม** — "ไม่อนุมัติ" (reject_recycle, กลับไป closed_fail) และ "อนุมัติรีไซเกิล" (approve_recycle, เพิ่ม tracking_round ส่งกลับเข้าไฟล์ 40) — แสดง `tracking_round` ปัจจุบันและประวัติ `recycle_history` (ถ้ามีจากรอบก่อนๆ) ให้เห็นในหน้านี้ด้วย
- **เคสสถานะอื่น** (draft, approved, rejected, need_info, closed_success): modal แสดงข้อมูลแบบอ่านอย่างเดียว มีเฉพาะปุ่ม "ปิดหน้าต่าง"
- เนื้อหาภายใน modal ต้องมี:
  - สรุปเคส (ลูกหนี้, case_ref, ไฟแนนซ์, ทรัพย์, source_channel, status, **tracking_round ปัจจุบัน** — แสดงเสมอทุกสถานะเพื่อให้รู้ว่ากำลังดูเคสรอบที่เท่าไหร่)
  - จังหวัด (ที่อยู่ปัจจุบัน) และมูลหนี้คงเหลือ
  - ช่องทางติดต่อลูกหนี้ทั้งหมด (มือถือ, ที่ทำงาน, LINE, Facebook)
  - รายชื่อผู้ติดต่ออื่น (ถ้ามี)
  - **เอกสารแนบ — ต้องเปิดดูได้จริง**: แต่ละไฟล์ในแต่ละ slot (contract_doc, national_id_doc, other_doc) แสดงเป็นรายการที่คลิกเพื่อเปิด viewer ได้ (PDF เปิดในตัว viewer, รูปภาพเปิดแบบ lightbox/ขยาย) ไม่ใช่แค่ badge ✓/✗ บอกว่ามี/ไม่มี
  - **รูปสินค้า — ต้องเปิดดูได้จริง**: แสดงเป็น thumbnail grid ที่คลิกแต่ละรูปเพื่อดูภาพขยายได้
  - **กล่องประมาณการรายได้ (ถ้าสำเร็จ)** — แสดง `projected_revenue_amount` (ตาม §6.5) พร้อมระบุโมเดลของ template ที่ใช้คำนวณ (FLAT/SUCCESS_FEE/HYBRID) — วางไว้**ติดกับกล่องทีมที่ระบบเสนอด้านบน** (ไม่แทรกอยู่ที่ส่วนข้อมูลลูกหนี้) เพื่อให้ผู้จัดการเห็นรายได้กับตัวเลือกทีมอยู่ใกล้กันตอนตัดสินใจ — ระบุชัดว่าเป็น "ประมาณการ ถ้าสำเร็จ" ไม่ใช่รายได้ที่ยืนยันแล้ว เพื่อไม่ให้สับสนกับ Revenue จริงตามไฟล์ 19
  - กล่องทีมที่ระบบเสนอ พร้อมปุ่มเปลี่ยนทีม (active เฉพาะตอน pending_review) และ**กล่องค่าใช้จ่ายของทีมนั้น** (ตาม §7.4 — แสดงข้อมูลเท่านั้น ไม่คำนวณกำไร/ขาดทุน — ไม่ใส่ข้อความ disclaimer ใน UI ใส่ไว้แค่ใน spec ฉบับนี้พอ)
  - ช่องเหตุผล/หมายเหตุ (แสดงเฉพาะตอน pending_review เพราะ reject/need_info ต้องมี reason, และตอน closed_fail/pending_recycle_review เพราะ create_recycle_request/reject_recycle ต้องมี reason ด้วยเช่นกัน)
  - **กล่องประวัติรีไซเกิล** (`recycle_history`) — แสดงเฉพาะเมื่อเคสมีประวัติ (array ไม่ว่างเปล่า) ไม่ว่าสถานะปัจจุบันจะเป็นอะไร แสดงรายการแต่ละรอบ (รอบที่เปลี่ยนจาก-ไป, ผู้อนุมัติ, วันเวลา, หมายเหตุ)

## 8. Actions & Buttons

| Action | Trigger / Button | Expected Behavior | Permission Required |
|---|---|---|---|
| create_case_manual | รับเคส (กรอกมือ) | สร้าง case สถานะ `draft` | Admin/ธุรการ |
| import_cases | Import ไฟล์ | สร้าง case หลายรายการสถานะ `draft`, แสดงผล success/error ต่อแถว | Admin/ธุรการ |
| receive_case_api | (ไม่มีปุ่ม — ระบบอัตโนมัติ) | สร้าง case สถานะ `draft` จาก API payload ของไฟแนนซ์ | System (service account) |
| upload_document | อัปโหลดเอกสาร (ต่อ slot) | แนบไฟล์เข้า case ตาม document_type | Admin/ธุรการ |
| review_case | ตรวจสอบเคส | ตรวจ case_ref ซ้ำ + ความครบถ้วน → เปลี่ยนสถานะเป็น `pending_review` | Admin/ธุรการ/Manager |
| accept_case | รับเคส (ผู้จัดการ) | ผู้จัดการพิจารณาแล้วยืนยันรับ → สถานะ `approved`, ยืนยัน/เปลี่ยนทีม | Manager |
| reject_case | ไม่รับเคส | สถานะ `rejected` พร้อม reason ที่ผู้จัดการระบุ | Manager |
| request_more_info | ขอข้อมูลเพิ่ม | สถานะ `need_info`, แจ้งธุรการ/ไฟแนนซ์ให้เติมข้อมูล/เอกสาร | Manager |
| edit_case | แก้ไข | เปิดฟอร์มเดียวกับ create_case_manual แบบ pre-fill ข้อมูลเดิม แก้ได้ทุก field รวม case_ref และเอกสารแนบ — บันทึกแล้วเพิ่มรายการใหม่ใน `edit_history` พร้อม actor และเวลา — **ใช้ได้เฉพาะเคสสถานะ `draft`, `pending_review`, `need_info` เท่านั้น** ปุ่มนี้ไม่แสดง/ไม่ทำงานในสถานะ `approved` หรือ `rejected` | Admin/ธุรการ/Manager (ตาม scope เดียวกับ create) |
| create_recycle_request | ขอรีไซเกิล (re-track) | **ใช้ได้เฉพาะเคสสถานะ `closed_fail` เท่านั้น** — เจ้าหน้าที่อนุมัติเคสกรอกหมายเหตุ (เช่น อ้างอิงการติดต่อจากไฟแนนซ์) แล้วเปลี่ยนสถานะเป็น `pending_recycle_review` (ดู §6.6) | Manager |
| approve_recycle | อนุมัติรีไซเกิล | เพิ่ม `tracking_round` +1, บันทึกลง `recycle_history`, เปลี่ยนสถานะเป็น `approved` และส่งกลับเข้า `ready_to_assign` ของไฟล์ 40 ทันที (ข้าม pending_review เพราะพิจารณารับเคสไปแล้วตั้งแต่รอบแรก) | Manager |
| reject_recycle | ไม่อนุมัติรีไซเกิล | เคสกลับไปสถานะ `closed_fail` เดิม ไม่มีการเปลี่ยนแปลงข้อมูลใดๆ — สร้างคำขอใหม่ได้อีกในอนาคต | Manager |

## 9. Workflow

```
[API/Import/Manual] → draft → pending_review → (ผู้จัดการพิจารณา) → approved → [ส่งต่อไฟล์ 40 มอบหมายทีม]
                                              ↘ rejected (จบ, เก็บ reason)
                                              ↘ need_info → กลับไป draft (รอเติมข้อมูล) → pending_review (ใหม่)

[เคสที่ไปจบงานแบบไม่สำเร็จในไฟล์ 41 — closed_fail] → (ไฟแนนซ์ติดต่อนอกระบบขอให้ลองใหม่)
  → เจ้าหน้าที่อนุมัติเคสกด create_recycle_request → pending_recycle_review
       ↘ approve_recycle → tracking_round +1 → approved → [ส่งต่อไฟล์ 40 ready_to_assign อีกรอบ]
       ↘ reject_recycle → กลับไป closed_fail เดิม (สร้างคำขอใหม่ได้อีกในอนาคต ไม่จำกัดจำนวนรอบ)
```

- ไม่มีขั้นเจ้าหน้าที่ตรวจแยกจากผู้จัดการ — เจ้าหน้าที่อนุมัติเคสเป็นผู้พิจารณารับ/ไม่รับด้วยตัวเอง ขั้นเดียว (ต่างจาก state machine multi-step ของ Baseline เดิม)
- การเปลี่ยนสถานะจาก `draft` → `pending_review` เกิดขึ้นเมื่อข้อมูล required ครบ + เอกสาร required (contract_doc, national_id_doc, product_photo) ครบ + ผ่านการตรวจ case_ref ซ้ำ

## 10. Status / State Machine

| State | Meaning | Allowed Next States | Trigger |
|---|---|---|---|
| draft | รับเข้าระบบแล้ว ข้อมูล/เอกสารอาจยังไม่ครบ | pending_review | ข้อมูล required + เอกสาร required ครบ |
| pending_review | พร้อมให้ผู้จัดการพิจารณา | approved / rejected / need_info | action ของผู้จัดการ |
| approved | ผู้จัดการรับเคสแล้ว ทีมยืนยันแล้ว | (ส่งต่อ → ไฟล์ 40 assigned) | accept_case |
| rejected | ผู้จัดการไม่รับเคส | — (terminal) | reject_case |
| need_info | รอข้อมูล/เอกสารเพิ่ม | draft | request_more_info |
| pending_recycle_review | เคสปิดงานแบบไม่สำเร็จ (จากไฟล์ 41) และเจ้าหน้าที่อนุมัติเคสสร้างคำขอรีไซเกิลไว้รออนุมัติ | (กลับไปสถานะ `approved` พร้อม `tracking_round` ใหม่ → ส่งต่อไฟล์ 40 ready_to_assign) / closed_fail (เดิม ถ้าไม่อนุมัติ) | create_recycle_request → approve_recycle / reject_recycle |

> **State `pending_recycle_review` มาจากไหน**: ไม่ได้มาจาก state machine ปกติของไฟล์นี้ (draft → pending_review → ...) แต่เป็น state ที่เคสกลับมาเข้าใหม่จากภายนอก — เคสต้องมีสถานะปิดงาน `closed_fail` (ของไฟล์ 41) อยู่ก่อนแล้ว เจ้าหน้าที่อนุมัติเคสกด `create_recycle_request` เปลี่ยนสถานะของเคสนั้นเป็น `pending_recycle_review` เพื่อรอการอนุมัติของตัวเองอีกขั้น (ดูรายละเอียดเต็มที่ §6.6) — **เพิ่มเข้า enum `case_status` ใน `02-database-schema-design.md` แล้วในรอบ reformat นี้ (เดิมขาดหายไป)**

> หมายเหตุ: state `assigned`, `in_progress`, `submitted`, `closed` ของ Baseline เดิมถูกย้ายไปอยู่ในความรับผิดชอบของไฟล์ 40 (Assignment) และ 41 (Outcome/Close) ไม่ใช่ส่วนของ Case Submission แล้ว เพื่อแยก concern ให้ชัดตาม Module Boundary (ไฟล์ 01 §6)

## 11. Business Rules

- **Duplicate case_ref (HARD BLOCK)**: case_ref คือเลขที่สัญญาจริง ดังนั้นต้องไม่สามารถสร้างซ้ำได้ภายใน `finance_company_id` เดียวกัน — ระบบ **reject การสร้างเคสใหม่ทันที** ถ้าเจอ case_ref ซ้ำ (เทียบที่ระดับ `case_ref_normalized`) ไม่ใช่แค่ warning
  - **Normalization rule** (เพราะแต่ละไฟแนนซ์ format เลขสัญญาไม่เหมือนกัน — มีทั้งตัวเลข ตัวอักษร และบางเจ้ามี `-`/`_`): normalize เบาที่สุดที่ปลอดภัย คือ (1) uppercase ทั้งหมด (2) trim whitespace หัว-ท้าย เท่านั้น — **ไม่ตัด dash/underscore ออก** เพราะความเสี่ยง false-positive (บล็อกเคสที่ไม่ซ้ำจริง) อันตรายกว่า false-negative ในธุรกิจนี้
  - **2-layer enforcement**: (1) Unique constraint ระดับ DB บน `(finance_company_id, case_ref_normalized)` เป็น safety net ป้องกัน race condition เมื่อหลายช่องทาง (API/Import/Manual) พยายามสร้างพร้อมกัน (2) API-level check ก่อนเขียน DB เพื่อแสดง error message ที่เข้าใจได้พร้อมลิงก์ไปเคสเดิม แทนการโยน raw DB error
  - หากในอนาคตพบรูปแบบ format ที่ทำให้ normalize เบานี้ไม่พอ (เช่น พบ false-negative จริงจากไฟแนนซ์เจ้าใดเจ้าหนึ่ง) ให้กลับมาพิจารณาทำ normalize เพิ่มเฉพาะต่อ finance_company_id นั้น ไม่ใช่เปลี่ยนกฎกลางทั้งระบบ
- **ไม่มี auto-reject ด้วยมูลค่าหนี้/สินค้า** — ทุกเคสต้องผ่านการพิจารณาโดยเจ้าหน้าที่อนุมัติเคสเสมอ ไม่มี threshold ที่ block อัตโนมัติ
- **Team suggestion เป็นค่าเริ่มต้นเท่านั้น** ไม่ auto-assign — ผู้จัดการต้องกด accept_case เพื่อ confirm ทีมเสมอ แม้จะใช้ทีมที่ระบบเสนอก็ตาม
- **Asset scope**: รับเฉพาะ `asset_type` = smartphone หรือ tablet ในรอบนี้ — ถ้ามีการขยายประเภทสินค้าในอนาคตต้องแก้ enum และอาจกระทบ field เพิ่มเติม
- เคสที่ source_channel = `api` ต้องสร้าง draft ทันทีแม้ข้อมูล/เอกสารยังไม่ครบ (เพราะธุรการต้องมาตรวจ/เติมต่อ) — ไม่ reject payload จาก API เพียงเพราะข้อมูลไม่ครบ **ยกเว้น** กรณี case_ref ซ้ำ ซึ่งต้อง reject แม้มาจาก API (ดูข้อด้านบน เพราะเป็นกฎ data integrity ระดับสัญญา ไม่ใช่ความครบถ้วนของข้อมูล)

## 12. Validation & Error Handling

| Scenario | Validation / Error | System Behavior |
|---|---|---|
| case_ref ซ้ำกับเคสเดิมของไฟแนนซ์เดียวกัน (เทียบที่ case_ref_normalized) | `CASE_REF_DUPLICATE` | **Reject ทันที** ไม่สร้างเคสใหม่ — แสดง error พร้อมลิงก์ไปเคสเดิม ทุกช่องทาง (API/Import/Manual) ถูก reject เหมือนกัน |
| ขาดเอกสาร required (contract_doc/national_id_doc/product_photo) | `CASE_DOCUMENT_INCOMPLETE` | ไม่อนุญาตเปลี่ยนสถานะเป็น pending_review จนกว่าจะอัปโหลดครบ |
| เปิด/แก้/แนบเอกสารเคสที่ไม่มีอยู่จริง หรืออยู่นอกขอบเขตที่ผู้ใช้เห็นได้ (ทีม/บริษัทอื่น) | `CASE_NOT_FOUND` | ตอบ 404 เหมือนไม่มีเคสนี้ ไม่บอกว่าเป็นของทีม/บริษัทอื่น (ไม่ leak ตาม `25` §16.1) |
| อัปโหลดรูปสินค้าเกิน 8 รูปต่อเคส (§6.3.1) | `CASE_PRODUCT_PHOTO_LIMIT` | reject ไฟล์ที่เกิน — ไม่กระทบรูปที่อัปโหลดสำเร็จไปแล้ว |
| province ของที่อยู่ปัจจุบันไม่ตรงกับทีมใดเลย | `CASE_NO_TEAM_MATCH` | ไม่เสนอทีมอัตโนมัติ — ต้องให้ผู้จัดการเลือกทีมเองแบบ manual พร้อม reason |
| debtor_national_id ไม่ครบ 13 หลัก หรือมีตัวอักษรที่ไม่ใช่เลข (เมื่อสัญชาติไทย) | `CASE_INVALID_NATIONAL_ID` | reject การบันทึก แสดง error ใต้ช่องกรอกทันที (inline) — input ต้อง filter ตัวอักษรที่ไม่ใช่เลขออกตั้งแต่ตอนพิมพ์เพื่อลดโอกาสเจอ error นี้ |
| debtor_phone_mobile/contact_phone ไม่ครบ 10 หลัก หรือ debtor_phone_work ไม่อยู่ในช่วง 9-10 หลัก | `CASE_INVALID_PHONE_FORMAT` | reject การบันทึก แสดง error ใต้ช่องกรอกทันที |
| รหัสไปรษณีย์ที่กรอกไม่พบใน Thailand Post API | `CASE_POSTAL_CODE_NOT_FOUND` | ไม่ auto-fill จังหวัด/อำเภอ/ตำบล — ให้ผู้ใช้เลือกเองทีละขั้นแบบ manual โดยไม่ block การกรอกฟอร์มต่อ |
| Import ไฟล์ field ไม่ตรง mapping | `API_VALIDATION_FAILED` (ตามไฟล์ 01 §11) | reject แถวนั้น แสดง field error เฉพาะแถว ไม่ reject ทั้งไฟล์ |
| แก้ไขเคสหลัง approved | `CASE_LOCKED_AFTER_APPROVAL` | ต้องผ่าน controlled edit/reopen ไม่แก้ตรงได้ (กฎ immutability ตามไฟล์ 02 §7) |
| สร้างคำขอรีไซเกิลกับเคสที่ไม่ใช่ `closed_fail` | `CASE_RECYCLE_INVALID_STATUS` | reject — รีไซเกิลได้เฉพาะเคสที่ปิดงานด้วยผลไม่สำเร็จเท่านั้น (เคส `closed_success` ไม่มีสิทธิ์) |
| สร้างคำขอรีไซเกิลโดยไม่กรอกหมายเหตุ | `CASE_RECYCLE_NOTE_REQUIRED` | reject การบันทึก ต้องระบุหมายเหตุอ้างอิงการติดต่อจากไฟแนนซ์เสมอ เพื่อ traceability |
| ไม่อนุมัติรีไซเกิลโดยไม่กรอกเหตุผล | `CASE_RECYCLE_REJECT_REASON_REQUIRED` | reject การบันทึก ต้องระบุเหตุผลที่ไม่อนุมัติเสมอ |

## 13. Permissions

| Capability | Allowed Roles | Notes |
|---|---|---|
| สร้างเคส (manual/import) | Admin/ธุรการ | ตาม scope ทีม/พื้นที่ที่ได้รับสิทธิ์ |
| อัปโหลดเอกสาร | Admin/ธุรการ | |
| พิจารณารับ/ไม่รับ/ขอข้อมูลเพิ่ม | เจ้าหน้าที่อนุมัติเคส (Case Approver) | ทุกเคสในระบบ — ไม่จำกัดพื้นที่/ทีม |
| เปลี่ยนทีมที่ระบบเสนอ | เจ้าหน้าที่อนุมัติเคส (Case Approver) | ต้องระบุ reason |
| แก้ไขเคส (edit_case) | Admin/ธุรการ/Manager | เฉพาะเคสสถานะ draft/pending_review/need_info ตาม scope เดียวกับสิทธิ์สร้าง/พิจารณา |
| สร้าง/อนุมัติ/ไม่อนุมัติคำขอรีไซเกิล | เจ้าหน้าที่อนุมัติเคส (Case Approver) | ทุกเคสในระบบที่ปิดงานด้วยผล `closed_fail` — เป็นคนเดียวกันที่ทำได้ทั้ง 3 action (สร้างคำขอ, อนุมัติ, ไม่อนุมัติ) เพราะเป็นผู้รับผิดชอบความสัมพันธ์กับไฟแนนซ์เจ้านั้นโดยตรง |
| ดูเคสทั้งหมด (ไม่จำกัดพื้นที่) | Superadmin/บริหาร | read scope กว้างกว่า manager |
| ตั้งค่า service account สำหรับ API ingestion | Superadmin | env-scoped |

## 14. Audit Log

ทุก mutation บันทึก `actor_id`, `role`, `action`, `before`, `after`, `reason` (เมื่อมี) ตามกฎกลาง รวมถึง:

- การสร้างเคส (ทุกช่องทาง พร้อม source_channel, created_at, created_by)
- การอัปโหลด/ลบเอกสารแต่ละ slot
- การเปลี่ยนสถานะทุกครั้ง (draft→pending_review→approved/rejected/need_info)
- การเปลี่ยนทีมจากที่ระบบเสนอ (ต้องมี reason)
- **การแก้ไขเคสทุกครั้ง (edit_case)** — เพิ่มรายการใหม่ใน `edit_history` พร้อม `edited_by` และ `edited_at` เสมอ ไม่เขียนทับประวัติเดิม เพื่อให้ดูย้อนหลังได้ว่าใครแก้ field ไหนไปบ้างเมื่อไหร่
- **การสร้าง/อนุมัติ/ไม่อนุมัติคำขอรีไซเกิล** — เพิ่มรายการใหม่ใน `recycle_history` ทุกครั้งที่อนุมัติสำเร็จ (พร้อม `previous_round`/`new_round` เพื่อ track การเปลี่ยนเลขรอบ) — กรณีไม่อนุมัติบันทึกใน audit log ทั่วไปพอ ไม่ต้องเพิ่มใน `recycle_history` เพราะไม่มีการเปลี่ยนรอบจริง

## 15. Notifications

- แจ้งเจ้าหน้าที่อนุมัติเคสทุกคนเมื่อมีเคสใหม่เข้าสถานะ `pending_review` (ไม่จำกัดพื้นที่ เพราะ scope เป็น global)
- แจ้งธุรการ/ผู้สร้างเคสเมื่อสถานะเปลี่ยนเป็น `need_info` (พร้อมเหตุผล) หรือ `rejected`
- แจ้ง finance module เมื่อเคส `approved` (เพื่อเตรียม cost center mapping ล่วงหน้า — ไม่ trigger สร้างรายได้/ค่าตอบแทนจริงในขั้นนี้ ซึ่งเกิดเมื่อเคสปิดในไฟล์ 41)

## 16. Integration Points

- event `case.created` → ใช้ตรวจ case_ref ซ้ำ + log audit
- event `case.approved` → ส่งต่อไฟล์ 40 (Assignment) เพื่อสร้าง assignment record จาก case นี้ — event เดียวกันนี้ถูกยิงซ้ำได้หลายครั้งตลอดอายุเคส (ทุกครั้งที่ approve_recycle สำเร็จ) ไฟล์ 40 ต้องรองรับการสร้าง assignment record ใหม่ทับ assignment เดิมของรอบก่อนหน้า ไม่ใช่แค่รอบแรกครั้งเดียว
- event `case.rejected` / `case.need_info` → แจ้งผู้เกี่ยวข้อง
- event `case.outcome_closed_fail` (รับมาจากไฟล์ 41) → ทำให้เคสพร้อมให้เจ้าหน้าที่อนุมัติเคสกด create_recycle_request ได้ในไฟล์นี้
- event `case.recycle_approved` → ส่งต่อไฟล์ 40 เหมือน `case.approved` พร้อม `tracking_round` ใหม่แนบไปด้วย เพื่อให้ไฟล์ 40/41 แสดงเลขรอบที่ถูกต้อง

## 17. API / Event Contract Draft

### 17.1 API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| POST | /api/cases | รับเคส (ใช้ทั้ง manual form submit และ API ingestion จากไฟแนนซ์ โดยมี field `source_channel` แยก) |
| POST | /api/cases/import | Import ไฟล์ Excel/CSV แบบ batch |
| GET | /api/cases | List พร้อม filter (status, source_channel, finance_company_id, province) |
| GET | /api/cases/{id} | รายละเอียดเคส |
| POST | /api/cases/{id}/documents | อัปโหลดเอกสารต่อ slot (document_type ระบุใน payload) |
| PATCH | /api/cases/{id}/status | เปลี่ยนสถานะ (review/accept/reject/request_more_info) — body ต้องมี `reason` เมื่อ action เป็น reject/need_info/เปลี่ยนทีม |
| GET | /api/cases/{id}/team-suggestion | คำนวณทีมที่เสนอจากจังหวัดที่อยู่ปัจจุบัน |

### 17.2 Events

- `case.created`
- `case.updated`
- `case.document_uploaded`
- `case.status_changed`
- `case.approved`
- `case.rejected`
- `case.need_info_requested`

## 18. Export / Document Requirements

- ยังไม่ระบุ export final ของขั้นนี้ (เคสเองไม่ export แยก แต่เอกสารแนบถูกอ้างอิงต่อใน Accounting Pack หากเคสนั้นมีผลทางการเงินในอนาคต)

## 19. Acceptance Criteria

- รับเคสได้ทั้ง 3 ช่องทาง (API, Import, Manual) และระบบเก็บ source_channel ถูกต้อง
- Document checklist แยกตามประเภท และ block การเข้า pending_review ถ้าเอกสาร required ไม่ครบ
- ตรวจ case_ref ซ้ำได้ถูกต้องตาม scope ของ finance_company_id
- ระบบเสนอทีมจากจังหวัดได้ และผู้จัดการยืนยัน/เปลี่ยนได้พร้อม audit trail
- สถานะ state machine เปลี่ยนตามกฎใน §10 ถูกต้องทุกกรณี
- Audit log ครบทุก mutation สำคัญ

## 20. Test Cases

| Case | Steps | Expected Result |
|---|---|---|
| Manual entry ครบข้อมูล | กรอกฟอร์ม + อัปโหลดเอกสาร required ครบ | case ไปสถานะ pending_review |
| Manual entry ขาดเอกสาร | กรอกฟอร์มแต่ไม่อัปโหลด national_id_doc | ไม่สามารถ submit เข้า pending_review ได้ ระบบแจ้ง CASE_DOCUMENT_INCOMPLETE |
| API ingestion ข้อมูลไม่ครบ | ส่ง payload จากไฟแนนซ์ที่ไม่มีที่อยู่ | case สร้างเป็น draft สำเร็จ (ไม่ reject) รอธุรการเติมข้อมูล |
| case_ref ซ้ำในไฟแนนซ์เดียวกัน | สร้างเคสด้วย case_ref ที่มีอยู่แล้ว (รวมถึงกรณีรูปแบบต่างเล็กน้อย เช่น พิมพ์เล็ก/ใหญ่ หรือมี/ไม่มี space หัว-ท้าย) | ระบบ reject ทันทีด้วย CASE_REF_DUPLICATE พร้อมลิงก์เคสเดิม ไม่สร้างเคสใหม่ |
| case_ref ต่างกันจริงแต่มี dash/underscore ต่างตำแหน่ง | สร้างเคสด้วย case_ref ที่มี `-`/`_` ต่างจากเคสเดิม | ระบบไม่ถือว่าซ้ำ (เพราะ normalize ไม่ตัด dash/underscore) — สร้างเคสใหม่ได้ตามปกติ |
| Team suggestion ตรงจังหวัด | กรอกที่อยู่ปัจจุบันจังหวัดที่มีทีมดูแล | ระบบเสนอ 1 ทีมถูกต้องตาม provinces ของทีม |
| Team suggestion ไม่มีทีมตรงจังหวัด | กรอกที่อยู่จังหวัดที่ไม่มีทีมดูแล | ระบบแจ้ง CASE_NO_TEAM_MATCH ให้ผู้จัดการเลือกทีมเองพร้อม reason |
| ผู้จัดการปฏิเสธเคส | กด reject_case พร้อม reason | case ไปสถานะ rejected, แจ้งผู้สร้างเคส, มี audit log |
| แก้ไขเคสหลัง approved | พยายามแก้ field หลังสถานะ approved | ระบบ reject ด้วย CASE_LOCKED_AFTER_APPROVAL |
| เลือกสัญชาติไทย | เลือก debtor_nationality = TH | ฟอร์มแสดงช่อง "เลขบัตรประชาชน" จำกัด 13 หลักตัวเลข |
| เลือกสัญชาติต่างด้าว | เลือก debtor_nationality = MM/LA/KH | ฟอร์มสลับเป็นช่อง "เลข Passport/เอกสารอื่น" แบบ free text ไม่จำกัดความยาว |
| เลือกสัญชาติอื่นๆ | เลือก debtor_nationality = OTHER | ฟอร์มแสดงช่องระบุชื่อสัญชาติเพิ่ม (debtor_nationality_other) |
| กรอกรหัสไปรษณีย์ที่มีในระบบ | กรอกรหัสไปรษณีย์ 5 หลักที่ตรงกับ master data | ระบบ auto-fill จังหวัด/อำเภอ/ตำบลให้อัตโนมัติ และอัปเดตทีมที่เสนอถ้าเป็นที่อยู่ปัจจุบัน |
| กรอกรหัสไปรษณีย์ที่ไม่พบ | กรอกรหัสไปรษณีย์ที่ไม่มีใน master data | ระบบไม่ auto-fill แสดง CASE_POSTAL_CODE_NOT_FOUND แต่ยังให้กรอกจังหวัด/อำเภอ/ตำบลเองต่อได้ |
| Projected revenue — โมเดล FLAT | เคสของไฟแนนซ์ที่ผูก template โมเดล FLAT (base = 1,500) | แสดง projected_revenue_amount = 1,500 บาท ไม่ขึ้นกับมูลหนี้ของเคส |
| Projected revenue — โมเดล SUCCESS_FEE | เคสมูลหนี้ 10,000 บาท ผูก template SUCCESS_FEE (rate = 20%) | แสดง projected_revenue_amount = 2,000 บาท (10,000 × 20%) |
| Projected revenue — โมเดล HYBRID | เคสมูลหนี้ 10,000 บาท ผูก template HYBRID (base = 500, rate = 15%) | แสดง projected_revenue_amount = 2,000 บาท (500 + 10,000×15%) |
| กล่องค่าใช้จ่ายของทีม — โหมด PER_KM | ทีมที่เสนอผูก Compensation Template โหมดค่าน้ำมัน PER_KM | แสดงอัตรา บาท/กม. และเพดานเบิกสูงสุดต่อเคสของโหมดนี้ ไม่มีตัวเลขกำไร/ขาดทุนใดๆ |
| กล่องค่าใช้จ่ายของทีม — โหมด DAILY_FLAT | ทีมที่เสนอผูก Compensation Template โหมดค่าน้ำมัน DAILY_FLAT | แสดงอัตราเหมาจ่ายบาท/วัน ไม่แสดงฟิลด์ของโหมด PER_KM |
| เปลี่ยนทีมแล้วกล่องค่าใช้จ่ายอัปเดต | ผู้จัดการเปลี่ยนทีมจากที่ระบบเสนอผ่าน dropdown | กล่องค่าใช้จ่ายของทีมอัปเดตเป็นค่าของ template ทีมใหม่ทันที |
| สร้างคำขอรีไซเกิลจากเคส closed_fail | กด create_recycle_request พร้อมหมายเหตุ | สถานะเปลี่ยนเป็น pending_recycle_review |
| สร้างคำขอรีไซเกิลจากเคสที่ไม่ใช่ closed_fail | พยายามกด create_recycle_request กับเคสสถานะ closed_success | ระบบ reject ด้วย CASE_RECYCLE_INVALID_STATUS |
| สร้างคำขอรีไซเกิลไม่กรอกหมายเหตุ | กด create_recycle_request โดยไม่กรอกหมายเหตุ | ระบบ reject ด้วย CASE_RECYCLE_NOTE_REQUIRED |
| อนุมัติรีไซเกิล | กด approve_recycle กับเคส pending_recycle_review ที่ tracking_round = 1 | tracking_round เปลี่ยนเป็น 2, บันทึกลง recycle_history, สถานะเปลี่ยนเป็น approved, ส่งกลับเข้าไฟล์ 40 ready_to_assign |
| ไม่อนุมัติรีไซเกิล | กด reject_recycle พร้อมเหตุผล | สถานะกลับเป็น closed_fail เดิม tracking_round ไม่เปลี่ยน |
| ไม่อนุมัติรีไซเกิลไม่กรอกเหตุผล | กด reject_recycle โดยไม่กรอกเหตุผล | ระบบ reject ด้วย CASE_RECYCLE_REJECT_REASON_REQUIRED |
| รีไซเกิลซ้ำหลายรอบไม่จำกัด | เคสถูกอนุมัติรีไซเกิลสำเร็จ 3 ครั้งติดต่อกัน (ปิด fail ทุกรอบ) | tracking_round ไปถึง 4 ได้ตามปกติ ไม่มี hard limit จำนวนรอบ recycle_history มี 3 รายการ |

---

## 21. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **รับเคสผ่าน 3 ช่องทาง**: API, Import, Manual — API ต้องสร้าง draft เสมอแม้ข้อมูลไม่ครบ ยกเว้น case_ref ซ้ำ (§11)
- **case_ref ซ้ำเป็น HARD BLOCK ไม่ใช่ warning** — 2-layer enforcement (DB constraint + API check) (§11, §12)
- **Team suggestion เป็นแค่ค่าเริ่มต้น ไม่ auto-assign** — ต้อง accept_case เพื่อ confirm เสมอ (§11)
- **ไม่มี auto-reject ด้วยมูลค่าหนี้** — เจ้าหน้าที่อนุมัติเคสพิจารณาเองเสมอ (§11)
- **Projected Revenue คำนวณบนฐาน "สำเร็จ 100%" เสมอ** ไม่คูณลดด้วยความน่าจะเป็น — เป็น best-case ไม่ใช่ expected value (§6.5)
- **กล่องค่าใช้จ่ายทีมไม่คำนวณกำไร/ขาดทุนใดๆ** แสดงแค่อัตราตั้งต้นจาก template (§7.4)
- **Recycle Flow ใช้ได้เฉพาะเคส `closed_fail` เท่านั้น ไม่จำกัดจำนวนรอบ** — อนุมัติแล้วข้าม pending_review ตรงเข้า ready_to_assign ทันที (§6.6)
- **เพิ่ม `pending_recycle_review` เข้า enum `case_status`** ที่ขาดหายไปจาก schema เดิม (§10) — sync กับ `02-database-schema-design.md` แล้ว
- **แก้ reference "ไฟล์ 42/43" ที่ล้าสมัยทั้งหมดเป็น "ไฟล์ 41"** เพราะทั้งสองไฟล์ merge เข้าไฟล์ 41 แล้วตาม README

## 22. สิ่งที่ยังต้องตัดสินใจ (Open Items)

1. **OCR / Document AI**: ยกไป sprint ถัดไป — แนวทางที่เสนอคือใช้ document-AI service (เช่น Google Document AI / AWS Textract หรือเทียบเท่า) ดึงข้อมูล debtor_name, debtor_national_id, case_ref จากไฟล์ที่อัปโหลดในช่อง `contract_doc`/`national_id_doc` มา pre-fill ฟอร์ม โดยต้องมีขั้นให้เจ้าหน้าที่ยืนยัน/แก้ไขก่อนบันทึกจริงเสมอ (ไม่ auto-commit ข้อมูลจาก OCR)
2. **Routing algorithm ละเอียดขึ้น**: ปัจจุบันจับคู่แค่จังหวัด รอบหน้าอาจต้องพิจารณา workload ของทีม/อำเภอเฉพาะ — ขึ้นกับผลตอนออกแบบไฟล์ 40
3. **Asset type เพิ่มเติม**: หากในอนาคตขยายจาก smartphone/tablet ไปประเภทอื่น ต้องกลับมาแก้ enum `asset_type` และอาจกระทบ field เฉพาะประเภท
4. **Thailand Post API integration**: ต้องเลือก provider/endpoint จริงสำหรับ lookup รหัสไปรษณีย์ → จังหวัด/อำเภอ/ตำบล (เช่น บริการของไปรษณีย์ไทยเอง หรือ third-party ที่ห่อ dataset เดียวกัน) รวมถึงวางแผน fallback เมื่อ API ภายนอกล่ม/ตอบช้า — เวอร์ชัน mockup ใช้ข้อมูลจำลองในระบบเท่านั้น
5. **Master data จังหวัด/อำเภอ/ตำบลฉบับสมบูรณ์**: เวอร์ชัน mockup ใส่ตัวอย่างไว้เพียง 4 จังหวัด ของจริงต้องโหลด master data ครบทั้ง 77 จังหวัดพร้อมอำเภอ/ตำบลทั้งหมดจากแหล่งข้อมูลทางการ (เช่น กรมการปกครอง)
6. **Pinpoint Geocoding API integration**: เลือกใช้ Pinpoint (pin-point.co) สำหรับแปลงที่อยู่เป็นพิกัด — ยืนยันแล้วว่าจุดปักหมุดอยู่ในไฟล์ 41 (ตอนมอบหมาย/ก่อนลงพื้นที่จริง) ไม่ใช่ตอนรับเคสในไฟล์นี้ เพื่อประหยัด credit — รายละเอียดเทคนิค (rate limit, accuracy, batch credit cost) บันทึกไว้ในไฟล์ 41
7. **Projected Revenue — basis field ของ SUCCESS_FEE/HYBRID**: §6.5 อ้างอิงว่าใช้ `basis` ของ Service Fee Template (ไฟล์ 12) เป็นตัวกำหนดว่าคำนวณจากมูลหนี้คงเหลือหรือมูลค่าสินค้า — ต้องยืนยันรายละเอียดการ map ฟิลด์นี้ตอนออกแบบ UI ของไฟล์ 12 จริง
8. **ค่าน้ำมันโหมด PER_KM — แหล่งระยะทางจริง**: §7.4 อ้างถึง "ระยะทางจริง" ของค่าน้ำมัน แต่ยังไม่ได้ตัดสินใจว่าจะคำนวณระยะทางจากที่ไหน (เช่น Pinpoint Route/Distance Matrix หรือคำนวณเองจากพิกัด origin-destination) — เป็นรายละเอียด implementation ที่ต้องชัดเจนตอนออกแบบไฟล์ 41 ที่จะเกิดการลงพื้นที่จริง
9. **ไฟล์ 40 ต้องอัปเดต spec ให้รองรับ assignment ใหม่ของเคสรีไซเกิล**: ตอนนี้ไฟล์ 40 spec เดิมออกแบบไว้สำหรับ assignment ครั้งแรกของเคสเท่านั้น — เมื่อเคสกลับเข้ามาทาง `case.recycle_approved` (ดู §16) ต้องสร้าง assignment record รอบใหม่ (ไม่ใช่แก้ทับ record เดิมของรอบก่อน) พร้อมแสดง `tracking_round` ปัจจุบันในหน้ามอบหมายงานของไฟล์ 40 ด้วย เพื่อให้ผู้จัดการทีมเห็นว่าเคสนี้เป็นรอบที่เท่าไหร่ก่อนมอบหมาย — ยังไม่ได้แก้ spec ไฟล์ 40 จริงในรอบนี้ (จะทำในไฟล์ถัดไปของ Batch 6)

---

*เอกสารนี้เป็นไฟล์แรกในหมวด Case & Field Operations (38–44) ต่อด้วย `40-case-assignment-routing.md`*
