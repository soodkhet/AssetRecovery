# ด่าน 3/6 — บัญชี: ปิดงวด / ภาษี / WHT / Export pack

อ้างอิง `docs/30`–`37`, `28`, `13`, `29` · **Hybrid Accounting Boundary**: ระบบ*เตรียมข้อมูล*เท่านั้น — ห้ามลง GL เอง ห้ามยื่นภาษีเอง:

1. **ปิดงวด + lock:** readiness check ครบก่อนปิดได้ · หลัง lock ทุก write ตรงต้องโดน `PERIOD_LOCKED_DIRECT_EDIT` **ทุกกรณี** (รวม Superadmin) → ต้องผ่าน Adjustment + Executive เท่านั้น (`30`, `20`, `13` §6.11)
2. **ใบกำกับภาษี:** เลขที่ **ห้าม gap** ภายใต้ concurrency (ยิงพร้อมกันหลาย request แล้วเลขต้องเรียงไม่ข้าม ไม่ซ้ำ) · cancelled ห้ามลบ/reverse ต้องคงแถวไว้ (`31`, `02` §13)
3. **WHT (ใบ 50 ทวิ):** ยอดรวมตรงกับ payout จริง · **cancelled ไม่นับยอด** (`33`) · PDF ออกได้และเลขที่ไม่ชน
4. **Exception + Document Checklist:** critical open ค้างอยู่ → **บล็อกการ export** (`34`/`37`) ทดสอบว่าบล็อกจริง
5. **Bank Reconciliation:** trigger 2 ทาง (`31`/`17`/`19`) · `ALREADY_MATCHED` / `DUPLICATE_PAYMENT_FILE` เป็น warning ไม่ block · ที่เหลือ reject
6. **Accounting Pack Export:** 8 ไฟล์ครบตามสเปค เทียบกับ `reference/samples/` ทีละคอลัมน์ · **versioned + SHA-256 ห้าม overwrite** — export ซ้ำต้องได้ version ใหม่ ไฟล์เดิมยังอยู่ · `export_records` ลบไม่ได้
7. **PDF ทุกใบ:** ตัวเลขตรง DB · วันที่เป็น **พ.ศ.** · ข้อมูลบริษัท/เลขผู้เสียภาษีมาจาก settings ไม่ใช่ค่า dummy

รายงานตาราง `| หัวข้อ | สถานะ | หลักฐาน (ไฟล์/เทสต์) |` แล้วแก้จุดที่ ❌ พร้อม test ที่พิสูจน์
