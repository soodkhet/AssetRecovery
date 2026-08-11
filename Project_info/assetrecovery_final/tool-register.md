# tool-register.md

# 98 — Tool & Account Registration Checklist
## AssetRecovery — ก่อนเริ่ม Implement จริง

> สถานะ: Pre-Implementation Setup Guide
> เอกสารอ้างอิง: `94-decision-log.md` (DEC-001 ถึง DEC-004), `01-architecture.md`, `93-roadmap-open-items.md`
> วัตถุประสงค์: รายการบัญชี/เครื่องมือทั้งหมดที่ **Product Owner (Boonphone) ต้องสมัครเอง** ก่อน Claude เริ่มเขียนโค้ด — เรียงตามลำดับความจำเป็น

---

## หลักการแยก Staging / Production

**สรุปสั้น**: ใช้ **1 GitHub repo, 1 Vercel project, 2 Supabase project** — แยกฐานข้อมูล/Auth/Storage ระหว่าง staging กับ production ให้ **ไม่มีทางแตะข้อมูลกันได้เลย** ส่วน deployment แยกด้วย Git branch mapping ไปยัง domain คนละตัว (Vercel รองรับฟีเจอร์นี้ในทุก plan ไม่ต้องใช้ Enterprise)

```
GitHub repo (1 repo)
├── branch: main     → Vercel → Production domain   → Supabase Project #2 (Production)
└── branch: staging  → Vercel → Staging domain       → Supabase Project #1 (Staging)
```

**เหตุผลที่แยก Supabase เป็น 2 project แทนการใช้ 1 project + DB branching**: Supabase Database Branching (feature เสริม) เหมาะกับ branch ระยะสั้นแบบ preview ไม่ใช่ staging แบบถาวรที่ต้องมีข้อมูลทดสอบสะสมไว้ยาวๆ และมีค่าใช้จ่ายเพิ่มต่อ branch — การแยกเป็น **2 project อิสระ** ปลอดภัยกว่า ราคาชัดเจนกว่า และไม่มีความเสี่ยงข้อมูล staging ไปปนกับ production เด็ดขาด

---

## รายการที่ต้องสมัคร (เรียงตามลำดับ)

### 🔴 ต้องสมัครก่อนเริ่ม (บล็อกการตั้งค่า repo/deploy)

| # | บริการ | ใช้ทำอะไร | หมายเหตุ |
|---|---|---|---|
| 1 | **GitHub** (Organization แนะนำ ไม่ใช่ personal account) | เก็บ source code, PR review, GitHub Actions (CI) | ถ้ามีทีม dev ในอนาคต Organization จัดการสิทธิ์ง่ายกว่า personal account — สร้าง org ชื่อบริษัท/โปรเจกต์ |
| 2 | **Vercel** (สมัครด้วย "Continue with GitHub" เพื่อ auto-link) | Hosting Next.js ทั้ง staging และ production | เลือก Plan: **Pro** ($20/เดือน/ผู้ใช้) แนะนำตั้งแต่ต้น เพราะ Hobby plan ห้ามใช้เชิงพาณิชย์ (commercial use) ตาม ToS ของ Vercel — ระบบนี้เป็นระบบธุรกิจจริง ใช้ Hobby plan จะผิดเงื่อนไขการใช้งาน |
| 3 | **Supabase — สร้าง 2 Project** | Database (PostgreSQL) + Auth (JWT) + Storage | Project 1: `assetrecovery-staging` (เริ่มที่ Free tier พอสำหรับทดสอบ) / Project 2: `assetrecovery-production` (ต้องเป็น **Pro plan $25/เดือน** ขึ้นไปตั้งแต่วันแรก เพราะ Free tier project จะ pause อัตโนมัติถ้าไม่มีการเรียกใช้ 7 วัน — ใช้กับ production ไม่ได้) |

### 🟡 สมัครได้ทีหลัง แต่ควรเตรียมไว้ก่อนถึงโมดูลที่เกี่ยวข้อง

