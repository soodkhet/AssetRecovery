import { hasCapability } from '@/lib/auth/permission'
import type { SessionUser } from '@/lib/auth/types'
import { CASE_READ_CAPABILITIES } from '@/lib/cases/permissions'
import { CASE_STATUS_LABEL, caseStatusBadgeGroup } from '@/lib/cases/status-display'
import type { CaseStatusValue } from '@/lib/cases/state-machine'
import { APPROVAL_STEP_CAPABILITIES } from '@/lib/compensation/approval'
import { canViewMenu } from '@/lib/nav/menu-registry'
import { fmtSatangSymbol } from '@/lib/format/money'
import { canViewReportCategory, isExecutiveViewer } from '@/lib/reports/access'
import type { ReportKpi } from '@/lib/reports/payload'
import type { StatusBadgeGroup } from '@/lib/ui/status-badge'

/**
 * แดชบอร์ดหลัก (Phase 6.6 · มติ PO 2026-08-16 — ตาม mockup `dashboard.html` ปรับเข้าข้อมูลจริง)
 * — ชั้น **pure ล้วน ไม่มี I/O**: ตัดสินว่าผู้ใช้คนนี้เห็น widget/คิวงานอะไร และประกอบผลนับให้หน้าจอ
 *
 * ### กติกาที่ห้ามหลุด
 * - หน้านี้ **อ่านอย่างเดียว** ทั้งหน้า — ทุกปุ่มเป็นลิงก์ไปทำงานจริงที่โมดูลต้นทาง (ไม่มี mutation ⇒ ไม่มี audit)
 * - **ห้ามมีสูตรเงินใหม่** — KPI เงินมาจาก endpoint เดิม (E1 `kpi-summary` / การเงิน `dashboard-kpi`) ที่ใช้
 *   pure module ของ `22` อยู่แล้ว · ชั้นนี้นับ "จำนวนรายการค้าง" เท่านั้น
 * - คิวงานแต่ละตัวผูก capability **ชุดเดียวกับ endpoint ต้นทาง** ระดับ `manage` (= คนที่ลงมือทำงานนั้นได้จริง)
 *   และต้องมองเห็นเมนูปลายทางด้วย (ไม่งั้นกดลิงก์แล้วโดนเด้งกลับ)
 * - ผู้ใช้ scope ทีม (ผู้จัดการ/หัวหน้าทีม) เห็นเฉพาะคิวที่ชั้นข้อมูล **กรองตามทีมได้จริง** (`teamScoped`) —
 *   คิวระดับองค์กร (เงินทดรอง/รอบจ่าย/บัญชี) ถูกตัดทิ้งแม้จะถือ capability (กันตัวเลขทั้งองค์กรรั่วให้ระดับทีม)
 */

// ── คิวงาน ("งานรอดำเนินการของฉัน") ─────────────────────────────────────────

export const DASHBOARD_QUEUE_IDS = [
  'case_draft',
  'case_need_info',
  'case_pending_review',
  'case_recycle_review',
  'case_awaiting_assignment',
  'reassign_waiting',
  'compensation_my_step',
  'advance_pending_approval',
  'advance_overdue',
  'payout_in_progress',
  'adjustment_pending',
  'exception_critical_open',
  'bank_unmatched',
  'period_awaiting_lock',
  'asset_pending_intake',
  'lot_in_progress',
  'job_failed',
] as const
export type DashboardQueueId = (typeof DASHBOARD_QUEUE_IDS)[number]

export interface DashboardQueueDef {
  id: DashboardQueueId
  label: string
  /** คำอธิบายใต้ชื่อคิว — บอกว่าต้องทำอะไรต่อ */
  hint: string
  /** ปุ่มลิงก์ไปโมดูลต้นทาง */
  linkLabel: string
  href: string
  /** เมนู/เมนูย่อยของปลายทาง — ผู้ใช้ต้องเห็นเมนูนี้ก่อนจึงแสดงคิว */
  menuId: string
  /** ถือ capability ตัวใดตัวหนึ่งระดับ `manage` = ลงมือทำคิวนี้ได้ */
  anyOf: readonly string[]
  /** ชั้นข้อมูลกรองตามทีมของผู้ใช้ได้ (ใช้ scope helper เดียวกับหน้าต้นทาง) */
  teamScoped: boolean
  tone: StatusBadgeGroup
}

