---
description: รีวิวโค้ดที่เพิ่งเขียนเทียบกติกา CLAUDE.md + spec
---

รีวิว diff ล่าสุด (หรือช่วงที่ระบุ: $ARGUMENTS) เทียบกับกติกาโปรเจกต์ — ใช้ subagent `code-reviewer` ถ้างานใหญ่:

ตรวจทีละหัวข้อแล้วรายงานเป็นตาราง `| หัวข้อ | ✅/❌ | รายละเอียด/บรรทัด |`:

1. เงินเป็น `INTEGER` satang ทุกจุด (ห้าม float) · วันที่แสดงผลเป็น พ.ศ. ทุกจุด
2. ทุก endpoint ใหม่มี `requirePermission` + ตรง matrix `25` · `/api/portal/*` ไม่มี mutation
3. ทุก mutation ผ่าน audit helper + reason ตามเกณฑ์
4. State/enum ตรง `23` + `02` §3 · error code มาจาก `24` เท่านั้น
5. สูตรเงินเรียกจาก pure modules (`22`) ไม่ hardcode
6. Snapshot pattern ครบตาม `92` §7.1 · idempotency ตามจุดที่กำหนด
7. ไม่มี `any` · Zod schema ครบ · UI ใช้ shared components + statusBadge กลาง
8. Test ครบตาม Test Cases ของ spec + งานการเงินมี test ในก้อนเดียวกัน

จุดที่ ❌ → แก้ให้เลย + verify + commit
