# AssetRecovery

Operations Platform สำหรับธุรกิจรับจ้างติดตามทรัพย์ (มือถือ/อุปกรณ์) คืนจากลูกหนี้ให้บริษัทไฟแนนซ์ — Case → Field Tracking → Warehouse → Finance → Accounting Handover + Client Portal

## เริ่มอ่านตรงไหน

| ต้องการ | เปิด |
|---|---|
| กติกาโปรเจกต์ + ตารางเส้นทางเอกสาร | `CLAUDE.md` |
| วงจรการทำงานต่อ session | `WORKFLOW.md` |
| สถานะงาน + งานถัดไป | `PROGRESS.md` (orchestrator parse ไฟล์นี้) |
| แผนงานละเอียดทุก task (60 tasks / 9 phases) | `docs/01_PLAN.md` |
| ดัชนี spec ทั้งหมด | `docs/00_INDEX.md` |
| ช่วงบรรทัดไฟล์ใหญ่ | `docs/00_MAP.md` |
| Spec ฉบับเต็ม (ไฟล์ 00–97) | `docs/` |
| UI mockups + template ตัวอย่าง | `reference/` , `reference/samples/` |

## Stack

Next.js App Router + TypeScript · Prisma · PostgreSQL (Supabase) · Supabase Auth/Storage · Vercel · เงินเก็บเป็น satang (INTEGER) · แสดงผล พ.ศ. Asia/Bangkok — รายละเอียด/เหตุผลดู `docs/94-decision-log.md`

## Automation

- `orchestrator/` — รัน Claude Code อัตโนมัติทีละ task ตาม `PROGRESS.md` (dashboard port 4174) — ต้อง adapt ก่อนใช้ (task 0.3, ดู `promptmovetools.md`)
- `tools/devpanel/` — แผงควบคุม dev servers (port 4600) — adapt ใน task 0.3 เช่นกัน
- `.claude/` — rules / commands (`/start-task`, `/finish-task`, `/review`, `/spec`) / subagents (code-reviewer, spec-checker, security-auditor) / hooks

## โฟลเดอร์ที่ห้ามแตะ

`Project_info/` = archive spec ต้นฉบับ (read-only ถาวร) — งานทั้งหมดใช้สำเนาใน `docs/` + `reference/`
