/** ip/user-agent ของ request สำหรับ audit log (`90` §13 — trace กลับผู้สั่งงานได้) */
export interface RequestMeta {
  ipAddress: string | null
  userAgent: string | null
}

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/
const IPV6 = /^[0-9a-fA-F:]+$/

/** `audit_logs.ip_address` เป็น INET — ค่าที่ไม่ใช่ IP ต้องกลายเป็น NULL ไม่งั้น insert ล้ม */
export function normalizeIpAddress(raw: string | null): string | null {
  if (!raw) return null
  const first = raw.split(',')[0]?.trim() ?? ''
  if (first.length === 0) return null
  if (IPV4.test(first)) {
    return first.split('.').every((part) => Number(part) <= 255) ? first : null
  }
  if (first.includes(':') && IPV6.test(first)) return first
  return null
}

/**
 * IP ของผู้ใช้ — เรียงจาก header ที่ client ปลอมไม่ได้ก่อน (R2-016)
 * Vercel เขียน `x-vercel-forwarded-for` / `x-real-ip` เองและไม่ส่งต่อค่าที่ client ใส่มา · `x-forwarded-for`
 * ใช้เป็นทางสุดท้าย (dev/proxy อื่น) — ค่านี้ใช้ทั้งใน audit และเพดาน login ราย IP จึงห้ามเชื่อค่าที่ปลอมได้ก่อน
 */
export function getRequestMeta(request: Request): RequestMeta {
  const forwarded =
    request.headers.get('x-vercel-forwarded-for') ?? request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')
  return {
    ipAddress: normalizeIpAddress(forwarded),
    userAgent: request.headers.get('user-agent'),
  }
}
