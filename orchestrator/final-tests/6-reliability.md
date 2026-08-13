# ด่าน 6/6 — ความทนทาน: idempotency / concurrency / jobs

อ้างอิง `docs/91`, `45`, `37`, `29` §7:

1. **Idempotency ทุกจุดที่สเปคระบุ:**
   - payout `idempotency_key` — ยิงซ้ำได้ batch เดิม ไม่เกิดการโอนซ้ำ (`17` §6.3)
   - background job ทุกตัว idempotent · เรียกซ้ำได้ `JOB_DUPLICATE` คืน job เดิม (`91`)
   - export/evidence versioned + SHA-256 **ห้าม overwrite** (`37`)
   - event consumer กัน duplicate delivery ได้จริง
2. **Concurrency (ทดสอบด้วยการยิงพร้อมกันจริง ไม่ใช่ทีละครั้ง):**
   - เลขที่ใบกำกับภาษี — ห้าม gap ห้ามซ้ำ (`31`)
   - duplicate `case_ref` ภายใต้ concurrency (`38`)
   - 2 คน confirm lot เดียวกันพร้อมกัน → สำเร็จคนเดียว ไม่มี state ค้างครึ่ง (`44` §11)
   - reassign timeout race (`40`)
   - advance เบิกซ้อนพร้อมกัน → partial unique index ต้องกันได้
3. **Transaction rollback:** ทุกจุดที่เป็น `$transaction` หลายขั้น — จำลอง fail กลางทางแล้วยืนยันว่าไม่มีขั้นไหนค้าง
4. **Jobs:** ทุก handler มี retry/backoff ตามสเปค · job log ตามรอยกลับผู้สั่งงานได้ (job actor = system + job id) · dev trigger ต้อง 404 ใน production
5. **Period lock ระหว่าง job:** job ที่รันคร่อมช่วงปิดงวดต้องไม่เขียนทับข้อมูลที่ล็อกแล้ว
6. **ข้อมูลนำเข้าเสีย:** import CSV/ไฟล์ผิดรูปแบบ → error ชัดเจนตาม `24` ไม่ทำ pipeline ล้มทั้งชุด และไม่เขียนข้อมูลครึ่ง ๆ กลาง ๆ

รายงานตาราง `| หัวข้อ | สถานะ | หลักฐาน (ไฟล์/เทสต์) |` แล้วแก้จุดที่ ❌ พร้อม test ที่พิสูจน์
