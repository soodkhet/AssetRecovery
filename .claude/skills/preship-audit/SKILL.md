---
name: preship-audit
description: ตรวจความพร้อมก่อนขึ้น staging/production แบบ READ-ONLY — ใช้ subagent 6 ตัว (Design · Mobile · States · Real User · Launch · Use Case) ตรวจอิสระ แล้วรวมผลเป็น .claude/preship/{issues.json,use-cases.json,summary.md} พร้อมคำตัดสิน READY / NOT READY TO SHIP · ห้ามแก้โค้ด ห้าม refactor ห้าม commit/push · เรียกด้วย /preship-audit (ใส่ขอบเขตต่อท้ายได้ เช่น /preship-audit เฉพาะ Field Tracker)
---

# Pre-ship Audit (READ-ONLY)

งานนี้คือ **AUDIT · TEST · ANALYZE · REPORT เท่านั้น**

## กติกาเหล็ก (ทั้ง orchestrator และ subagent)
- ห้ามแก้ source code · ห้าม refactor · ห้าม redesign · ห้ามแก้ issue · ห้าม commit · ห้าม push
- ไฟล์ที่เขียนได้มีแค่: ผลลัพธ์ใน `.claude/preship/` (orchestrator เท่านั้น) และไฟล์ชั่วคราว/สคริปต์ทดสอบ/ภาพใน scratchpad ของ session
- ตรวจจากสิ่งที่มีอยู่จริงใน repository เท่านั้น — ห้ามเดา feature · ห้ามเดา business rule · ห้ามสร้าง issue สมมุติ
- **ทุก finding ต้องมี evidence** (file:line · component · route/API · ผล test/build · screenshot · ขั้นตอนทำซ้ำ) ไม่มีหลักฐาน = ไม่รายงาน
- ทดสอบบน dev server + ฐาน dev เท่านั้น (ข้อมูลบนฐาน dev เปลี่ยนได้จากการทดสอบ — snapshot ก่อนเริ่ม และบอกวิธี restore ในรายงาน) · ห้ามแตะ staging/production/Supabase dashboard/Vercel · ห้ามพิมพ์รหัสผ่าน/secret ลงรายงาน
- **โหมด staging** (ผู้ใช้สั่งตรวจบน staging ชัดเจน): ใช้ [STAGING-MODE.md](STAGING-MODE.md) แทนข้อ "ทดสอบบน dev" ด้านบน — session จาก `uat/.auth-staging/` · ห้าม login/สร้างบัญชี/เขียนฐานตรง/restore
- `pnpm build` ห้ามรันในโฟลเดอร์หลักขณะ dev server ทำงาน — ใช้สำเนาชั่วคราว (`git archive HEAD | tar -x -C <scratch>/build`)

## ขั้นตอน
1. **เตรียม** (orchestrator): ตรวจ dev server ตอบ 200 · `prisma migrate status` สะอาด · snapshot ฐาน dev (โปรเจกต์นี้: `uat/bin/snap.sh preship-<วันที่>`) · หาเครื่องมือเบราว์เซอร์ (โปรเจกต์นี้: Playwright `uat/bin/lib.mjs` `openAs(username)` · persona `uat/personas.json`)
2. **ส่ง subagent 6 ตัวพร้อมกัน** (ใช้ subagent type ที่ไม่มี Edit/Write เช่น `Explore`) แต่ละตัวรับ brief หมวดของตัวเอง (ด้านล่าง) + กติกาเหล็ก + รูปแบบ issue · ให้เขียนผลเป็น JSON ลง scratchpad ของตัวเอง (ผ่าน Bash heredoc) แล้วรายงาน path + สรุปสั้นกลับมา
3. **รวมผล** (orchestrator): Merge → Deduplicate (issue เดียวกันจากหลายหมวด รวมเป็นแถวเดียว เก็บ evidence ทุกชิ้น) → Sort critical → high → medium → low
4. **เขียนผลลัพธ์** `.claude/preship/issues.json` · `.claude/preship/use-cases.json` · `.claude/preship/summary.md`
5. **ตัดสิน** READY TO SHIP / NOT READY TO SHIP · ถ้า NOT READY บอกจำนวน production blocker และสิ่งที่ต้องแก้ก่อน (ตามลำดับ)

## รูปแบบ issue (ทุกหมวด)
```json
{
  "group": "Design | Mobile | States | Real User | Launch | Use Case",
  "severity": "critical | high | medium | low",
  "title": "",
  "description": "",
  "file": "",
  "line": null,
  "evidence": "",
  "impact": "",
  "recommended_fix": ""
}
```
- **critical** — ห้ามขึ้น production: data loss · security vulnerability · เงิน/การจ่ายผิด · permission รั่ว · ระบบใช้งานไม่ได้
- **high** — กระทบ feature สำคัญ ควรแก้ก่อน production
- **medium** — กระทบ UX/บาง flow ควรแก้ ไม่ block เสมอไป
- **low** — เล็กน้อย (design/alignment/minor UX)

