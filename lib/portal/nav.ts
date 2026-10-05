import type { PortalSection } from '@/lib/portal/access'
import { portalAlertTone } from '@/lib/portal/finance-ui'
import type { PortalDashboardDto } from '@/lib/portal/serializers'

/**
 * เมนู/การ์ดของหน้าพอร์ทัลตามหมวดที่ผู้ใช้เห็น (`97` §5 Top Bar Nav 6 แท็บ · §7 mobile bottom nav ·
 * มติ PO 05/10/2569 U6/O43) — pure ⇒ test ได้โดยไม่ต้องมี DOM
 *
 * ⚠️ การซ่อนเมนู/การ์ดเป็น UX เท่านั้น — ข้อมูลจริงมาจาก `/api/portal/*` ที่ตรวจสิทธิ์เอง (DEC-002)
 */

export const PORTAL_HOME_PATH = '/portal'

export type PortalNavKey = 'overview' | 'cases' | 'billing' | 'tax-invoices' | 'handover' | 'company'

export interface PortalNavItem {
  key: PortalNavKey
  label: string
  /** ป้ายสั้นของ bottom nav (mobile) */
  shortLabel: string
  href: string
  /** `null` = หน้าแรก (ทุกผู้ใช้พอร์ทัลเปิดได้) */
  section: PortalSection | null
}

/** ลำดับตาม mockup `97-client-portal-mockup.html` NAV (desktop) */
export const PORTAL_NAV_ITEMS: readonly PortalNavItem[] = [
  { key: 'overview', label: 'ภาพรวม', shortLabel: 'ภาพรวม', href: PORTAL_HOME_PATH, section: null },
  { key: 'cases', label: 'เคสของเรา', shortLabel: 'เคส', href: '/portal/cases', section: 'cases' },
  { key: 'billing', label: 'รอบวางบิล / ยอดค้างชำระ', shortLabel: 'วางบิล', href: '/portal/billing', section: 'finance' },
  { key: 'tax-invoices', label: 'ใบกำกับภาษี', shortLabel: 'ใบกำกับ', href: '/portal/tax-invoices', section: 'finance' },
  { key: 'handover', label: 'ใบส่งมอบทรัพย์', shortLabel: 'ส่งมอบ', href: '/portal/handover', section: 'handover' },
  { key: 'company', label: 'ข้อมูลบริษัท', shortLabel: 'บริษัท', href: '/portal/company', section: 'profile' },
]

/** แท็บ desktop ที่ผู้ใช้เห็น — ซ่อนหมวดที่ไม่มีสิทธิ์ (ไม่ใช่ disabled) */
export function portalNavItems(sections: readonly PortalSection[]): PortalNavItem[] {
  return PORTAL_NAV_ITEMS.filter((item) => item.section === null || sections.includes(item.section))
}

export interface PortalBottomNavItem {
  key: 'overview' | 'cases' | 'finance' | 'handover'
  label: string
  href: string
  /** แท็บ desktop ที่นับว่า "อยู่ในหมวดนี้" (ใช้ไฮไลต์) */
  matches: readonly PortalNavKey[]
}

/**
 * Bottom nav ของ mobile (mockup mobile `renderBottomNav()` — ภาพรวม/เคส/การเงิน/ส่งมอบ) · ข้อมูลบริษัท
 * อยู่ในเมนูแฮมเบอร์เกอร์ · "การเงิน" ชี้หน้ารอบวางบิล และไฮไลต์ทั้งวางบิล + ใบกำกับภาษี
 */
export function portalBottomNavItems(sections: readonly PortalSection[]): PortalBottomNavItem[] {
  const items: PortalBottomNavItem[] = [{ key: 'overview', label: 'ภาพรวม', href: PORTAL_HOME_PATH, matches: ['overview'] }]
  if (sections.includes('cases')) items.push({ key: 'cases', label: 'เคส', href: '/portal/cases', matches: ['cases'] })
  if (sections.includes('finance')) {
    items.push({ key: 'finance', label: 'การเงิน', href: '/portal/billing', matches: ['billing', 'tax-invoices'] })
  }
  if (sections.includes('handover')) {
    items.push({ key: 'handover', label: 'ส่งมอบ', href: '/portal/handover', matches: ['handover'] })
  }
  return items
}

/** แท็บที่กำลังเปิดจาก pathname — หน้าแรกต้องตรงเป๊ะ (ไม่งั้นทุกหน้าใต้ `/portal` ถือเป็นภาพรวม) */
export function activePortalNavKey(pathname: string): PortalNavKey | null {
  const normalized = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  if (normalized === PORTAL_HOME_PATH) return 'overview'
  const match = PORTAL_NAV_ITEMS.find(
    (item) => item.href !== PORTAL_HOME_PATH && (normalized === item.href || normalized.startsWith(`${item.href}/`)),
  )
  return match?.key ?? null
}

