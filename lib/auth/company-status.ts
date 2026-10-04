import { prisma } from '@/lib/prisma'

/**
 * สถานะบริษัทไฟแนนซ์ของผู้ใช้ฝั่งบริษัท (`10` §9.3 `active`/`suspended`) — ตรวจ **ทุก request** ของพอร์ทัล
 * และตอน login (มติ PO 05/10/2569 O43 D5 · `97` §12 `COMPANY_SUSPENDED`)
 *
 * อ่านจาก DB ตรงทุกครั้ง (ไม่ผ่าน session cache) — ระงับบริษัทแล้วต้องมีผลกับ request ถัดไปทันที (`97` §20)
 * คืน `null` เมื่อผู้ใช้ไม่ได้ผูกบริษัท / บริษัทถูกลบ — ผู้เรียกถือว่า "ไม่ active" (ปิดไว้ก่อน)
 */
export async function loadCompanyStatus(organizationId: string, companyId: string | null): Promise<string | null> {
  if (companyId === null) return null
  const company = await prisma.financeCompany.findFirst({
    where: { id: companyId, organizationId, deletedAt: null },
    select: { status: true },
  })
  return company?.status ?? null
}

export function isCompanyActive(status: string | null): boolean {
  return status === 'active'
}