## Brief ต่อ agent

### Agent 1 — Design
ความสม่ำเสมอ: spacing · padding · margin · alignment · border radius · shadow · สี · icon · button style · component consistency ข้ามหน้า
Typography: font size/weight · line height · text hierarchy · การตัดบรรทัด · overflow · truncation · ข้อความยาวผิดปกติ · ไทย/อังกฤษแสดงถูก
Layout: element ล้น/ซ้อน · เนื้อหาถูกตัด · width/height ผิด · grid/flex · container · sidebar · header · footer · modal · drawer
Component: button · input · select · checkbox · radio · card · modal · dialog · table · pagination · navigation · badge · tabs · dropdown · tooltip · icons — รูปแบบ/พฤติกรรมเหมือนกันทั้งระบบ
อ้างอิงมาตรฐานของโปรเจกต์ (เช่น design system/mockup ใน repo) เป็นเกณฑ์ · หลักฐาน = file:line ของ class/component + screenshot

### Agent 2 — Mobile
viewport อย่างน้อย 320 · 360 · 375 · 390 · 428 และ tablet 768 · 1024 (ถ้ารองรับ)
ตรวจ: horizontal overflow (`document.documentElement.scrollWidth > innerWidth`) · grid แตก · column ยุบ · card เรียง · table ใช้งานได้ · sidebar/menu · tap target (< 44×44px) · form · keyboard บัง input · dropdown · fixed header/sticky/bottom nav/modal/drawer/popup บน mobile
เน้น: ข้อความยาว · ตาราง · form · dialog · dropdown · navigation · card · image · upload · date picker

### Agent 3 — States
ทุกหน้า/component สำคัญ: loading (indicator/skeleton) · empty (ข้อความ + CTA · ไม่ดูเหมือน error) · error (API/network/server/validation เข้าใจง่าย) · success/disabled/submitting (toast · confirmation · ปุ่ม disabled ระหว่าง submit · กัน double submit · form ล็อกระหว่าง submit)
หา: ปุ่มกดซ้ำได้ · submit ซ้ำ · loading ไม่มี feedback · API error แล้วหน้าว่าง · ไม่มีข้อมูลแล้ว UI แตก · ข้อความ success/error ไม่ชัด
วิธี: อ่านโค้ด component + จำลองใน browser (route interception `page.route` ให้ API ช้า/500/offline)

### Agent 4 — Real User
คิดแบบผู้ใช้จริง เดิน user journey หลักต้นจนจบ: navigation (menu/link/button/breadcrumb/back/browser back) · form (ถูก/ผิด/required ว่าง/ยาว/อักขระพิเศษ/emoji/copy-paste/submit หลายครั้ง) · browser (refresh/back/forward/URL ตรง/หลาย tab/refresh ระหว่างทำรายการ) · unexpected (double click/click รัว/เปลี่ยนหน้าระหว่าง submit/ปิด modal ระหว่างทำงาน/upload ผิดไฟล์/input ยาวมาก/ผิดประเภท)
หาสิ่งที่ทำให้ผู้ใช้: สับสน · ทำรายการผิด/ซ้ำ · ข้อมูลหาย · ไปต่อไม่ได้ · เกิด error · เข้าใจสถานะผิด

### Agent 5 — Launch
Code quality (รัน read-only: typecheck · lint · test · build ในสำเนา) · broken import · circular dependency (เช่น `npx madge --circular` ถ้าใช้ได้โดยไม่ติดตั้งลง repo)
Broken resources: route · link · image · asset · API endpoint · external URL
Production config: env var ที่โค้ดอ่าน vs `.env.example` · production API/DB URL · storage · auth · CORS · domain · redirect URL · ค่าที่ผูก localhost
Debug code: console.log · debugger · TODO/FIXME · localhost/127.0.0.1 · mock data · test account · hardcoded password/secret · dev endpoint (ต้องปิดใน production)
Security เบื้องต้น: secret ใน frontend bundle · API key ที่ไม่ควร public · permission/authn/authz · protected/admin route · role · direct API access (ยิง API ด้วย role ไม่มีสิทธิ์)
Error handling: API/DB failure · timeout · invalid response · network failure
**ห้ามอ่าน/พิมพ์ค่าในไฟล์ `.env*`** (ดูได้แค่ชื่อตัวแปรจากโค้ด)

