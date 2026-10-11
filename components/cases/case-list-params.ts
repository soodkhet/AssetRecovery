import { pickPage, pickParam, pickUuid } from '@/components/ui/url-state'
import { THAI_PROVINCES } from '@/lib/address/thai-address'
import { CASE_STATUSES } from '@/lib/cases/state-machine'
import { CASE_SOURCE_CHANNELS } from '@/lib/cases/status-display'

/** ตัวกรองรายการเคสหน้ารับเคส — ผูกกับ URL (preship PS-013) */
export interface CaseListFilters {
  search: string
  status: string
  sourceChannel: string
  financeCompanyId: string
  province: string
}

export const EMPTY_CASE_LIST_FILTERS: CaseListFilters = {
  search: '',
  status: 'all',
  sourceChannel: 'all',
  financeCompanyId: 'all',
  province: 'all',
}

/**
 * อ่านตัวกรอง/หน้าจาก query — ใช้ทั้ง page (server `searchParams`) และ `CasesManager` (URL จริงของ browser ตอน
 * Back กลับมา — preship R6-004) ด้วยกติกาเดียวกัน ⇒ hydrate ไม่ mismatch
 * ตัวเลือกที่มีชุดค่าตายตัว (สถานะ/ช่องทาง/บริษัท/จังหวัด) ค่านอกชุด = "ทั้งหมด" — เดิมส่งต่อให้ API แล้วตาราง error
 * ทั้งที่ dropdown แสดง "ทั้งหมด" (preship R7-010) · API ตรวจ query ซ้ำด้วย Zod เสมอ
 */
export function parseCaseListParams(get: (key: string) => string | null | undefined): {
  filters: CaseListFilters
  page: number
} {
  const text = (key: string, fallback: string) => {
    const value = get(key)
    return value === null || value === undefined || value === '' ? fallback : value.slice(0, 100)
  }
  return {
    filters: {
      search: text('search', ''),
      status: pickParam(get('status') ?? undefined, CASE_STATUSES, 'all'),
      sourceChannel: pickParam(get('source') ?? undefined, CASE_SOURCE_CHANNELS, 'all'),
      financeCompanyId: pickUuid(get('company') ?? undefined) ?? 'all',
      province: pickParam(get('province') ?? undefined, THAI_PROVINCES, 'all'),
    },
    page: pickPage(get('page') ?? undefined),
  }
}

/** ตัวกรองเท่ากันในความหมายของ URL — คำค้นเทียบแบบ trim (URL เก็บค่าที่ trim แล้ว) */
export function sameCaseListFilters(a: CaseListFilters, b: CaseListFilters): boolean {
  return (
    a.search.trim() === b.search.trim() &&
    a.status === b.status &&
    a.sourceChannel === b.sourceChannel &&
    a.financeCompanyId === b.financeCompanyId &&
    a.province === b.province
  )
}

/**
 * ข้อความตอนรายการว่าง — ไม่มีตัวกรอง = "ยังไม่มีเคส" ชวนเริ่มรับเคส · มีตัวกรอง = "ไม่พบตามเงื่อนไข" ชวนล้างตัวกรอง
 * (mytester B-08 — เดิมขึ้น "ลองล้างตัวกรอง" ทั้งที่ยังไม่ได้กรองอะไร)
 */
export function caseListEmptyView(filters: CaseListFilters): { title: string; description: string } {
  if (sameCaseListFilters(filters, EMPTY_CASE_LIST_FILTERS)) {
    return {
      title: 'ยังไม่มีเคส',
      description: 'เริ่มรับเคสด้วยปุ่ม “+ รับเคส (กรอกมือ)” หรือ “Import ไฟล์” ด้านบน',
    }
  }
  return {
    title: 'ไม่พบเคสตามเงื่อนไขที่ค้นหา',
    description: 'ลองล้างตัวกรอง หรือกด “+ รับเคส (กรอกมือ)” เพื่อสร้างเคสใหม่',
  }
}
