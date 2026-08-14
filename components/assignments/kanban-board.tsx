'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button, ErrorState, Input, LoadingState, Select, StatusBadge } from '@/components/ui'
import { apiPath } from '@/lib/api/contract'
import { callApi, type ApiCallError } from '@/lib/api/types'
import { THAI_PROVINCES } from '@/lib/address/thai-address'
import {
  assignmentStateBadgeGroup,
  assignmentStateLabel,
  KANBAN_CARD_FILTER_LABEL,
  KANBAN_CARD_FILTERS,
  kanbanCardMatches,
  PENDING_REASSIGNMENT_BADGE_GROUP,
  targetFromKanbanCard,
  teamSideBadgeClass,
  teamSideLabel,
  type AssignmentTarget,
  type KanbanCardFilter,
} from '@/lib/assignments/assignment-ui'
import type { AgentCaseDto, AssignmentTeamOptionDto, KanbanBoardDto, KanbanColumnDto } from '@/lib/assignments/types'
import { fmtRatioPct, fmtSatangSymbol } from '@/lib/format/money'

/**
 * **Kanban Board — ภาพรวม Workload ของทีม (`40` §7.5)**
 *
 * - full-screen แทนที่หน้า List ทั้งหน้า (ไม่ใช่ modal ลอยทับ) + ปุ่มกลับที่ตำแหน่งเดิม (§7.1)
 * - **1 คอลัมน์ = 1 พนักงาน** (ไม่ใช่ตามสถานะเคส) · read-only ไม่มี drag-and-drop
 * - filter จังหวัด/ค้นหา ยิงที่ API · **filter สถานะกรองที่ระดับการ์ด** — คอลัมน์พนักงานที่ไม่เหลือ
 *   การ์ดต้องยังแสดงอยู่เสมอ (`40` §20) และตัวเลข "เคสในมือ" บนหัวคอลัมน์นับเคสที่ถือจริง ไม่ใช่การ์ดหลังกรอง
 * - คลิกการ์ด = เปิด modal มอบหมาย/เปลี่ยนผู้รับผิดชอบตัวเดียวกับหน้ารายการ
 */