| # | บริการ | ใช้ทำอะไร | ต้องมีก่อนโมดูล |
|---|---|---|---|
| 4 | **Google Cloud Console → Google Maps API** | คำนวณระยะทางจริงสำหรับค่าน้ำมัน PER_KM | ไฟล์ 41 (Field Tracker) — ยืนยันแล้วว่า "มีอยู่แล้ว" (ดู `93-roadmap-open-items.md`) รอส่ง API key ตอนถึงโมดูลนี้ |
| 5 | **โดเมนเว็บไซต์ (Domain Registrar)** | โดเมนจริงสำหรับ production (เช่น `assetrecovery.co.th`) + subdomain staging (เช่น `staging.assetrecovery.co.th`) | 🔴 **ยังจดไม่ได้ตอนนี้** — ชื่อ Product ยังเป็น Open Item (`README.md` "รอ Product Owner") ระหว่างนี้ใช้ domain ฟรีที่ Vercel ให้มาแทนชั่วคราว (เช่น `assetrecovery-staging.vercel.app`, `assetrecovery-prod.vercel.app`) — เปลี่ยนเป็นโดเมนจริงทีหลังได้โดยไม่กระทบโค้ด |

### 🟢 ยังไม่ต้องสมัคร (Deferred — ตามการตัดสินใจ Go-Live ที่ปิดไปแล้ว)

| บริการ | เหตุผลที่ยังไม่ต้อง |
|---|---|
| SMS/Email Gateway (Twilio/SendGrid ฯลฯ) | เฟส 1 ใช้ Push/In-app notification เท่านั้น (ตัดสินใจแล้ว — ดู `90-platform-audit-notification-reporting.md` §17) |
| e-Tax Invoice / e-Withholding Tax provider | เฟส 2 — ยังไม่ออกแบบ integration |
| Supabase PITR add-on | ตัดสินใจใช้ daily backup ฟรีที่มากับ Pro plan แทน (RPO/RTO 24 ชม./24 ชม.) |

### 🔵 แนะนำเพิ่มเติม (Optional — ยังไม่ใช่ข้อบังคับ ขอ confirm ก่อนเปิดใช้)

| บริการ | ใช้ทำอะไร | หมายเหตุ |
|---|---|---|
| Sentry (หรือเทียบเท่า) | Error monitoring บน production — เห็น error จริงจาก user ก่อนมีคนแจ้ง | ยังไม่มีการตัดสินใจเรื่องนี้ในเอกสารสเปคใดๆ — เป็นคำแนะนำเชิงสถาปัตยกรรมจากผม ไม่ใช่ requirement ที่มีอยู่แล้ว ขอ confirm ก่อนตั้งค่าให้ |
| Uptime monitor (เช่น UptimeRobot / Better Uptime) | แจ้งเตือนถ้า production ล่ม | เช่นเดียวกับข้างต้น — optional รอ confirm |

---

## ข้อมูลที่ต้องเตรียมให้ Claude หลังสมัครเสร็จ

หลัง Boonphone สมัครครบตามลิสต์ 🔴 แล้ว ให้เตรียมส่งข้อมูลต่อไปนี้กลับมา (**ห้ามวางค่า secret ลงในแชทที่บันทึกถาวร/commit ลง GitHub เด็ดขาด** — ใส่ผ่าน Vercel Environment Variables UI โดยตรงเท่านั้น):

- [ ] ชื่อ GitHub Organization + repo ที่สร้างไว้ (จะ verify ว่า Claude เข้าถึงได้)
- [ ] Vercel Project สร้างแล้วหรือยัง (ลิงก์ได้เลยถ้าสร้างผ่าน "Continue with GitHub")
- [ ] Supabase Staging Project: Project URL, `anon` key, `service_role` key (ใส่ใน Vercel env vars ของ branch `staging` เท่านั้น)
- [ ] Supabase Production Project: Project URL, `anon` key, `service_role` key (ใส่ใน Vercel env vars ของ branch `main` เท่านั้น — **ห้ามใช้ค่าเดียวกับ staging เด็ดขาด**)
- [ ] Node.js package manager ที่ต้องการ — เสนอ **pnpm** (เร็วกว่า npm, ประหยัด disk, Vercel รองรับเต็มที่) รอ confirm หรือจะใช้ npm/yarn แทนก็แจ้งได้

---

*ไฟล์นี้เป็นไฟล์ที่ 1 ของ 2 ไฟล์เตรียมพร้อมก่อน Implement — ดูลำดับงานจริงที่ `implementation-todo.md`*
