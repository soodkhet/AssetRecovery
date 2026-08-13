# Rule 06 — Git Workflow & Release Flow

## Branch Model (มติ PO 2026-08-12)

```
local (เครื่อง dev) ──push──▶ origin/staging ──ทดสอบผ่าน──▶ PR ──▶ origin/main
     งานทุก task                Vercel Staging                      Vercel Production
     base = staging             + Supabase Staging                  + Supabase Production
```

- **สายพัฒนา = `staging`** — orchestrator และงานทุก task ทำบนสายนี้ (`baseBranch = staging`) · branch งานอัตโนมัติ = `auto/phase-<id>` merge กลับเข้า local staging
- **`main` = production เท่านั้น** — advance ได้**ทางเดียว**คือ PR จาก `staging` หลังทดสอบบน staging ผ่านแล้ว · Branch Protection: require PR + CI เขียว · **ห้าม push main ตรงทุกกรณี ห้าม merge อะไรเข้า main ที่ไม่ได้มาจาก staging**

## Release Flow (บังคับตามลำดับ ห้ามข้ามขั้น)

1. งานเสร็จบน local: verify เขียว (`pnpm typecheck` + `pnpm test` + lint) + commit บนสาย staging
2. **คน**รัน `pnpm typecheck && pnpm test` เต็มหนึ่งรอบ แล้ว `git push origin staging` → deploy ขึ้น Vercel Staging (ต่อ Supabase Staging)
3. ทดสอบบนระบบนิเวศจริงที่ staging domain — flow จริง, ข้อมูลจริง (staging DB), มือถือจริงสำหรับ Field Tracker
4. ผ่านแล้วจึงเปิด **PR `staging` → `main`** บน GitHub → CI รันเต็ม → merge = deploy production อัตโนมัติ
5. มีปัญหาบน production → แก้ที่สาย staging แล้วเดินลำดับ 1–4 ใหม่ (**ห้าม hotfix ตรงเข้า main**)

## กติกาสำหรับ session อัตโนมัติ (orchestrator / Claude Code)

- **ห้าม `git push` เด็ดขาดในทุก session อัตโนมัติ** — push ทั้ง staging และ PR เข้า main เป็นการกระทำของ**คน**เท่านั้น (auto-merge ของ orchestrator แตะแค่ local staging ซึ่ง reset ได้)
- ทุกคำสั่ง git ที่ orchestrator เรียกต้อง exclude `orchestrator/` (`:(exclude)orchestrator`) — queue/logs เขียนตลอดเวลา
- session ถูกตัดกลางคัน: ห้าม auto-commit WIP ถ้ามี `MERGE_HEAD` หรือไฟล์ conflict (UU/AA/DD) ค้าง · merge conflict → `git merge --abort` ทันที

## Commit & สุขอนามัย repo

- Commit: conventional commits ภาษาไทย — `feat(<scope>): Phase <id> <headline>` / `fix(...)` / `docs(...)` · commit หลัง verify ผ่านเท่านั้น
- ห้าม commit: `.env*` (นอกจาก `.env.example`), secrets, `node_modules/`, `.next/`, `orchestrator/queue|logs|.token|.run.lock`
- archive ต้นฉบับ (`Project_info/`) ถูกนำออกจาก repo แล้ว (2026-08-13) — `docs/` + `reference/` คือแหล่ง canonical ห้ามลบ/ย้าย
- แก้ spec ใน `docs/` ได้เฉพาะ: อัปเดต INDEX/MAP/PLAN/PROGRESS_ARCHIVE/REUSE_INDEX/02_OPEN_DECISIONS หรือแก้ spec ตามมติ/คำตอบ `[[NEEDS_DECISION]]` ที่อนุมัติแล้ว (พร้อม changelog ในไฟล์นั้น + DEC ใหม่ถ้าเป็นเชิง architecture)