/** ลำดับในอาร์เรย์ = ลำดับบนจอ (ไหลตามวงจรงาน: รับเคส → มอบหมาย → การเงิน → บัญชี → คลัง → ระบบ) */
export const DASHBOARD_QUEUES: readonly DashboardQueueDef[] = [
  {
    id: 'case_draft',
    label: 'เคสร่างที่ยังไม่ส่งพิจารณา',
    hint: 'กรอกข้อมูล/แนบเอกสารให้ครบแล้วส่งพิจารณา',
    linkLabel: 'ไปที่ รับเคส',
    // staging E-040 — เปิดรายการที่กรองสถานะของคิวนี้ไว้แล้ว
    href: '/cases/submit?status=draft',
    menuId: 'cases.submit',
    anyOf: ['record_admin_data'],
    teamScoped: false,
    tone: 'neutral',
  },
  {
    id: 'case_need_info',
    label: 'เคสที่ขอข้อมูลเพิ่ม',
    hint: 'รอข้อมูลเพิ่มเติมจากบริษัทไฟแนนซ์ก่อนพิจารณาต่อ',
    linkLabel: 'ไปที่ รับเคส',
    // staging E-040 — เปิดรายการที่กรองสถานะของคิวนี้ไว้แล้ว
    href: '/cases/submit?status=need_info',
    menuId: 'cases.submit',
    anyOf: ['record_admin_data', 'approve_case'],
    teamScoped: false,
    tone: 'cleared',
  },
  {
    id: 'case_pending_review',
    label: 'เคสรอพิจารณารับ',
    hint: 'ตรวจข้อมูลแล้วตัดสินรับเคส / ไม่รับ / ขอข้อมูลเพิ่ม',
    linkLabel: 'ไปที่ รับเคส',
    // staging E-040 — เปิดรายการที่กรองสถานะของคิวนี้ไว้แล้ว
    href: '/cases/submit?status=pending_review',
    menuId: 'cases.submit',
    anyOf: ['approve_case'],
    teamScoped: false,
    tone: 'pending',
  },
  {
    id: 'case_recycle_review',
    label: 'คำขอรีไซเกิลรออนุมัติ',
    hint: 'เคสปิดไม่สำเร็จที่ขอเปิดติดตามรอบใหม่',
    linkLabel: 'ไปที่ รับเคส',
    // staging E-040 — เปิดรายการที่กรองสถานะของคิวนี้ไว้แล้ว
    href: '/cases/submit?status=pending_recycle_review',
    menuId: 'cases.submit',
    anyOf: ['approve_recycle'],
    teamScoped: true,
    tone: 'pending',
  },
  {
    id: 'case_awaiting_assignment',
    label: 'เคสรอมอบหมายงาน',
    hint: 'รับเคสแล้ว — เลือกพนักงานผู้รับผิดชอบ',
    linkLabel: 'ไปที่ มอบหมายงาน',
    href: '/cases/assign?status=ready_to_assign',
    menuId: 'cases.assign',
    anyOf: ['assign_case'],
    teamScoped: true,
    tone: 'sent',
  },
  {
    id: 'reassign_waiting',
    label: 'คำขอย้ายงานรอผู้รับยินยอม',
    hint: 'ระบบยกเลิกให้อัตโนมัติเมื่อเลยเวลาที่ตั้งไว้',
    linkLabel: 'ไปที่ มอบหมายงาน',
    href: '/cases/assign?status=ready_to_assign',
    menuId: 'cases.assign',
    anyOf: ['assign_case'],
    teamScoped: true,
    tone: 'cleared',
  },
  {
    id: 'compensation_my_step',
    label: 'ค่าตอบแทน/เบิกจ่ายรออนุมัติขั้นของฉัน',
    hint: 'รายการที่เดินมาถึงขั้นอนุมัติของคุณแล้ว',
    linkLabel: 'ไปที่ การเงิน › ค่าตอบแทน',
    href: '/finance?tab=comp',
    menuId: 'finance',
    anyOf: APPROVAL_STEP_CAPABILITIES,
    teamScoped: true,
    tone: 'pending',
  },
  {
    id: 'advance_pending_approval',
    label: 'เงินทดรองรออนุมัติ',
    hint: 'คำขอเบิกเงินทดรองที่ยังไม่มีผู้อนุมัติ',
    linkLabel: 'ไปที่ การเงิน › เงินทดรอง',
    href: '/finance?tab=advances',
    menuId: 'finance',
    anyOf: ['approve_advance'],
    teamScoped: false,
    tone: 'pending',
  },
  {
    id: 'advance_overdue',
    label: 'เงินทดรองเลยกำหนดเคลียร์',
    hint: 'ติดตามให้พนักงานเคลียร์ยอดหรือคืนเงิน',
    linkLabel: 'ไปที่ การเงิน › เงินทดรอง',
    href: '/finance?tab=advances',
    menuId: 'finance',
    anyOf: ['approve_advance'],
    teamScoped: false,
    tone: 'critical',
  },
  {
    id: 'payout_in_progress',
    label: 'รอบจ่ายที่ยังโอนไม่เสร็จ',
    hint: 'รอบจ่ายสถานะร่าง / รอตรวจ / สร้างไฟล์ธนาคารแล้ว',
    linkLabel: 'ไปที่ การเงิน › รอบจ่ายเงิน',
    href: '/finance?tab=payout',
    menuId: 'finance',
    anyOf: ['manage_payout_batch'],
    teamScoped: false,
    tone: 'sent',
  },
  {
    id: 'adjustment_pending',
    label: 'รายการปรับปรุงรออนุมัติ',
    hint: 'ปรับยอดย้อนหลังที่ต้องมีผู้อนุมัติก่อนมีผล',
    linkLabel: 'ไปที่ การเงิน › ปรับปรุง',
    href: '/finance?tab=adjustment',
    menuId: 'finance',
    anyOf: ['approve_adjustment', 'approve_adjustment_locked'],
    teamScoped: false,
    tone: 'pending',
  },
  {
    id: 'exception_critical_open',
    label: 'ปัญหาระดับวิกฤตที่ยังเปิดอยู่',
    hint: 'ต้องแก้หรือได้รับอนุมัติให้ผ่านก่อนส่งงวดบัญชี',
    linkLabel: 'ไปที่ บัญชี › เอกสารไม่ครบ',
    href: '/accounting?tab=documents',
    menuId: 'accounting',
    anyOf: ['manage_exceptions', 'authorize_exception'],
    teamScoped: false,
    tone: 'critical',
  },
  {
    id: 'bank_unmatched',
    label: 'รายการเดินบัญชียังไม่จับคู่',
    hint: 'จับคู่กับเอกสาร หรือปิดรายการพร้อมเหตุผล',
    linkLabel: 'ไปที่ บัญชี › กระทบยอด',
    href: '/accounting?tab=bank',
    menuId: 'accounting',
    anyOf: ['manage_bank_reconciliation'],
    teamScoped: false,
    tone: 'warning',
  },
  {
    id: 'period_awaiting_lock',
    label: 'งวดบัญชีที่ส่งสำนักงานบัญชีแล้ว รอล็อก',
    hint: 'ตรวจคำตอบจากสำนักงานบัญชีแล้วล็อกงวด',
    linkLabel: 'ไปที่ บัญชี › รอบส่งบัญชี',
    href: '/accounting?tab=closing',
    menuId: 'accounting',
    anyOf: ['lock_period'],
    teamScoped: false,
    tone: 'sent',
  },
  {
    id: 'asset_pending_intake',
    label: 'เครื่องรอรับเข้าคลัง',
    hint: 'ตรวจ IMEI และสภาพเครื่องแล้วรับเข้าคลัง',
    linkLabel: 'ไปที่ คลังสินค้า',
    href: '/warehouse',
    menuId: 'warehouse',
    anyOf: ['intake_asset'],
    teamScoped: true,
    tone: 'cleared',
  },
  {
    id: 'lot_in_progress',
    label: 'ใบส่งมอบที่ยังไม่ยืนยัน',
    hint: 'แนบเครื่อง/หลักฐานการส่งมอบให้ครบแล้วยืนยัน',
    linkLabel: 'ไปที่ คลังสินค้า',
    href: '/warehouse',
    menuId: 'warehouse',
    anyOf: ['create_handover_lot', 'confirm_handover_lot'],
    teamScoped: true,
    tone: 'pending',
  },
  {
    id: 'job_failed',
    label: 'งานเบื้องหลังที่ล้มเหลว',
    hint: 'ตรวจสาเหตุแล้วสั่งทำซ้ำ',
    linkLabel: 'ไปที่ งานเบื้องหลัง',
    href: '/settings/jobs',
    menuId: 'settings.jobs',
    anyOf: ['manage_jobs'],
    teamScoped: false,
    tone: 'critical',
  },
]

