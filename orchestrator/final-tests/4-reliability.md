# ด่าน 4/4 — ความทนทาน + ข้อมูล + งานเบื้องหลัง

1. **Concurrency:** 2 คนจอง/ขายป้ายเดียวกันพร้อมกัน → สำเร็จคนเดียว (row lock + partial unique) · ทดสอบด้วย transaction จริง
2. **Idempotency:** รัน sync ซ้ำ / worker job ซ้ำ / กดปุ่มซ้ำ → ไม่เกิดข้อมูลซ้ำ (`UNIQUE (partner_id, source_external_id)` + idempotencyKey)
3. **ข้อมูลเสียจากต้นทาง:** normalize ไม่ได้/ขัดแย้ง/ของหายจาก source → เข้า `plate_review_queue` + `sync_job_items` แล้ว pipeline ทำงานต่อ (ห้ามล้ม)
4. **Worker:** claim `FOR UPDATE SKIP LOCKED` · retry/dead-letter · ไม่มี job ค้างซ้อน
5. **Reconciliation (7.1):** รันแล้ว mismatch = 0 · alert ทำงานเมื่อเจอ mismatch
6. **กู้คืน:** ทดสอบว่า migration apply ใหม่ได้สะอาด + seed idempotent

รายงานตาราง `| หัวข้อ | สถานะ | หลักฐาน |` แล้วแก้จุดที่ ❌
