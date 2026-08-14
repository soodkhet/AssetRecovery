'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AssignmentModal } from '@/components/assignments/assignment-modal'
import { KanbanBoard } from '@/components/assignments/kanban-board'
import { usePermission } from '@/components/auth/permission-provider'
import { CaseDetailModal } from '@/components/cases/case-detail-modal'
import {
  Badge,
  Button,
  Card,
  Input,
  PageHeader,
  RefText,
  Select,
  StatCard,
  StatusBadge,
  TBody,
  THead,
  Table,
  TableState,
  Td,
  Th,
  Tr,
} from '@/components/ui'
import { apiPath } from '@/lib/api/contract'
import { callApi, type ApiCallError } from '@/lib/api/types'
import {
  assignedTimeline,
  assignmentRowActions,
  assignmentStateBadgeGroup,
  assignmentStateLabel,
  expiresInText,
  PENDING_REASSIGNMENT_BADGE_GROUP,
  PENDING_REASSIGNMENT_LABEL,
  targetFromListItem,
  teamSideBadgeClass,
  teamSideLabel,
  type AssignmentActionButton,
  type AssignmentTarget,
} from '@/lib/assignments/assignment-ui'
import { ASSIGNMENT_MANAGE_CAPABILITY } from '@/lib/assignments/permissions'
import { ASSIGNMENT_STATE_FILTERS } from '@/lib/assignments/schemas'
import type { AssignmentListItemDto, AssignmentListResultDto } from '@/lib/assignments/types'
import { fmtSatang } from '@/lib/format/money'

/**
 * หน้า "มอบหมายงาน" (`/cases/assign` — `40` §7.1/§7.2 · `06` §7.1.1)
 * โครงหน้า/คลาสตาม mockup `40-case-assignment-mockup.html`
 *
 * - filter สถานะ/ทีม/ค้นหา + pagination · จอเล็ก (< `md`) สลับเป็น card list (§7.2 Responsive)
 * - badge Inhouse/Outsource **คนละบรรทัด** กับชื่อทีม · badge `pending_reassignment` แยกจากสถานะหลัก
 * - คอลัมน์ผู้รับผิดชอบมี**วันเวลากำกับเสมอ** (`assignedTimeline()` — พ.ศ. ผ่าน `fmtDateTime`)
 * - ปุ่มมอบหมาย/เปลี่ยนผู้รับผิดชอบมาจาก `assignmentRowActions()` — `canAct = false` (หัวหน้าที่ settings
 *   ปิดไว้) แปลว่า **ซ่อนปุ่ม** ไม่ใช่ disabled (`40` §7.2 · Rule 05) · API ตรวจสิทธิ์ซ้ำเสมอ (DEC-002)
 */

const PAGE_SIZE = 20

const KPI_STATES = [
  { state: 'ready_to_assign', hint: 'รอผู้จัดการเลือกพนักงาน' },
  { state: 'assigned', hint: 'ส่งให้พนักงานแล้ว รอกดรับ' },
  { state: 'accepted', hint: 'พนักงานรับงานแล้ว' },
] as const

interface Filters {
  search: string
  status: string
  team: string
}

const EMPTY_FILTERS: Filters = { search: '', status: 'all', team: 'all' }

function buildListPath(filters: Filters, page: number): string {
  const query: Record<string, string | number> = { page, limit: PAGE_SIZE }
  if (filters.status !== 'all') query.status = filters.status
  if (filters.team !== 'all') query.team = filters.team
  if (filters.search.trim() !== '') query.search = filters.search.trim()
  return apiPath('assignment.list', undefined, query)
}