const QUEUE_BY_ID: ReadonlyMap<DashboardQueueId, DashboardQueueDef> = new Map(
  DASHBOARD_QUEUES.map((def) => [def.id, def]),
)

export function dashboardQueueDef(id: DashboardQueueId): DashboardQueueDef {
  const def = QUEUE_BY_ID.get(id)
  if (def === undefined) throw new RangeError(`dashboardQueueDef: ไม่รู้จักคิว ${id}`)
  return def
}

/** ผู้ใช้ scope ระดับองค์กรหรือไม่ — scope อื่น (ทีม/ตัวเอง/บริษัท) เห็นเฉพาะคิวที่กรองตาม scope ได้ */
function isGlobalScope(user: Pick<SessionUser, 'scope'>): boolean {
  return user.scope.kind === 'global'
}

/**
 * คิวที่ผู้ใช้คนนี้เห็น (ลำดับตาม {@link DASHBOARD_QUEUES})
 *
 * เงื่อนไขครบทั้งสาม: ถือ capability ระดับ `manage` · มองเห็นเมนูปลายทาง · scope รองรับ
 * (scope `self`/`company` ไม่มีคิวระดับทีม — พนักงานภาคสนามทำงานที่ Field Tracker · บริษัทไฟแนนซ์ใช้พอร์ทัล)
 */
