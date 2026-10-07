/**
 * ค่าที่แสดงบนการ์ด KPI/สรุปยอด — ยังโหลดไม่เสร็จหรือโหลดไม่สำเร็จ (`null`/`undefined`) ⇒ "—"
 * ห้าม default เป็น 0: ผู้ใช้อ่าน "฿0.00 / 0 รายการ" เป็นข้อมูลจริงว่าไม่มียอดค้าง (preship PS-012)
 * `format` = ตัวจัดรูปแบบของหน้านั้น (เช่น `fmtBaht` สำหรับเงิน) — เรียกเฉพาะเมื่อมีค่าจริง
 */

export const KPI_UNAVAILABLE = '—'

export function kpiValue(value: number | null | undefined, format: (value: number) => string = String): string {
  return value === null || value === undefined ? KPI_UNAVAILABLE : format(value)
}