export function KanbanBoard({
  teams,
  reloadToken = 0,
  onBack,
  onOpenCase,
}: {
  teams: readonly AssignmentTeamOptionDto[]
  /** เปลี่ยนค่าทุกครั้งที่มอบหมาย/เปลี่ยนผู้รับผิดชอบสำเร็จ — บังคับให้กระดานโหลดใหม่ */
  reloadToken?: number
  onBack: () => void
  onOpenCase: (target: AssignmentTarget) => void
}) {
  const [teamId, setTeamId] = useState(teams[0]?.teamId ?? '')
  const [search, setSearch] = useState('')
  const [province, setProvince] = useState('all')
  const [agentSearch, setAgentSearch] = useState('')
  const [cardFilter, setCardFilter] = useState<KanbanCardFilter>('all')

  const [board, setBoard] = useState<KanbanBoardDto | null>(null)
  const [error, setError] = useState<ApiCallError | null>(null)
  const [loading, setLoading] = useState(true)

  const boardPath = useMemo(() => {
    if (teamId === '') return null
    const query: Record<string, string> = {}
    if (search.trim() !== '') query.search = search.trim()
    if (province !== 'all') query.province = province
    return apiPath('assignment.teamKanban', { team_id: teamId }, query)
  }, [teamId, search, province])

  const fetchBoard = useCallback(async () => {
    if (boardPath === null) return { data: undefined, error: undefined }
    void reloadToken
    return await callApi<KanbanBoardDto>(boardPath)
  }, [boardPath, reloadToken])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const response = await fetchBoard()
      if (cancelled) return
      setBoard(response.data ?? null)
      setError(response.error ?? null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchBoard])

  const columns = (board?.columns ?? []).filter((column) =>
    agentSearch.trim() === '' ? true : column.fullName.toLowerCase().includes(agentSearch.trim().toLowerCase()),
  )

  return (
    <div className="fade-in">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={onBack}>
          ← กลับหน้ารายการ
        </Button>
        <h2 className="text-lg font-bold text-slate-900">ภาพรวม Workload ทีม</h2>
        {board !== null && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">{board.teamName}</span>
            <Badge className={teamSideBadgeClass(board.teamSide)}>{teamSideLabel(board.teamSide)}</Badge>
          </div>
        )}
      </div>

      <div className="mb-5 flex flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 lg:flex-row">
        <div className="flex-1">
          <Input
            aria-label="ค้นหาเลขที่สัญญา หรือชื่อลูกหนี้"
            value={search}
            placeholder="ค้นหา เลขสัญญา / ชื่อลูกหนี้..."
            onChange={(event) => {
              setLoading(true)
              setSearch(event.target.value)
            }}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:flex lg:flex-nowrap">
          {/* หัวหน้าทีมมีทีมเดียว — ไม่ต้องมีตัวเลือกทีม (`40` §7.1) */}
          {teams.length > 1 && (
            <Select
              aria-label="เลือกทีม"
              className="lg:w-48"
              value={teamId}
              onChange={(event) => {
                setLoading(true)
                setTeamId(event.target.value)
              }}
            >
              {teams.map((team) => (
                <option key={team.teamId} value={team.teamId}>
                  {team.teamName}
                </option>
              ))}
            </Select>
          )}
          <Input
            aria-label="ค้นหาชื่อพนักงาน"
            className="lg:w-40"
            value={agentSearch}
            placeholder="ชื่อพนักงาน..."
            onChange={(event) => setAgentSearch(event.target.value)}
          />
          <Select
            aria-label="กรองตามจังหวัด"
            className="lg:w-40"
            value={province}
            onChange={(event) => {
              setLoading(true)
              setProvince(event.target.value)
            }}
          >
            <option value="all">ทุกจังหวัด</option>
            {THAI_PROVINCES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
          <Select
            aria-label="กรองตามสถานะงาน"
            className="lg:w-52"
            value={cardFilter}
            onChange={(event) => setCardFilter(event.target.value as KanbanCardFilter)}
          >
            {KANBAN_CARD_FILTERS.map((filter) => (
              <option key={filter} value={filter}>
                {KANBAN_CARD_FILTER_LABEL[filter]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {loading && <LoadingState message="กำลังโหลดภาพรวมทีม..." />}
      {!loading && error !== null && <ErrorState title={error.title} message={error.message} />}
      {!loading && error === null && columns.length === 0 && (
        <p className="py-10 text-center text-sm text-slate-400">ไม่มีพนักงานในทีมนี้</p>
      )}

      {!loading && error === null && board !== null && columns.length > 0 && (
        // จอเล็ก = stack แนวตั้ง · จอใหญ่ = คอลัมน์แนวนอนเลื่อนได้ (§7.5 Responsive)
        <div className="flex flex-col gap-4 md:flex-row md:overflow-x-auto md:pb-4">
          {columns.map((column) => (
            <KanbanColumn
              key={column.agentId}
              board={board}
              column={column}
              cardFilter={cardFilter}
              onOpenCase={onOpenCase}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function KanbanColumn({
  board,
  column,
  cardFilter,
  onOpenCase,
}: {
  board: KanbanBoardDto
  column: KanbanColumnDto
  cardFilter: KanbanCardFilter
  onOpenCase: (target: AssignmentTarget) => void
}) {
  const cards = column.cases.filter((item) => kanbanCardMatches(item, cardFilter))

  return (
    <div className="w-full shrink-0 md:w-72">
      <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
            {column.fullName.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-bold text-slate-900">{column.fullName}</div>
            <div className="truncate text-[10px] text-slate-500">{board.teamName}</div>
          </div>
          <Badge className={teamSideBadgeClass(board.teamSide)}>{teamSideLabel(board.teamSide)}</Badge>
        </div>
        <div className="flex justify-between text-[10px] text-slate-500">
          <span className="font-semibold text-slate-700">{column.activeCaseCount} เคสในมือ</span>
          <span className="font-bold text-emerald-600">{fmtRatioPct(column.successRate)} สำเร็จ</span>
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
          ไม่มีเคสตามเงื่อนไขที่กรอง
        </div>
      ) : (
        <div className="space-y-2">
          {cards.map((item) => (
            <KanbanCard
              key={item.caseId}
              item={item}
              onOpen={() => onOpenCase(targetFromKanbanCard(item, column, board))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function KanbanCard({ item, onOpen }: { item: AgentCaseDto; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="focus-ring w-full rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-slate-400"
    >
      <div className="flex items-start justify-between gap-1">
        <span className="font-mono text-[10px] text-slate-400">{item.caseRef}</span>
        {item.hasPendingReassignment && (
          <StatusBadge group={PENDING_REASSIGNMENT_BADGE_GROUP} label="รอยินยอม" />
        )}
      </div>
      <div className="mt-0.5 text-xs font-semibold text-slate-800">{item.debtorName ?? '—'}</div>
      <div className="mt-1 text-[10px] text-slate-500">{item.province ?? 'ไม่ระบุจังหวัด'}</div>
      <div className="text-[10px] text-slate-500">{item.assetDescription ?? '—'}</div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-bold text-rose-600">{fmtSatangSymbol(item.debtAmountSatang)}</span>
        <StatusBadge group={assignmentStateBadgeGroup(item.state)} label={assignmentStateLabel(item.state)} />
      </div>
    </button>
  )
}
