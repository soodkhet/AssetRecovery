# 45-case-warehouse-api-contracts.md

# 45 — Case & Warehouse API Contracts (รวม API Endpoint ทั้งระบบ)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v1 (สร้างใหม่ — ปิดช่องว่าง reference ที่ค้างมาจากไฟล์ `02`, `27`, `91`, `92`)
> Document Level: Case/Warehouse Reference — เอกสารอ้างอิงเชิงเทคนิค ไม่มีหน้าจอ UI ของตัวเอง
> เอกสารอ้างอิง: สรุปรวมจากไฟล์ `38-case-submission.md` §17, `40-case-assignment-routing.md` §17, `41-field-tracker-mobile.md` §17, `44-asset-custody-handover.md` §15, `27-finance-api-contracts.md` (ใช้ convention เดียวกัน)

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | 03/07/2569 | สร้างไฟล์ครั้งแรก — ไฟล์นี้ถูก reference ไว้ตั้งแต่ Batch ก่อนหน้าในไฟล์ `02` §เชิงอรรถ, `27` §Scope note, `91` §Scope note, `92` §14 แต่ไม่เคยถูกสร้างขึ้นจริง (ต่างจากไฟล์ 39/42/43 ที่เป็นการ merge โดยตั้งใจและมีบันทึกไว้ใน README) — ไฟล์นี้**ไม่ใช่เนื้อหาใหม่** เป็นการรวบรวม endpoint ที่มีอยู่แล้วครบถ้วนในไฟล์ต้นทาง 38/40/41/44 มาไว้ที่เดียว ไม่มีการเปลี่ยนแปลง business logic ใดๆ |
| v1.1 | 04/07/2569 | **Sync กับไฟล์ 41 v2.1**: §6.3 เติม `POST /api/field/cases/:id/resubmit-close` และ `POST /api/field/expenses/:id/resubmit` + §7 เติม event `case.close_resubmitted` / `expense.resubmitted` — ตาม endpoint ที่เติมเข้าไฟล์ 41 §17.1 (ปิดช่องว่าง action `resubmit_close_case`/`resubmit_expense` ที่นิยามไว้ใน 41 §8 แต่ไม่มี endpoint) |
| v1.2 | 04/07/2569 | ✅ Product Owner ยืนยันชื่อ endpoint ทั้ง 2 แล้ว (DEC-006/D9) |
| v1.4 | 14/08/2569 | **ปิดช่องว่างจาก implement Phase 2.5**: §6.1 เติม `GET /api/cases/team-options` — `38` §7.4 บังคับให้ฟอร์มรับเคสแสดง "ทีมที่เสนอ" แบบ real-time ตามจังหวัด พร้อมกล่องค่าใช้จ่ายของทุกทีมในรายการ แต่เคสที่ยังไม่ถูกบันทึกยังไม่มี `:id` จึงเรียก `GET /api/cases/:id/team-suggestion` ไม่ได้ · และ `GET /api/teams` + `GET /api/compensation-plans` ต้องใช้ `view_master_data`/`manage_compensation_plans` ซึ่งเจ้าหน้าที่อนุมัติเคสไม่มี (`25` §7.1) ⇒ endpoint นี้อ่านด้วย capability ชุดเดียวกับการอ่านเคส · **read-only ไม่มี business logic ใหม่** รวมเป็น 41 endpoints |
| v1.3 | 14/08/2569 | **ปิดช่องว่างจาก implement Phase 2.2**: §6.1 เติม `PATCH /api/cases/:id` (action `edit_case` ที่ `38` §8/§12 นิยามไว้พร้อม error `CASE_LOCKED_AFTER_APPROVAL` และ `edit_history` ใน §6.4 แต่ §17.1 ของไฟล์ 38 ไม่เคยประกาศ endpoint) — ไม่มี business logic ใหม่ รวมเป็น 40 endpoints |

