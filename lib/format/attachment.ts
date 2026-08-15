/**
 * header ของไฟล์ที่ให้ดาวน์โหลด — **pure ล้วน** ใช้ร่วมทุก endpoint ที่ส่งไฟล์ (PDF/Excel/ไฟล์โอน)
 *
 * ชื่อไฟล์ของระบบเป็นภาษาไทยได้ (เลขที่เอกสาร/ชื่อรอบจ่าย) ⇒ ต้องส่งทั้ง `filename` แบบ ASCII
 * (fallback ของ client เก่า) และ `filename*` แบบ RFC 5987 ไม่งั้นเบราว์เซอร์บางตัวได้ชื่อไฟล์เพี้ยน
 */
export function attachmentHeader(fileName: string): string {
  return `attachment; filename="${fileName.replace(/[^\w.\-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}
