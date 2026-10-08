---
name: staging-check
description: ตรวจ staging (Vercel Preview สาย staging + Supabase staging) หลัง push — เฉพาะสิ่งที่ localhost ตรวจไม่ได้ (deploy/env/migration · อัปโหลดไฟล์จริง · Google Maps · push notification · มือถือจริง · smoke ต่อ role) ผ่าน browser pane ใน session ที่ผู้ใช้ login ให้ · ไม่ใช้ subagent · ไม่กรอกรหัสผ่าน · ไม่ restore ฐาน · รายงานที่ .claude/preship/staging-<วันที่>/report.md · เรียกด้วย /staging-check (ใส่ขอบเขตต่อท้ายได้ เช่น /staging-check เฉพาะอัปโหลด)
---

# Staging Check

ตรวจว่าโค้ดที่ผ่าน `/preship-audit` บน localhost แล้ว **ทำงานบนโครงสร้างจริงของ staging** — ไม่ตรวจ logic ซ้ำ (ทำบน local แล้ว)
ตรวจเฉพาะสิ่งที่ต่างระหว่าง local กับ staging: deploy · env · migration · Supabase Storage/Auth จริง · Google Maps · Web Push · มือถือจริง

## ทำไมไม่ใช้ /preship-audit กับ staging
- `/preship-audit` สร้าง/ลบข้อมูลทดสอบจำนวนมากแล้ว restore ฐานทุกรอบ — ฐาน staging restore แบบนั้นไม่ได้
- Claude **กรอกรหัสผ่านในระบบจริงไม่ได้** (ได้แค่ localhost) ⇒ subagent login เองไม่ได้ · staging ไม่มี persona ครบ 15 role
- staging อยู่หลัง Vercel Authentication ⇒ สคริปต์อัตโนมัติ (Playwright/curl) เข้าไม่ได้ — ต้องใช้ browser pane ที่ผู้ใช้ผ่าน Vercel auth แล้ว

## กติกาเหล็ก
- **ห้ามกรอกรหัสผ่าน / API key / token ลงช่องใด ๆ** — ให้ผู้ใช้ login เองใน browser pane แล้วบอกว่า login เป็น role ไหน · ห้าม logout หรือเปลี่ยนรหัสของบัญชีผู้ใช้
- **ห้ามอ่าน/พิมพ์ค่าใน `.env*` และค่า secret บน Vercel** — ดูได้แค่ชื่อตัวแปร (`vercel env ls`)
- ห้ามแตะ production (`main`, deployment Production, Supabase production) · ห้าม `git push` (hook ของ repo บล็อก — ให้ผู้ใช้ push เอง)
- **ห้ามรีเซ็ต/restore ฐาน staging** · migration/seed บน staging ทำได้เมื่อผู้ใช้สั่งในแชทเท่านั้น (คำสั่งอยู่ด้านล่าง)
- ข้อมูลที่สร้างระหว่างตรวจ: ตั้งชื่อขึ้นต้น `STG-<วันที่>` (เช่นเลขเคส `STG-0810-01`) · จดทุก record + path ไฟล์ใน Storage ลงรายงาน (หัวข้อ "ข้อมูลที่สร้าง") ให้ผู้ใช้ลบก่อน go-live
- action ที่ย้อนไม่ได้ (ล็อกงวด · complete รอบจ่าย · ส่งบิล · ยกเลิกเอกสารภาษี · ลบข้อมูลที่ไม่ได้สร้างเอง) — **ถามในแชทก่อนทุกครั้ง** · กับข้อมูลที่ผู้ใช้สร้างไว้เองห้ามทำ action ใด ๆ
- เปลี่ยนค่าตั้ง/env บน Vercel หรือ Google Cloud — ถามก่อนทุกครั้ง
- พบปัญหา ⇒ **จดลงรายงาน ไม่แก้โค้ดระหว่างตรวจ** (แก้ทีหลังบน local แล้วเดินวงจร push ใหม่)

