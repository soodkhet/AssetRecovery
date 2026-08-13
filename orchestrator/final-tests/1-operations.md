# ด่าน 1/6 — Ops E2E: เคส → มอบหมาย → ภาคสนาม → คลัง

ทดสอบสายงานปฏิบัติการข้ามโมดูลด้วย integration test จริง (DB จาก `docker-compose.dev.yml`) ไม่ใช่แค่อ่านโค้ด — อ้างอิง `docs/38`, `40`, `41`, `44`, `29` §7:

1. **Happy path เต็มสาย:** บริษัทไฟแนนซ์ส่งเคส (ทีละเคส + import) → ตรวจ/อนุมัติ (**snapshot service fee ตอน `approved` ไม่ใช่ตอนสร้าง**) → มอบหมายทีม → เจ้าหน้าที่รับงาน → ลงพื้นที่ → ปิดงาน `closed_success` + หลักฐาน → รับเข้าคลัง → HandoverLot → confirm → ส่งมอบ
2. **Lot confirmed = `$transaction` 4 ขั้น** (assets→handed_over, unlock expenses, audit, tryCreateRevenue) — ทดสอบ **rollback**: ทำให้ขั้นที่ 3 หรือ 4 พัง แล้วยืนยันว่าไม่มีขั้นไหนค้างครึ่งทาง (`44` §17 T11–T13)
3. **Revenue trigger ครบ 8 เคส** (`19` §16): เกิดเมื่อ `expense.approved` **AND** `lot.confirmed` เท่านั้น · เคสไม่มี expense ยังต้องผ่าน warehouse gate (DEC-006/D6) · `closed_fail` **ไม่ผ่านคลังและไม่เกิด revenue** · idempotent ต่อเคส (ทริกซ้ำไม่สร้างซ้ำ)
4. **กฎข้อมูลคลัง:** IMEI **exact match 15 หลัก** (ห้าม fuzzy/trim/ignore dash) · 1 HandoverLot = 1 บริษัทไฟแนนซ์ · lot ที่ confirmed แล้วแก้ไม่ได้
5. **เคสแตกกิ่ง:** reassign 2 แบบ + timeout job · `resubmit_close` → expense เดิมเป็น `superseded` + สร้างใหม่ (ไม่ซ้ำ ไม่หาย) · duplicate `case_ref` ภายใต้ concurrency ต้องกันได้จริง · recycle/tracking_round
6. **เลขเอกสาร:** `LOT-YYYY-XXX` / `DLV-YYYY-XXX` ใช้ปี **พ.ศ.** และไม่ซ้ำภายใต้ concurrency

รายงานตาราง `| หัวข้อ | สถานะ | หลักฐาน (ไฟล์/เทสต์) |` แล้วแก้จุดที่ ❌ พร้อม test ที่พิสูจน์
