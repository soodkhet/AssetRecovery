# Rule 03 — Permission & Audit (DEC-002, DEC-009, ไฟล์ 25/90)

## Permission
- ตรวจที่ **API layer ทุก endpoint** ผ่าน `requirePermission(action, resource, scope)` — ไม่มีข้อยกเว้น · UI hide/disable เป็นแค่ UX
- **ไม่ใช้ Supabase RLS** เป็น permission layer (DEC-002) — Supabase ใช้แค่ Auth + Storage
- Role 15 ตัว 4 กลุ่ม (`07` §5) — seed ห้ามลบ/เปลี่ยนชื่อ · role ชื่อซ้ำข้ามกลุ่ม = คนละ record
- สิทธิ์ 3 ระดับ (DEC-009): ไม่มี record = มองไม่เห็น / `view` / `manage` — เก็บที่ `role_capabilities.access_level` · Superadmin = manage ทุกอย่างโดยนิยาม **ไม่เก็บ record** enforce ที่ middleware · 7 รายการ "✅ only" ล็อก Superadmin มอบให้ role อื่นไม่ได้
- Scope ย่อย ("ทีมตัวเอง"/"own"/"company") enforce ที่ business logic เพิ่มจาก access_level — Manager เห็นเฉพาะทีมใน `team_managers` · Company User เห็นเฉพาะ `company_id` ตัวเอง (403 แบบไม่ leak)
- endpoint ที่กระทบเงิน/ภาษี → เช็ค matrix `25` ก่อนเขียนเสมอ · `/api/portal/*` = GET เท่านั้น

## Audit
- ทุก mutation ผ่าน audit helper กลาง — fields ครบ 9: `actor_id, role, action, target_type, target_id, before, after, reason, created_at`
- `reason` **บังคับ** เมื่อกระทบ เงิน/สิทธิ์/ธนาคาร/ภาษี/lock period
- Audit log **immutable** — ห้าม UPDATE/DELETE แม้ Superadmin, reject ที่ DB level · retention 5 ปี
- export/import/background job ต้อง trace กลับผู้สั่งงานได้ (job actor = system ให้ระบุ job id)
- Login/logout/failed login ต้องลง audit ทุกครั้ง
