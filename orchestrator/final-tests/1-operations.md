# ด่าน 1/7 — Ops E2E: เคส → มอบหมาย → ภาคสนาม → คลัง → ส่งมอบ

> อ่าน `0-common.md` ก่อน (เตรียม worktree · ฐาน `assetrecovery_test2` · มติ U1–U122 = spec · รายงาน `uat/report/FINAL-1-operations.md`)

ทดสอบสายงานปฏิบัติการข้ามโมดูลด้วย integration test จริง — อ้างอิง `docs/38`, `40`, `41`, `44`, `29` §7 + มติที่แตะ ops (U1/U2/U24/U26/U28/U46/U54/U75/U89/U97/U111/U118):

1. **Happy path เต็มสาย:** บริษัทไฟแนนซ์ส่งเคส (ทีละเคส + import · ช่อง "IMEI หรือ Serial" U54) → ตรวจ/อนุมัติ (**snapshot service fee ตอน `approved` ไม่ใช่ตอนสร้าง**) → มอบหมายทีม → เจ้าหน้าที่รับงาน → ลงพื้นที่ (แถวรายวัน/น้ำมัน/เบี้ยเลี้ยงเหมาจาก job รายวัน DEC-012 · ค่าที่พัก + เพดานต่อคืน U89 + "พักร่วมกับ" U28) → ปิดงาน `closed_success` + หลักฐาน (เวลาปิดงาน U26/U46) → รับเข้าคลัง → HandoverLot → confirm → ส่งมอบ
2. **Lot confirmed = `$transaction`** (assets→handed_over, unlock expenses, audit, tryCreateRevenue, **letterhead_snapshot U111**) — ทำให้ขั้นกลาง/ท้ายพัง แล้วยืนยันว่าไม่มีขั้นไหนค้างครึ่งทาง (`44` §17 T11–T13)
3. **Revenue trigger ครบ 8 เคส** (`19` §16): เกิดเมื่อ `expense.approved` **AND** `lot.confirmed` เท่านั้น · เคสไม่มี expense ยังต้องผ่าน warehouse gate (DEC-006/D6) · `closed_fail` **ไม่ผ่านคลังและไม่เกิด revenue** · idempotent ต่อเคส · วันที่รับรู้รายได้ตาม U39
4. **กฎข้อมูลคลัง:** IMEI ผ่าน `parseImei()` จุดเดียว — ตัดได้เฉพาะช่องว่าง/ขีด/จุด แล้วต้องเหลือ 15 หลักพอดี อักขระอื่น/ขาด/เกิน = ปฏิเสธ (U24) ไม่ตรวจ Luhn · 1 HandoverLot = 1 บริษัทไฟแนนซ์ · lot confirmed แก้/แนบเอกสารไม่ได้ · เอกสารล็อตมี hash + ห้ามเขียนทับ
5. **เคสแตกกิ่ง:** reassign 2 แบบ + timeout job (**แจ้งเตือนผ่าน outbox U120 — dispatch ล้มแล้วไม่หาย**) · `resubmit_close` → expense เดิม `superseded` + สร้างใหม่ · duplicate `case_ref` ภายใต้ concurrency · recycle/tracking_round · ค่าที่พัก: ปฏิเสธถาวรจาก `pending_approval`/`needs_revision`/`pending_finance_approval` ต้องมีเหตุผล + ใบรับรองที่ผูกคืนเพดาน (U117/U118) · แถวรายวันอนุมัติบางส่วน (U75)
6. **เลขเอกสาร:** LOT/DLV เดินจาก `document_number_series` (U102) ปี **พ.ศ.** · ไม่ซ้ำ/ไม่ข้ามภายใต้ concurrency · `NUMBERING_FORMAT_LOCKED` หลังออกเลขแล้ว
7. **ระยะเก็บเอกสารลูกหนี้ (U97)** ทำงานตามค่าตั้ง data retention และไม่ลบสิ่งที่ยังผูกกับเอกสารการเงิน