/** ข้อมูลที่หน้าภาพรวมต้องโหลด — ยิงเฉพาะ endpoint ที่ผู้ใช้มีสิทธิ์ (ไม่ยิงแล้วรอ 403) */
export interface PortalOverviewLoads {
  /** `/api/portal/dashboard` (หมวดเคส) */
  dashboard: boolean
  /** `/api/portal/reports/revenue-summary` + `/api/portal/reports/ar-aging` (หมวดการเงิน) */
  financeReports: boolean
}

export function portalOverviewLoads(sections: readonly PortalSection[]): PortalOverviewLoads {
  return { dashboard: sections.includes('cases'), financeReports: sections.includes('finance') }
}

export type PortalKpiTone = 'slate' | 'emerald' | 'amber' | 'blue' | 'red'

export type PortalKpiCardKey = 'inProgressCases' | 'arOutstanding' | 'latestTaxInvoice' | 'pendingLots'

export type PortalKpiValue =
  | { kind: 'count'; count: number }
  | { kind: 'money'; satang: number }
  | { kind: 'invoice'; invoiceNumber: string; issueDate: string; totalSatang: number }
  | { kind: 'none' }

export interface PortalKpiCardModel {
  key: PortalKpiCardKey
  label: string
  hint: string
  tone: PortalKpiTone
  href: string
  value: PortalKpiValue
}

/**
 * การ์ด KPI 4 ใบของ `97` §5 — **แสดงเฉพาะการ์ดที่ API ส่งคีย์มา** (การ์ดของหมวดที่ไม่มีสิทธิ์ไม่มีคีย์)
 * · `latestTaxInvoice: null` (มีสิทธิ์แต่ยังไม่มีใบ) ยังแสดงการ์ดเป็น "—"
 */
export function portalKpiCards(dto: PortalDashboardDto): PortalKpiCardModel[] {
  const cards: PortalKpiCardModel[] = []
  if (dto.inProgressCases !== undefined) {
    cards.push({
      key: 'inProgressCases',
      label: 'เคสกำลังดำเนินการ',
      hint: 'อยู่ระหว่างตรวจสอบและติดตาม',
      tone: 'amber',
      href: '/portal/cases',
      value: { kind: 'count', count: dto.inProgressCases.count },
    })
  }
  if (dto.arOutstanding !== undefined) {
    cards.push({
      key: 'arOutstanding',
      label: 'ยอดค้างชำระรวม',
      hint: 'ทุกรอบวางบิลที่ยังชำระไม่ครบ',
      // สีตามค่า (BUG-149) — ตัวเดียวกับการ์ดในหน้าวางบิล
      tone: portalAlertTone(dto.arOutstanding.outstandingSatang),
      href: '/portal/billing',
      value: { kind: 'money', satang: dto.arOutstanding.outstandingSatang },
    })
  }
  if (dto.latestTaxInvoice !== undefined) {
    const invoice = dto.latestTaxInvoice
    cards.push({
      key: 'latestTaxInvoice',
      label: 'ใบกำกับภาษีล่าสุด',
      hint: invoice === null ? 'ยังไม่มีใบกำกับภาษี' : 'วันที่ออกเอกสาร',
      tone: 'blue',
      href: '/portal/tax-invoices',
      value:
        invoice === null
          ? { kind: 'none' }
          : { kind: 'invoice', invoiceNumber: invoice.invoiceNumber, issueDate: invoice.issueDate, totalSatang: invoice.totalSatang },
    })
  }
  if (dto.pendingLots !== undefined) {
    cards.push({
      key: 'pendingLots',
      label: 'ล็อตรอส่งมอบ',
      hint: 'ยังไม่ยืนยันส่งมอบสำเร็จ',
      tone: 'emerald',
      href: '/portal/handover',
      value: { kind: 'count', count: dto.pendingLots.count },
    })
  }
  return cards
}

/** กราฟ 6 เดือนว่างจริง = ทุกเดือนไม่มีทั้งยอดและเคส (ไม่วาดแท่งศูนย์ทั้งแถวให้ดูเหมือนมีข้อมูล) */
export function revenueSummaryIsEmpty(months: readonly { revenueSatang: number; caseCount: number }[]): boolean {
  return months.every((month) => month.revenueSatang === 0 && month.caseCount === 0)
}