ขอบเขตเอกสารนี้: รวม API Endpoint ทั้งหมดของโมดูล Case Workflow (รับเคส/มอบหมาย/ภาคสนาม) และ Warehouse (คลังสินค้า) เป็นรายการเดียว จัดกลุ่มตาม resource เพื่อให้ backend implement ตาม REST convention เดียวกันทั้งระบบ — คู่กันกับ `27-finance-api-contracts.md` ที่รวม endpoint ฝั่ง Finance/Accounting

**ไม่รวมอยู่ในไฟล์นี้**: API ของโมดูล Finance/Accounting (ดู `27-finance-api-contracts.md`), Request/Response body schema แบบเต็ม (ดูไฟล์ต้นทางแต่ละ resource — `44` มี JSON schema ตัวอย่างละเอียดที่สุด), Event contract แบบเต็ม (สรุปย่อไว้ที่ §7 ของไฟล์นี้ รายละเอียดเต็มอยู่ไฟล์ต้นทาง)

---

## 1. Summary

รวม API Endpoint ทั้งหมดของโมดูล Case/Warehouse เป็นรายการเดียว จัดกลุ่มตาม resource เพื่อให้ backend implement ตาม REST convention เดียวกันทั้งระบบ

## 2. Purpose

ป้องกัน endpoint ซ้ำซ้อน/ตั้งชื่อไม่สอดคล้องกัน และเป็น checklist ความครบถ้วนก่อน implement — ปิดช่องว่างที่ไฟล์อื่นอ้างอิงมาที่นี่แต่ไม่เคยมีไฟล์จริงมาก่อน

## 3-5. (ไม่ใช้กับไฟล์ประเภทนี้)

เอกสารนี้เป็น technical reference ล้วน — ไม่มี Scope/Actor ของตัวเอง (ดู Actor ที่ไฟล์ต้นทางแต่ละ resource)

## 6. API Endpoints รวมทั้งหมด (จัดกลุ่มตาม Resource)

### 6.1 Case Submission (ไฟล์ 38)

```
POST   /api/cases                       รับเคส (manual form submit + API ingestion — แยกด้วย field source_channel)
POST   /api/cases/import                Import ไฟล์ Excel/CSV แบบ batch
GET    /api/cases                       List พร้อม filter (status, source_channel, finance_company_id, province)
GET    /api/cases/:id                   รายละเอียดเคส
PATCH  /api/cases/:id                   แก้ไขเคส (edit_case — เฉพาะ draft/pending_review/need_info) เพิ่มแถวใน edit_history ทุกครั้ง
POST   /api/cases/:id/documents         อัปโหลดเอกสารต่อ slot (document_type ระบุใน payload)
PATCH  /api/cases/:id/status            เปลี่ยนสถานะ (review/accept/reject/request_more_info) — body ต้องมี reason เมื่อ action เป็น reject/need_info/เปลี่ยนทีม
GET    /api/cases/:id/team-suggestion   คำนวณทีมที่เสนอจากจังหวัดที่อยู่ปัจจุบัน
GET    /api/cases/team-options          ทีม active ทั้งหมด + จังหวัดที่ดูแล + ค่าตั้งของแผนค่าตอบแทน (กล่องค่าใช้จ่ายทีม `38` §7.4)
```

### 6.2 Case Assignment & Routing (ไฟล์ 40)

```
GET    /api/assignments                                  List เคสพร้อมสถานะมอบหมาย (filter team, status)
GET    /api/teams/:team_id/agents                         รายชื่อพนักงานในทีม พร้อม active_case_count, success_rate, covered_provinces
GET    /api/teams/:team_id/agents/:agent_id/cases         รายการเคสที่พนักงานคนนี้ถือครองอยู่
GET    /api/teams/:team_id/kanban                         ข้อมูลสำหรับ Kanban Board ภาพรวมทีม
POST   /api/cases/:id/assign                              มอบหมายเคสให้พนักงาน (body: agent_id)
POST   /api/cases/:id/reassign                            เปลี่ยนพนักงานรับผิดชอบ (body: agent_id, reason) — assigned เปลี่ยนทันที / accepted สร้าง pending_reassignment
POST   /api/cases/:id/reassignment/respond                พนักงานคนเดิมตอบคำขอ (body: decision: consent|decline, decline_reason)
POST   /api/cases/:id/accept                              พนักงานกดรับงาน (เฉพาะ agent ที่ถูก assign)
```

