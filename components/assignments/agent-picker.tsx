'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, EmptyState, ErrorState, LoadingState, StatusBadge } from '@/components/ui'
import { apiPath } from '@/lib/api/contract'
import { callApi, type ApiCallError } from '@/lib/api/types'
import { assignmentStateBadgeGroup, assignmentStateLabel, teamSideBadgeClass, teamSideLabel } from '@/lib/assignments/assignment-ui'
import type {
  AgentCaseDto,
  AgentCasesResultDto,
  AssignmentTeamSide,
  TeamAgentDto,
  TeamAgentsResultDto,
} from '@/lib/assignments/types'
import { fmtRatioPct, fmtSatangSymbol } from '@/lib/format/money'

/**
 * **Agent Picker** ของ Assignment Modal (`40` §7.3)
 *
 * - รายชื่อ **เฉพาะพนักงานในทีมของเคส** เท่านั้น (`assigned_team_id`) — ไม่ดึงข้ามทีมแม้ผู้จัดการดูแลหลายทีม
 * - แต่ละคนแสดงข้อมูลประกอบการตัดสินใจของ §6.2: เคสในมือ · % ความสำเร็จสะสม · พื้นที่ที่รับผิดชอบ
 * - toggle "ดูเคสที่ถืออยู่" **ขยายพร้อมกันได้หลายคน** (ไม่ใช่ accordion) และแต่ละเคสมีปุ่ม
 *   "ดูรายละเอียด" เปิด case detail แบบอ่านอย่างเดียว (ผู้เรียกเป็นคนเปิด modal นั้น)
 */

export function AgentPicker({
  teamId,
  selectedAgentId,
  currentAgentId,
  disabled = false,
  onSelect,
  onPeekCase,
}: {
  teamId: string
  selectedAgentId: string | null
  /** ผู้รับผิดชอบปัจจุบัน (โหมด reassign) — เลือกซ้ำคนเดิมไม่ได้ */
  currentAgentId?: string | null
  disabled?: boolean
  onSelect: (agent: TeamAgentDto) => void
  onPeekCase: (caseId: string) => void
}) {
  const [result, setResult] = useState<TeamAgentsResultDto | null>(null)
  const [error, setError] = useState<ApiCallError | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const response = await callApi<TeamAgentsResultDto>(apiPath('assignment.teamAgents', { team_id: teamId }))
      if (cancelled) return
      setResult(response.data ?? null)
      setError(response.error ?? null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [teamId])

  if (loading) return <LoadingState message="กำลังโหลดรายชื่อพนักงานในทีม..." />
  if (error !== null) return <ErrorState title={error.title} message={error.message} />
  if (result === null || result.agents.length === 0) {
    return (
      <EmptyState
        title="ไม่มีพนักงานในทีมนี้"
        description="เพิ่มพนักงานเข้าทีมที่หน้าตั้งค่า → ทีม ก่อนจึงจะมอบหมายเคสได้"
      />
    )
  }

  return (
    <div className="space-y-2">
      {result.agents.map((agent) => (
        <AgentCard
          key={agent.agentId}
          teamId={result.teamId}
          teamName={result.teamName}
          teamSide={result.teamSide}
          agent={agent}
          selected={selectedAgentId === agent.agentId}
          isCurrent={currentAgentId === agent.agentId}
          disabled={disabled}
          onSelect={() => onSelect(agent)}
          onPeekCase={onPeekCase}
        />
      ))}
    </div>
  )
}

function AgentCard({
  teamId,
  teamName,
  teamSide,
  agent,
  selected,
  isCurrent,
  disabled,
  onSelect,
  onPeekCase,
}: {
  teamId: string
  teamName: string
  teamSide: AssignmentTeamSide
  agent: TeamAgentDto
  selected: boolean
  isCurrent: boolean
  disabled: boolean
  onSelect: () => void
  onPeekCase: (caseId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [cases, setCases] = useState<readonly AgentCaseDto[] | null>(null)
  const [casesError, setCasesError] = useState<ApiCallError | null>(null)

  const loadCases = useCallback(async () => {
    const response = await callApi<AgentCasesResultDto>(
      apiPath('assignment.agentCases', { team_id: teamId, agent_id: agent.agentId }),
    )
    return response
  }, [teamId, agent.agentId])

  async function toggle(): Promise<void> {
    const next = !expanded
    setExpanded(next)
    if (!next || cases !== null) return
    const response = await loadCases()
    setCases(response.data?.cases ?? [])
    setCasesError(response.error ?? null)
  }

  const selectable = !disabled && !isCurrent

  return (
    <div
      className={[
        'rounded-xl border p-3 transition',
        selected ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900' : 'border-slate-200 bg-white',
        selectable ? 'cursor-pointer hover:border-slate-400' : 'opacity-80',
      ].join(' ')}
    >
      <button
        type="button"
        className="focus-ring w-full rounded text-left"
        disabled={!selectable}
        aria-pressed={selected}
        onClick={onSelect}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
            {agent.fullName.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-slate-900">{agent.fullName}</span>
              {selected && <span className="text-xs font-bold text-emerald-600">✓ เลือกแล้ว</span>}
              {isCurrent && <Badge className="bg-slate-100 text-slate-600">ผู้รับผิดชอบปัจจุบัน</Badge>}
            </div>
            {/* ชื่อทีม + badge Inhouse/Outsource คนละบรรทัด (`40` §7.3) */}
            <div className="mt-0.5 text-[11px] text-slate-500">{teamName}</div>
            <Badge className={`mt-1 ${teamSideBadgeClass(teamSide)}`}>{teamSideLabel(teamSide)}</Badge>
          </div>
          <div className="shrink-0 text-right text-xs">
            <div className="font-bold text-slate-800">{agent.activeCaseCount} เคสในมือ</div>
            <div className="font-semibold text-emerald-600">{fmtRatioPct(agent.successRate)} สำเร็จ</div>
          </div>
        </div>
        <div className="mt-2 text-[11px] text-slate-400">
          พื้นที่: {agent.coveredProvinces.length === 0 ? 'ยังไม่ระบุ' : agent.coveredProvinces.join(' · ')}
        </div>
      </button>

      <Button variant="ghost" size="sm" className="mt-2" onClick={() => void toggle()}>
        {expanded ? '▴ ซ่อนเคสที่ถืออยู่' : `▾ ดูเคสที่ถืออยู่ (${agent.activeCaseCount})`}
      </Button>

      {expanded && (
        <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
          {casesError !== null && <p className="text-xs text-red-600">{casesError.message}</p>}
          {cases === null && casesError === null && <p className="text-xs text-slate-400">กำลังโหลด...</p>}
          {cases !== null && cases.length === 0 && <p className="px-2 text-xs text-slate-400">ไม่มีเคสในมือ</p>}
          {(cases ?? []).map((item) => (
            <div
              key={item.caseId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px]"
            >
              <div className="min-w-0">
                <span className="font-mono text-slate-500">{item.caseRef}</span>
                <span className="ml-1.5 font-semibold text-slate-800">{item.debtorName ?? '—'}</span>
                <span className="ml-1 text-slate-400">
                  {item.province ?? 'ไม่ระบุจังหวัด'} / {item.assetDescription ?? '—'}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="font-mono font-bold text-rose-600">{fmtSatangSymbol(item.debtAmountSatang)}</span>
                <StatusBadge
                  group={assignmentStateBadgeGroup(item.state)}
                  label={assignmentStateLabel(item.state)}
                />
                <Button variant="secondary" size="sm" onClick={() => onPeekCase(item.caseId)}>
                  ดูรายละเอียด
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