export function AssignmentsManager({ canAct }: { canAct: boolean }) {
  const { can } = usePermission()
  /**
   * ปุ่มโผล่ต่อเมื่อ **ทั้ง** capability `assign_case` (DEC-009) และ settings ของ §6.4 อนุญาต —
   * ผู้บริหาร/การเงินที่เข้าหน้านี้ด้วย `view_master_data` จึงเห็นเป็นอ่านอย่างเดียว
   */
  const mayAct = canAct && can('manage', ASSIGNMENT_MANAGE_CAPABILITY)

  const [result, setResult] = useState<AssignmentListResultDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiCallError | null>(null)

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [counts, setCounts] = useState<Readonly<Record<string, number>>>({})

  const [view, setView] = useState<'list' | 'kanban'>('list')
  /** เพิ่มค่าเมื่อ mutation สำเร็จ — ใช้บังคับให้กระดาน Kanban โหลดใหม่โดยไม่ล้าง filter ที่ตั้งไว้ */
  const [reloadToken, setReloadToken] = useState(0)
  const [target, setTarget] = useState<AssignmentTarget | null>(null)
  const [detailCaseId, setDetailCaseId] = useState<string | null>(null)

  const listPath = useMemo(() => buildListPath(filters, page), [filters, page])

  const fetchList = useCallback(async () => await callApi<AssignmentListResultDto>(listPath), [listPath])

  const fetchCounts = useCallback(async () => {
    const results = await Promise.all(
      KPI_STATES.map(async (item) => {
        const path = apiPath('assignment.list', undefined, { status: item.state, page: 1, limit: 1 })
        const response = await callApi<AssignmentListResultDto>(path)
        return [item.state, response.data?.total ?? 0] as const
      }),
    )
    return Object.fromEntries(results)
  }, [])

  const reload = useCallback(async () => {
    const [list, kpi] = await Promise.all([fetchList(), fetchCounts()])
    if (list.error !== undefined) {
      setError(list.error)
      setLoading(false)
      return
    }
    setResult(list.data ?? null)
    setCounts(kpi)
    setError(null)
    setLoading(false)
  }, [fetchList, fetchCounts])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [list, kpi] = await Promise.all([fetchList(), fetchCounts()])
      if (cancelled) return
      if (list.error !== undefined) {
        setError(list.error)
        setLoading(false)
        return
      }
      setResult(list.data ?? null)
      setCounts(kpi)
      setError(null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchList, fetchCounts])

  function updateFilter(next: Partial<Filters>): void {
    setLoading(true)
    setPage(1)
    setFilters((current) => ({ ...current, ...next }))
  }

  const items = result?.items ?? []
  const teams = result?.teams ?? []
  const total = result?.total ?? 0
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))

  if (view === 'kanban') {
    return (
      <>
        <KanbanBoard
          teams={teams}
          reloadToken={reloadToken}
          onBack={() => setView('list')}
          onOpenCase={setTarget}
        />
        <AssignmentModal
          open={target !== null}
          target={target}
          onClose={() => setTarget(null)}
          onDone={() => {
            setReloadToken((current) => current + 1)
            setLoading(true)
            void reload()
          }}
        />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="มอบหมายงาน (Case Assignment)"
        description="เลือกพนักงานในทีมของเคส ติดตามการกดรับงาน และเปลี่ยนผู้รับผิดชอบเมื่อจำเป็น"
      />

      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        {KPI_STATES.map((item) => (
          <StatCard
            key={item.state}
            label={assignmentStateLabel(item.state)}
            value={counts[item.state] ?? 0}
            hint={item.hint}
          />
        ))}
      </div>

      <Card>
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 lg:flex-row">
          <div className="flex-1">
            <Input
              aria-label="ค้นหาเลขที่สัญญา หรือชื่อลูกหนี้"
              value={filters.search}
              placeholder="ค้นหา เลขสัญญา / ชื่อลูกหนี้..."
              onChange={(event) => updateFilter({ search: event.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:flex lg:flex-nowrap">
            <Select
              aria-label="กรองตามสถานะมอบหมาย"
              className="lg:w-52"
              value={filters.status}
              onChange={(event) => updateFilter({ status: event.target.value })}
            >
              <option value="all">สถานะทั้งหมด</option>
              {ASSIGNMENT_STATE_FILTERS.map((state) => (
                <option key={state} value={state}>
                  {assignmentStateLabel(state)}
                </option>
              ))}
            </Select>
            {/* หัวหน้าทีมมีทีมเดียวให้ดูเสมอ — ไม่ต้องมีตัวเลือกทีม (`40` §7.1) */}
            {teams.length > 1 && (
              <Select
                aria-label="กรองตามทีม"
                className="lg:w-48"
                value={filters.team}
                onChange={(event) => updateFilter({ team: event.target.value })}
              >
                <option value="all">ทุกทีมที่ดูแล</option>
                {teams.map((team) => (
                  <option key={team.teamId} value={team.teamId}>
                    {team.teamName}
                  </option>
                ))}
              </Select>
            )}
            {/* `40` §7.1 — ปุ่มอยู่ระดับเดียวกับ filter/search แล้วเปิดเป็น full-screen แทนหน้ารายการ */}
            {teams.length > 0 && (
              <Button variant="secondary" className="lg:w-36" onClick={() => setView('kanban')}>
                ดูภาพรวมทีม
              </Button>
            )}
          </div>
        </div>

        {/* จอ md ขึ้นไป = ตาราง */}
        <div className="hidden md:block">
          <Table>
            <THead>
              <Tr>
                <Th>เลขที่สัญญา / รอบ</Th>
                <Th>ลูกหนี้ / จังหวัด</Th>
                <Th>ไฟแนนซ์ / ทรัพย์</Th>
                <Th className="text-right">มูลหนี้คงเหลือ</Th>
                <Th>ทีม</Th>
                <Th>ผู้รับผิดชอบ</Th>
                <Th>สถานะ</Th>
                <Th className="text-right">จัดการ</Th>
              </Tr>
            </THead>
            <TableState
              colSpan={8}
              loading={loading}
              error={error === null ? null : { title: error.title, message: error.message }}
              isEmpty={items.length === 0}
              emptyTitle="ไม่พบเคสตามเงื่อนไขที่ค้นหา"
              emptyDescription="เคสจะเข้ามาที่หน้านี้เมื่อผู้พิจารณากด “รับเคส” ที่หน้ารับเคสแล้ว"
              onRetry={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setLoading(true)
                    void reload()
                  }}
                >
                  ลองใหม่
                </Button>
              }
            />
            <TBody>
              {!loading &&
                error === null &&
                items.map((item) => (
                  <Tr key={item.caseId}>
                    <Td>
                      <RefText className="font-bold">{item.caseRef}</RefText>
                      <div className="mt-0.5 text-[11px] text-slate-500">รอบที่ {item.trackingRound}</div>
                    </Td>
                    <Td>
                      <div className="font-semibold text-slate-800">{item.debtorName ?? '—'}</div>
                      <div className="text-[11px] text-slate-500">{item.province ?? 'ยังไม่ระบุจังหวัด'}</div>
                    </Td>
                    <Td>
                      <div className="text-xs text-slate-700">{item.companyName}</div>
                      <div className="text-[11px] text-slate-400">{item.assetDescription ?? '—'}</div>
                    </Td>
                    <Td numeric>{fmtSatang(item.debtAmountSatang)}</Td>
                    <Td>
                      <TeamCell item={item} />
                    </Td>
                    <Td>
                      <AgentCell item={item} />
                    </Td>
                    <Td>
                      <StatusCell item={item} />
                    </Td>
                    <Td className="text-right">
                      <RowActions
                        item={item}
                        canAct={mayAct}
                        onRun={() => setTarget(targetFromListItem(item))}
                        onOpenDetail={() => setDetailCaseId(item.caseId)}
                      />
                    </Td>
                  </Tr>
                ))}
            </TBody>
          </Table>
        </div>

        {/* จอเล็ก = card list — วันเวลากำกับ + badge ทีมต้องไม่หายไป (`40` §7.2) */}
        <div className="space-y-3 md:hidden">
          {loading && <div className="py-8 text-center text-sm text-slate-400">กำลังโหลด...</div>}
          {!loading && error !== null && (
            <div className="py-8 text-center text-sm text-red-600">
              {error.title} — {error.message}
            </div>
          )}
          {!loading && error === null && items.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-400">ไม่พบเคสตามเงื่อนไขที่ค้นหา</div>
          )}
          {!loading &&
            error === null &&
            items.map((item) => (
              <div key={item.caseId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <RefText className="font-bold">{item.caseRef}</RefText>
                    <div className="text-[11px] text-slate-500">รอบที่ {item.trackingRound}</div>
                  </div>
                  <StatusCell item={item} />
                </div>
                <div className="mb-1 text-sm font-semibold text-slate-800">{item.debtorName ?? '—'}</div>
                <div className="mb-2 text-xs text-slate-500">
                  {item.province ?? 'ยังไม่ระบุจังหวัด'} · {item.companyName}
                </div>
                <div className="mb-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <div>
                    <span className="text-slate-400">ทรัพย์:</span> {item.assetDescription ?? '—'}
                  </div>
                  <div className="text-right font-mono font-semibold text-slate-800">
                    {fmtSatang(item.debtAmountSatang)}
                  </div>
                </div>
                <div className="mb-2">
                  <TeamCell item={item} />
                </div>
                <div className="mb-3 border-t border-slate-100 pt-2">
                  <AgentCell item={item} />
                </div>
                <RowActions
                  item={item}
                  canAct={mayAct}
                  onRun={() => setTarget(targetFromListItem(item))}
                  onOpenDetail={() => setDetailCaseId(item.caseId)}
                />
              </div>
            ))}
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
          <span>
            แสดง {items.length} จาก {total} รายการ (หน้า {page}/{lastPage})
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => {
                setLoading(true)
                setPage((current) => Math.max(1, current - 1))
              }}
            >
              ก่อนหน้า
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= lastPage || loading}
              onClick={() => {
                setLoading(true)
                setPage((current) => current + 1)
              }}
            >
              ถัดไป
            </Button>
          </div>
        </div>
      </Card>

      <AssignmentModal
        open={target !== null}
        target={target}
        onClose={() => setTarget(null)}
        onDone={() => {
          setLoading(true)
          void reload()
        }}
      />

      <CaseDetailModal
        open={detailCaseId !== null}
        caseId={detailCaseId}
        hideWorkflowActions
        description="ดูรายละเอียดเคสจากหน้ามอบหมายงาน (อ่านอย่างเดียว)"
        onClose={() => setDetailCaseId(null)}
      />
    </>
  )
}

