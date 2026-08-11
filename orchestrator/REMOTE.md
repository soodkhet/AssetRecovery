# สั่งงาน RTB Orchestrator จากมือถือ (Mac รัน + Tailscale)

เป้าหมาย: Mac เครื่อง dev ของคุณเป็นตัวรันจริง (ใช้ Claude subscription เดิม + Postgres ที่ตั้งไว้แล้ว) แล้วคุณเปิด dashboard สั่ง/กด Approve จากมือถือที่ไหนก็ได้ ผ่านเน็ตส่วนตัว Tailscale — ไม่เปิด public

---

## ทำครั้งเดียว (setup)

### 1. ลง Tailscale ทั้ง Mac และมือถือ (ล็อกอิน account เดียวกัน)
- Mac: `brew install --cask tailscale` แล้วเปิดแอป ล็อกอิน (หรือโหลดจาก tailscale.com/download)
- มือถือ: ลงแอป Tailscale จาก App Store / Play Store แล้วล็อกอิน account เดียวกัน
- เปิด Tailscale ให้ทั้งสองเครื่อง "Connected"

### 2. หาชื่อ/ไอพีของ Mac บน Tailscale
บน Mac รัน:
```bash
tailscale ip -4        # ได้เลขแบบ 100.x.x.x
tailscale status       # เห็นชื่อเครื่อง (MagicDNS) เช่น  boonphone-mac
```
จำเลข `100.x.x.x` หรือชื่อเครื่องไว้

### 3. ตั้ง token ของ dashboard (แนะนำตั้งเอง)
```bash
cd /Users/zeegamemsg/RTB-RUAMTABIEN
echo "ตั้งรหัสอะไรก็ได้ที่เดายาก" > orchestrator/.token   # หรือปล่อยให้ server generate เองครั้งแรก
```
> ถ้าไม่ตั้ง server จะสุ่มให้เองครั้งแรกแล้วพิมพ์ token ออกมาตอนบูต (ดูใน log)

### 4. ให้ server รันเองตอนเปิดเครื่อง (launchd)
```bash
cp orchestrator/scripts/com.rtb.orchestrator.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.rtb.orchestrator.plist
tail -f orchestrator/logs/service.log     # ดูว่าขึ้น dashboard แล้ว + เห็น token
```
> `start.sh` ใช้ `caffeinate -is` กัน Mac หลับระหว่าง server รัน — ถ้าไม่อยากกันหลับถาวร ให้รัน server เองเฉพาะตอนต้องการแทน (ข้อล่าง)

**หรือรันมือ (ไม่ใช้ launchd):**
```bash
cd /Users/zeegamemsg/RTB-RUAMTABIEN
set -a; . ./.env; set +a
caffeinate -is node orchestrator/server.mjs
```

---

## ใช้งานประจำวัน (จากมือถือ)

1. เช็คว่า Mac เปิดอยู่ + Tailscale connected + server รัน
2. บนมือถือเปิดเบราว์เซอร์ไปที่ (ใส่ token ครั้งแรกครั้งเดียว จากนั้นจำ cookie):
   ```
   http://<ชื่อเครื่อง-หรือ-100.x.x.x>:4173/?token=<TOKEN>
   ```
   เช่น `http://boonphone-mac:4173/?token=abc123...`
3. กด **▶ รันงานถัดไป** หรือเปิดสวิตช์ **Auto**
4. เมื่อมีการ์ด **"รอการตัดสินใจ"** โผล่ → พิมพ์คำตอบ กด **Approve** มันทำต่อให้เอง

> เพิ่ม URL เป็น bookmark / เพิ่มลงหน้า Home ของมือถือได้ (ไม่ต้องพิมพ์ token ซ้ำเพราะ cookie อยู่ 30 วัน)

---

## ⚠️ ความปลอดภัย
- **Tailscale = เน็ตส่วนตัว** เฉพาะอุปกรณ์ใน account คุณเห็น dashboard เท่านั้น (คนอื่นบนอินเทอร์เน็ตเข้าไม่ได้)
- **token** เป็นด่านสอง เผื่อมีคนในเครือข่าย Tailscale เดียวกัน — อย่าแชร์ URL ที่มี `?token=`
- server ผูก `0.0.0.0` (เห็นได้จาก Wi‑Fi บ้านด้วย) แต่ token กันไว้ ถ้าอยากล็อกให้เฉพาะ Tailscale ตั้ง `RTB_HOST=<100.x.x.x ของ Mac>` ก่อนรัน
- อย่าเปิด **Tailscale Funnel** (เปิด public) กับ dashboard นี้ เพราะมันสั่งรันโค้ดได้

---

## แก้ปัญหาที่พบบ่อย
- **เปิด URL ไม่ขึ้น** → เช็ค `tailscale status` ทั้งสองเครื่อง connected ไหม, Mac หลับหรือเปล่า, server รันอยู่ไหม (`tail orchestrator/logs/service.log`)
- **launchd ไม่เจอ node** → แก้ `NODE_BIN` ใน `start.sh` เป็น path เต็มของ node (`command -v node` เพื่อหา)
- **`pnpm test` แดงเพราะต่อ DB ไม่ได้** → docker `rtb-postgres` ต้องรัน + `.env` โหลดถูก
- **อยากหยุด service** → `launchctl unload ~/Library/LaunchAgents/com.rtb.orchestrator.plist`
