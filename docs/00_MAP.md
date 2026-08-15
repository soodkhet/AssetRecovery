# 00_MAP.md — แผนที่ช่วงบรรทัดของไฟล์ใหญ่ (สำหรับ Read(offset, limit))

> **วิธีใช้**: ก่อนอ่านไฟล์ใหญ่ ให้เปิดไฟล์นี้หาบรรทัดเริ่มของ section ที่ต้องการ แล้ว `Read(file, offset=<บรรทัดเริ่ม>, limit=<ช่วงที่ต้องการ>)` — **ห้ามอ่านไฟล์ใหญ่ทั้งไฟล์**
> ช่วงจบของแต่ละ section = บรรทัดเริ่มของ section ถัดไป − 1
> ⚠️ **ถ้ามีการแก้ไฟล์ spec/mockup จนบรรทัดเลื่อน ต้อง regenerate MAP นี้ใหม่** (สคริปต์อยู่ท้ายไฟล์)
> ครอบคลุม: ไฟล์ `.md` ใน docs/ ที่ ≥ 15KB ทุกไฟล์ + mockup `.html` ใน reference/ ทุกไฟล์

---

## ส่วนที่ 1 — Spec files (docs/)


### `docs/02-database-schema-design.md` (148 KB, 2070 บรรทัด — v4.4)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 02-database-schema-design.md |
| 3 | # 02 — Database Schema Design (Full Production Schema) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 39 | ## 1. Summary |
| 42 | ## 2. Conventions (กฎที่ใช้ทั้งไฟล์) |
| 44 | ### 2.1 Naming |
| 54 | ### 2.2 Money |
| 61 | ### 2.3 Timestamps |
| 66 | ### 2.4 Common Columns (ทุก table มีครบ) |
| 77 | ### 2.5 Permission Architecture |
| 84 | ## 3. Enum Types (ทั้งหมด) |
| 406 | ## 4. Schema Group A — Identity & Access |
| 500 | ## 5. Schema Group B — Master Data |
| 801 | ## 6. Schema Group C — Case Workflow |
| 1147 | ## 7. Schema Group D — Warehouse (ไฟล์ 44) |
| 1235 | ## 8. Schema Group E — Finance Operation |
| 1495 | ## 9. Schema Group F — Accounting Handover (รวม `bank_transaction_allocations` A2 + `customer_wht_certificates` A1) |
| 1790 | ## 10. Schema Group G — Platform |
| 1891 | ## 11. Migration Order (ลำดับที่ต้อง run) |
| 1964 | ## 12. Seed Data |
| 2032 | ## 13. Immutable Rules (ห้ามแก้ไขย้อนหลัง) |
| 2050 | ## 14. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 2060 | ## 15. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/03-non-functional-requirements.md` (14 KB, 213 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 03-non-functional-requirements.md |
| 3 | # 03 — Non-Functional Requirements |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 25 | ## 1. Summary |
| 29 | ## 2. Purpose |
| 33 | ## 3. In Scope |
| 39 | ## 4. Out of Scope |
| 44 | ## 5. Actors & Responsibilities |
| 59 | ## 6. Core Concepts |
| 67 | ### 6.5 Datetime Standard (ใช้ทั้งระบบ — บังคับทุก module) |
| 118 | ## 7. Data Entities / Required Objects |
| 128 | ## 8. UI / UX Rules |
| 135 | ## 9. Workflow / Lifecycle |
| 141 | ## 10. Security / Control Rules |
| 148 | ## 11. Validation & Error Handling |
| 157 | ## 12. Permission Requirements |
| 164 | ## 13. Audit Log Requirements |
| 171 | ## 14. API / Integration Draft |
| 179 | ## 15. Acceptance Criteria |
| 186 | ## 16. Test Cases |
| 196 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 204 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/04-ui-ux-design-system.md` (19 KB, 214 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 04-ui-ux-design-system.md |
| 3 | # 04 — UI/UX Design System |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 25 | ## 1. Summary |
| 29 | ## 2. Purpose |
| 33 | ## 3. In Scope |
| 39 | ## 4. Out of Scope |
| 44 | ## 5. Actors & Responsibilities |
| 59 | ## 6. Core Concepts |
| 67 | ## 7. Data Entities / Required Objects |
| 75 | ## 8. UI / UX Rules |
| 86 | ### 8.1 Design Token Reference (สกัดจริงจาก Mockup HTML — ไม่ใช่ค่าที่กำหนดขึ้นใหม่) |
| 141 | ## 10. Security / Control Rules |
| 147 | ## 11. Validation & Error Handling |
| 156 | ## 12. Permission Requirements |
| 163 | ## 13. Audit Log Requirements |
| 170 | ## 14. API / Integration Draft |
| 178 | ## 15. Acceptance Criteria |
| 185 | ## 16. Test Cases |
| 196 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 205 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/06-menu-and-navigation-map.md` (19 KB, 209 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 06-menu-and-navigation-map.md |
| 3 | # 06 — Menu and Navigation Map |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 26 | ## 1. Summary |
| 30 | ## 2. Purpose |
| 34 | ## 3. In Scope |
| 40 | ## 4. Out of Scope |
| 45 | ## 5. Actors & Responsibilities |
| 60 | ## 6. Core Concepts |
| 68 | ## 7. Data Entities / Required Objects |
| 76 | ### 7.1 เมนู "งานติดตามทรัพย์" (Asset Recovery Workflow) — Concrete Menu Map |
| 107 | ## 8. UI / UX Rules |
| 119 | ### 7.2 สิทธิ์เข้าถึงเมนูหลัก (Top Nav Visibility Matrix) |
| 131 | ## 9. Workflow / Lifecycle |
| 136 | ## 10. Security / Control Rules |
| 141 | ## 11. Validation & Error Handling |
| 150 | ## 12. Permission Requirements |
| 157 | ## 13. Audit Log Requirements |
| 164 | ## 14. API / Integration Draft |
| 172 | ## 15. Acceptance Criteria |
| 179 | ## 16. Test Cases |
| 191 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 201 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/07-roles-permissions.md` (23 KB, 205 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 07-roles-permissions.md |
| 3 | # 07 — Roles and Permissions (Master Role List) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 26 | ## 1. Summary |
| 30 | ## 2. Purpose |
| 34 | ## 3. In Scope |
| 40 | ## 4. Out of Scope |
| 45 | ## 5. Actors & Responsibilities — Role ทั้งหมด 15 ตัว แบ่งตาม Role Group (system 6 + in... |
| 47 | ### 5.1 กลุ่ม System (ดูแลภาพรวมทั้งระบบ — ไม่ผูกทีม) |
| 58 | ### 5.2 กลุ่ม Inhouse / Outsource (ทีมติดตามทรัพย์ — แยก role ต่อ Role Group) |
| 68 | ### 5.3 กลุ่ม Finance Company (ภายนอก — ผูกกับบริษัทไฟแนนซ์โดยตรง ไม่มี sub-team) |
| 78 | ## 6. Core Concepts |
| 86 | ## 7. Data Entities / Required Objects |
| 88 | ### 7.1 Role |
| 98 | ### 7.2 Permission |
| 106 | ### 7.3 Role Group |
| 115 | ## 8. UI / UX Rules |
| 121 | ## 9. Workflow / Lifecycle |
| 127 | ## 10. Security / Control Rules |
| 134 | ## 11. Validation & Error Handling |
| 144 | ## 12. Permission Requirements (สรุปภาพรวม — รายละเอียดเชิงลึกดูไฟล์ต้นทาง) |
| 156 | ## 13. Audit Log Requirements |
| 162 | ## 14. API / Integration Draft |
| 171 | ## 15. Acceptance Criteria |
| 178 | ## 16. Test Cases |
| 189 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 198 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/10-finance-companies.md` (22 KB, 209 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 10-finance-companies.md |
| 3 | # 10 — Finance Companies (บริษัทไฟแนนซ์คู่ค้า) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 24 | ## 1. Summary |
| 28 | ## 2. Purpose |
| 32 | ## 3. In Scope |
| 39 | ## 4. Out of Scope |
| 45 | ## 5. Actors & Responsibilities |
| 54 | ## 6. Core Concepts |
| 62 | ## 7. Data Entities / Required Objects |
| 64 | ### 7.1 Finance Company |
| 84 | ### 7.2 Company User (บัญชีผู้ใช้ฝั่งบริษัทไฟแนนซ์) |
| 95 | ## 8. UI / UX Rules |
| 106 | ## 9. Workflow / Lifecycle |
| 108 | ### 9.1 สร้างบริษัทใหม่ |
| 112 | ### 9.2 Service Fee Template Snapshot (แก้ไขแล้ว — ดู Changelog v2) |
| 123 | ### 9.3 ระงับ/เปิดใช้งานบริษัท |
| 129 | ## 10. Security / Control Rules |
| 135 | ## 11. Validation & Error Handling |
| 145 | ## 12. Permission Requirements |
| 155 | ## 13. Audit Log Requirements |
| 161 | ## 14. API / Integration Draft |
| 173 | ## 15. Acceptance Criteria |
| 180 | ## 16. Test Cases |
| 193 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 201 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/11-compensation.md` (15 KB, 181 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 11-compensation.md |
| 3 | # 11 — Compensation (แผนค่าตอบแทน) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 23 | ## 1. Summary |
| 27 | ## 2. Purpose |
| 31 | ## 3. In Scope |
| 37 | ## 4. Out of Scope |
| 42 | ## 5. Actors & Responsibilities |
| 57 | ## 6. Core Concepts |
| 65 | ## 7. Data Entities / Required Objects |
| 74 | ### 7.1 Fuel Rule — 2 โหมด (ไม่ใช่สูตรเดียวแบบ Rule อื่น) |
| 85 | ### 7.2 No-Success Compensation (เบี้ยเสี่ยง/ค่าออกพื้นที่) |
| 94 | ## 8. UI / UX Rules |
| 102 | ## 9. Workflow / Lifecycle |
| 107 | ## 10. Security / Control Rules |
| 115 | ## 11. Validation & Error Handling |
| 124 | ## 12. Permission Requirements |
| 131 | ## 13. Audit Log Requirements |
| 138 | ## 14. API / Integration Draft |
| 147 | ## 15. Acceptance Criteria |
| 154 | ## 16. Test Cases |
| 166 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 174 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/12-service-fee.md` (16 KB, 169 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 12-service-fee.md |
| 3 | # 12 — Service Fee (กติกาค่าบริการที่เรียกเก็บบริษัทไฟแนนซ์) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 24 | ## 1. Summary |
| 28 | ## 2. Purpose |
| 32 | ## 3. In Scope |
| 38 | ## 4. Out of Scope |
| 44 | ## 5. Actors & Responsibilities |
| 51 | ## 6. Core Concepts |
| 53 | ### 6.1 Model: `SUCCESS_FEE` |
| 60 | ### 6.2 Model: `FLAT` |
| 67 | ### 6.3 Model: `HYBRID` |
| 75 | ## 7. Data Entities / Required Objects |
| 77 | ### 7.1 Service Fee Template |
| 91 | ## 8. UI / UX Rules |
| 98 | ## 9. Workflow / Lifecycle |
| 104 | ## 10. Security / Control Rules |
| 109 | ## 11. Validation & Error Handling |
| 117 | ## 12. Permission Requirements |
| 124 | ## 13. Audit Log Requirements |
| 128 | ## 14. API / Integration Draft |
| 136 | ## 15. Acceptance Criteria |
| 142 | ## 16. Test Cases |
| 154 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 162 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/13-accounting-finance-settings.md` (46 KB, 365 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 13-accounting-finance-settings.md |
| 3 | # 13 — Accounting & Finance Settings (ตั้งค่าระบบบัญชี/การเงิน) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 28 | ## 1. Summary |
| 32 | ## 2. Purpose |
| 36 | ## 3. In Scope |
| 40 | ## 4. Out of Scope |
| 45 | ## 5. Actors & Responsibilities |
| 53 | ## 6. Core Concepts & Data Entities |
| 55 | ### 6.1 Billing/Payout Cycles (รอบบิลและรอบจ่าย) |
| 70 | ### 6.2 Approval Matrix (สายการอนุมัติ) |
| 95 | ### 6.3 Corporate Bank Accounts (บัญชีธนาคารบริษัท) |
| 110 | ### 6.4 Tax Profile (กติกาภาษี) 🔶 สำคัญมาก — ต้องนักบัญชียืนยันก่อนใช้จริง |
| 128 | ### 6.5 VAT Rate Setting (อัตราภาษีมูลค่าเพิ่ม) 🔶 สำคัญมาก — ติดตามใกล้ชิด |
| 145 | ### 6.6 Cost Center |
| 154 | ### 6.7 Internal Document Templates (รูปแบบเอกสารภายใน) |
| 168 | ### 6.8 Bank File Format (รูปแบบไฟล์ธนาคาร) |
| 178 | ### 6.9 Export Format (รูปแบบไฟล์ Export ส่งสำนักงานบัญชี) |
| 193 | ### 6.10 Functional Permission Matrix (สิทธิ์เฉพาะโมดูลการเงิน/บัญชี) |
| 212 | ### 6.11 Period Lock Policy (นโยบายล็อกรอบบัญชี) |
| 222 | ### 6.12 Tax Invoice Numbering Format (รูปแบบเลขที่ใบกำกับภาษี) |
| 236 | ### 6.13 Tax Document Template Settings (รูปแบบเอกสารภาษีทางการ) |
| 251 | ### 6.14 SLA Alert Threshold (เกณฑ์ SLA งานติดตาม) — มติ PO 15/08/2569 (D18) |
| 263 | ## 7. UI / UX Rules |
| 269 | ## 8. Workflow / Lifecycle |
| 275 | ## 9. Security / Control Rules |
| 282 | ## 10. Validation & Error Handling |
| 292 | ## 11. Permission Requirements |
| 305 | ## 12. Audit Log Requirements |
| 310 | ## 13. API / Integration Draft |
| 328 | ## 14. Acceptance Criteria |
| 335 | ## 15. Test Cases |
| 347 | ## 16. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 358 | ## 17. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/15-claims-and-advances.md` (18 KB, 193 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 15-claims-and-advances.md |
| 3 | # 15 — Claims and Advances (รายการเบิกและเงินทดรองจ่าย) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 24 | ## 1. Summary |
| 28 | ## 2. Purpose |
| 32 | ## 3. In Scope |
| 37 | ## 4. Out of Scope |
| 43 | ## 5. Actors & Responsibilities |
| 51 | ## 6. Core Concepts |
| 53 | ### 6.1 Claim (รายการเบิก) — มาจาก 2 แหล่ง |
| 58 | ### 6.2 Advance (เงินทดรองจ่าย) |
| 64 | ## 7. Data Entities / Required Objects |
| 66 | ### 7.1 Manual Claim |
| 79 | ### 7.2 Advance (แก้ไขแล้ว — ดู Changelog v2) |
| 95 | ## 8. UI / UX Rules |
| 103 | ## 9. Workflow / Lifecycle |
| 105 | ### 9.1 Advance (แก้ไขแล้ว) |
| 109 | ### 9.2 ห้ามเบิกซ้อน |
| 113 | ## 10. Security / Control Rules |
| 119 | ## 11. Validation & Error Handling |
| 129 | ## 12. Permission Requirements |
| 137 | ## 13. Audit Log Requirements |
| 143 | ## 14. API / Integration Draft |
| 157 | ## 15. Acceptance Criteria |
| 164 | ## 16. Test Cases |
| 177 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 186 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/16-compensation-approval.md` (16 KB, 158 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 16-compensation-approval.md |
| 3 | # 16 — Compensation Approval (สายการอนุมัติค่าตอบแทน) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 25 | ## 1. Summary |
| 29 | ## 2. Purpose |
| 33 | ## 3. In Scope |
| 39 | ## 4. Out of Scope |
| 45 | ## 5. Actors & Responsibilities |
| 53 | ## 6. Core Concepts |
| 55 | ### 6.1 Multi-step Approval ตาม Approval Matrix |
| 64 | ### 6.2 ความสัมพันธ์กับ QC Outcome (ไฟล์ 41 §10.1) |
| 71 | ## 7. Data Entities / Required Objects |
| 81 | ## 8. UI / UX Rules |
| 89 | ## 9. Workflow / Lifecycle |
| 95 | ## 10. Security / Control Rules |
| 101 | ## 11. Validation & Error Handling |
| 109 | ## 12. Permission Requirements |
| 117 | ## 13. Audit Log Requirements |
| 121 | ## 14. API / Integration Draft |
| 129 | ## 15. Acceptance Criteria |
| 135 | ## 16. Test Cases |
| 144 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 151 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/17-payroll-and-payout.md` (17 KB, 175 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 17-payroll-and-payout.md |
| 3 | # 17 — Payroll and Payout (รอบจ่ายเงินและไฟล์โอนธนาคาร) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 25 | ## 1. Summary |
| 29 | ## 2. Purpose |
| 33 | ## 3. In Scope |
| 40 | ## 4. Out of Scope |
| 45 | ## 5. Actors & Responsibilities |
| 52 | ## 6. Core Concepts |
| 54 | ### 6.1 Payout Batch แยกฝั่ง inhouse / outsource |
| 58 | ### 6.2 WHT Calculation ต่อ Payout Batch |
| 62 | ### 6.3 Idempotency Key (กันโอนซ้ำ) 🔶 สำคัญมากด้านความปลอดภัยทางการเงิน |
| 66 | ## 7. Data Entities / Required Objects |
| 68 | ### 7.1 Payout Batch (เติมสถานะ `draft` — ดู Changelog v2) |
| 84 | ### 7.2 Payout Batch Item |
| 94 | ## 8. UI / UX Rules |
| 102 | ## 9. Workflow / Lifecycle |
| 106 | ## 10. Security / Control Rules |
| 112 | ## 11. Validation & Error Handling |
| 120 | ## 12. Permission Requirements |
| 128 | ## 13. Audit Log Requirements |
| 133 | ## 14. API / Integration Draft |
| 142 | ## 15. Acceptance Criteria |
| 149 | ## 16. Test Cases |
| 159 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 167 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/18-payee-and-tax-profile.md` (17 KB, 184 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 18-payee-and-tax-profile.md |
| 3 | # 18 — Payee and Tax Profile (ผู้รับเงินและกติกาภาษีรายบุคคล) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 24 | ## 1. Summary |
| 28 | ## 2. Purpose |
| 32 | ## 3. In Scope |
| 38 | ## 4. Out of Scope |
| 43 | ## 5. Actors & Responsibilities |
| 51 | ## 6. Core Concepts |
| 53 | ### 6.1 Payee = บุคคล/นิติบุคคลที่รับเงินจาก AssetRecovery |
| 57 | ### 6.2 Verification ก่อนจ่ายเงิน |
| 61 | ### 6.3 WHT Rate Priority — Payee Level vs Plan Level 🔑 Key Business Rule |
| 83 | ## 7. Data Entities / Required Objects |
| 85 | ### 7.1 Payee Profile (field name ตรงกับ `02-database-schema-design.md` §8 หลังเติม col... |
| 102 | ## 8. UI / UX Rules |
| 109 | ## 9. Workflow / Lifecycle |
| 115 | ## 10. Security / Control Rules |
| 121 | ## 11. Validation & Error Handling |
| 129 | ## 12. Permission Requirements |
| 137 | ## 13. Audit Log Requirements |
| 142 | ## 14. API / Integration Draft |
| 151 | ## 15. Acceptance Criteria |
| 158 | ## 16. Test Cases |
| 169 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 177 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/19-revenue-billing-receivable.md` (25 KB, 224 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 19-revenue-billing-receivable.md |
| 3 | # 19 — Revenue, Billing & Receivable (รายได้ วางบิล และลูกหนี้การค้า) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 26 | ## 1. Summary |
| 30 | ## 2. Purpose |
| 34 | ## 3. In Scope |
| 41 | ## 4. Out of Scope |
| 47 | ## 5. Actors & Responsibilities |
| 55 | ## 6. Core Concepts |
| 57 | ### 6.1 Revenue Record (รายการรายได้) 🔑 Complex Trigger Logic |
| 73 | ### 6.2 Billing Batch (รอบวางบิล) |
| 77 | ### 6.3 VAT Handling 🔶 สำคัญมาก — อัตราอาจเปลี่ยนใน 3 เดือนข้างหน้า |
| 93 | ### 6.4 AR Aging |
| 97 | ## 7. Data Entities / Required Objects |
| 99 | ### 7.1 Revenue |
| 115 | ### 7.2 Billing Batch |
| 127 | ## 8. UI / UX Rules |
| 135 | ## 9. Workflow / Lifecycle |
| 137 | ### 9.1 Revenue → Billing Batch |
| 141 | ### 9.2 Billing Batch Payment Tracking |
| 147 | ## 10. Security / Control Rules |
| 152 | ## 11. Validation & Error Handling |
| 160 | ## 12. Permission Requirements |
| 168 | ## 13. Audit Log Requirements |
| 173 | ## 14. API / Integration Draft |
| 183 | ## 15. Acceptance Criteria |
| 189 | ## 16. Test Cases |
| 205 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 215 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/22-finance-calculation-spec.md` (15 KB, 215 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 22-finance-calculation-spec.md |
| 3 | # 22 — Finance Calculation Spec (สูตรคำนวณรวมทั้งระบบ) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 24 | ## 1. Summary |
| 28 | ## 2. Purpose |
| 32 | ## 3. In Scope |
| 36 | ## 4. Out of Scope |
| 41 | ## 5. Actors & Responsibilities |
| 45 | ## 6. สูตรคำนวณทั้งหมด |
| 47 | ### 6.1 ค่าน้ำมัน (Fuel) — โหมด PER_KM (อ้างอิงไฟล์ 11, 41 §6.4.2) |
| 59 | ### 6.2 ค่าน้ำมัน (Fuel) — โหมด DAILY_FLAT (อ้างอิงไฟล์ 11) |
| 65 | ### 6.3 เบี้ยเลี้ยง (Allowance) — แก้ไขแล้ว (ดู Changelog v2) |
| 76 | ### 6.4 Commission / No-Success Fee (อ้างอิงไฟล์ 11) |
| 84 | ### 6.5 รายได้จาก Service Fee — Model SUCCESS_FEE (อ้างอิงไฟล์ 12, 19) |
| 96 | ### 6.6 รายได้จาก Service Fee — Model FLAT (อ้างอิงไฟล์ 12) |
| 103 | ### 6.7 รายได้จาก Service Fee — Model HYBRID (อ้างอิงไฟล์ 12) |
| 117 | ### 6.8 VAT (อ้างอิงไฟล์ 13 §6.5, 19 §6.3) |
| 134 | ### 6.9 ภาษีหัก ณ ที่จ่าย (WHT) (อ้างอิงไฟล์ 13 §6.4, 17, 18) |
| 156 | ### 6.10 ยอด Payout Batch รวม (อ้างอิงไฟล์ 17) |
| 164 | ### 6.11 AR คงค้าง (อ้างอิงไฟล์ 19 §6.4) |
| 170 | ### 6.12 กำไรขั้นต้น (Gross Profit) — ไฟล์ 21 (Actual เท่านั้น ไม่ใช่ projection) |
| 180 | ### 6.13 เงินทดรองจ่าย — ยอดคืน (อ้างอิงไฟล์ 15) |
| 189 | ## 7. Data Entities / Required Objects |
| 193 | ## 8-16. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 199 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 208 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/23-finance-state-machines.md` (15 KB, 218 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 23-finance-state-machines.md |
| 3 | # 23 — Finance State Machines (สถานะรวมทุก Entity) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 23 | ## 1. Summary |
| 27 | ## 2. Purpose |
| 31 | ## 3-5. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 35 | ## 6. State Machines ทั้งหมด |
| 37 | ### 6.1 Finance Company (ไฟล์ 10) |
| 43 | ### 6.2 Payee Profile (ไฟล์ 18) |
| 52 | ### 6.3 Expense / Claim (ไฟล์ 15, 41 §6.6 — entity เดียวกัน enum เดียวกัน) — แก้ไขแล้ว |
| 64 | ### 6.4 Advance — เงินทดรองจ่าย (ไฟล์ 15) — แก้ไขแล้ว (5 สถานะ) |
| 75 | ### 6.5 Compensation Approval — Multi-step (ไฟล์ 16, ผูกกับ §6.3 ด้านบน) |
| 82 | ### 6.6 Payout Batch (ไฟล์ 17) — เติม `draft` แล้ว |
| 90 | ### 6.7 Revenue (ไฟล์ 19) |
| 98 | ### 6.8 Billing Batch (ไฟล์ 19) |
| 105 | ### 6.9 Adjustment (ไฟล์ 20) |
| 112 | ### 6.10 Tax Invoice (ไฟล์ 31) — แก้ไขแล้ว ✅ |
| 120 | ### 6.11 WHT Filing Period Summary (ไฟล์ 33) |
| 128 | ### 6.12 Exception (ไฟล์ 34) — แก้ไขแล้ว ✅ |
| 137 | ### 6.13 Accounting Period — Period Lock Policy (ไฟล์ 13 §6.11, ไฟล์ 30) — **state แม่ท... |
| 149 | ### 6.14 Bank Transaction (ไฟล์ 35) — แก้ไขแล้ว ✅ |
| 160 | ### 6.15 Accountant Question (ไฟล์ 36) — ตรวจสอบแล้ว ✅ |
| 168 | ### 6.16 Export Record (ไฟล์ 37) — แก้ไขแล้ว ✅ |
| 180 | ## 7. ความสัมพันธ์ระหว่าง State Machines (Cross-Entity Flow) |
| 198 | ## 8-16. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 204 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 211 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/31-accounting-sales-and-receipts.md` (19 KB, 200 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 31-accounting-sales-and-receipts.md |
| 3 | # 31 — Accounting: Sales and Receipts (บัญชีขายและเงินรับ) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 24 | ## 1. Summary |
| 28 | ## 2. Purpose |
| 32 | ## 3. In Scope |
| 39 | ## 4. Out of Scope |
| 45 | ## 5. Actors & Responsibilities |
| 52 | ## 6. Core Concepts |
| 54 | ### 6.1 Sales Record (รายการขาย — มุมมองบัญชี) |
| 58 | ### 6.2 Tax Invoice (ใบกำกับภาษี) 🔶 มีข้อกำหนดทางกฎหมายเข้มงวด — ต้องให้นักบัญชียืนยันก... |
| 66 | ### 6.3 Cash Receipt (เงินรับจริง) |
| 70 | ### 6.4 Receipt (ใบเสร็จรับเงิน) |
| 74 | ## 7. Data Entities / Required Objects |
| 76 | ### 7.1 Sales Record |
| 86 | ### 7.2 Tax Invoice (แก้ไข status แล้ว — ดู Changelog v2) |
| 102 | ### 7.3 Cash Receipt |
| 113 | ## 8. UI / UX Rules |
| 120 | ## 9. Workflow / Lifecycle |
| 122 | ### 9.1 Tax Invoice (แก้ไขแล้ว) |
| 128 | ### 9.2 Cash Receipt |
| 132 | ## 10. Security / Control Rules |
| 138 | ## 11. Validation & Error Handling |
| 146 | ## 12. Permission Requirements |
| 153 | ## 13. Audit Log Requirements |
| 158 | ## 14. API / Integration Draft |
| 167 | ## 15. Acceptance Criteria |
| 173 | ## 16. Test Cases |
| 185 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 192 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/33-accounting-wht-data.md` (17 KB, 173 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 33-accounting-wht-data.md |
| 3 | # 33 — Accounting: WHT Data (ข้อมูลหัก ณ ที่จ่ายและหนังสือรับรอง) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 25 | ## 1. Summary |
| 29 | ## 2. Purpose |
| 33 | ## 3. In Scope |
| 39 | ## 4. Out of Scope |
| 44 | ## 5. Actors & Responsibilities |
| 50 | ## 6. Core Concepts |
| 52 | ### 6.1 WHT Summary (สรุปข้อมูลหัก ณ ที่จ่ายรอนำส่ง) |
| 59 | ### 6.2 กำหนดเวลานำส่งภาษี 🔶 มีโทษปรับจริงหากพลาด — ต้องเตือนให้ชัดเจน |
| 63 | ### 6.3 หนังสือรับรองการหักภาษี ณ ที่จ่าย (ใบ 50 ทวิ) |
| 67 | ## 7. Data Entities / Required Objects |
| 69 | ### 7.1 WHT Certificate (หนังสือรับรองหัก ณ ที่จ่าย) |
| 87 | ### 7.2 WHT Filing Period Summary |
| 97 | ## 8. UI / UX Rules |
| 104 | ## 9. Workflow / Lifecycle |
| 110 | ## 10. Security / Control Rules |
| 115 | ## 11. Validation & Error Handling |
| 122 | ## 12. Permission Requirements |
| 129 | ## 13. Audit Log Requirements |
| 133 | ## 14. API / Integration Draft |
| 142 | ## 15. Acceptance Criteria |
| 147 | ## 16. Test Cases |
| 158 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 166 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/34-accounting-document-checklist-exceptions.md` (17 KB, 180 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 34-accounting-document-checklist-exceptions.md |
| 3 | # 34 — Document Checklist & Exceptions (รายการตรวจสอบเอกสารและข้อยกเว้น) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 24 | ## 1. Summary |
| 28 | ## 2. Purpose |
| 32 | ## 3. In Scope |
| 37 | ## 4. Out of Scope |
| 42 | ## 5. Actors & Responsibilities |
| 49 | ## 6. Core Concepts |
| 51 | ### 6.1 Severity Levels |
| 59 | ### 6.2 Status: 3 สถานะ (แก้ไขแล้ว — ดู Changelog v2) |
| 69 | ### 6.3 Authorized Exception — ยุบเข้าเป็น field เดียวกับ Exception แล้ว (แก้ไขแล้ว) |
| 79 | ## 7. Data Entities / Required Objects |
| 81 | ### 7.1 Exception (รวม Authorized fields เข้ามาแล้ว — ดู Changelog v2) |
| 95 | ## 8. UI / UX Rules |
| 104 | ## 9. Workflow / Lifecycle |
| 110 | ## 10. Security / Control Rules |
| 116 | ## 11. Validation & Error Handling |
| 123 | ## 12. Permission Requirements |
| 131 | ## 13. Audit Log Requirements |
| 136 | ## 14. API / Integration Draft |
| 146 | ## 15. Acceptance Criteria |
| 153 | ## 16. Test Cases |
| 165 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 173 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/35-bank-reconciliation.md` (15 KB, 167 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 35-bank-reconciliation.md |
| 3 | # 35 — Bank Reconciliation (กระทบยอดธนาคาร) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 23 | ## 1. Summary |
| 27 | ## 2. Purpose |
| 31 | ## 3. In Scope |
| 38 | ## 4. Out of Scope |
| 43 | ## 5. Actors & Responsibilities |
| 49 | ## 6. Core Concepts |
| 51 | ### 6.1 Bank Transaction (รายการจาก Statement) |
| 55 | ### 6.2 Auto-matching Logic |
| 64 | ### 6.3 Manual Matching |
| 68 | ### 6.4 Unmatched Resolved (เพิ่มใหม่ — ดู Changelog v2) |
| 72 | ## 7. Data Entities / Required Objects |
| 74 | ### 7.1 Bank Transaction (แก้ไข matching structure แล้ว — ดู Changelog v2) |
| 89 | ## 8. UI / UX Rules |
| 97 | ## 9. Workflow / Lifecycle |
| 101 | ## 10. Security / Control Rules |
| 107 | ## 11. Validation & Error Handling |
| 114 | ## 12. Permission Requirements |
| 121 | ## 13. Audit Log Requirements |
| 126 | ## 14. API / Integration Draft |
| 135 | ## 15. Acceptance Criteria |
| 142 | ## 16. Test Cases |
| 153 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 160 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/38-case-submission.md` (86 KB, 469 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 38-case-submission.md |
| 3 | # 38 — Case Submission (รับเคส) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 24 | ## 1. Summary |
| 28 | ## 2. Purpose |
| 32 | ## 3. Scope |
| 34 | ### 3.1 In Scope |
| 42 | ### 3.2 Out of Scope (ยกไป Sprint ถัดไป / เอกสารอื่น) |
| 49 | ## 4. Actors & Responsibilities |
| 62 | ## 5. Menu & Navigation |
| 68 | ## 6. Data Requirements |
| 70 | ### 6.1 Required Fields — ข้อมูลลูกหนี้/คู่สัญญา |
| 92 | ### 6.1.1 Identity Document — Conditional ตามสัญชาติ |
| 100 | ### 6.1.2 Address Structure (ใช้ร่วมกันทั้ง 3 ที่อยู่) |
| 114 | ### 6.1.3 Contact Persons (ผู้ติดต่ออื่น) — Repeatable |
| 121 | ### 6.2 Required Fields — ข้อมูลทรัพย์/สินค้า |
| 130 | ### 6.3 Document Checklist (เอกสารแนบ) |
| 145 | ### 6.3.1 Product Photo (รูปสินค้า) — แยกเป็น Section ของตัวเอง |
| 155 | ### 6.4 Derived / Computed Fields |
| 171 | ### 6.5 Projected Revenue Calculation (ประมาณการรายได้ก่อนรับเคส) |
| 187 | ### 6.6 Re-track / Recycle Flow (เคสไม่สำเร็จ — ไฟแนนซ์ขอให้ลองใหม่) |
| 198 | ## 7. UI Requirements |
| 200 | ### 7.1 Page Layout |
| 206 | ### 7.2 Table Behavior |
| 215 | ### 7.3 Form / Modal Behavior (Manual Entry) |
| 228 | ### 7.4 Team Suggestion UI |
| 238 | ### 7.5 Case Detail / Review Modal (Consolidated) |
| 258 | ## 8. Actions & Buttons |
| 275 | ## 9. Workflow |
| 291 | ## 10. Status / State Machine |
| 306 | ## 11. Business Rules |
| 317 | ## 12. Validation & Error Handling |
| 333 | ## 13. Permissions |
| 346 | ## 14. Audit Log |
| 357 | ## 15. Notifications |
| 363 | ## 16. Integration Points |
| 371 | ## 17. API / Event Contract Draft |
| 373 | ### 17.1 API Endpoints |
| 385 | ### 17.2 Events |
| 395 | ## 18. Export / Document Requirements |
| 399 | ## 19. Acceptance Criteria |
| 408 | ## 20. Test Cases |
| 442 | ## 21. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 454 | ## 22. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/40-case-assignment-routing.md` (78 KB, 357 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 40-case-assignment-routing.md |
| 3 | # 40 — Case Assignment & Routing (มอบหมายและวางแผนงาน) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 24 | ## 1. Summary |
| 27 | ## 2. Purpose |
| 30 | ## 3. Scope |
| 32 | ### 3.1 In Scope |
| 39 | ### 3.2 Out of Scope (ส่งต่อเอกสารอื่น/Sprint ถัดไป) |
| 46 | ## 4. Actors & Responsibilities |
| 58 | ## 5. Menu & Navigation |
| 63 | ## 6. Data Requirements |
| 65 | ### 6.1 Required Fields |
| 79 | ### 6.1.1 Pending Reassignment Object |
| 91 | ### 6.2 Agent Decision-Support Fields (แสดงเฉพาะหน้ามอบหมาย ไม่ผูกกับ case) |
| 99 | ### 6.3 Derived / Computed Fields |
| 103 | ### 6.4 Settings Config — Supervisor Action Permission |
| 114 | ## 7. UI Requirements |
| 116 | ### 7.1 Page Layout |
| 122 | ### 7.2 Table Behavior |
| 135 | ### 7.3 Assignment Modal (Manager) — Consolidated: Case Detail + Agent Picker |
| 154 | ### 7.4 Agent Accept UI |
| 159 | ### 7.5 Kanban Board — ภาพรวม Workload ของทีม |
| 167 | ## 8. Actions & Buttons |
| 176 | ## 9. Workflow |
| 198 | ## 10. Status / State Machine |
| 208 | ## 11. Business Rules |
| 224 | ## 12. Validation & Error Handling |
| 235 | ## 13. Permissions |
| 252 | ## 14. Audit Log |
| 260 | ## 15. Notifications |
| 267 | ## 16. Integration Points |
| 273 | ## 17. API / Event Contract Draft |
| 275 | ### 17.1 API Endpoints |
| 287 | ### 17.2 Events |
| 296 | ## 18. Export / Document Requirements |
| 299 | ## 19. Acceptance Criteria |
| 309 | ## 20. Test Cases |
| 336 | ## 21. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 348 | ## 22. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/41-field-tracker-mobile.md` (115 KB, 548 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 41-field-tracker-mobile.md |
| 3 | # 41 — Field Tracker Mobile (ติดตามภาคสนาม) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 12 | ## Changelog |
| 27 | ## 1. Summary |
| 30 | ## 2. Purpose |
| 33 | ## 3. Scope |
| 35 | ### 3.1 In Scope |
| 44 | ### 3.2 Out of Scope (ยกไปเฟส/เอกสารอื่น) |
| 51 | ## 4. Actors & Responsibilities |
| 62 | ## 5. Menu & Navigation |
| 64 | ### 5.1 Mobile — Bottom Nav (4 รายการ) + Top Bar |
| 73 | ### 5.2 Desktop — Sidebar ถาวร (Fixed) |
| 80 | ## 6. Data Requirements |
| 82 | ### 6.1 Case Assignment Status (รับช่วงจากไฟล์ 40) |
| 95 | ### 6.2 Address Structure (3 ที่อยู่ — รับมาจากไฟล์ 38 §6.1.2) |
| 105 | ### 6.3 Contact Methods (คลิกเพื่อติดต่อได้จริง) |
| 113 | ### 6.4 Evidence (หลักฐานการปิดงาน) |
| 125 | ### 6.4.1 Travel Origin (จุดเริ่มเดินทาง — สำหรับคำนวณค่าน้ำมัน PER_KM) |
| 138 | ### 6.4.2 Distance Calculation (คำนวณระยะทางสำหรับค่าน้ำมัน PER_KM) |
| 145 | ### 6.5 Close-Case Draft (บันทึกฟอร์มปิดงานแบบไม่ครบ) |
| 155 | ### 6.6 Expense (ค่าใช้จ่าย) |
| 184 | ### 6.7 Pending Reassignment (รับมาจากไฟล์ 40) |
| 194 | ### 6.8 Derived / Computed Fields |
| 199 | ## 7. UI Requirements |
| 201 | ### 7.1 Dashboard (หน้าแรก) |
| 211 | ### 7.2 แท็บ "รอรับงาน" |
| 217 | ### 7.3 แท็บ "รับงานแล้ว" (จัดวันที่) |
| 223 | ### 7.4 Calendar Picker (เลือกวันที่ติดตาม) |
| 233 | ### 7.5 แท็บ "กำลังติดตาม" |
| 244 | ### 7.6 ฟอร์มปิดงาน (Close Case) |
| 264 | ### 7.7 Case Detail (รายละเอียดเคสแบบเต็ม) |
| 277 | ### 7.8 Pending Reassignment Flow (ตอบรับ/ปฏิเสธคำขอเปลี่ยนผู้รับผิดชอบ) |
| 286 | ### 7.9 เบิกค่าใช้จ่าย |
| 292 | ### 7.10 สรุปรายได้ |
| 298 | ### 7.11 แท็บ "จบงาน" |
| 303 | ## 8. Actions & Buttons |
| 322 | ## 9. Workflow |
| 348 | ## 10. Status / State Machine |
| 362 | ### 10.1 QC Outcome — สรุปกฎการตีกลับ (ปิด Open Item #9) |
| 373 | ## 11. Business Rules |
| 384 | ## 12. Validation & Error Handling |
| 399 | ## 13. Permissions |
| 408 | ## 14. Audit Log |
| 416 | ## 15. Notifications |
| 428 | ## 16. Integration Points |
| 435 | ## 17. API / Event Contract Draft |
| 437 | ### 17.1 API Endpoints |
| 455 | ### 17.2 Events |
| 470 | ## 18. Export / Document Requirements |
| 473 | ## 19. Acceptance Criteria |
| 480 | ## 20. Test Cases |
| 519 | ## 21. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 534 | ## 22. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/44-asset-custody-handover.md` (37 KB, 641 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 44-asset-custody-handover.md |
| 3 | # 44 — Asset Custody & Handover (คลังสินค้าและการส่งมอบทรัพย์คืน) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 24 | ## 1. Summary |
| 27 | ## 2. Purpose |
| 33 | ## 3. In Scope |
| 41 | ## 4. Out of Scope |
| 49 | ## 5. Actors & Responsibilities |
| 62 | ## 6. Core Concepts |
| 64 | ### 6.1 Asset (ทรัพย์ที่ยึดคืน) |
| 69 | ### 6.2 HandoverLot (ล็อตส่งมอบ) |
| 78 | ### 6.3 รูปแบบการส่งมอบ (HandoverType) |
| 87 | ### 6.4 เอกสาร |
| 93 | ### 6.5 IMEI Validation |
| 100 | ## 7. Data Entities / Required Objects |
| 102 | ### 7.1 Asset |
| 136 | ### 7.2 HandoverLot |
| 170 | ## 8. UI / UX Rules (อ้างอิง warehouse.html) |
| 172 | ### 8.1 โครงสร้างหน้า |
| 183 | ### 8.2 แท็บ "รับเข้าคลัง" |
| 226 | ### 8.3 แท็บ "ในคลัง" |
| 265 | ### 8.4 แท็บ "รอส่งมอบ" |
| 290 | ### 8.5 แท็บ "ส่งมอบแล้ว" |
| 309 | ## 9. Workflow / State Machines |
| 311 | ### 9.1 Asset Status Flow |
| 333 | ### 9.2 HandoverLot Status Flow |
| 360 | ### 9.3 สรุป Draft / Confirmed ใน UI |
| 370 | ## 10. Security / Control Rules |
| 387 | ## 11. ผลกระทบต่อ Module อื่นเมื่อ Lot.status = confirmed |
| 425 | ## 12. Validation & Error Handling |
| 444 | ## 13. Permission Requirements |
| 458 | ## 14. Audit Log Requirements |
| 475 | ## 15. API Endpoints |
| 477 | ### Assets |
| 517 | ### HandoverLots |
| 587 | ## 16. Acceptance Criteria |
| 603 | ## 17. Test Cases |
| 625 | ## 18. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 636 | ## 19. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/45-case-warehouse-api-contracts.md` (15 KB, 151 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 45-case-warehouse-api-contracts.md |
| 3 | # 45 — Case & Warehouse API Contracts (รวม API Endpoint ทั้งระบบ) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 24 | ## 1. Summary |
| 28 | ## 2. Purpose |
| 32 | ## 3-5. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 36 | ## 6. API Endpoints รวมทั้งหมด (จัดกลุ่มตาม Resource) |
| 38 | ### 6.1 Case Submission (ไฟล์ 38) |
| 50 | ### 6.2 Case Assignment & Routing (ไฟล์ 40) |
| 63 | ### 6.3 Field Tracker — Mobile/Desktop (ไฟล์ 41) |
| 82 | ### 6.4 Warehouse — Assets (ไฟล์ 44) |
| 91 | ### 6.5 Warehouse — Handover Lots (ไฟล์ 44) |
| 102 | ## 7. Events รวม (สรุปย่อ — รายละเอียดเต็มดูไฟล์ต้นทาง §17.2/§16) |
| 122 | ## 8. REST Convention ที่ใช้สม่ำเสมอทั้งระบบ |
| 132 | ## 9-16. (ไม่ใช้กับไฟล์ประเภทนี้) |
| 138 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 144 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/90-platform-audit-notification-reporting.md` (21 KB, 234 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 90-platform-audit-notification-reporting.md |
| 3 | # 90 — Platform Audit, Notification & Reporting |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 27 | ## 1. Summary |
| 31 | ## 2. Purpose |
| 35 | ## 3. In Scope |
| 41 | ## 4. Out of Scope |
| 46 | ## 5. Actors & Responsibilities |
| 61 | ## 6. Core Concepts |
| 69 | ### 6.1 Event Flow (Audit → Notification) |
| 88 | ### 6.2 PDPA / Privacy Scope (Draft — 03/07/2569) |
| 116 | ### 6.3 Notification Channel & Event Trigger (Decided — 03/07/2569) |
| 138 | ## 7. Data Entities / Required Objects |
| 148 | ## 8. UI / UX Rules |
| 154 | ## 9. Workflow / Lifecycle |
| 158 | ## 10. Security / Control Rules |
| 164 | ## 11. Validation & Error Handling |
| 173 | ## 12. Permission Requirements |
| 180 | ## 13. Audit Log Requirements |
| 187 | ## 14. API / Integration Draft |
| 198 | ## 15. Acceptance Criteria |
| 205 | ## 16. Test Cases |
| 216 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 225 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/91-platform-api-integration-jobs.md` (15 KB, 202 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 91-platform-api-integration-jobs.md |
| 3 | # 91 — Platform API Integration & Background Jobs |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 26 | ## 1. Summary |
| 30 | ## 2. Purpose |
| 34 | ## 3. In Scope |
| 40 | ## 4. Out of Scope |
| 45 | ## 5. Actors & Responsibilities |
| 60 | ## 6. Core Concepts |
| 68 | ### 6.1 Job Type ที่ระบบรู้จัก (จาก `02-database-schema-design.md` §10) |
| 80 | ### 6.2 Job Lifecycle (State Diagram) |
| 96 | ## 7. Data Entities / Required Objects |
| 104 | ## 8. UI / UX Rules |
| 111 | ## 9. Workflow / Lifecycle |
| 115 | ## 10. Security / Control Rules |
| 121 | ## 11. Validation & Error Handling |
| 131 | ## 12. Permission Requirements |
| 138 | ## 13. Audit Log Requirements |
| 145 | ## 14. API / Integration Draft |
| 156 | ### 14.1 Dev Trigger Endpoint (`/api/dev/trigger-job`) |
| 166 | ## 15. Acceptance Criteria |
| 173 | ## 16. Test Cases |
| 185 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 193 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/93-roadmap-open-items.md` (23 KB, 239 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 93-roadmap-open-items.md |
| 3 | # 93 — Roadmap & Open Items (Consolidated Index) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 27 | ## 1. Summary |
| 31 | ## 2. Purpose |
| 35 | ## 3. In Scope |
| 41 | ## 4. Out of Scope |
| 46 | ## 5. Actors & Responsibilities |
| 61 | ## 6. Core Concepts |
| 69 | ## 7. Data Entities / Required Objects |
| 77 | ### 7.1 Consolidated Open Items Index (รวมทุกไฟล์ — อัปเดต 03/07/2569) |
| 162 | ## 8. UI / UX Rules |
| 168 | ## 9. Workflow / Lifecycle |
| 172 | ## 10. Security / Control Rules |
| 178 | ## 11. Validation & Error Handling |
| 187 | ## 12. Permission Requirements |
| 194 | ## 13. Audit Log Requirements |
| 201 | ## 14. API / Integration Draft |
| 210 | ## 15. Acceptance Criteria |
| 217 | ## 16. Test Cases |
| 227 | ## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 232 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/94-decision-log.md` (21 KB, 242 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 94-decision-log.md |
| 3 | # 94 — Decision Log |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 28 | ## 1. Summary |
| 32 | ## 2. Purpose |
| 36 | ## 3. In Scope |
| 42 | ## 4. Out of Scope |
| 47 | ## 5. Actors & Responsibilities |
| 62 | ## 6. Core Concepts |
| 70 | ## 7. Data Entities / Required Objects |
| 77 | ## 8. UI / UX Rules |
| 83 | ## 9. Workflow / Lifecycle |
| 87 | ## 10. Security / Control Rules |
| 92 | ## 11. Validation & Error Handling |
| 101 | ## 12. Permission Requirements |
| 109 | ## 13. Audit Log Requirements |
| 116 | ## 14. API / Integration Draft |
| 124 | ## 15. Acceptance Criteria |
| 131 | ## 16. Test Cases |
| 142 | ## 17. Decision Records (Source of Truth ทุก DEC ของโปรเจกต์) |
| 144 | ### DEC-001 — Tech Stack (02/07/2569) |
| 154 | ### DEC-002 — Permission Architecture (02/07/2569) |
| 164 | ### DEC-003 — File Storage (02/07/2569) |
| 174 | ### DEC-004 — Polymorphic Relation Pattern (02/07/2569) |
| 184 | ### DEC-005 — UI Datetime Calendar Standard (03/07/2569) |
| 194 | ### DEC-006 — Batch 6 Consistency Sync: คำตอบ D1–D10 ครบชุด (04/07/2569) |
| 204 | ### DEC-007 — Mockup Audit: ผลตรวจ HTML Mockup ทั้งชุด (04/07/2569) |
| 214 | ### DEC-008 — Service Fee Template แสดงผลแบบการ์ด (05/07/2569) |
| 224 | ### DEC-009 — Functional Permission Matrix ใช้ระดับสิทธิ์ 3 ระดับ (05/07/2569) |
| 234 | ## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/95-diagrams.md` (20 KB, 460 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 95-diagrams.md |
| 3 | # 95 — Diagrams (System Architecture / ER / Use Case / Workflow) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 10 | ## Changelog |
| 23 | ## 1. System Architecture Diagram |
| 109 | ## 2. ER Diagram (Entity Relationship) |
| 199 | ## 3. Use Case Diagram |
| 203 | ### 3.1 งานติดตามทรัพย์ (Case Workflow) |
| 239 | ### 3.2 คลังสินค้า (Warehouse) |
| 265 | ### 3.3 การเงิน (Finance) |
| 301 | ### 3.4 บัญชี (Accounting) |
| 337 | ### 3.5 ตั้งค่า (Settings) |
| 369 | ## 4. Main Workflow Diagram (Business Flow ภาพรวม) |
| 444 | ## 5. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 451 | ## 6. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/96-reports.md` (23 KB, 436 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 96-reports.md |
| 3 | # 96 — Reports (รายงานภาพรวมระบบ) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 26 | ## 1. Summary |
| 30 | ## 2. Purpose |
| 33 | ## 3. In Scope |
| 39 | ## 4. Out of Scope |
| 44 | ## 5. Actors & Responsibilities |
| 55 | ## 6. รายงานทั้งหมด |
| 57 | ### หมวด F — รายงานการเงิน |
| 147 | ### หมวด O — รายงานงานติดตามทรัพย์ |
| 226 | ### หมวด A — รายงานบัญชี |
| 275 | ### หมวด E — Executive Dashboard |
| 309 | ## 7. Data Sources (ดึงข้อมูลจากไหน) |
| 331 | ## 8. Caching Strategy |
| 342 | ## 9. API Endpoints |
| 369 | ## 10. Permission Matrix |
| 380 | ## 11. UI / UX Rules |
| 391 | ## 12. Validation & Error Handling |
| 402 | ## 13. Acceptance Criteria |
| 414 | ## 14. Test Cases |
| 428 | ## 15. การตัดสินใจที่เกี่ยวข้อง (Decisions) |
| 435 | ## 16. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/97-client-portal.md` (36 KB, 275 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # 97-client-portal.md |
| 3 | # 97 — Client Portal (พอร์ทัลบริษัทไฟแนนซ์) |
| 4 | ## AssetRecovery — Asset Recovery Operations Platform |
| 11 | ## Changelog |
| 26 | ## 1. Summary |
| 29 | ## 2. Purpose |
| 32 | ## 3. Scope |
| 34 | ### 3.1 In Scope |
| 43 | ### 3.2 Out of Scope (ยืนยันถาวร — ไม่ใช่ Open Item) |
| 49 | ### 3.3 รอการตัดสินใจ (ดู §22) |
| 55 | ## 4. Actors & Responsibilities |
| 64 | ## 5. Menu & Navigation |
| 83 | ## 6. Data Requirements |
| 85 | ### 6.1 เคสของเรา (จากไฟล์ 38) |
| 99 | ### 6.2 รอบวางบิล / AR (จากไฟล์ 19) |
| 104 | ### 6.3 ใบกำกับภาษี (จากไฟล์ 31) |
| 107 | ### 6.4 ใบส่งมอบทรัพย์ (จากไฟล์ 44) |
| 112 | ### 6.5 รายงานสรุป |
| 116 | ### 6.6 ข้อมูลบริษัท (read-only) |
| 119 | ## 7. UI Requirements |
| 126 | ## 8. Actions & Buttons |
| 139 | ## 9. Workflow |
| 147 | ## 10. Status / State Machine |
| 149 | ### 10.1 Case Status Mapping (ใหม่ — เฉพาะพอร์ทัลนี้ ไม่ใช่ state machine ใหม่ แค่ labe... |
| 162 | ### 10.2 HandoverLot Status Mapping |
| 169 | ### 10.3 Tax Invoice / Billing Batch |
| 172 | ## 11. Business Rules |
| 181 | ## 12. Validation & Error Handling |
| 190 | ## 13. Permissions |
| 200 | ## 14. Audit Log |
| 206 | ## 15. Notifications |
| 209 | ## 16. Integration Points |
| 212 | ## 17. API / Event Contract Draft |
| 230 | ## 18. Export / Document Requirements |
| 235 | ## 19. Acceptance Criteria |
| 242 | ## 20. Test Cases |
| 253 | ## 21. การตัดสินใจที่เกี่ยวข้อง (Decisions — ยืนยันในรอบสนทนานี้ 03/07/2569) |
| 264 | ## 22. สิ่งที่ยังต้องตัดสินใจ (Open Items) |

### `docs/DECISIONS-NEEDED-BATCH6.md` (19 KB, 263 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # DECISIONS-NEEDED-BATCH6.md |
| 2 | ## Batch 6 — Consistency Sync: รายการที่ต้องให้ Product Owner ตัดสินใจ |
| 11 | ## 🔴 D1 — ตาราง Settings ที่ขาดจาก schema (บล็อก Phase 1.3) |
| 126 | ## 🔴 D2 — `bank_accounts` ไม่ตรงไฟล์ 13 §6.3 |
| 145 | ## 🟡 D3 — ตาราง `notifications` (เฟส 1 ใช้ Push/In-app แต่ไม่มีที่เก็บ) |
| 170 | ## 🟡 D4 — WHT Certificate: กลไกยกเลิก/ออกใหม่ (ไฟล์ 33 §10) |
| 194 | ## 🟡 D5 — `expenses`: เก็บ approval หลายขั้นตาม Approval Matrix |
| 211 | ## 🟡 D6 — Revenue edge case: เคส `closed_success` ที่ไม่มี expense เลย |
| 221 | ## 🟡 D7 — DB constraints เสริมกฎเงิน (เลือกได้เป็นรายข้อ) |
| 243 | ## 🔵 D8 — ยืนยันจำนวน Seed Role = **15** (แก้เอกสารแล้ว) |
| 247 | ## 🔵 D9 — ยืนยันชื่อ endpoint ใหม่ 2 ตัว (เติมแล้วใน 41/45) |
| 251 | ## 🟢 D10 — รูปแบบข้อมูลใน Export Pack template (ไม่บล็อก build) |
| 258 | ## สรุปตัวเลือกที่แนะนำ (ถ้าต้องการตอบสั้น) |

### `docs/README.md` (18 KB, 259 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # AssetRecovery — Build Specification Index |
| 8 | ## แหล่งอ้างอิงหลัก |
| 23 | ## Tech Stack (ตัดสินใจแล้วทั้งหมด — ห้ามเปลี่ยนโดยไม่มี Decision Log) |
| 43 | ## ภาพรวมระบบ |
| 47 | ### Hybrid Accounting Boundary |
| 62 | ## Modules & HTML Mockups |
| 78 | ## File Index |
| 80 | ### 🏗️ Foundation & Platform |
| 98 | ### ⚙️ Settings Module (ไฟล์ 07–13) |
| 110 | ### 💰 Finance Module (ไฟล์ 14–21) |
| 123 | ### 💰 Finance Reference (ไฟล์ 22–29) |
| 136 | ### 📋 Accounting Module (ไฟล์ 30–37) |
| 149 | ### 📦 Case & Field Operations (ไฟล์ 38–44) |
| 161 | ### 📊 Reports (ไฟล์ 96) |
| 167 | ### 🌐 Client Portal (ไฟล์ 97) |
| 175 | ### 📋 Decision & Planning Documents |
| 184 | ## Datetime Standard (บังคับทุก module) |
| 205 | ## Database Conventions |
| 219 | ## Key Business Rules (สรุปจุดสำคัญ) |
| 241 | ## Open Items — รอยืนยันจากภายนอก |
| 243 | ### 🟡 รอนักบัญชี (ดู `QUESTIONS-FOR-ACCOUNTANT.md`) — มีเมนูตั้งค่ารองรับแล้ว ไม่บล็อก ... |
| 249 | ### 🟡 รอ Product Owner (ดู `DECISIONS-NEEDED.md`) |
| 254 | ### 🟢 เฟส 2 (ออกแบบแล้ว ยังไม่ implement) |

### `docs/implementation-todo.md` (16 KB, 184 บรรทัด)

| บรรทัด | หัวข้อ |
|---|---|
| 1 | # implementation-todo.md |
| 3 | # 99 — Implementation Todo List (ทีละขั้นตอน) |
| 4 | ## AssetRecovery — ลำดับงานตั้งแต่ตั้งค่า Infra จนถึงเริ่มโมดูลแรก |
| 12 | ## Phase 0 — Infrastructure Setup (ก่อนมีโค้ดบรรทัดแรก) |
| 14 | ### 0.1 GitHub Repository |
| 22 | ### 0.2 Next.js Project Bootstrap |
| 37 | ### 0.3 Environment Variables แยก Staging/Production |
| 43 | ### 0.4 Domain Mapping |
| 48 | ### 0.5 CI Pipeline พื้นฐาน (GitHub Actions) |
| 52 | ### 0.6 Verify Pipeline ทำงานจริง |
| 61 | ## Phase 1 — Foundation Modules (ตามลำดับ dependency) |
| 65 | ### 1.0 Database Seeding (Master Data) — ทำก่อน Auth เสมอ |
| 76 | ### 1.1 Auth & Access Control (ไฟล์ 05) |
| 83 | ### 1.2 Roles & Permissions Matrix (ไฟล์ 07) |
| 89 | ### 1.3 Settings / Master Data (ไฟล์ 08–13) — ทำทีละไฟล์ย่อยตามลำดับ |
| 103 | ## Phase 2 — Case & Field Operations (ไฟล์ 38, 40, 41, 44) |
| 113 | ## Phase 3 — Finance Module (ไฟล์ 14–21) |
| 128 | ## Phase 4 — Accounting Module (ไฟล์ 30–37) |
| 143 | ## Phase 5 — Platform Services (ไฟล์ 90–92) |
| 152 | ## Phase 6 — Reports (ไฟล์ 96) |
| 160 | ## Phase 7 — Client Portal (ไฟล์ 97) ✅ Phase ยืนยันแล้ว — เป็นส่วนหนึ่งของ Phase 1 (rel... |
| 173 | ## หมายเหตุการทำงานร่วมกันทุก Phase |


---

## ส่วนที่ 2 — UI Mockups (reference/)

> mockup เป็น UI source of truth (โครงหน้าจอ/Tailwind pattern/ข้อมูลตัวอย่าง) — **ห้ามอ้าง business logic จาก mockup** ให้ยึด spec `.md` เสมอ
> ตารางนี้ชี้บรรทัดของ JavaScript function หลักในแต่ละไฟล์ — ใช้ Grep หา render function ที่ต้องการก่อน แล้ว Read เฉพาะช่วง


### `reference/38-case-submission-mockup.html` (86 KB, 1062 บรรทัด)

| บรรทัด | function |
|---|---|
| 43 | `getDistricts` |
| 44 | `getSubDistricts` |
| 112 | `setState` |
| 113 | `openModal` |
| 114 | `closeModal` |
| 115 | `showToast` |
| 116 | `money` |
| 119 | `getCompanyByName` |
| 120 | `calcProjectedRevenue` |
| 131 | `feeModelLabel` |
| 136 | `getTeamByName` |
| 137 | `renderTeamCostBox` |
| 158 | `statusBadge` |
| 170 | `fieldStatusBadge` |
| 180 | `sourceBadge` |
| 185 | `btnAction` |
| 188 | `formInput` |
| 191 | `formSelect` |
| 196 | `renderAddressBlock` |
| 245 | `onProvinceChange` |
| 253 | `onDistrictChange` |
| 258 | `updateTeamSuggestion` |
| 267 | `onNationalityChange` |
| 281 | `renderPhotoUploader` |
| 297 | `renderPhotoThumbnails` |
| 304 | `handlePhotoFiles` |
| 316 | `handlePhotoDrop` |
| 317 | `handlePhotoSelect` |
| 318 | `removePhoto` |
| 319 | `refreshPhotoUI` |
| 340 | `renderTopNav` |
| 364 | `kpi` |
| 370 | `renderCaseList` |
| 460 | `canEditCase` |
| 464 | `docChip` |
| 466 | `have` |
| 474 | `renderCaseRow` |
| 504 | `renderCaseCard` |
| 535 | `renderCreateCaseModal` |
| 538 | `v` |
| 654 | `renderContactPersonRow` |
| 669 | `renderReviewModal` |
| 674 | `fileRow` |
| 789 | `viewFile` |
| 796 | `renderTeamSelectionSection` |
| 849 | `refreshTeamSection` |
| 855 | `toggleShowAllTeams` |
| 861 | `selectTeamChange` |
| 866 | `cancelTeamChange` |
| 872 | `confirmTeamChange` |
| 891 | `renderModal` |
| 968 | `renderToast` |
| 975 | `render` |
| 986 | `updateFilter` |

### `reference/40-case-assignment-mockup.html` (68 KB, 1064 บรรทัด)

| บรรทัด | function |
|---|---|
| 239 | `setState` |
| 240 | `showToast` |
| 245 | `money` |
| 248 | `getTeam` |
| 249 | `getAgent` |
| 250 | `getCase` |
| 251 | `currentUser` |
| 253 | `filteredCases` |
| 266 | `kpiCounts` |
| 276 | `myPendingAccept` |
| 280 | `myPendingConsent` |
| 310 | `statusBadge` |
| 323 | `teamBadge` |
| 330 | `agentName` |
| 336 | `assignedInfo` |
| 346 | `doAssign` |
| 360 | `doReassign` |
| 387 | `doAccept` |
| 395 | `doConsent` |
| 406 | `doDecline` |
| 416 | `renderNav` |
| 448 | `renderKPI` |
| 471 | `renderToolbar` |
| 499 | `renderCaseTable` |
| 576 | `renderKanban` |
| 677 | `renderAgentView` |
| 759 | `renderCaseDetailSection` |
| 838 | `renderAgentPicker` |
| 893 | `toggleAgentExpand` |
| 900 | `openModal` |
| 903 | `closeModal` |
| 905 | `renderModal` |
| 1019 | `renderToast` |
| 1030 | `render` |
| 1054 | `switchRole` |

### `reference/41-field-tracker-desktop-mockup.html` (131 KB, 1800 บรรทัด)

| บรรทัด | function |
|---|---|
| 110 | `toBKK` |
| 113 | `fmtDate` |
| 117 | `fmtDateTime` |
| 121 | `nowDate` |
| 122 | `nowDateTime` |
| 142 | `setState` |
| 143 | `showToast` |
| 148 | `money` |
| 149 | `openModal` |
| 187 | `closeModal` |
| 188 | `myCases` |
| 189 | `myPendingReassignments` |
| 190 | `myUnseenPendingReassignments` |
| 191 | `teammateName` |
| 226 | `statusBadge` |
| 239 | `expenseStatusBadge` |
| 253 | `renderSidebar` |
| 258 | `navItem` |
| 295 | `renderPageHeader` |
| 300 | `renderDashboard` |
| 431 | `renderPendingAcceptTab` |
| 458 | `renderUnscheduledTab` |
| 476 | `renderMyUnscheduledList` |
| 492 | `renderTeamUnscheduledList` |
| 518 | `renderScheduledTab` |
| 577 | `formatDateTH` |
| 585 | `formatDDMMYYYY` |
| 590 | `onDragStart` |
| 591 | `onDropReorder` |
| 608 | `renderClosedTab` |
| 617 | `monthLabel` |
| 665 | `renderEmptyState` |
| 675 | `renderCaseFullDetailBody` |
| 677 | `fileRow` |
| 682 | `addressBlock` |
| 774 | `renderCaseDetailModal` |
| 783 | `viewFile` |
| 789 | `acceptCase` |
| 798 | `renderPickDateModal` |
| 823 | `renderDayClickPopup` |
| 854 | `confirmScheduleFromPopup` |
| 860 | `renderCalendarGrid` |
| 905 | `changeCalendarMonth` |
| 914 | `scheduleCase` |
| 925 | `renderCloseCaseModal` |
| 961 | `renderTravelOriginSection` |
| 991 | `selectOutcome` |
| 997 | `renderEvidenceSection` |
| 1090 | `evidenceButton` |
| 1099 | `captureEvidence` |
| 1107 | `addCheckin` |
| 1122 | `removeCheckin` |
| 1130 | `setTravelOrigin` |
| 1143 | `adjustTravelOrigin` |
| 1159 | `haversineKm` |
| 1161 | `dLat` |
| 1162 | `dLng` |
| 1167 | `calculateTravelDistanceKm` |
| 1177 | `addMedia` |
| 1186 | `removeMedia` |
| 1193 | `saveDraftSilently` |
| 1200 | `saveDraftAndClose` |
| 1206 | `submitCloseCase` |
| 1260 | `resubmitCloseCase` |
| 1306 | `renderExpensePage` |
| 1338 | `renderCaseBoundExpenseTab` |
| 1403 | `renderSeparateExpenseTab` |
| 1410 | `monthLabel` |
| 1450 | `parseThaiDateToYearMonth2` |
| 1459 | `parseThaiDateToYearMonth` |
| 1466 | `renderIncomeSummaryPage` |
| 1480 | `monthLabel` |
| 1532 | `renderHotelClaimModal` |
| 1562 | `submitHotelClaim` |
| 1572 | `renderModal` |
| 1606 | `renderToast` |
| 1613 | `renderReassignmentAutoPopup` |
| 1642 | `dismissReassignmentPopup` |
| 1649 | `renderReassignmentResponseModal` |
| 1687 | `submitConsentReassignment` |
| 1704 | `submitDeclineReassignment` |
| 1720 | `checkAndAutoResolveReassignments` |
| 1744 | `parseThaiDateTimeToDate` |
| 1753 | `checkAndApplyQcActions` |
| 1772 | `render` |

### `reference/41-field-tracker-mobile-mockup.html` (136 KB, 1860 บรรทัด)

| บรรทัด | function |
|---|---|
| 110 | `toBKK` |
| 113 | `fmtDate` |
| 117 | `fmtDateTime` |
| 121 | `nowDate` |
| 122 | `nowDateTime` |
| 143 | `setState` |
| 144 | `showToast` |
| 149 | `money` |
| 150 | `openModal` |
| 188 | `closeModal` |
| 189 | `myCases` |
| 190 | `myPendingReassignments` |
| 191 | `myUnseenPendingReassignments` |
| 192 | `teammateName` |
| 227 | `statusBadge` |
| 240 | `expenseStatusBadge` |
| 254 | `renderTopBar` |
| 270 | `renderBottomNav` |
| 293 | `renderHamburgerMenu` |
| 299 | `menuItem` |
| 355 | `renderDashboard` |
| 495 | `renderPendingAcceptTab` |
| 519 | `renderUnscheduledTab` |
| 537 | `renderMyUnscheduledList` |
| 553 | `renderTeamUnscheduledList` |
| 579 | `renderScheduledTab` |
| 638 | `formatDateTH` |
| 646 | `formatDDMMYYYY` |
| 651 | `onDragStart` |
| 652 | `onDropReorder` |
| 669 | `renderClosedTab` |
| 678 | `monthLabel` |
| 721 | `renderEmptyState` |
| 731 | `renderCaseFullDetailBody` |
| 733 | `fileRow` |
| 738 | `addressBlock` |
| 830 | `renderCaseDetailModal` |
| 839 | `viewFile` |
| 845 | `acceptCase` |
| 854 | `renderPickDateModal` |
| 879 | `renderDayClickPopup` |
| 910 | `confirmScheduleFromPopup` |
| 916 | `renderCalendarGrid` |
| 961 | `changeCalendarMonth` |
| 970 | `scheduleCase` |
| 981 | `renderCloseCaseModal` |
| 1017 | `renderTravelOriginSection` |
| 1047 | `selectOutcome` |
| 1053 | `renderEvidenceSection` |
| 1146 | `evidenceButton` |
| 1155 | `captureEvidence` |
| 1163 | `addCheckin` |
| 1178 | `removeCheckin` |
| 1186 | `setTravelOrigin` |
| 1199 | `adjustTravelOrigin` |
| 1215 | `haversineKm` |
| 1217 | `dLat` |
| 1218 | `dLng` |
| 1223 | `calculateTravelDistanceKm` |
| 1233 | `addMedia` |
| 1242 | `removeMedia` |
| 1249 | `saveDraftSilently` |
| 1256 | `saveDraftAndClose` |
| 1262 | `submitCloseCase` |
| 1316 | `resubmitCloseCase` |
| 1362 | `renderExpenseModal` |
| 1394 | `renderCaseBoundExpenseTab` |
| 1459 | `renderSeparateExpenseTab` |
| 1466 | `monthLabel` |
| 1506 | `parseThaiDateToYearMonth2` |
| 1515 | `parseThaiDateToYearMonth` |
| 1522 | `renderIncomeSummaryModal` |
| 1537 | `monthLabel` |
| 1588 | `renderHotelClaimModal` |
| 1618 | `submitHotelClaim` |
| 1628 | `renderModal` |
| 1668 | `renderToast` |
| 1676 | `renderReassignmentAutoPopup` |
| 1706 | `dismissReassignmentPopup` |
| 1713 | `renderReassignmentResponseModal` |
| 1751 | `submitConsentReassignment` |
| 1768 | `submitDeclineReassignment` |
| 1784 | `checkAndAutoResolveReassignments` |
| 1808 | `parseThaiDateTimeToDate` |
| 1817 | `checkAndApplyQcActions` |
| 1835 | `render` |

### `reference/97-client-portal-mobile-mockup.html` (58 KB, 682 บรรทัด)

| บรรทัด | function |
|---|---|
| 39 | `toBKK` |
| 40 | `fmtDate` |
| 41 | `nowDate` |
| 42 | `money` |
| 108 | `setState` |
| 109 | `showToast` |
| 114 | `caseStatusInfo` |
| 125 | `billingStatusInfo` |
| 129 | `invoiceStatusInfo` |
| 130 | `lotStatusInfo` |
| 134 | `conditionInfo` |
| 139 | `findAssetByCaseRef` |
| 146 | `badge` |
| 172 | `renderHeader` |
| 189 | `renderHamburger` |
| 227 | `renderBottomNav` |
| 248 | `kpiSm` |
| 256 | `sectionHeader` |
| 269 | `renderDashboard` |
| 342 | `barChartSm` |
| 355 | `caseCard` |
| 367 | `renderCases` |
| 392 | `renderFinance` |
| 452 | `renderHandover` |
| 486 | `renderProfile` |
| 488 | `row` |
| 510 | `renderDrawer` |
| 602 | `renderAssetDetailDrawer` |
| 606 | `a` |
| 657 | `renderToastEl` |
| 665 | `render` |

### `reference/97-client-portal-mockup.html` (61 KB, 698 บรรทัด)

| บรรทัด | function |
|---|---|
| 35 | `toBKK` |
| 36 | `fmtDate` |
| 37 | `nowDate` |
| 38 | `money` |
| 110 | `S` |
| 111 | `showToast` |
| 116 | `caseStatusInfo` |
| 127 | `billingStatusInfo` |
| 136 | `invoiceStatusInfo` |
| 139 | `lotStatusInfo` |
| 148 | `conditionInfo` |
| 154 | `findAssetByCaseRef` |
| 161 | `badge` |
| 195 | `layout` |
| 237 | `kpi` |
| 245 | `pageHeader` |
| 249 | `sectionHeader` |
| 262 | `renderDashboard` |
| 352 | `renderCases` |
| 391 | `renderBilling` |
| 436 | `renderInvoices` |
| 463 | `renderHandover` |
| 499 | `barChart` |
| 513 | `renderProfile` |
| 515 | `row` |
| 536 | `renderModal` |
| 667 | `renderToast` |
| 675 | `render` |

### `reference/accounting.html` (127 KB, 1659 บรรทัด)

| บรรทัด | function |
|---|---|
| 31 | `toBKK` |
| 32 | `fmtDate` |
| 33 | `fmtDateTime` |
| 34 | `nowDate` |
| 35 | `nowDateTime` |
| 142 | `setState` |
| 143 | `openModal` |
| 144 | `closeModal` |
| 145 | `showToast` |
| 151 | `money` |
| 225 | `statusBadge` |
| 231 | `btnAction` |
| 237 | `formInput` |
| 240 | `formSelect` |
| 243 | `formTextarea` |
| 248 | `renderTopNav` |
| 278 | `renderAccountingOperations` |
| 817 | `renderModal` |
| 1582 | `renderToast` |
| 1597 | `render` |

### `reference/app-shell.html` (17 KB, 334 บรรทัด)

| บรรทัด | function |
|---|---|
| 155 | `getQueryParam` |
| 166 | `init` |
| 180 | `cfg` |
| 182 | `setMainTab` |
| 191 | `setCaseSubTab` |
| 197 | `toggleFieldView` |
| 202 | `currentIframeSrc` |
| 214 | `renderTopNav` |
| 252 | `renderCaseSubNav` |
| 278 | `renderDashboardPlaceholder` |
| 297 | `renderFrame` |
| 307 | `render` |
| 318 | `attachEvents` |

### `reference/case-management.html` (25 KB, 237 บรรทัด)

| บรรทัด | function |
|---|---|
| 70 | `render` |
| 163 | `openModal` |

### `reference/dashboard.html` (20 KB, 264 บรรทัด)

| บรรทัด | function |
|---|---|
| 161 | `render` |

### `reference/finance.html` (250 KB, 2504 บรรทัด)

| บรรทัด | function |
|---|---|
| 32 | `toBKK` |
| 33 | `fmtDate` |
| 34 | `fmtDateTime` |
| 35 | `nowDate` |
| 36 | `nowDateTime` |
| 39 | `fuelLabel` |
| 45 | `compPlanSummary` |
| 247 | `getRole` |
| 248 | `getUser` |
| 249 | `getCompany` |
| 250 | `getTeam` |
| 251 | `getCompTemplate` |
| 252 | `getServiceTemplate` |
| 253 | `groupLabel` |
| 254 | `groupColor` |
| 289 | `setState` |
| 290 | `updateFilter` |
| 291 | `resetFilters` |
| 292 | `showToast` |
| 293 | `openModal` |
| 294 | `closeModal` |
| 296 | `handleSfChange` |
| 304 | `money` |
| 305 | `statusBadge` |
| 359 | `btnAction` |
| 362 | `formInput` |
| 366 | `formSelect` |
| 384 | `renderTopNav` |
| 411 | `kpi` |
| 417 | `approvalStepBadge` |
| 424 | `renderFinanceOperations` |
| 967 | `renderAccountingOperations` |
| 1052 | `renderSettingsLayout` |
| 1137 | `renderRolesContent` |
| 1191 | `renderTeamsContent` |
| 1259 | `renderCompaniesContent` |
| 1308 | `renderUsersContent` |
| 1364 | `renderCompensationContent` |
| 1368 | `renderServiceFeeContent` |
| 1374 | `renderSystemSettingsContent` |
| 1378 | `renderAuditLogContent` |
| 1384 | `renderSettingsCycles` |
| 1388 | `renderSettingsApprovals` |
| 1392 | `renderSettingsBanks` |
| 1396 | `renderSettingsTax` |
| 1400 | `renderSettingsCost` |
| 1403 | `renderSettingsPayee` |
| 1407 | `renderSettingsDocs` |
| 1411 | `renderSettingsBankFile` |
| 1415 | `renderSettingsExport` |
| 1419 | `renderSettingsPermission` |
| 1470 | `renderSettingsLock` |
| 1484 | `renderModal` |
| 1950 | `baseAmt` |
| 2390 | `renderToast` |
| 2401 | `render` |

### `reference/login.html` (12 KB, 250 บรรทัด)

| บรรทัด | function |
|---|---|
| 59 | `render` |
| 65 | `renderLoginForm` |
| 147 | `renderSuccess` |
| 179 | `renderToast` |
| 186 | `attachEvents` |
| 201 | `handleSubmit` |
| 237 | `handleLogout` |

### `reference/notifications.html` (12 KB, 130 บรรทัด)

| บรรทัด | function |
|---|---|
| 46 | `unread` |
| 48 | `render` |

### `reference/reports.html` (62 KB, 950 บรรทัด)

| บรรทัด | function |
|---|---|
| 37 | `toBKK` |
| 38 | `fmtDate` |
| 39 | `nowDate` |
| 142 | `S` |
| 143 | `openModal` |
| 144 | `closeModal` |
| 145 | `toast` |
| 150 | `money` |
| 151 | `pct` |
| 152 | `trend` |
| 158 | `pill` |
| 170 | `kpiCard` |
| 181 | `barChart` |
| 199 | `lineChart` |
| 220 | `exportBtns` |
| 228 | `periodPicker` |
| 235 | `tbl` |
| 251 | `renderNav` |
| 271 | `renderMainTabs` |
| 300 | `renderF1` |
| 359 | `renderF2` |
| 392 | `renderF3` |
| 425 | `renderF4` |
| 454 | `renderF5` |
| 488 | `renderO1` |
| 491 | `avgRate` |
| 520 | `renderO2` |
| 547 | `renderO3` |
| 574 | `renderO4` |
| 605 | `renderO5` |
| 635 | `renderA1` |
| 669 | `renderA2` |
| 696 | `renderA3` |
| 721 | `renderA4` |
| 749 | `renderE1` |
| 780 | `renderE2` |
| 801 | `renderE3` |
| 829 | `renderModal` |
| 897 | `renderToast` |
| 917 | `render` |

### `reference/settings.html` (225 KB, 1918 บรรทัด)

| บรรทัด | function |
|---|---|
| 32 | `toBKK` |
| 33 | `fmtDate` |
| 34 | `fmtDateTime` |
| 35 | `nowDate` |
| 36 | `nowDateTime` |
| 280 | `getRole` |
| 281 | `getUser` |
| 282 | `getCompany` |
| 283 | `getTeam` |
| 284 | `getCompTemplate` |
| 285 | `getServiceTemplate` |
| 286 | `groupLabel` |
| 287 | `groupColor` |
| 317 | `setState` |
| 318 | `updateFilter` |
| 319 | `resetFilters` |
| 320 | `showToast` |
| 321 | `openModal` |
| 322 | `closeModal` |
| 324 | `handleSfChange` |
| 332 | `money` |
| 333 | `statusBadge` |
| 341 | `btnAction` |
| 344 | `formInput` |
| 348 | `formSelect` |
| 366 | `renderTopNav` |
| 392 | `kpi` |
| 398 | `renderFinanceOperations` |
| 497 | `renderAccountingOperations` |
| 582 | `renderSettingsLayout` |
| 675 | `renderRolesContent` |
| 735 | `renderTeamsContent` |
| 807 | `renderCompaniesContent` |
| 859 | `renderUsersContent` |
| 915 | `renderOrganizationContent` |
| 973 | `renderCompensationContent` |
| 993 | `renderServiceFeeContent` |
| 1032 | `renderSystemSettingsContent` |
| 1060 | `renderAuditLogContent` |
| 1067 | `renderSettingsCycles` |
| 1081 | `renderSettingsApprovals` |
| 1088 | `renderSettingsBanks` |
| 1095 | `renderSettingsTax` |
| 1103 | `renderSettingsVat` |
| 1109 | `now` |
| 1116 | `renderSettingsCost` |
| 1125 | `renderSettingsTaxDoc` |
| 1168 | `renderSettingsNumbering` |
| 1184 | `renderSettingsPayee` |
| 1188 | `renderSettingsDocs` |
| 1192 | `renderSettingsBankFile` |
| 1200 | `renderSettingsExport` |
| 1204 | `renderSettingsPermission` |
| 1214 | `levelChip` |
| 1266 | `renderSettingsLock` |
| 1280 | `renderModal` |
| 1740 | `lv` |
| 1779 | `renderToast` |
| 1790 | `render` |

### `reference/warehouse.html` (104 KB, 1316 บรรทัด)

| บรรทัด | function |
|---|---|
| 37 | `toBKK` |
| 42 | `fmtDate` |
| 51 | `fmtDateTime` |
| 62 | `nowDate` |
| 63 | `nowDateTime` |
| 151 | `S` |
| 152 | `openModal` |
| 153 | `closeModal` |
| 154 | `toast` |
| 163 | `pill` |
| 164 | `btn` |
| 165 | `getCompany` |
| 166 | `getAsset` |
| 167 | `getLot` |
| 168 | `custodyAssets` |
| 169 | `nextLotId` |
| 170 | `nextDocRef` |
| 171 | `matchSearch` |
| 189 | `filterInput` |
| 197 | `filterSelect` |
| 207 | `renderNav` |
| 232 | `renderSummary` |
| 233 | `cnt` |
| 234 | `lotCnt` |
| 252 | `renderTabs` |
| 269 | `renderIntakeTab` |
| 350 | `renderCustodyTab` |
| 485 | `renderPendingHandoverTab` |
| 595 | `renderDeliveredTab` |
| 716 | `renderModal` |
| 724 | `ah` |
| 1179 | `renderToast` |
| 1192 | `render` |


---

## สคริปต์ regenerate MAP

```bash
# รันที่ root ของ repo หลังแก้ไฟล์ spec/mockup ใดๆ
python3 .claude/hooks/generate-map.py > docs/00_MAP.md
```
