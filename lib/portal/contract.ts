import type { PortalSection } from '@/lib/portal/access'

/**
 * Registry ของ `/api/portal/*` — **SoT ฝั่งโค้ด** ของตาราง `97` §17 (15 endpoint · GET เท่านั้น ·
 * มติ PO 05/10/2569 O43 D6 · U13 +2) · test เทียบกับตารางใน spec ทุกแถว
 *
 * `capabilities` = ชุด capability ที่ต้องมีครบ (ตรงคอลัมน์ Capability ของ spec) ·
 * `download` = ต้องมี `portal_download` เพิ่ม · `dto` = ชื่อ DTO ที่ route คืน (ดู `lib/portal/serializers.ts`)
 */
export type PortalDtoName =
  | 'PortalDashboardDto'
  | 'PortalCaseListItemDto[]'
  | 'PortalCaseDetailDto'
  | 'PortalBillingBatchDto[]'
  | 'PortalTaxInvoiceDto[]'
  | 'PortalLotListItemDto[]'
  | 'PortalLotDetailDto'
  | 'PortalCompanyProfileDto'
  | 'PortalRevenueSummaryDto'
  | 'PortalArAgingDto'
  | 'file:pdf'
  | 'file:image'
  /** ไฟล์ที่ผู้ใช้ภายในแนบ (PDF หรือรูป) */
  | 'file:file'

export interface PortalEndpoint {
  method: 'GET'
  path: string
  section: PortalSection
  capabilities: readonly string[]
  download: boolean
  dto: PortalDtoName
}

export const PORTAL_ENDPOINTS: readonly PortalEndpoint[] = [
  { method: 'GET', path: '/api/portal/dashboard', section: 'cases', capabilities: ['portal_cases'], download: false, dto: 'PortalDashboardDto' },
  { method: 'GET', path: '/api/portal/cases', section: 'cases', capabilities: ['portal_cases'], download: false, dto: 'PortalCaseListItemDto[]' },
  { method: 'GET', path: '/api/portal/cases/:id', section: 'cases', capabilities: ['portal_cases'], download: false, dto: 'PortalCaseDetailDto' },
  { method: 'GET', path: '/api/portal/billing-batches', section: 'finance', capabilities: ['portal_finance'], download: false, dto: 'PortalBillingBatchDto[]' },
  { method: 'GET', path: '/api/portal/tax-invoices', section: 'finance', capabilities: ['portal_finance'], download: false, dto: 'PortalTaxInvoiceDto[]' },
  { method: 'GET', path: '/api/portal/tax-invoices/:id/download', section: 'finance', capabilities: ['portal_finance', 'portal_download'], download: true, dto: 'file:pdf' },
  { method: 'GET', path: '/api/portal/handover-lots', section: 'handover', capabilities: ['portal_handover'], download: false, dto: 'PortalLotListItemDto[]' },
  { method: 'GET', path: '/api/portal/handover-lots/:id/download', section: 'handover', capabilities: ['portal_handover', 'portal_download'], download: true, dto: 'file:pdf' },
  { method: 'GET', path: '/api/portal/reports/revenue-summary', section: 'finance', capabilities: ['portal_finance'], download: false, dto: 'PortalRevenueSummaryDto' },
  { method: 'GET', path: '/api/portal/reports/ar-aging', section: 'finance', capabilities: ['portal_finance'], download: false, dto: 'PortalArAgingDto' },
  { method: 'GET', path: '/api/portal/company-profile', section: 'profile', capabilities: ['portal_profile'], download: false, dto: 'PortalCompanyProfileDto' },
  { method: 'GET', path: '/api/portal/handover-lots/:id', section: 'handover', capabilities: ['portal_handover'], download: false, dto: 'PortalLotDetailDto' },
  { method: 'GET', path: '/api/portal/assets/:id/photos/:index', section: 'handover', capabilities: ['portal_handover', 'portal_download'], download: true, dto: 'file:image' },
  // มติ PO 05/10/2569 U13 — ใบส่งมอบ PDF จากระบบ + หลักฐานการจัดส่ง
  { method: 'GET', path: '/api/portal/handover-lots/:id/delivery-note', section: 'handover', capabilities: ['portal_handover', 'portal_download'], download: true, dto: 'file:pdf' },
  { method: 'GET', path: '/api/portal/handover-lots/:id/delivery-proof', section: 'handover', capabilities: ['portal_handover', 'portal_download'], download: true, dto: 'file:file' },
]

/** หา endpoint จาก path pattern (เช่น `/api/portal/cases/:id`) */
export function portalEndpointOf(path: string): PortalEndpoint | undefined {
  return PORTAL_ENDPOINTS.find((endpoint) => endpoint.path === path)
}
