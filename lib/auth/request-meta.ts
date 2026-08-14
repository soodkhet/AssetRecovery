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

export function getRequestMeta(request: Request): RequestMeta {
  const forwarded = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip')
  return {
    ipAddress: normalizeIpAddress(forwarded),
    userAgent: request.headers.get('user-agent'),
  }
}