### Agent 6 — Use Case / Functional (สำคัญที่สุด)
1. สำรวจ repo ก่อน → **Feature Inventory**: page · route · feature · form · action · button · API · DB operation · role · permission · status · workflow · business rule (ห้ามสมมุติ feature)
2. ทุก feature สำคัญมี test case อย่างน้อย 10 กลุ่ม: HAPPY PATH · VALIDATION · BOUNDARY (0/ติดลบ/สูงสุด/ต่ำสุด/ว่าง/ยาวมาก/ทศนิยม/วันย้อนหลัง/อนาคต — ตาม rule จริง) · DUPLICATE (double submit/click/request/รายการ/payment/upload ซ้ำ) · STATE TRANSITION (ถูก + ที่ไม่ควรเกิด) · PERMISSION (ทุก role view/create/edit/delete/approve + URL ตรง + API ไม่มีสิทธิ์) · FAILURE (API/DB/network/timeout/upload/external error) · REFRESH/RETRY (refresh ระหว่าง/หลัง submit · retry · back แล้ว submit ใหม่ · หลาย tab) · DATA INTEGRITY (UI = API = DB · ยอดเงิน/สถานะ/record ครบ) · END-TO-END
3. Business rule ต้องมี evidence จาก repo (code/spec) — สร้าง test case ทดสอบ rule นั้น
4. **Use Case Matrix** ทุกแถว: Feature · Use Case · Preconditions · Steps · Expected Result · Actual Result · Pass/Fail (+ "Not Tested" พร้อมเหตุผล) · Severity · Evidence · Related File · Related API
วิธีทดสอบ: Playwright บน dev + เรียก API ตรง + ตรวจฐาน dev ด้วย SQL **อ่านอย่างเดียว** (SELECT) + รัน test ที่มีอยู่ (ไม่เขียน test ใหม่ลง repo)

## summary.md ต้องมี
- จำนวน feature ที่พบ · use case ที่สร้าง · test case ทั้งหมด · ผ่าน · ไม่ผ่าน · ทดสอบไม่ได้
- จำนวน issue แยก critical/high/medium/low และแยกตามหมวด 6 หมวด
- **รายการ Production Blocker** (critical + high ที่ต้องแก้ก่อน): Problem · Severity · Feature · Impact · Evidence · Recommended Fix
- คำตัดสิน **READY TO SHIP** หรือ **NOT READY TO SHIP** (+ จำนวน blocker + ลำดับสิ่งที่ต้องแก้ก่อน)
- วิธี restore ฐาน dev กลับเป็นก่อน audit · สิ่งที่ audit เขียนเพิ่มบน dev/Storage (ถ้ามี)

## วิธีเรียก
- `/preship-audit` — ตรวจทั้งระบบ
- `/preship-audit <ขอบเขต>` — จำกัดหมวด/โมดูล เช่น `/preship-audit Mobile + States เฉพาะ Portal`
- หรือพิมพ์ว่า "รัน preship audit" / "ตรวจความพร้อมก่อนขึ้น staging"

## ภาคผนวก — สภาพแวดล้อมของ AssetRecovery (ส่งให้ subagent ทุกตัว)
### สภาพแวดล้อม
- dev server http://localhost:3000 (Next.js 16) · ฐาน `assetrecovery_dev` (ข้อมูล seed Final · snapshot ที่ orchestrator สร้างตอนเตรียม — ฐานนี้ทดสอบได้ ข้อมูลเปลี่ยนได้ แต่จดสิ่งที่สร้างไว้)
- SQL อ่านอย่างเดียว: `psql -d assetrecovery_dev -c "SELECT ..."` (SELECT เท่านั้น)
- Playwright: `import { openAs, shot } from '/Users/beer/AssetRecovery/uat/bin/lib.mjs'` → `const { browser, page } = await openAs('uat.admin')` (รันด้วย `node <script>.mjs` จาก cwd `/Users/beer/AssetRecovery`) · ตั้ง viewport ด้วย `page.setViewportSize`
- persona (username → role): uat.admin ธุรการ · uat.approver เจ้าหน้าที่อนุมัติเคส · uat.finance การเงิน · uat.account บัญชี · uat.exec บริหาร · uat.mgr.in / uat.mgr.out ผู้จัดการทีม · uat.sup.in / uat.sup.out หัวหน้าทีม · uat.agent.in1 / in2 / out1 / out2 พนักงานภาคสนาม · uat.co1.mgr / uat.co1.sup / uat.co2.admin ผู้ใช้บริษัทไฟแนนซ์ (Portal) · uat.temp1 (ระงับ) uat.temp2 (ลบ) · Superadmin: ดูใน personas.json ว่ามีหรือไม่
- spec/มาตรฐาน: `CLAUDE.md` · `.claude/rules/*` · `docs/` (ใช้ `docs/00_MAP.md` หาช่วงบรรทัด ห้ามอ่านไฟล์ใหญ่ทั้งไฟล์) · mockup `reference/*.html` · มติ `uat/PO-DECISIONS-*.md` · บั๊กที่รู้แล้ว `uat/BUGS.md` (อย่ารายงานซ้ำบั๊กที่ status fixed เว้นแต่ยืนยันว่ายังเป็นอยู่)


### โฟลเดอร์ทำงานของ subagent
scratchpad ของ session ปัจจุบัน `<scratchpad>/preship/<หมวด>/` (สคริปต์ Playwright · ภาพ · log · issues.json · Agent 6 เพิ่ม features.json + use-cases.json · notes.md สิ่งที่สร้างบนฐาน dev/Storage) — orchestrator อ่านจากที่นี่แล้วรวมเป็น `.claude/preship/`
