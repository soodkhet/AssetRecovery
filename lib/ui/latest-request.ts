/**
 * สถานะ "กำลังโหลด" ของตารางแบบ **อนุมานจากคำขอ** — ตารางกำลังโหลดเมื่อผลที่แสดงอยู่ไม่ใช่ผลของคำขอปัจจุบัน
 *
 * แทนการตั้ง `setLoading(true)` เองก่อนเปลี่ยนตัวกรองแล้วหวังให้ effect โหลดใหม่ — ถ้าค่าไม่เปลี่ยนจริง
 * หรือโหลดซ้ำจากหลายทางพร้อมกัน (โหลดใหม่หลังบันทึก + โหลดใหม่อัตโนมัติเมื่องานนำเข้าจบ) ตารางจะค้าง
 * "กำลังโหลดข้อมูล..." ทั้งที่ข้อมูลมาแล้ว (mytester2 A2-02) · คีย์ = ทุกค่าที่กำหนดผลของคำขอ + ตัวนับโหลดซ้ำ
 */
export function listRequestKey(parts: readonly (string | number | null)[]): string {
  return JSON.stringify(parts)
}

/** ผลที่แสดงอยู่ (`loadedKey`) ยังไม่ใช่ของคำขอปัจจุบัน ⇒ กำลังโหลด */
export function isAwaitingRequest(loadedKey: string | null, requestKey: string): boolean {
  return loadedKey !== requestKey
}