/** ชื่อทีม + badge Inhouse/Outsource **คนละบรรทัด** (`40` §7.2) */
function TeamCell({ item }: { item: AssignmentListItemDto }) {
  return (
    <div>
      <div className="text-xs text-slate-700">{item.teamName ?? 'ยังไม่ระบุทีม'}</div>
      {item.teamSide !== null && (
        <Badge className={`mt-1 ${teamSideBadgeClass(item.teamSide)}`}>{teamSideLabel(item.teamSide)}</Badge>
      )}
    </div>
  )
}

/** ชื่อพนักงาน + วันเวลากำกับเสมอ (`40` §7.2 — ห้ามซ่อนไว้ใน audit) */
function AgentCell({ item }: { item: AssignmentListItemDto }) {
  const timeline = assignedTimeline(item)
  return (
    <div>
      <div className="text-xs font-semibold text-slate-800">{item.agentName ?? 'ยังไม่มอบหมาย'}</div>
      {timeline !== null && <div className="mt-0.5 text-[11px] text-slate-500">{timeline}</div>}
      {item.pendingReassignment !== null && (
        <div className="mt-0.5 text-[11px] text-orange-600">
          ขอเปลี่ยนเป็น {item.pendingReassignment.newAgentName} ·{' '}
          {expiresInText(item.pendingReassignment.expiresAt, new Date())}
        </div>
      )}
    </div>
  )
}