export function visibleDashboardQueues(user: SessionUser): DashboardQueueDef[] {
  return DASHBOARD_QUEUES.filter((def) => {
    if (!def.anyOf.some((code) => hasCapability(user, 'manage', code))) return false
    if (!canViewMenu(user, def.menuId)) return false
    if (isGlobalScope(user)) return true
    return def.teamScoped && user.scope.kind === 'team'
  })
}

export interface DashboardQueueItemDto {
  id: DashboardQueueId
  label: string
  hint: string
  linkLabel: string
  href: string
  tone: StatusBadgeGroup
  count: number
  /** จำนวนชนเพดานการดึงข้อมูลของคิวนั้น — แสดงเป็น "N+" */
  capped: boolean
}

/**
 * ประกอบผลนับเข้ากับนิยามคิว — คิวที่ไม่มีผลนับ (ไม่ได้ query) ถูกตัดทิ้ง
 * ไม่จัดเรียงใหม่: หน้าจอเลือกเองว่าจะแสดงเฉพาะคิวที่มีงาน ({@link pendingQueueItems})
 */
export function buildQueueItems(
  defs: readonly DashboardQueueDef[],
  counts: Readonly<Partial<Record<DashboardQueueId, { count: number; capped?: boolean }>>>,
): DashboardQueueItemDto[] {
  return defs.flatMap((def) => {
    const counted = counts[def.id]
    if (counted === undefined) return []
    return [
      {
        id: def.id,
        label: def.label,
        hint: def.hint,
        linkLabel: def.linkLabel,
        href: def.href,
        tone: def.tone,
        count: Math.max(0, counted.count),
        capped: counted.capped === true,
      },
    ]
  })
}

/** คิวที่มีงานค้างจริง (count > 0) — รายการ "งานรอดำเนินการของฉัน" */
export function pendingQueueItems(items: readonly DashboardQueueItemDto[]): DashboardQueueItemDto[] {
  return items.filter((item) => item.count > 0)
}

/** ข้อความจำนวนของคิว — ชนเพดานแสดง "N+" (ไม่บอกตัวเลขที่ไม่ได้นับจริง) */
export function queueCountText(item: Pick<DashboardQueueItemDto, 'count' | 'capped'>): string {
  const text = item.count.toLocaleString('th-TH')
  return item.capped ? `${text}+` : text
}

// ── KPI แถวบน ─────────────────────────────────────────────────────────────────

/**
 * แหล่ง KPI เงินของแถวบน
 * - `executive` = รายงาน KPI ภาพรวม (E1) — ผู้บริหาร/Superadmin
 * - `finance`   = KPI 4 ตัวของหน้าภาพรวมการเงิน — ผู้ถือสิทธิ์ดูแดชบอร์ดการเงิน (การเงิน/บัญชี)
 * - `queues`    = ไม่มีสิทธิ์เห็นตัวเลขเงิน ⇒ ใช้จำนวนคิวงานของตัวเองแทน (ห้ามโชว์เงินให้ role ที่ไม่มีสิทธิ์)
 */
