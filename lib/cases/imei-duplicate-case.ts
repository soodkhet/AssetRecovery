import type { CaseStatus } from '@/lib/generated/prisma/enums'
import { isCompanySideViewer } from '@/lib/auth/scope'
import type { SessionUser } from '@/lib/auth/types'
import { prisma } from '@/lib/prisma'

/**
 * มติชั่วคราว M1 (mytester B-03 · 11/10/2569 — รอ PO ยืนยัน): IMEI เดียวกันอยู่ในเคสอื่นที่ยังดำเนินการอยู่
 * (รวมเคสของบริษัทไฟแนนซ์อื่น) ⇒ **เตือน ไม่บล็อก** ตอนบันทึก/ส่งตรวจ/เปิดดู พร้อมบอกเลขเคสอื่น
 *
 * - เป็นข้อมูลประกอบใน `data` (ช่อง `activeCaseImeiWarning` ของ DTO) ไม่ใช่ error code — รายการ warning code ล็อกไว้ (Rule 04)
 * - ผู้ใช้ฝั่งบริษัทไฟแนนซ์เห็นเฉพาะเคสของบริษัทตัวเอง — ไม่ leak ว่ามีบริษัทอื่นส่งเครื่องนี้มา
 * - "ยังดำเนินการอยู่" = ส่งเข้าระบบแล้วและยังไม่ปิด (ไม่นับร่าง/ไม่รับเคส/ปิดแล้ว) — นิยามเดียวกับเคสค้างของรายงาน
 */
export const ACTIVE_CASE_IMEI_STATUSES: readonly CaseStatus[] = [
  'pending_review',
  'need_info',
  'approved',
  'active',
  'pending_recycle_review',
]

export interface ImeiDuplicateCaseHit {
  caseRef: string
  trackingRound: number
  companyName: string
  sameCompany: boolean
}

const MAX_LISTED = 5

/** ข้อความเตือน (pure) — `null` = ไม่ชน */
export function activeCaseImeiWarningMessage(hits: readonly ImeiDuplicateCaseHit[]): string | null {
  if (hits.length === 0) return null
  const listed = hits.slice(0, MAX_LISTED).map((hit) => {
    const round = hit.trackingRound > 1 ? ` รอบ ${hit.trackingRound}` : ''
    return hit.sameCompany ? `${hit.caseRef}${round}` : `${hit.caseRef}${round} (${hit.companyName})`
  })
  const more = hits.length > MAX_LISTED ? ` และอีก ${hits.length - MAX_LISTED} เคส` : ''
  return `IMEI นี้ตรงกับเคสอื่นที่ยังดำเนินการอยู่: ${listed.join(', ')}${more} — บันทึก/ส่งเคสได้ แต่โปรดตรวจสอบว่าไม่ใช่เครื่องเดียวกันที่ถูกส่งติดตามซ้ำ`
}

/** เคสอื่นที่ยังดำเนินการอยู่และมี IMEI เดียวกัน — ฝั่งบริษัทไฟแนนซ์กรองเฉพาะบริษัทตัวเอง */
export async function findActiveCasesWithImei(
  viewer: SessionUser,
  imei: string,
  input: { excludeCaseId: string; financeCompanyId: string },
): Promise<ImeiDuplicateCaseHit[]> {
  const companySide = isCompanySideViewer(viewer)
  const rows = await prisma.case.findMany({
    where: {
      organizationId: viewer.organizationId,
      imei,
      id: { not: input.excludeCaseId },
      deletedAt: null,
      status: { in: [...ACTIVE_CASE_IMEI_STATUSES] },
      ...(companySide ? { companyId: input.financeCompanyId } : {}),
    },
    select: { caseRef: true, trackingRound: true, companyId: true, company: { select: { name: true } } },
    orderBy: [{ createdAt: 'asc' }],
    take: 20,
  })
  return rows.map((row) => ({
    caseRef: row.caseRef,
    trackingRound: row.trackingRound,
    companyName: row.company.name,
    sameCompany: row.companyId === input.financeCompanyId,
  }))
}

export async function activeCaseImeiWarning(
  viewer: SessionUser,
  imei: string | null,
  input: { excludeCaseId: string; financeCompanyId: string },
): Promise<string | null> {
  if (imei === null) return null
  return activeCaseImeiWarningMessage(await findActiveCasesWithImei(viewer, imei, input))
}
