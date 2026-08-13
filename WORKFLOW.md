# WORKFLOW.md — วงจรการทำงานต่อ 1 Session (AssetRecovery)

> ใช้คู่กับ `CLAUDE.md` (กติกา + ตารางเส้นทาง) และ `PROGRESS.md` (สถานะงาน) — orchestrator ส่ง prompt ตามวงจรนี้อัตโนมัติ แต่ session ที่รันมือ (Claude Code ปกติ) ก็ต้องเดินตามลำดับเดียวกัน

## วงจรต่อ 1 ก้อนงาน

1. **อ่าน `PROGRESS.md`** — ส่วน "🎯 งานถัดไป" + แถวตารางของ task นั้น (+ Handoff note ถ้ามี)
2. **กันทำซ้ำ**: ดู `git log --oneline -15` + ไฟล์จริง ยืนยันว่า task นี้ยังไม่ถูกทำ+commit ไปแล้ว — ถ้าทำแล้ว: อัปเดต PROGRESS.md ให้ตรงความจริง → commit → `[[TASK_DONE]]` ไม่ต้องทำซ้ำ
3. **เปิด `docs/01_PLAN.md` §ของ task นี้** — scope, reading list, งบ context, Definition of Done
4. **เช็ค `docs/REUSE_INDEX.md`** — ของที่มีแล้ว/แม่แบบ/กับดัก ก่อนเขียนโค้ดใหม่ทุกครั้ง
5. **อ่าน spec ตาม reading list** — ไฟล์ใหญ่ผ่าน `docs/00_MAP.md` (Read เฉพาะช่วง) — ห้ามอ่านเผื่อนอกรายการ
6. **วางแผนทีละขั้น** (ระบุ section เอกสาร + วิธี verify ของแต่ละขั้น) — งานใหญ่เกินงบ → แตก sub-task ใน PROGRESS.md ก่อน
7. **ลงมือทำทีละขั้น** ตามลำดับ: migration/schema → pure logic + unit test → backend API → frontend — verify (typecheck/test ที่เกี่ยว) หลังจบแต่ละขั้น
8. **verify เต็มก่อนจบ**: `pnpm typecheck` + `pnpm test` + lint ผ่านทั้งหมด
9. **อัปเดต `PROGRESS.md`**:
   - แถว task → ✅ พร้อม (วันที่ + commit hash ใน backtick + headline 1 บรรทัด)
   - รายละเอียดเต็ม/บันทึกการตัดสินใจระหว่างทำ → ย้ายไป `docs/PROGRESS_ARCHIVE.md`
   - "🎯 งานถัดไป" → เลื่อนไป task ถัดไป **งานเดียวเสมอ** (คัดรายละเอียดจาก `docs/01_PLAN.md`)
   - component/util ใหม่ที่ reuse ได้ → เพิ่ม `docs/REUSE_INDEX.md`
   - PROGRESS.md ต้อง ≤ 50,000 ตัวอักษร (วัด `python3 -c "print(len(open('PROGRESS.md',encoding='utf-8').read()))"`)
10. **commit** — conventional commits ภาษาไทย: `feat(<scope>): Phase <id> <headline>` แล้วพิมพ์ `[[TASK_DONE]] <commit hash> <headline>`

## เมื่อ context ใกล้เต็ม (เพดาน ~800k จาก 1M)

- **600k**: เริ่มเก็บงาน — commit ก้อนที่ verify ผ่านแล้ว
- **800k**: commit ความคืบหน้า → เขียนสรุป (เหลืออะไร / ตัดสินใจอะไรไปแล้ว / จุดที่ค้าง) → `[[HANDOFF]] <สรุป>` — session ใหม่จะทำต่อจาก commit ล่าสุด
- **ห้าม HANDOFF โดยไม่ commit** — session ใหม่เห็นเฉพาะสิ่งที่ commit แล้วเท่านั้น

## เมื่อติดจุดตัดสินใจ

เอกสารขัดกัน / สเปคไม่ชัด / ต้องตัดสินใจเชิงธุรกิจ / ต้อง credential หรือไฟล์ที่ไม่มี / งานเสี่ยงกระทบข้อมูลจริง
→ หยุดทันที ห้ามเดา ห้าม commit แล้วพิมพ์:
```
[[NEEDS_DECISION]] <สรุปคำถามสั้นๆ>
[[OPTIONS]] ตัวเลือกที่แนะนำ (แนะนำ) | ตัวเลือกที่ 2 | ตัวเลือกที่ 3
```

## กติกา verify ที่ทุก task ต้องผ่าน

| ด่าน | คำสั่ง | หมายเหตุ |
|---|---|---|
| typecheck | `pnpm typecheck` | **รันเต็มทั้ง repo เสมอ ห้ามย่อ** |
| test | `pnpm vitest run --changed <base> --passWithNoTests` | incremental ตาม import graph |
| lint | ส่งรายชื่อไฟล์ผ่าน `xargs` (ดู `orchestrator/config.mjs`) | มี guard เคสแก้แต่ docs |

- ทุก endpoint ที่กระทบเงิน/ภาษี ต้องผ่าน Permission Matrix (`25`) — ตรวจตอน review ทุกครั้ง
- จบแต่ละ task ให้เทียบกับ Test Cases §16/§20 ของไฟล์ spec นั้นก่อนขอปิดงาน
- เงินทุกจุด `INTEGER` satang / วันที่แสดงผล พ.ศ. — ตรวจซ้ำใน diff ก่อน commit ทุกครั้ง
