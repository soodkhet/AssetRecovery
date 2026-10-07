/**
 * Security response headers ของทุกหน้า/ทุก API — ใช้ใน `next.config.ts` (preship audit PS-008)
 *
 * - กันเว็บอื่นฝังหน้าระบบใน iframe (clickjacking หน้าการเงิน/อนุมัติ/จ่ายเงิน) · ใช้ `SAMEORIGIN` ไม่ใช่ `DENY`
 *   เพราะตัวดูไฟล์ของระบบเองฝัง blob URL / signed URL ใน iframe (`file-viewer-modal.tsx`, `document-samples-view.tsx`)
 * - ไม่ตั้ง CSP เต็มรูป — มีแค่ `frame-ancestors` (ตัวที่ browser ใหม่ใช้แทน X-Frame-Options) เพื่อไม่ไปบล็อก
 *   script/รูป/ไฟล์จาก Supabase Storage
 * - HSTS เฉพาะ production (dev เป็น http://localhost — browser ไม่สนใจอยู่แล้ว แต่ไม่ส่งให้ชัด)
 */

export interface SecurityHeader {
  key: string
  value: string
}

export function securityHeaders({ production }: { production: boolean }): SecurityHeader[] {
  const headers: SecurityHeader[] = [
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  ]
  if (production) {
    headers.push({ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' })
  }
  return headers
}
