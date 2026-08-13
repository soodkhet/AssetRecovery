---
name: spec-lookup
description: วิธีค้น spec ของ AssetRecovery แบบประหยัด context — ใช้ทุกครั้งที่ต้องหาข้อมูลจากเอกสาร spec (docs/) หรือ mockup (reference/) โดยเฉพาะไฟล์ใหญ่ (02, 13, 38, 40, 41, 44, 97, mockup ทุกตัว)
---

# Spec Lookup — ค้น spec โดยไม่เผา context

## ขั้นตอนบังคับ

1. **ระบุไฟล์**: เปิดตารางเส้นทางใน `CLAUDE.md` หรือ `docs/00_INDEX.md` — ห้ามไล่เปิดไฟล์สุ่ม
2. **ไฟล์ใหญ่ (≥15KB)**: เปิด `docs/00_MAP.md` หาบรรทัดเริ่มของ section → `Read(file, offset, limit)` เฉพาะช่วง (ช่วงจบ = บรรทัดเริ่ม section ถัดไป − 1)
3. **ไฟล์เล็ก**: Grep คีย์เวิร์ด (ไทย/อังกฤษตาม spec) ก่อน แล้วอ่านรอบๆ จุดที่เจอ
4. **Mockup**: MAP มีตาราง function ต่อไฟล์ — Grep ชื่อ render function แล้วอ่านเฉพาะช่วงนั้น
5. อ้างอิงคำตอบด้วย `<ไฟล์> §<section>` เสมอ

## โครง section มาตรฐานของ spec (จำไว้ ลด lookup)

ไฟล์ 00–37, 90–96 ใช้โครง 18 หัวข้อ: §1 Summary · §6 Core Concepts (**เนื้อหลัก**) · §7 Data Entities · §8 UI/UX · §9 Workflow · §10 Security · §11 Validation · §12 Permission · §13 Audit · §14 API · §16 Test Cases · §17 Decisions · §18 Open Items
ไฟล์ 38/40/41/44/97 ใช้โครงต่างออกไป (Data Requirements/UI Requirements/Actions/Workflow/State Machine/Business Rules/…) — ดูหัวข้อจริงใน MAP
⚠️ ไฟล์ 36 เลข section เลื่อนจากมาตรฐาน (ไม่มี Core Concepts)

## จุดที่คนถามบ่อย → ชี้เป้าเลย

| เรื่อง | ที่อยู่ |
|---|---|
| สูตรเงินทุกสูตร | `22` §6.1–6.13 |
| Revenue เกิดเมื่อไหร่ | `19` §6.1 (+DEC-006/D6), `44` §11 |
| WHT ใช้ rate ไหน | `18` §6.3, `22` §6.9 |
| State ของ entity X | `23` §6.1–6.16 |
| Error code | `24` §6.1–6.8 |
| ใครทำอะไรได้ | `25` §7, `07` §5, `06` §7.2 |
| Endpoint ของ X | `27` (Finance/Accounting) หรือ `45` (Case/Warehouse) |
| ตาราง/คอลัมน์ | `02` ผ่าน MAP (Group A–G) |
| การตัดสินใจ/เหตุผล | `94` (DEC-001…009) |
| อะไรยังไม่ปิด | `93` §7.1 |