export type DashboardKpiSource = 'executive' | 'finance' | 'queues'

/**
 * สิทธิ์อ่าน KPI การเงิน — ค่าเดียวกับ `REPORT_READ_CAPABILITIES` ของ `GET /api/finance/dashboard-kpi`
 * (ประกาศซ้ำที่นี่เพราะไฟล์ต้นทางเป็นชั้น DB — เทสต์ล็อกให้ตรงกัน)
 */
export const FINANCE_KPI_CAPABILITIES = ['view_finance_dashboard'] as const

export function dashboardKpiSource(user: SessionUser): DashboardKpiSource {
  if (isExecutiveViewer(user)) return 'executive'
  if (FINANCE_KPI_CAPABILITIES.some((code) => hasCapability(user, 'view', code))) return 'finance'
  return 'queues'
}

/** KPI ของรายงาน E1 ที่แสดงบนแดชบอร์ด (คีย์ตรงกับ `buildKpiSummaryReport()`) — ลำดับตามการ์ดของ mockup */
export const EXECUTIVE_DASHBOARD_KPI_KEYS = ['revenue', 'marginPct', 'successPct', 'arOutstanding'] as const

/**
 * การ์ด AR ของผู้บริหาร: บรรทัดย่อย "เกิน 60 วัน" (มติ PO 06/10/2569 U115) — ยอดมาจาก KPI `over60` ของรายงาน F3
 * (อายุหนี้ลูกค้า · ช่วงอายุตามค่าตั้งการเงิน) ตัวเดียวกับหน้ารายงาน **ไม่มีสูตรใหม่** · โชว์เฉพาะผู้ที่เห็นทั้งแถว KPI
 * ผู้บริหารและรายงานหมวด F (API ของ F3 ตรวจสิทธิ์ซ้ำอีกชั้น)
 */
export const AR_AGING_OVER60_KPI_KEY = 'over60'

export function canShowArOver60(user: SessionUser): boolean {
  return dashboardKpiSource(user) === 'executive' && canViewReportCategory(user, 'F')
}

/** แทรกบรรทัด "เกิน 60 วัน ฿x" ลงการ์ด `arOutstanding` — ไม่มีข้อมูล F3 (โหลดไม่ได้/ไม่มีสิทธิ์) ⇒ การ์ดเดิม */
export function withArOver60Hint(kpi: ReportKpi, arAgingKpis: readonly ReportKpi[] | null): ReportKpi {
  if (kpi.key !== 'arOutstanding' || arAgingKpis === null) return kpi
  const over60 = arAgingKpis.find((each) => each.key === AR_AGING_OVER60_KPI_KEY)
  if (over60 === undefined || typeof over60.value !== 'number') return kpi
  const line = `เกิน 60 วัน ${fmtSatangSymbol(over60.value)}`
  return { ...kpi, hint: kpi.hint === undefined ? line : `${line} · ${kpi.hint}` }
}

/** จำนวนการ์ดสูงสุดของแถว KPI แบบคิวงาน */
export const QUEUE_KPI_LIMIT = 4

/**
 * การ์ด KPI แบบคิวงาน — คิวที่มีงานค้างมาก่อน (ลำดับเดิม) แล้วเติมด้วยคิวที่ว่างให้ครบ {@link QUEUE_KPI_LIMIT}
 * (ผู้ใช้เห็นว่า "ไม่มีงานค้าง" เป็นตัวเลข 0 จริง ไม่ใช่การ์ดหาย)
 */
export function queueKpiItems(items: readonly DashboardQueueItemDto[]): DashboardQueueItemDto[] {
  const pending = items.filter((item) => item.count > 0)
  const idle = items.filter((item) => item.count === 0)
  return [...pending, ...idle].slice(0, QUEUE_KPI_LIMIT)
}

// ── เคสตามสถานะ ───────────────────────────────────────────────────────────────

/** สถานะที่แสดงบนกระดาน (ไม่รวม `draft`/`rejected` เหมือน mockup) — 2 ตัวท้ายนับเฉพาะ "เดือนนี้" */
export const CASE_BOARD_STATUSES = [
  'pending_review',
  'need_info',
  'approved',
  'active',
  'pending_recycle_review',
  'closed_success',
  'closed_fail',
] as const satisfies readonly CaseStatusValue[]
export type CaseBoardStatus = (typeof CASE_BOARD_STATUSES)[number]

