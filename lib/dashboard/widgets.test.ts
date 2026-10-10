import { describe, expect, it } from 'vitest'
import { ROLE_USERS, roleUser } from '@/lib/dashboard/role-fixtures.test-helper'
import {
  buildCaseBoard,
  buildQueueItems,
  canShowArOver60,
  withArOver60Hint,
  canViewCaseBoard,
  caseBoardHref,
  CASE_BOARD_STATUSES,
  DASHBOARD_QUEUE_IDS,
  DASHBOARD_QUEUES,
  dashboardKpiSource,
  dashboardQueueDef,
  FINANCE_KPI_CAPABILITIES,
  pendingQueueItems,
  queueCountText,
  queueKpiItems,
  showFieldTrackerShortcut,
  visibleDashboardQueues,
  type DashboardQueueItemDto,
} from '@/lib/dashboard/widgets'
import { APPROVAL_STEP_CAPABILITIES } from '@/lib/compensation/approval'
import { REPORT_READ_CAPABILITIES } from '@/lib/reports/queries'
import { canViewMenu } from '@/lib/nav/menu-registry'
import { TEAM_MANAGER_ROLE_NAME } from '@/lib/auth/constants'

/**
 * แดชบอร์ดหลัก (Phase 6.6) — ชั้น pure: role → widget/คิวงาน
 * ผู้ใช้ทดสอบใช้ capability จาก matrix ค่าเริ่มต้นจริง (ดู `role-fixtures.test-helper.ts`)
 */

const idsOf = (user: ReturnType<(typeof ROLE_USERS)[keyof typeof ROLE_USERS]>) =>
  visibleDashboardQueues(user).map((def) => def.id)

describe('นิยามคิวงาน', () => {
  it('ทุก id มีนิยามครบหนึ่งต่อหนึ่ง และลิงก์เป็น path ภายใน', () => {
    expect(DASHBOARD_QUEUES.map((def) => def.id)).toEqual([...DASHBOARD_QUEUE_IDS])
    for (const def of DASHBOARD_QUEUES) {
      expect(def.href.startsWith('/')).toBe(true)
      expect(def.anyOf.length).toBeGreaterThan(0)
      expect(dashboardQueueDef(def.id)).toBe(def)
    }
  })

  it('สิทธิ์ KPI การเงินตรงกับ endpoint ต้นทาง', () => {
    expect([...FINANCE_KPI_CAPABILITIES]).toEqual([...REPORT_READ_CAPABILITIES])
  })

  it('คิวค่าตอบแทนใช้ capability ชุดเดียวกับ GET /api/compensation', () => {
    expect(dashboardQueueDef('compensation_my_step').anyOf).toEqual(APPROVAL_STEP_CAPABILITIES)
  })
})

