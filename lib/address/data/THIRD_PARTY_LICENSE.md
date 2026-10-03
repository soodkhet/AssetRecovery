# Third-party data license — `thai-postal.json`

| รายการ | ค่า |
|---|---|
| ไฟล์ในระบบ | `lib/address/data/thai-postal.json` (สร้างด้วย `scripts/build-thai-postal-data.ts`) |
| แหล่งข้อมูล | [kongvut/thai-province-data](https://github.com/kongvut/thai-province-data) — ไฟล์ `province_with_district_and_sub_district.json` |
| License | MIT (ข้อความเต็มด้านล่าง) |
| วันที่ดาวน์โหลด | 03/10/2569 |
| อนุมัติโดย | มติ PO 03/10/2569 (UAT Q19, BUG-036) |
| ขอบเขตที่ใช้ | ชื่อจังหวัด/อำเภอ/ตำบล (ภาษาไทย ตัดคำนำหน้า) + รหัสไปรษณีย์ — 77 จังหวัด · 966 รหัส · 7,436 ตำบล |
| การแปลง | จัดกลุ่มใหม่เป็น `รหัส → [จังหวัด, อำเภอ, ตำบล[]][]` — ไม่ได้แก้ไขเนื้อหาชื่อ |

สร้างซ้ำ: `pnpm tsx scripts/build-thai-postal-data.ts <path>/province_with_district_and_sub_district.json`

---

MIT License

Copyright (c) 2025 Kongvut Sangkla

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
