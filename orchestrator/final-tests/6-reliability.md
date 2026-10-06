# ด่าน 6/7 — ความทนทาน: idempotency / concurrency / jobs / outbox

> อ่าน `0-common.md` ก่อน (ฐาน `assetrecovery_test7` · รายงาน `uat/report/FINAL-6-reliability.md`)

อ้างอิง `docs/91`, `45`, `37`, `29` §7 + DEC-012/DEC-015 + มติ U9/U35/U49/U65/U120:

1. **Idempotency:** payout `idempotency_key` · job ทุกตัว idempotent + `JOB_DUPLICATE` คืน job เดิม · export/evidence versioned + SHA-256 ห้าม overwrite · event consumer กัน duplicate delivery · job รายวันน้ำมัน/เบี้ยเลี้ยง (DEC-012) รันซ้ำไม่สร้างแถวซ้ำ
2. **Notification outbox (U120/DEC-015):** enqueue ใน tx เดียวกับการเปลี่ยนสถานะ · dispatch ล้ม → retry รอบถัดไปสำเร็จ · drain พร้อมกัน 2 ตัวไม่แจ้งซ้ำ · tx rollback → ไม่มีแถว · การรวมแจ้งเตือน (U49)
3. **Concurrency (ยิงพร้อมกันจริง):** เลขเอกสารทุกชนิดใน `document_number_series` (ใบกำกับ/ใบเสร็จ ห้าม gap) · duplicate `case_ref` · 2 คน confirm lot เดียวกัน · reassign timeout race · advance เบิกซ้อน · ออก 50 ทวิ ซ้ำ · สร้างรอบวางบิลร่างซ้อน (U88) · ล็อกงวดพร้อมสร้างรอบจ่าย (U112)
4. **Transaction rollback:** ทุก `$transaction` หลายขั้น — จำลอง fail กลางทาง ไม่มีขั้นไหนค้าง (lot confirm + letterhead snapshot · payout · ออกเอกสารภาษี + snapshot)
5. **Jobs:** retry/backoff ตามสเปค · job log ตามรอยผู้สั่งงานได้ (system + job id) · dev trigger/asOf (U65) = 404 ใน production · cache รายงานหลาย instance (U9/U35)
6. **Period lock ระหว่าง job:** job คร่อมปิดงวดไม่เขียนทับข้อมูลที่ล็อก
7. **ข้อมูลนำเข้าเสีย:** import CSV/ไฟล์ธนาคาร/ไฟล์ผิดรูปแบบ → error ตาม `24` ไม่ล้มทั้งชุด ไม่เขียนครึ่ง ๆ
8. **Render PDF ล้มไม่ลากระบบ:** โลโก้/ลายเซ็นโหลดไม่ได้ → เอกสารยังออกได้ (เว้นช่อง) · PDF route ไม่ 500 ทั้ง server (บทเรียน BUG-172)