describe('role → widget (matrix ค่าเริ่มต้น)', () => {
  it('Superadmin เห็นทุกคิว + KPI ผู้บริหาร + กระดานเคส', () => {
    const user = ROLE_USERS.superadmin()
    expect(idsOf(user)).toEqual([...DASHBOARD_QUEUE_IDS])
    expect(dashboardKpiSource(user)).toBe('executive')
    expect(canViewCaseBoard(user)).toBe(true)
    expect(showFieldTrackerShortcut(user)).toBe(false)
  })

  it('บริหาร — KPI ผู้บริหาร + คิวที่ตัดสินใจเอง (อนุมัติขั้นสูง/ปรับปรุง/ปัญหาวิกฤต)', () => {
    const user = ROLE_USERS.executive()
    expect(dashboardKpiSource(user)).toBe('executive')
    expect(idsOf(user)).toEqual(['compensation_my_step', 'adjustment_pending', 'exception_critical_open'])
  })

  it('การเงิน — KPI การเงิน + คิวอนุมัติ/เงินทดรอง/รอบจ่าย/ปรับปรุง ไม่มีคิวรับเคส/คลัง', () => {
    const user = ROLE_USERS.finance()
    expect(dashboardKpiSource(user)).toBe('finance')
    expect(idsOf(user)).toEqual([
      'compensation_my_step',
      'advance_pending_approval',
      'advance_overdue',
      'payout_in_progress',
      'adjustment_pending',
    ])
  })

  it('บัญชี — KPI การเงิน + ปัญหาวิกฤต/กระทบยอด', () => {
    const user = ROLE_USERS.accounting()
    expect(dashboardKpiSource(user)).toBe('finance')
    expect(idsOf(user)).toEqual(['exception_critical_open', 'bank_unmatched'])
  })

  it('เจ้าหน้าที่อนุมัติเคส — ไม่เห็นตัวเลขเงิน · คิวพิจารณาเคส/รีไซเกิล', () => {
    const user = ROLE_USERS.caseApprover()
    expect(dashboardKpiSource(user)).toBe('queues')
    expect(idsOf(user)).toEqual(['case_need_info', 'case_pending_review', 'case_recycle_review'])
    expect(caseBoardHref(user)).toBe('/cases/submit')
  })

  it('ธุรการ — ร่างเคส/ขอข้อมูลเพิ่ม + งานคลัง', () => {
    const user = ROLE_USERS.adminOffice()
    expect(dashboardKpiSource(user)).toBe('queues')
    expect(idsOf(user)).toEqual(['case_draft', 'case_need_info', 'asset_pending_intake', 'lot_in_progress'])
  })

  it('ผู้จัดการทีม (scope ทีม) — เฉพาะคิวที่กรองตามทีมได้ ไม่มีคิวระดับองค์กร', () => {
    const user = ROLE_USERS.manager()
    expect(dashboardKpiSource(user)).toBe('queues')
    expect(idsOf(user)).toEqual(['case_awaiting_assignment', 'reassign_waiting', 'compensation_my_step'])
    expect(caseBoardHref(user)).toBe('/cases/assign?view=team')
    expect(canViewCaseBoard(user)).toBe(true)
  })

  it('หัวหน้าทีม — คิวมอบหมาย/ย้ายงาน', () => {
    expect(idsOf(ROLE_USERS.supervisor())).toEqual(['case_awaiting_assignment', 'reassign_waiting'])
  })

  it('พนักงานภาคสนาม — ไม่มีคิว ไม่มีกระดานเคส มีทางลัด Field Tracker', () => {
    const user = ROLE_USERS.fieldAgent()
    expect(idsOf(user)).toEqual([])
    expect(canViewCaseBoard(user)).toBe(false)
    expect(caseBoardHref(user)).toBeNull()
    expect(showFieldTrackerShortcut(user)).toBe(true)
    expect(dashboardKpiSource(user)).toBe('queues')
  })

  it('ทุกคิวที่ role เห็น ต้องเปิดเมนูปลายทางได้จริง (กดลิงก์แล้วไม่โดนเด้ง)', () => {
    for (const factory of Object.values(ROLE_USERS)) {
      const user = factory()
      for (const def of visibleDashboardQueues(user)) expect(canViewMenu(user, def.menuId)).toBe(true)
    }
  })
})

describe('scope — กันตัวเลขระดับองค์กรรั่วให้ผู้ใช้ระดับทีม', () => {
  it('ผู้ใช้ scope ทีมที่ถือสิทธิ์อนุมัติเงินทดรอง/รอบจ่าย ก็ยังไม่เห็นคิวระดับองค์กร', () => {
    const user = roleUser(TEAM_MANAGER_ROLE_NAME, 'inhouse', 'team', {
      capabilities: {
        approve_advance: 'manage',
        manage_payout_batch: 'manage',
        manage_exceptions: 'manage',
        assign_case: 'manage',
        intake_asset: 'manage',
      },
    })
    const ids = visibleDashboardQueues(user).map((def) => def.id)
    for (const id of ids) expect(dashboardQueueDef(id).teamScoped).toBe(true)
    expect(ids).not.toContain('advance_overdue')
    expect(ids).not.toContain('payout_in_progress')
    expect(ids).not.toContain('exception_critical_open')
  })

  it('ถือ capability แค่ระดับ view = ไม่ใช่งานของฉัน (ไม่ขึ้นคิว)', () => {
    const user = roleUser('บทบาทสมมติ', 'system', 'global', { capabilities: { approve_case: 'view' } })
    expect(visibleDashboardQueues(user)).toEqual([])
  })

  it('scope บริษัท/ตัวเอง ไม่เห็นกระดานเคส', () => {
    const company = roleUser('บทบาทสมมติ', 'system', 'company', { capabilities: { view_master_data: 'view' } })
    expect(canViewCaseBoard(company)).toBe(false)
  })
})

