'use client'

import { useEffect, useState } from 'react'
import { CalendarPickerModal } from '@/components/field/calendar-picker-modal'
import { FieldCaseDetailModal } from '@/components/field/field-case-detail'
import { useFieldCases } from '@/components/field/field-cases-provider'
import { IconMapPin, IconUser, IconUsers } from '@/components/field/field-icons'
import { Button, EmptyState, ErrorState, LoadingState, RefText } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { apiPath } from '@/lib/api/contract'
import { callApi, type ApiCallError } from '@/lib/api/types'
import { assetSummary, fieldCardAction, groupCasesByAgent } from '@/lib/field/field-ui'
import type { FieldCaseListItemDto, FieldCaseListResultDto } from '@/lib/field/types'

/**
 * แท็บ "รับงานแล้ว (จัดวันที่)" (`41` §7.3)
 *
 * - **ของฉัน**: เคส `accepted_unscheduled` ของตัวเอง + ปุ่ม "จัดวันที่" → Calendar Picker (§7.4)
 * - **ทีม**: เคสที่ยังไม่จัดวันของทุกคนในทีม แยกคอลัมน์ต่อคน เห็นรายละเอียดเต็ม
 *   แต่ **read-only เสมอ** (`41` §11) — ไม่มีปุ่มจัดวัน/ปิดงานของเพื่อนร่วมทีม
 *   (ยาม backend: ทุก mutation ผูก `agentId = ผู้เรียก` อยู่แล้ว — ปุ่มที่ซ่อนเป็นแค่ UX)
 */

const VIEWS = [
  { key: 'own', label: 'ของฉัน' },
  { key: 'team', label: 'ทีม' },
] as const
type ViewKey = (typeof VIEWS)[number]['key']

export function AcceptedTab({ currentUserId }: { currentUserId: string }) {
  const { items, loading, error, reload } = useFieldCases()
  const [view, setView] = useState<ViewKey>('own')
  const [scheduling, setScheduling] = useState<FieldCaseListItemDto | null>(null)
  const [detailCaseId, setDetailCaseId] = useState<string | null>(null)

  const [teamResult, setTeamResult] = useState<{
    items: readonly FieldCaseListItemDto[]
    error: ApiCallError | null
  } | null>(null)

  useEffect(() => {
    if (view !== 'team') return
    let cancelled = false
    void (async () => {
      const response = await callApi<FieldCaseListResultDto>(
        apiPath('field.caseList', undefined, { status: 'accepted', view: 'team' }),
      )
      if (cancelled) return
      setTeamResult({ items: response.data?.items ?? [], error: response.error ?? null })
    })()
    return () => {
      cancelled = true
    }
  }, [view])

  const teamLoading = teamResult === null
  const teamItems = teamResult?.items ?? []
  const teamError = teamResult?.error ?? null

  const mine = items.filter((item) => item.status === 'accepted_unscheduled')

  return (
    <>
      <div className="mb-4 flex rounded-xl bg-slate-100 p-1">
        {VIEWS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setView(option.key)}
            className={cn(
              'focus-ring flex flex-1 items-center justify-center gap-1 rounded-lg py-2 text-xs font-bold',
              view === option.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
            )}
          >
            {option.key === 'team' && <IconUsers className="h-4 w-4" />}
            {option.label}
          </button>
        ))}
      </div>

      {view === 'own' ? (
        loading ? (
          <LoadingState message="กำลังโหลดเคสที่รอจัดวันที่..." />
        ) : error !== null ? (
          <ErrorState title={error.title} message={error.message} code={error.code} />
        ) : mine.length === 0 ? (
          <EmptyState title="ไม่มีเคสรอจัดวันที่" description='รับงานจากแท็บ "รอรับงาน" แล้วจะมาอยู่ที่นี่' />
        ) : (
          <div className="space-y-2.5">
            {mine.map((item) => {
              const action = fieldCardAction(item)
              return (
                <div
                  key={item.assignmentId}
                  className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-white p-3.5 shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => setDetailCaseId(item.caseId)}
                    className="focus-ring min-w-0 flex-1 text-left"
                  >
                    <div className="truncate text-[15px] font-bold text-slate-800">{item.debtorName ?? '—'}</div>
                    <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
                      <IconMapPin className="h-4 w-4 shrink-0" />
                      {[item.district, item.province].filter((part) => part !== null).join(', ') || '—'} ·{' '}
                      {assetSummary({ assetDescription: item.assetDescription })}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      <RefText>{item.caseRef}</RefText>
                    </div>
                  </button>
                  {action?.kind === 'schedule' && (
                    <Button variant="info" onClick={() => setScheduling(item)}>
                      {action.label}
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )
      ) : teamLoading ? (
        <LoadingState message="กำลังโหลดเคสของทีม..." />
      ) : teamError !== null ? (
        <ErrorState title={teamError.title} message={teamError.message} code={teamError.code} />
      ) : teamItems.length === 0 ? (
        <EmptyState title="ทีมยังไม่มีเคสรอจัดวันที่" description="ใช้ดูประกอบการวางแผนที่พัก/เส้นทางร่วมกัน" />
      ) : (
        <>
          <div className="mb-2 flex items-center gap-1 text-xs font-bold text-slate-400">
            <IconUsers className="h-4 w-4" /> เห็นเฉพาะทีมของคุณ — อ่านอย่างเดียว ใช้ดูประกอบการวางแผนร่วมกัน
          </div>
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
            {groupCasesByAgent(teamItems, currentUserId).map((column) => (
              <div
                key={column.agentId}
                className="w-[220px] shrink-0 rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
                  <span className="rounded-full bg-slate-100 p-1.5 text-slate-500">
                    <IconUser className="h-4 w-4" />
                  </span>
                  <span className="truncate text-sm font-bold text-slate-800">
                    {column.agentName}
                    {column.agentId === currentUserId && ' (ฉัน)'}
                  </span>
                </div>
                <div className="space-y-2 p-2.5">
                  {column.items.map((item) => (
                    <div key={item.assignmentId} className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                      <div className="truncate text-xs font-semibold text-slate-700">{item.debtorName ?? '—'}</div>
                      <div className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-slate-400">
                        <IconMapPin className="h-3 w-3 shrink-0" />
                        {[item.district, item.province].filter((part) => part !== null).join(', ') || '—'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <CalendarPickerModal
        key={scheduling?.caseId ?? 'none'}
        open={scheduling !== null}
        target={scheduling}
        onClose={() => setScheduling(null)}
        onScheduled={() => {
          void reload()
        }}
      />

      <FieldCaseDetailModal
        open={detailCaseId !== null}
        caseId={detailCaseId}
        onClose={() => setDetailCaseId(null)}
        onChanged={() => {
          void reload()
        }}
      />
    </>
  )
}
