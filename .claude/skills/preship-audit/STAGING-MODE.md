# Pre-ship Audit — โหมด staging

ใช้เมื่อผู้ใช้สั่งตรวจบน **staging** แบบเต็ม (เช่น `/preship-audit staging` หรือ prompt ที่ระบุ) — ทับข้อ "ทดสอบบน dev เท่านั้น/ห้ามแตะ staging" ของ SKILL.md **เฉพาะที่เขียนไว้ที่นี่** · กติกาเหล็กข้ออื่นยังใช้ครบ (ไม่แก้โค้ดแอป · ทุก finding ต้องมี evidence · ไม่พิมพ์ secret)

## สภาพแวดล้อม
| อะไร | ค่า |
|---|---|
| BASE | `https://asset-recovery-git-staging-prototype24.vercel.app` (Vercel Preview สาย staging) |
| Playwright | `UAT_TARGET=staging node <script>.mjs` → `openAs(username)` ใช้ session `uat/.auth-staging/<username>.json` เท่านั้น |
| persona | 18 คนตาม SKILL.md (อีเมล `@stg.uat.test` — แยกจาก localhost) · Superadmin = session `superadmin` (ถ้าผู้ใช้ login ให้ด้วย `--manual`) |
| ฐาน | Supabase staging `qgshdgzzajmoytzymsqe` · ชุดข้อมูล Final Test (`pnpm seed:final --target=staging`) |
| Storage/Auth | Supabase จริง (ใช้ร่วมกับ localhost) · Google Maps จริง (Distance Matrix) |
| Cron | Vercel ไม่รัน cron บน Preview — job รายวันไม่เกิดเอง (ไม่ใช่บั๊ก) |

## สิ่งที่ Claude/subagent **ห้าม** ทำ (แม้ผู้ใช้อนุญาต)
- กรอกรหัสผ่าน / สร้างบัญชีผู้ใช้ / เปลี่ยนรหัสบน staging — `openAs` ไม่มี session = error ⇒ **หยุดแล้วรายงาน** ให้ผู้ใช้รัน `uat/bin/staging-prep.sh login <username>` · ห้าม `fresh: true`
- เขียนฐาน staging ตรง (SQL INSERT/UPDATE/DELETE · reset · seed · restore) — ฐานเปลี่ยนได้**เฉพาะผ่าน UI/API ของแอป**ในฐานะ persona · SQL อ่านอย่างเดียวใช้ `uat/bin/staging-prep.sh q "SELECT …"` (ทรานแซกชัน READ ONLY · ไม่แสดง connection)
- อ่าน/พิมพ์ค่าใน `.env*` · ค่า env บน Vercel · ตั้งค่า Vercel/Supabase/Google Cloud
- `git push` · แตะ production / `main`
- **action ที่ต้องถามผู้ใช้ก่อน** (subagent หยุดแล้วรายงาน "ต้องขออนุญาต"): ล็อกงวด · complete รอบจ่าย · ยกเลิกเอกสารภาษีที่ออกแล้ว · ลบ/ระงับผู้ใช้ · เปลี่ยนค่าตั้งระบบที่กระทบทุก role (เช่น VAT/WHT/เลขเอกสาร)

## สิ่งที่ทำได้เต็มที่
- สร้าง/แก้/ยกเลิกข้อมูลธุรกิจผ่าน UI/API ด้วย persona (ฐาน reset ได้ด้วย `staging-prep.sh reset → users → seed`) — ข้อมูลที่สร้างใหม่ตั้งชื่อ/เลขอ้างอิงขึ้นต้น `STG-` เมื่อช่องนั้นรับข้อความ
- อัปโหลดไฟล์จริงขึ้น Storage (ไฟล์เล็ก ≤ 200 KB) — จด path ทุกไฟล์
- เรียก API ตรงด้วย `context.request` ของ session persona (ทดสอบ permission/validation)
- `vercel logs` / `vercel ls` / `vercel inspect` (อ่านอย่างเดียว · ไม่คัดลอก header/ค่า secret)

## เน้นสิ่งที่ localhost ตรวจไม่ได้
1. อัปโหลดไฟล์จริง (signed URL + anon key — มติ P10) · เปิดดู/ดาวน์โหลดไฟล์ที่อัปโหลด · ไฟล์ seed (`--with-storage`)
2. Google Maps: ปิดงานภาคสนามที่มีเช็คอิน ≥ 2 จุด → ระยะทาง > 0 · ไม่ขึ้น "คำนวณระยะทางไม่ได้"
3. ความเร็ว/timeout บน Vercel + Supabase (วัดเวลาโหลดหน้า/API หลัก · cold start · PDF/export ใหญ่ · function timeout)
4. error ใน `vercel logs` ระหว่างตรวจ
5. PDF (ฟอนต์ไทยบน serverless) · export ZIP/XLSX · ไฟล์โอนธนาคาร · push subscription (เปิดได้ — รับ push บนมือถือจริงผู้ใช้ตรวจเอง)

## ผลลัพธ์
`.claude/preship/staging-<YYYYMMDD>/{issues.json,use-cases.json,summary.md}` · id `S-001…` · summary มีหัวข้อ "ข้อมูล/ไฟล์ที่สร้างบน staging" + "สิ่งที่ผู้ใช้ต้องทำเอง"
หลัง agent จบทุกตัว: `git status` ต้องไม่มีไฟล์หลุดใน repo root / ไฟล์แอป