describe('ประกอบผลนับ', () => {
  const defs = DASHBOARD_QUEUES.filter((def) =>
    ['case_draft', 'case_need_info', 'case_pending_review', 'case_recycle_review', 'job_failed'].includes(def.id),
  )

  it('buildQueueItems ตัดคิวที่ไม่ได้นับ · ค่าติดลบกลายเป็น 0 · คงลำดับนิยาม', () => {
    const items = buildQueueItems(defs, {
      job_failed: { count: 2 },
      case_draft: { count: -3 },
      case_pending_review: { count: 5, capped: true },
    })
    expect(items.map((item) => [item.id, item.count, item.capped])).toEqual([
      ['case_draft', 0, false],
      ['case_pending_review', 5, true],
      ['job_failed', 2, false],
    ])
  })

  it('pendingQueueItems เอาเฉพาะคิวที่มีงาน · queueKpiItems เอาคิวที่มีงานก่อนแล้วเติมให้ครบ 4', () => {
    const items: DashboardQueueItemDto[] = buildQueueItems(defs, {
      case_draft: { count: 0 },
      case_need_info: { count: 0 },
      case_pending_review: { count: 0 },
      case_recycle_review: { count: 1 },
      job_failed: { count: 4 },
    })
    expect(pendingQueueItems(items).map((item) => item.id)).toEqual(['case_recycle_review', 'job_failed'])
    expect(queueKpiItems(items).map((item) => item.id)).toEqual([
      'case_recycle_review',
      'job_failed',
      'case_draft',
      'case_need_info',
    ])
  })

  it('queueCountText — ชนเพดานแสดง N+', () => {
    expect(queueCountText({ count: 1200, capped: false })).toBe('1,200')
    expect(queueCountText({ count: 300, capped: true })).toBe('300+')
  })

  it('buildCaseBoard — ครบ 7 สถานะตามลำดับ · 2 แถวปิดงานนับรายเดือน · total รวมทุกแถว', () => {
    const board = buildCaseBoard({
      openCounts: { pending_review: 5, active: 18 },
      closedThisMonth: { success: 7, fail: 2 },
      monthLabel: 'ตุลาคม 2569',
      href: '/cases/submit',
    })
    expect(board.rows.map((row) => row.status)).toEqual([...CASE_BOARD_STATUSES])
    expect(board.rows.map((row) => row.count)).toEqual([5, 0, 0, 18, 0, 7, 2])
    expect(board.total).toBe(32)
    expect(board.rows.filter((row) => row.monthly).map((row) => row.status)).toEqual(['closed_success', 'closed_fail'])
    expect(board.rows.find((row) => row.status === 'closed_success')?.label).toBe('ปิดงานสำเร็จ (เดือนนี้)')
    expect(board.rows.find((row) => row.status === 'closed_fail')?.group).toBe('critical')
  })
})

describe('การ์ด AR ผู้บริหาร — บรรทัด "เกิน 60 วัน" จาก F3 (มติ PO U115)', () => {
  const arKpi = {
    key: 'arOutstanding',
    label: 'AR ค้างรับ',
    value: 1_500_000,
    type: 'money' as const,
    hint: '2 บริษัทที่ยังมียอดค้าง',
    higherIsBetter: false,
  }
  const agingKpis = [
    { key: 'outstanding', label: 'ยอดค้างรับรวม', value: 1_500_000, type: 'money' as const },
    { key: 'over60', label: 'ค้างเกิน 60 วัน', value: 425_050, type: 'money' as const },
    { key: 'over90', label: 'ค้างเกิน 90 วัน', value: 100_000, type: 'money' as const },
  ]

  it('ยอดใหญ่คงเดิม + บรรทัดย่อยใช้ค่า over60 ของ F3 ตรงตัว', () => {
    const merged = withArOver60Hint(arKpi, agingKpis)
    expect(merged.value).toBe(1_500_000)
    expect(merged.hint).toBe('เกิน 60 วัน ฿4,250.50 · 2 บริษัทที่ยังมียอดค้าง')
  })

  it('ไม่มีข้อมูล F3 / ไม่ใช่การ์ด AR ⇒ การ์ดเดิม', () => {
    expect(withArOver60Hint(arKpi, null)).toBe(arKpi)
    expect(withArOver60Hint(arKpi, [])).toBe(arKpi)
    const revenue = { ...arKpi, key: 'revenue' }
    expect(withArOver60Hint(revenue, agingKpis)).toBe(revenue)
  })

  it('สิทธิ์: เฉพาะผู้บริหาร/Superadmin (เห็นทั้ง E และ F) — การเงิน/บัญชี/ทีม ไม่ได้', () => {
    expect(canShowArOver60(ROLE_USERS.executive())).toBe(true)
    expect(canShowArOver60(ROLE_USERS.superadmin())).toBe(true)
    for (const make of [ROLE_USERS.finance, ROLE_USERS.accounting, ROLE_USERS.manager, ROLE_USERS.fieldAgent]) {
      expect(canShowArOver60(make())).toBe(false)
    }
  })
})

describe('ลิงก์คิวเคสเปิดรายการที่กรองสถานะไว้แล้ว (staging E-040)', () => {
  it.each([
    ['case_draft', '/cases/submit?status=draft'],
    ['case_need_info', '/cases/submit?status=need_info'],
    ['case_pending_review', '/cases/submit?status=pending_review'],
    ['case_recycle_review', '/cases/submit?status=pending_recycle_review'],
  ])('%s → %s', (id, href) => {
    expect(DASHBOARD_QUEUES.find((queue) => queue.id === id)?.href).toBe(href)
  })
})
