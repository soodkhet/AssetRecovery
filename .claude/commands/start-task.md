---
description: เริ่มทำงานถัดไปตาม PROGRESS.md (วงจรเต็มตาม WORKFLOW.md)
---

เริ่มทำงานถัดไปของโปรเจกต์ตามขั้นตอนนี้อย่างเคร่งครัด:

1. อ่าน `PROGRESS.md` ส่วน "🎯 งานถัดไป" — ถ้ามี argument ให้ทำ task id นั้นแทน: $ARGUMENTS
2. เช็คกันทำซ้ำ: `git log --oneline -15` + ตรวจไฟล์จริง — ถ้าทำแล้วให้ sync PROGRESS.md แล้วจบ
3. อ่าน `docs/01_PLAN.md` เฉพาะ § ของ task นี้ (scope / reading list / งบ context / DoD)
4. เช็ค `docs/REUSE_INDEX.md` ก่อนเขียนโค้ดใหม่
5. อ่าน spec ตาม reading list — ไฟล์ใหญ่ผ่าน `docs/00_MAP.md` เท่านั้น (Read เฉพาะช่วงบรรทัด)
6. วางแผนทีละขั้นแล้วลงมือ: schema → pure logic + test → backend → UI
7. verify: `pnpm typecheck` + `pnpm test` + lint ให้เขียวทั้งหมด
8. อัปเดต PROGRESS.md (✅ + commit hash + เลื่อนงานถัดไป + archive) แล้ว commit

ถ้าติดจุดตัดสินใจ ให้หยุดถามทันที ห้ามเดา
