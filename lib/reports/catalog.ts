/**
 * ทะเบียนรายงานทั้ง 17 ตัวของไฟล์ `96` — **pure ล้วน** ใช้ร่วม FE/BE
 *
 * ที่มาของทุกช่องในตารางนี้ (มีเทสต์อ่านเอกสารจริงมาเทียบตัวต่อตัวที่ `catalog.test.ts`):
 * - `code`/`title` = §6 (หัวข้อของแต่ละรายงาน) · `path` = §9 API Endpoints
 * - `cacheMode` = §8 Caching Strategy (daily / hourly / realtime — ห้ามเดาเอง)
 * - `category` = §10 Permission Matrix (F/O/A/E — ยามอยู่ที่ `lib/reports/access.ts`)
 *
 * ⚠️ Phase 6.1 สร้าง **โครง** เท่านั้น: ตัวคำนวณจริงของแต่ละรายงานเกิดใน 6.2–6.5 โดยลงทะเบียนที่
 * `REPORT_PROVIDERS` (`lib/reports/providers.ts`) — รายงานที่ยังไม่มี provider ถูกทำเครื่องหมาย
 * "ยังไม่เปิดใช้งาน" ทั้งบนหน้าจอและ API (ห้ามคืนตัวเลขปลอมเด็ดขาด)
 */

export const REPORT_CATEGORIES = ['F', 'O', 'A', 'E'] as const
export type ReportCategory = (typeof REPORT_CATEGORIES)[number]

export const REPORT_CATEGORY_LABEL: Readonly<Record<ReportCategory, string>> = {
  F: 'รายงานการเงิน',
  O: 'รายงานงานติดตามทรัพย์',
  A: 'รายงานบัญชี',
  E: 'Executive Dashboard',
}

/** โหมดแคชตาม `96` §8 — `realtime` = ไม่แคชเลย (ข้อมูลน้อย/อ่านจากที่บันทึกไว้แล้ว) */
export const REPORT_CACHE_MODES = ['daily', 'hourly', 'realtime'] as const
export type ReportCacheMode = (typeof REPORT_CACHE_MODES)[number]

export interface ReportDefinition {
  /** รหัสในเอกสาร (`F1`…`E3`) — ใช้ขึ้นต้นชื่อไฟล์ export ด้วย (E13) */
  readonly code: string
  /** slug ที่ใช้บน URL (`/api/reports/:id/export`) = ส่วนท้ายของ path ใน §9 */
  readonly id: string
  readonly title: string
  readonly category: ReportCategory
  readonly cacheMode: ReportCacheMode
  /** endpoint ของรายงานตาม `96` §9 */
  readonly path: string
}

export const REPORT_DEFINITIONS: readonly ReportDefinition[] = [
  // ── หมวด F — รายงานการเงิน (`96` §6-F) ─────────────────────────────────
  {
    code: 'F1',
    id: 'gross-profit',
    title: 'กำไรขั้นต้น',
    category: 'F',
    cacheMode: 'daily',
    path: '/api/reports/finance/gross-profit',
  },
  {
    code: 'F2',
    id: 'revenue-summary',
    title: 'สรุปรายได้',
    category: 'F',
    cacheMode: 'daily',
    path: '/api/reports/finance/revenue-summary',
  },
  {
    code: 'F3',
    id: 'ar-aging',
    title: 'อายุหนี้ลูกค้า',
    category: 'F',
    cacheMode: 'daily',
    path: '/api/reports/finance/ar-aging',
  },
  {
    code: 'F4',
    id: 'compensation',
    title: 'สรุปค่าตอบแทน',
    category: 'F',
    cacheMode: 'realtime',
    path: '/api/reports/finance/compensation',
  },
  {
    code: 'F5',
    id: 'advance-overdue',
    title: 'เงินทดรองค้างเคลียร์',
    category: 'F',
    cacheMode: 'realtime',
    path: '/api/reports/finance/advance-overdue',
  },

  // ── หมวด O — รายงานงานติดตามทรัพย์ (`96` §6-O) ─────────────────────────
  {
    code: 'O1',
    id: 'success-rate',
    title: 'อัตราความสำเร็จ',
    category: 'O',
    cacheMode: 'hourly',
    path: '/api/reports/operations/success-rate',
  },
  {
    code: 'O2',
    id: 'team-performance',
    title: 'ประสิทธิภาพทีม / SLA',
    category: 'O',
    cacheMode: 'hourly',
    path: '/api/reports/operations/team-performance',
  },
  {
    code: 'O3',
    id: 'workload',
    title: 'ปริมาณงานรายพนักงาน',
    category: 'O',
    cacheMode: 'hourly',
    path: '/api/reports/operations/workload',
  },
  {
    code: 'O4',
    id: 'sla-breach',
    title: 'เคสค้างเกิน SLA',
    category: 'O',
    cacheMode: 'hourly',
    path: '/api/reports/operations/sla-breach',
  },
  {
    code: 'O5',
    id: 'warehouse-summary',
    title: 'สรุปคลังสินค้า',
    category: 'O',
    cacheMode: 'hourly',
    path: '/api/reports/operations/warehouse-summary',
  },

  // ── หมวด A — รายงานบัญชี (`96` §6-A) ───────────────────────────────────
  {
    code: 'A1',
    id: 'wht-summary',
    title: 'สรุป WHT รายเดือน',
    category: 'A',
    cacheMode: 'realtime',
    path: '/api/reports/accounting/wht-summary',
  },
  {
    code: 'A2',
    id: 'tax-invoice',
    title: 'สรุปใบกำกับภาษี',
    category: 'A',
    cacheMode: 'realtime',
    path: '/api/reports/accounting/tax-invoice',
  },
  {
    code: 'A3',
    id: 'export-history',
    title: 'สถานะส่งออกชุดข้อมูลบัญชี',
    category: 'A',
    cacheMode: 'realtime',
    path: '/api/reports/accounting/export-history',
  },
  {
    code: 'A4',
    id: 'exception-summary',
    title: 'สรุปข้อยกเว้นรายงวด',
    category: 'A',
    cacheMode: 'realtime',
    path: '/api/reports/accounting/exception-summary',
  },

  // ── หมวด E — Executive Dashboard (`96` §6-E) ───────────────────────────
  {
    code: 'E1',
    id: 'kpi-summary',
    title: 'KPI ภาพรวม',
    category: 'E',
    cacheMode: 'daily',
    path: '/api/reports/executive/kpi-summary',
  },
  {
    code: 'E2',
    id: 'company-scorecard',
    title: 'Scorecard รายบริษัทไฟแนนซ์',
    category: 'E',
    cacheMode: 'daily',
    path: '/api/reports/executive/company-scorecard',
  },
  {
    code: 'E3',
    id: 'team-scorecard',
    title: 'Scorecard รายทีม',
    category: 'E',
    cacheMode: 'daily',
    path: '/api/reports/executive/team-scorecard',
  },
]

const BY_ID: ReadonlyMap<string, ReportDefinition> = new Map(
  REPORT_DEFINITIONS.map((report) => [report.id, report]),
)

/** หา definition จาก slug บน URL — ไม่รู้จัก = `null` (route ต้องตอบ 404 เอง ห้าม throw ที่นี่) */
export function findReport(id: string): ReportDefinition | null {
  return BY_ID.get(id) ?? null
}

export function reportsOfCategory(category: ReportCategory): readonly ReportDefinition[] {
  return REPORT_DEFINITIONS.filter((report) => report.category === category)
}