### 6.3 Field Tracker — Mobile/Desktop (ไฟล์ 41)

```
GET    /api/field/cases?status={status}              ดึงรายการเคสของพนักงานตามสถานะ (4 กลุ่มหลัก)
GET    /api/field/cases/:id                           ดึงรายละเอียดเคสเต็ม
POST   /api/field/cases/:id/accept                    รับงาน
POST   /api/field/cases/:id/schedule                  จัดวันที่ (body: schedule_date)
PATCH  /api/field/cases/reorder                       สลับลำดับเคสในวันเดียวกัน (body: date, ordered_case_ids[])
POST   /api/field/cases/:id/checkin                   บันทึกเช็คอิน (body: lat, lng — ต้องมาจาก device GPS จริง)
POST   /api/field/cases/:id/close-draft               บันทึก Draft ปิดงาน
POST   /api/field/cases/:id/close                     ยืนยันปิดงาน (body: outcome, evidence)
POST   /api/field/cases/:id/resubmit-close            ส่งกลับยืนยันอีกครั้งหลังถูกตีกลับ needs_revision (ไฟล์ 41 §8 resubmit_close_case)
POST   /api/field/expenses/:id/resubmit               แก้ไขรายการเบิกที่ถูกตีกลับแล้วส่งใหม่ (ไฟล์ 41 §8 resubmit_expense)
POST   /api/field/reassignment/:id/respond            ตอบรับ/ปฏิเสธคำขอเปลี่ยนผู้รับผิดชอบ (body: consent, decline_reason?)
GET    /api/field/expenses?type={caseBound|separate}  ดึงรายการเบิกค่าใช้จ่าย
POST   /api/field/expenses/hotel                      ส่งคำขอเบิกที่พัก
GET    /api/field/income-summary?month={YYYY-MM}      ดึงสรุปรายได้
```

### 6.4 Warehouse — Assets (ไฟล์ 44)

```
GET    /api/assets                    List assets พร้อม filter (status, companyId, teamId, agentId, condition, search, dateFrom/dateTo, page/limit)
GET    /api/assets/:id                รายละเอียด asset + lot info
POST   /api/assets/:id/intake         รับเข้าคลัง (body: imeiActual, condition, conditionNote, photos[]) — auth: ธุรการ+
POST   /api/assets/:id/reject-intake  ตีกลับ IMEI ไม่ตรง (body: rejectReason) — auth: ธุรการ+
```

### 6.5 Warehouse — Handover Lots (ไฟล์ 44)

```
GET    /api/handover-lots                    List lots พร้อม filter (status, companyId, type, dateFrom/dateTo, search, page/limit)
GET    /api/handover-lots/:id                รายละเอียด lot + assets
POST   /api/handover-lots                    สร้าง Lot + นัดวัน (body: companyId, assetIds[], type, scheduledAt, contactPerson, deliveryAddr, trackingNo, note) — auth: ธุรการ
PATCH  /api/handover-lots/:id/confirm        ยืนยัน + แนบเอกสาร → trigger unlock expense + Revenue (body: deliveredAt, signedDocUrl, deliveryProofUrl) — auth: ธุรการ
GET    /api/handover-lots/:id/pdf            ดาวน์โหลดใบส่งมอบ PDF — auth: ธุรการ+
GET    /api/handover-lots/:id/export-excel   Export รายการเครื่องใน Lot — auth: ธุรการ+
```

## 7. Events รวม (สรุปย่อ — รายละเอียดเต็มดูไฟล์ต้นทาง §17.2/§16)

