# สั่งงาน AssetRecovery Orchestrator จากมือถือ (Mac รัน + Tailscale)

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
tailscale status       # เห็นชื่อเครื่อง (MagicDNS) เช่น  zeegames-macbook-air
```
จำเลข `100.x.x.x` หรือชื่อเครื่องไว้

### 3. ตั้ง token ของ dashboard (แนะนำตั้งเอง)
```bash
cd /Users/zeegamemsg/AssetRecovery
echo "ตั้งรหัสอะไรก็ได้ที่เดายาก" > orchestrator/.token   # หรือปล่อยให้ server generate เองครั้งแรก
```
> ถ้าไม่ตั้ง server จะสุ่มให้เองครั้งแรกแล้วพิมพ์ token ออกมาตอนบูต (ดูใน log)

### 4. ให้ server รันเองตอนเปิดเครื่อง (launchd)
```bash
cp orchestrator/scripts/com.assetrecovery.orchestrator.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.assetrecovery.orchestrator.plist
tail -f orchestrator/logs/service.log     # ดูว่าขึ้น dashboard แล้ว + เห็น token
```
> `start.sh` ใช้ `caffeinate -is` กัน Mac หลับระหว่าง server รัน — ถ้าไม่อยากกันหลับถาวร ให้รัน server เองเฉพาะตอนต้องการแทน (ข้อล่าง)

**หรือรันมือ (ไม่ใช้ launchd):**
```bash
cd /Users/zeegamemsg/AssetRecovery
set -a; . ./.env.local; set +a
caffeinate -is node orchestrator/server.mjs
```
> โปรเจกต์นี้เก็บค่าที่ `.env.local` (ตามแบบ Next.js) — `start.sh` โหลดให้ทั้ง `.env` และ `.env.local` แล้ว

---

## 5. แจ้งเตือนมือถือผ่าน ntfy (ตัวเลือก แต่แนะนำ)

ตั้งใน `.env.local` (ไฟล์นี้ไม่ถูก commit):
```bash
RTB_NTFY_TOPIC=assetrecovery-<สุ่มยาว ๆ เดาไม่ได้>   # ชื่อ topic = รหัสผ่านโดยพฤตินัย
RTB_API_BASE=http://<ชื่อเครื่อง-หรือ-100.x.x.x>:4174  # ทำให้ปุ่มบนการแจ้งเตือนกดสั่งงานได้
```
แล้ว **restart server** · ทดสอบว่าเข้ามือถือจริง: `node orchestrator/orchestrate.mjs notify-test`

- ลงแอป **ntfy** บนมือถือ → Subscribe topic ชื่อเดียวกันเป๊ะ
- ได้อะไรบ้าง: งานเสร็จ/verify แดง/มีคำถามรอตัดสินใจ → เด้งเข้ามือถือ พร้อมปุ่ม **ตัวเลือกคำตอบ / ✓ Approve / เปิด Dashboard** (สูงสุด 3 ปุ่ม)
- ⚠️ **ntfy.sh เป็น public broker** — ใครรู้ชื่อ topic ก็อ่านข้อความได้ และ payload ของปุ่มมี dashboard token อยู่ด้วย ⇒ ตั้งชื่อ topic ให้เดาไม่ได้ · ถ้าต้องการแน่นหนากว่านี้ให้ใช้ ntfy ที่มี auth หรือ self-host แล้วตั้ง `RTB_NTFY_SERVER`
- ปิดแจ้งเตือน: ลบ `RTB_NTFY_TOPIC` ออกแล้ว restart

---

## ใช้งานประจำวัน (จากมือถือ)

1. เช็คว่า Mac เปิดอยู่ + Tailscale connected + server รัน
2. บนมือถือเปิดเบราว์เซอร์ไปที่ (ใส่ token ครั้งแรกครั้งเดียว จากนั้นจำ cookie):
   ```
   http://<ชื่อเครื่อง-หรือ-100.x.x.x>:4174/?token=<TOKEN>
   ```
   เช่น `http://zeegames-macbook-air:4174/?token=abc123...`
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
- **`pnpm test` แดงเพราะต่อ DB ไม่ได้** → docker `assetrecovery-postgres-dev` ต้องรัน + `.env.local` โหลดถูก
- **อยากหยุด service** → `launchctl unload ~/Library/LaunchAgents/com.assetrecovery.orchestrator.plist`