const MONTHLY_STATUSES: ReadonlySet<CaseBoardStatus> = new Set(['closed_success', 'closed_fail'])

export function isMonthlyBoardStatus(status: CaseBoardStatus): boolean {
  return MONTHLY_STATUSES.has(status)
}

/** เห็นกระดานเคสได้ไหม — สิทธิ์อ่านเคสชุดเดียวกับ `GET /api/cases` + scope องค์กร/ทีมเท่านั้น */
export function canViewCaseBoard(user: SessionUser): boolean {
  if (user.scope.kind !== 'global' && user.scope.kind !== 'team') return false
  return CASE_READ_CAPABILITIES.some((code) => hasCapability(user, 'view', code))
}

/** ปลายทางเมื่อกดแถวของกระดาน — หน้ารายการเคสที่ผู้ใช้เข้าได้ (ไม่มี = แสดงเฉย ๆ ไม่มีลิงก์) */
export function caseBoardHref(user: SessionUser): string | null {
  if (canViewMenu(user, 'cases.submit')) return '/cases/submit'
  // staging E-005 — ผู้จัดการไปแท็บ "เคสทั้งหมดของทีม" (มีเคสที่ปิดแล้ว) ไม่ใช่รายการมอบหมายที่มีแค่ 3 สถานะ
  if (canViewMenu(user, 'cases.assign')) return '/cases/assign?view=team'
  return null
}

export interface CaseBoardRowDto {
  status: CaseBoardStatus
  label: string
  group: StatusBadgeGroup
  count: number
  /** นับเฉพาะเคสที่ปิดในเดือนนี้ */
  monthly: boolean
}

export interface CaseBoardDto {
  rows: CaseBoardRowDto[]
  total: number
  /** ป้ายเดือนปัจจุบัน (พ.ศ.) ของแถวที่นับรายเดือน */
  monthLabel: string
  href: string | null
}

export function buildCaseBoard(input: {
  /** จำนวนเคส**ปัจจุบัน**ต่อสถานะ (ยังไม่ปิด) */
  openCounts: Readonly<Partial<Record<CaseBoardStatus, number>>>
  /** จำนวนเคสที่ปิดในเดือนนี้ */
  closedThisMonth: { success: number; fail: number }
  monthLabel: string
  href: string | null
}): CaseBoardDto {
  const rows = CASE_BOARD_STATUSES.map((status): CaseBoardRowDto => {
    const monthly = isMonthlyBoardStatus(status)
    const count =
      status === 'closed_success'
        ? input.closedThisMonth.success
        : status === 'closed_fail'
          ? input.closedThisMonth.fail
          : (input.openCounts[status] ?? 0)
    const label = CASE_STATUS_LABEL[status]
    return {
      status,
      label: monthly ? `${label} (เดือนนี้)` : label,
      group: caseStatusBadgeGroup(status),
      count: Math.max(0, count),
      monthly,
    }
  })
  return {
    rows,
    total: rows.reduce((sum, row) => sum + row.count, 0),
    monthLabel: input.monthLabel,
    href: input.href,
  }
}

// ── ทางลัด ────────────────────────────────────────────────────────────────────

/** พนักงานภาคสนาม (หรือผู้ถือสิทธิ์ทำงานภาคสนาม) — โชว์การ์ดทางลัดไป Field Tracker */
export function showFieldTrackerShortcut(user: SessionUser): boolean {
  return !user.isSuperadmin && hasCapability(user, 'view', 'perform_field_work')
}

// ── DTO ของ `GET /api/dashboard` ─────────────────────────────────────────────

export interface DashboardOverviewDto {
  kpiSource: DashboardKpiSource
  /** การ์ด AR โชว์บรรทัด "เกิน 60 วัน" ได้ (U115 · {@link canShowArOver60}) */
  arOver60: boolean
  /** ทุกคิวที่ผู้ใช้เห็น (รวมคิวที่เป็น 0) — หน้าจอกรองเองด้วย {@link pendingQueueItems} */
  queues: DashboardQueueItemDto[]
  /** `null` = ไม่มีสิทธิ์เห็นเคส */
  caseBoard: CaseBoardDto | null
  fieldTracker: boolean
  computedAt: string
}