## สภาพแวดล้อม
| อะไร | ค่า |
|---|---|
| URL | `https://asset-recovery-git-staging-prototype24.vercel.app` (Vercel Authentication — เปิดผ่าน browser pane) |
| Vercel project | `prototype24/asset-recovery` · env ของ staging = Preview (branch `staging`) |
| Supabase | project `qgshdgzzajmoytzymsqe` (staging — ใช้ Auth ร่วมกับ localhost) |
| ฐานข้อมูล | `.env.staging` (`DIRECT_URL` — Session pooler) · ห้ามพิมพ์ค่า |
| สถานะ migration | `PRISMA_ENV_FILE=.env.staging pnpm prisma migrate status` |
| ลง migration (ผู้ใช้สั่ง) | `PRISMA_ENV_FILE=.env.staging pnpm db:deploy` — Vercel **ไม่** migrate ให้เอง |
| seed (ผู้ใช้รันเอง) | `set -a && source .env.staging && set +a && DATABASE_URL="$DIRECT_URL" PRISMA_ENV_FILE=.env.staging pnpm db:seed` (upsert เฉพาะแถวที่ยังไม่มี) |
| สำรองฐานก่อน migrate | `pg_dump` 16 ของเครื่องใช้กับ server 17 ไม่ได้ — สำรองเป็น JSON ลง `uat/snapshots/staging-*.json` (gitignored) |
| Cron | `vercel.json` ตั้ง `/api/cron/jobs` ทุก 10 นาที แต่ **Vercel รัน cron เฉพาะ deployment Production** ⇒ บน staging (Preview) ไม่มี cron รันเอง — job รายวัน (เบี้ยเลี้ยง · เงินทดรองเลยกำหนด · เตือนยื่น WHT) ไม่เกิดเอง · ทดสอบ job ได้แค่ผู้ใช้เรียก endpoint เองพร้อม `CRON_SECRET` |
| Google Maps | โค้ดอ่าน `GOOGLE_MAPS_API_KEY` ก่อน ไม่มีใช้ `GOOGLE_MAPS_SERVER_KEY` · key ฝั่ง server = "assetrecovery-server" (Distance Matrix API) ในโปรเจกต์ GCP `assetrecovery-505421` |

## ขั้นตอน

### 0. เตรียม (Claude ทำเอง — อ่านอย่างเดียว)
1. `git fetch origin` แล้วเทียบ `origin/staging` กับ HEAD — โค้ดที่จะตรวจคือ commit ไหน
2. `vercel ls` — deployment ล่าสุดของสาย staging เป็น **Ready** และสร้างหลัง push ล่าสุด (Error ⇒ `vercel inspect <url> --logs` ดูสาเหตุ แล้วหยุด)
3. `PRISMA_ENV_FILE=.env.staging pnpm prisma migrate status` — ต้อง "up to date" (ค้าง ⇒ หยุด บอกผู้ใช้ว่าต้อง migrate + seed ก่อน)
4. `vercel env ls` — มีชื่อครบ: `DATABASE_URL` `DIRECT_URL` `SUPABASE_SERVICE_ROLE_KEY` `NEXT_PUBLIC_SUPABASE_URL` `NEXT_PUBLIC_SUPABASE_ANON_KEY` `CRON_SECRET` `VAPID_PUBLIC_KEY` `VAPID_PRIVATE_KEY` `VAPID_SUBJECT` `NEXT_PUBLIC_VAPID_PUBLIC_KEY` และ `GOOGLE_MAPS_API_KEY` หรือ `GOOGLE_MAPS_SERVER_KEY` (ดูชื่อเท่านั้น)
5. โหลด skill `anthropic-skills:built-in-browser` แล้วเปิด `<URL>/login` ใน browser pane — หน้า login ขึ้น (ไม่ใช่ 500/หน้าว่าง)
6. สร้างโฟลเดอร์ `.claude/preship/staging-<YYYYMMDD>/` สำหรับรายงาน

### 1. ขอให้ผู้ใช้ login
- เรียก `tabs_context` ตรวจว่า browser pane แสดงอยู่ (ซ่อน ⇒ ขอให้กด Cmd+Shift+B)
- ขอให้ผู้ใช้ login **ทีละบัญชี** ตามลำดับ role ที่ต้องตรวจ แล้วบอกว่าเป็น role อะไร · ตรวจครบ role หนึ่งแล้วขอเปลี่ยนบัญชี (ผู้ใช้ logout/login เอง)
- ไม่มีบัญชีของ role ไหน ⇒ ข้าม จดว่า "ไม่ได้ตรวจ — ไม่มีบัญชี" (สร้างบัญชีผู้ใช้เป็นงานของผู้ใช้ ผ่านหน้าจัดการผู้ใช้)

### 2. รายการตรวจ (ทำตามขอบเขตที่ผู้ใช้ระบุ — ไม่ระบุ = ทุกข้อ)