/** badge สถานะหลัก + badge คำขอเปลี่ยนผู้รับผิดชอบ **แยกกัน** (`40` §7.2) */
function StatusCell({ item }: { item: AssignmentListItemDto }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <StatusBadge group={assignmentStateBadgeGroup(item.state)} label={assignmentStateLabel(item.state)} />
      {item.pendingReassignment !== null && (
        <StatusBadge group={PENDING_REASSIGNMENT_BADGE_GROUP} label={PENDING_REASSIGNMENT_LABEL} />
      )}
    </div>
  )
}

function RowActions({
  item,
  canAct,
  onRun,
  onOpenDetail,
}: {
  item: AssignmentListItemDto
  canAct: boolean
  onRun: (button: AssignmentActionButton) => void
  onOpenDetail: () => void
}) {
  const actions = assignmentRowActions({
    state: item.state,
    hasPendingReassignment: item.pendingReassignment !== null,
    canAct,
  })

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {actions.map((button) => (
        <Button
          key={button.action}
          variant={button.tone === 'primary' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => onRun(button)}
        >
          {button.label}
        </Button>
      ))}
      {/* "ดูรายละเอียด" ไม่ผูกกับ settings — หัวหน้าเห็นได้เสมอ (`40` §6.4) */}
      <Button variant="secondary" size="sm" onClick={onOpenDetail}>
        ดูรายละเอียด
      </Button>
    </div>
  )
}