```
Case (38):        case.created / case.updated / case.document_uploaded / case.status_changed /
                   case.approved / case.rejected / case.need_info_requested / case.recycle_approved

Assignment (40):   assignment.created / assignment.reassigned / assignment.reassignment_requested /
                   assignment.reassignment_consented / assignment.reassignment_declined /
                   assignment.reassignment_timeout_resolved / assignment.accepted

Field Tracker (41): case.accepted / case.scheduled / case.reordered / case.checkin_recorded /
                   case.close_draft_saved / case.closed_success / case.closed_fail /
                   case.close_resubmitted / expense.resubmitted /
                   reassignment.consented / reassignment.declined

Warehouse (44):    asset.intake_confirmed / asset.intake_rejected / lot.created / lot.confirmed
                   (lot.confirmed คือ trigger point เดียวที่ unlock expense + generate revenue พร้อมกันใน
                   1 transaction — ดู 44 §11 และ 92-platform-data-model.md §6.1)
```

## 8. REST Convention ที่ใช้สม่ำเสมอทั้งระบบ

- `GET /resource` = list (รองรับ query filter)
- `GET /resource/:id` = detail
- `POST /resource` = create
- `PATCH /resource/:id` = update (partial)
- `POST /resource/:id/action-name` หรือ `PATCH /resource/:id/action-name` = state transition เฉพาะทาง (ดูไฟล์ต้นทางว่าใช้ verb ไหน — ไม่ได้ normalize เป็น PATCH ทั้งหมดเหมือนไฟล์ 27 เพราะไฟล์ต้นทาง 38/40/41/44 ใช้ POST สำหรับ action ที่สร้าง side-effect ใหม่ เช่น accept/checkin/close — คงไว้ตามต้นฉบับไม่ normalize เอง)
- ทุก endpoint ที่กระทบ case/asset ต้องตรวจสิทธิ์ตาม `07-roles-permissions.md` ก่อนเสมอ
- Namespace `/api/field/*` สงวนไว้เฉพาะ endpoint ที่เรียกจาก Field Tracker app (ไฟล์ 41) เท่านั้น — แยกจาก `/api/cases/*` ที่ใช้ฝั่ง Back Office (ไฟล์ 38/40)

## 9-16. (ไม่ใช้กับไฟล์ประเภทนี้)

ดูรายละเอียดเชิง business ของแต่ละ endpoint ที่ไฟล์ต้นทาง (`38` §17, `40` §17, `41` §17, `44` §15)

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **ไฟล์นี้เป็นการรวบรวม ไม่ใช่เนื้อหาใหม่** — endpoint ทุกตัวคัดลอกมาจากไฟล์ต้นทาง 38/40/41/44 แบบคำต่อคำ ไม่มีการเปลี่ยนแปลง business logic หรือเพิ่ม endpoint ใหม่
- **ไม่ normalize verb ของ state-transition endpoint ให้เป็น PATCH ทั้งหมดแบบไฟล์ 27** — เพราะไฟล์ต้นทาง 38/40/41/44 ใช้ POST สม่ำเสมอสำหรับ action ที่มี side-effect (accept/checkin/close/assign) การเปลี่ยนตอนนี้จะทำให้ไม่ตรงกับไฟล์ต้นทางที่เป็น source of truth — คงไว้ตามเดิม (ดู §8)
- **`/api/field/*` แยก namespace ชัดเจนจาก `/api/cases/*`** — สะท้อนว่า Field Tracker (ไฟล์ 41) เป็นแอปคนละ context กับ Back Office แม้จะทำงานกับ case entity เดียวกัน

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- ไม่มี Open Item ใหม่ — ไฟล์นี้เป็นการปิดช่องว่าง reference ที่ค้างอยู่ ไม่ได้เปิดประเด็นใหม่ที่ต้องตัดสินใจ

---

*เอกสารนี้เติมช่องว่างในหมวด Case & Field Operations (38–44) — คู่กันกับ `27-finance-api-contracts.md` ในหมวด Finance Reference (22–29)*