| # | เรื่อง | ใครทำ | วิธี | ผ่านเมื่อ |
|---|---|---|---|---|
| S1 | Smoke หน้าหลักของ role | Claude | เปิดทุกเมนูที่ role เห็น · อ่าน console (`read_console_messages` onlyErrors) + network ≥ 500 | ทุกหน้าโหลดได้ ไม่มี 500 / hydration error / หน้าว่าง |
| S2 | Back · ตัวกรองใน URL · กระดิ่ง · หน้าแจ้งเตือน | Claude | กรอง → ไปหน้าอื่น → Back · refresh · เปิดกระดิ่ง (ห้ามกด "อ่านทั้งหมด" ถ้าผู้ใช้ไม่อนุญาต) | ตัวกรอง/แท็บคงอยู่ · กระดิ่งไม่ล้นจอ |
| S3 | อัปโหลดไฟล์จริงขึ้น Supabase Storage (มติ P10 — signed URL + anon key) | Claude | แนบไฟล์ PDF/รูปเล็ก ๆ ในฟอร์มที่สร้าง record `STG-` ของตัวเอง (เช่นเอกสารเคส) · ยกเลิกระหว่างอัปโหลด 1 ครั้ง | อัปโหลดสำเร็จ เปิดดูไฟล์ได้ · ยกเลิกแล้วไม่ค้าง · ไม่มี 4xx/5xx จาก storage |
| S4 | Google Maps คำนวณระยะทาง | Claude (ถามก่อน — สร้างข้อมูลจริง) | สร้างเคส `STG-` → อนุมัติ → มอบหมาย → ภาคสนามเช็คอิน ≥ 2 จุด แล้วปิดงาน (ต้องมีบัญชีธุรการ/อนุมัติ/ภาคสนาม) | รายการค่าน้ำมัน (PER_KM) มีระยะทาง > 0 · ไม่ขึ้น "คำนวณระยะทางไม่ได้" |
| S5 | Web Push (VAPID) | ผู้ใช้ (มือถือจริง) | Claude บอกขั้นตอน: เปิด `/field` บนมือถือ → กดเปิดการแจ้งเตือน → ให้อีกบัญชีทำ action ที่แจ้งเตือนพนักงานคนนั้น | มือถือได้รับ push |
| S6 | แอปภาคสนามที่ติดตั้งบนหน้าจอโฮม + session หมดอายุ (R9-011) | ผู้ใช้ (iPhone จริง) | Add to Home Screen → เปิดจากไอคอน → ลบ session (logout จากอีกเครื่อง/รอหมดอายุ) → ทำรายการ | กล่องเซสชันหมดอายุมีแค่ "เข้าสู่ระบบใหม่" และกลับหน้าเดิมได้ |
| S7 | กล่องเซสชันหมดอายุ (จำลอง) | Claude | ใช้ `javascript_tool` dispatch `new Event('ar:session-expired')` (ไม่แตะ session จริง) | กล่องเปิด 1 อัน · ลิงก์ login มี `?next=` ของหน้าเดิม |
| S8 | Cron / job รายวัน | ผู้ใช้ (ถ้าต้องการ) | บน Preview ไม่มี cron อัตโนมัติ — ตรวจหลังขึ้น production (Vercel → Project → Cron Jobs) หรือผู้ใช้เรียก `/api/cron/jobs` เองพร้อม `Authorization: Bearer <CRON_SECRET>` | job ตอบ 200 · ไม่ซ้ำเมื่อเรียกซ้ำ (idempotent) |
| S9 | พอร์ทัลบริษัทไฟแนนซ์ | Claude | ผู้ใช้ login บัญชีบริษัท → ดูเคส/ล็อต/ใบกำกับ · ดาวน์โหลด PDF 1 ไฟล์ | เห็นเฉพาะบริษัทตัวเอง · ดาวน์โหลดได้ |
| S10 | Runtime log | Claude | `vercel logs <deployment-url>` ช่วงที่ตรวจ (ดูแค่ error/stack — ไม่คัดลอก header/ค่า secret ลงรายงาน) | ไม่มี error ที่ไม่ได้คาดไว้ |

### 3. รายงาน
เขียน `.claude/preship/staging-<YYYYMMDD>/report.md` (ภาษาไทย):
- commit ที่ตรวจ · deployment URL · เวลา · บัญชี/role ที่ผู้ใช้ login ให้
- ตารางผล S1–S10: ผ่าน / ไม่ผ่าน / ไม่ได้ตรวจ (+ เหตุผล) · หลักฐาน (หน้า/ข้อความ error/ภาพ)
- ปัญหาที่พบ (ระดับตาม `/preship-audit`: critical/high/medium/low) + ข้อเสนอการแก้ (แก้บน local แล้ว push ใหม่)
- **ข้อมูลที่สร้างบน staging** (record `STG-` + path ใน Storage) ให้ลบก่อน go-live
- สิ่งที่ผู้ใช้ต้องทำต่อ (มือถือจริง · cron · env)
- คำตัดสิน: **พร้อมเปิด PR staging → main** / **ยังไม่พร้อม** (+ สิ่งที่ต้องแก้ก่อน)

ส่งไฟล์รายงานให้ผู้ใช้ด้วย SendUserFile และสรุปสั้นในแชท

## วิธีเรียก
- `/staging-check` — ตรวจทุกข้อ
- `/staging-check <ขอบเขต>` — เช่น `/staging-check เฉพาะอัปโหลดไฟล์` · `/staging-check S1 S2 role การเงิน`
