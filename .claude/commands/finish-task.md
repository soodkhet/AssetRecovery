---
description: ปิดงานปัจจุบัน — verify + อัปเดต PROGRESS + archive + commit
---

ปิด task ปัจจุบันให้สมบูรณ์:

1. รัน verify เต็ม: `pnpm typecheck` + `pnpm test` + lint — ถ้าแดง ให้แก้ให้เขียวก่อน (ห้ามลด scope/ตัด field เพื่อให้ผ่าน)
2. เทียบผลงานกับ Definition of Done ใน `docs/01_PLAN.md` § ของ task นี้ + Test Cases ในไฟล์ spec ที่เกี่ยว — รายงานเป็นตาราง ผ่าน/ไม่ผ่าน
3. อัปเดต `PROGRESS.md`:
   - แถว task → ✅ + วันที่ + commit hash ใน backtick + headline 1 บรรทัด
   - ย้ายรายละเอียด/การตัดสินใจระหว่างทำ → `docs/PROGRESS_ARCHIVE.md`
   - "🎯 งานถัดไป" → task ถัดไปงานเดียว (คัดรายละเอียดจาก `docs/01_PLAN.md`)
   - ตรวจขนาด ≤50,000 ตัวอักษร: `python3 -c "print(len(open('PROGRESS.md',encoding='utf-8').read()))"`
4. เพิ่ม component/util ใหม่ที่ reuse ได้ลง `docs/REUSE_INDEX.md`
5. ถ้าแก้ไฟล์ spec/mockup จนบรรทัดเลื่อน: regenerate `docs/00_MAP.md` (`python3 .claude/hooks/generate-map.py`)
6. commit: `feat(<scope>): Phase <id> <headline>`
