'use client'

import { useState } from 'react'
import { CloseCaseModal } from '@/components/field/close-case-modal'
import { FieldCaseDetailModal } from '@/components/field/field-case-detail'
import { useFieldCases } from '@/components/field/field-cases-provider'
import { IconAlert, IconGrip, IconMapPin } from '@/components/field/field-icons'
import { useReassignment } from '@/components/field/reassignment-provider'
import { Button, EmptyState, ErrorState, LoadingState, StatusBadge, useToast } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { apiPath } from '@/lib/api/contract'
import { callApi, jsonRequest } from '@/lib/api/types'
import { withWeekdayPrefix } from '@/lib/field/calendar'
import {
  DRAFT_BADGE_GROUP,
  DRAFT_BADGE_LABEL,
  REASSIGNMENT_BADGE_GROUP,
  REASSIGNMENT_BADGE_LABEL,
  fieldCardAction,
  reorderCaseIds,
  splitTrackingCases,
  type FieldCardAction,
} from '@/lib/field/field-ui'
import type { FieldCaseListItemDto, FieldReorderResultDto } from '@/lib/field/types'
import { fmtDate } from '@/lib/format/datetime'

/**
 * แท็บ "กำลังติดตาม" (`41` §7.5)
 *
 * - บล็อกส้มบนสุด = เคสที่ถูกตีกลับหลักฐาน (`needs_revision` อยู่กลุ่ม `tracking` — §7.6)
 * - ส่วนที่เหลือจัดกลุ่มตามวันลงพื้นที่ เรียงตาม `schedule_order` พร้อมเลขลำดับ
 * - **สลับลำดับได้เสมอ ไม่มีกฎ lock** — ลาก (desktop) หรือปุ่มขึ้น/ลง (มือถือที่ไม่รองรับ HTML5 drag)
 *   ทั้งสองทางเรียก `reorderCaseIds()` ตัวเดียวกันแล้วยิง `PATCH /api/field/cases/reorder` ทั้งวัน
 * - ปุ่มบนการ์ดมาจาก `fieldCardAction()` เท่านั้น (ห้าม if สถานะเองในหน้าจอ)
 */

function CardButton({ action, onClick }: { action: FieldCardAction; onClick: () => void }) {
  const toneClass =
    action.tone === 'reassign'
      ? 'bg-purple-600 text-white hover:bg-purple-700'
      : action.tone === 'revise'
        ? 'bg-orange-600 text-white hover:bg-orange-700'
        : undefined

  return toneClass === undefined ? (
    <Button onClick={onClick}>{action.label}</Button>
  ) : (
    <button type="button" onClick={onClick} className={cn('focus-ring rounded-lg px-3 py-2 text-xs font-bold', toneClass)}>
      {action.label}
    </button>
  )
}

export function TrackingTab() {
  const { items, loading, error, reload } = useFieldCases()
  const { showToast } = useToast()
  const { openReassignment, setPopupPaused } = useReassignment()
  const [detailCaseId, setDetailCaseId] = useState<string | null>(null)
  const [closeCaseId, setCloseCaseId] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [savingDate, setSavingDate] = useState<string | null>(null)

  const { needsRevision, days } = splitTrackingCases(items)

  async function applyOrder(date: string, orderedCaseIds: string[]): Promise<void> {
    setSavingDate(date)
    try {
      const response = await callApi<FieldReorderResultDto>(
        apiPath('field.reorderCases'),
        jsonRequest('PATCH', { date, orderedCaseIds }),
      )
      if (response.error !== undefined) {
        showToast({ tone: 'error', title: response.error.title, description: response.error.message })
        return
      }
      showToast({ tone: 'success', title: 'สลับลำดับเรียบร้อย' })
      await reload()
    } finally {
      setSavingDate(null)
    }
  }

  function moveTo(date: string, dayItems: readonly FieldCaseListItemDto[], fromId: string, toId: string): void {
    const next = reorderCaseIds(
      dayItems.map((item) => item.caseId),
      fromId,
      toId,
    )
    if (next === null) return
    void applyOrder(date, next)
  }

  /** ปุ่มบนการ์ด — คำขอเปลี่ยนผู้รับผิดชอบเปิด modal ของ shell · ที่เหลือเปิดฟอร์มปิดงาน (`41` §7.5/§7.6) */
  function runAction(action: FieldCardAction, caseId: string): void {
    if (action.kind === 'respond_reassignment') {
      openReassignment(caseId)
      return
    }
    openCloseForm(caseId)
  }

  /** ระหว่างเปิดฟอร์มปิดงาน พัก auto-popup ไว้ก่อน (mockup ก็ไม่เด้ง popup ทับ modal อื่น) */
  function openCloseForm(caseId: string): void {
    setPopupPaused(true)
    setCloseCaseId(caseId)
  }

  function closeCloseForm(): void {
    setCloseCaseId(null)
    setPopupPaused(false)
  }

  if (loading) return <LoadingState message="กำลังโหลดงานที่กำลังติดตาม..." />
  if (error !== null) return <ErrorState title={error.title} message={error.message} code={error.code} />

  return (
    <>
      {needsRevision.length > 0 && (
        <div className="mb-5">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-orange-600">
            <IconAlert className="h-4 w-4" /> ถูกตีกลับ ต้องแก้ไขหลักฐาน ({needsRevision.length})
          </div>
          <div className="space-y-2">
            {needsRevision.map((item) => {
              const action = fieldCardAction(item)
              return (
                <div
                  key={item.assignmentId}
                  className="rounded-2xl border-2 border-orange-300 bg-orange-50 p-3.5 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2.5">
                    <button
                      type="button"
                      onClick={() => setDetailCaseId(item.caseId)}
                      className="focus-ring min-w-0 flex-1 text-left"
                    >
                      <div className="truncate text-[15px] font-bold text-slate-800">{item.debtorName ?? '—'}</div>
                      <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
                        <IconMapPin className="h-4 w-4 shrink-0" />
                        {[item.district, item.province].filter((part) => part !== null).join(', ') || '—'} · รอบที่{' '}
                        {item.trackingRound}
                      </div>
                    </button>
                    {action !== null && <CardButton action={action} onClick={() => runAction(action, item.caseId)} />}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {days.length === 0 && needsRevision.length === 0 ? (
        <EmptyState title="ยังไม่มีเคสที่จัดวันแล้ว" description='จัดวันที่จากแท็บ "รับงานแล้ว" ก่อน' />
      ) : (
        days.length > 0 && (
          <>
            <div className="mb-3 text-xs font-bold text-slate-400">ลาก (หรือใช้ปุ่มลูกศร) เพื่อสลับลำดับก่อน-หลังได้เสมอ</div>
            <div className="space-y-5">
              {days.map((section) => (
                <div key={section.date}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white">
                      {withWeekdayPrefix(section.date, fmtDate(section.date))}
                    </span>
                    <span className="text-xs text-slate-500">{section.items.length} เคส</span>
                    {savingDate === section.date && <span className="text-xs text-slate-400">กำลังบันทึกลำดับ...</span>}
                  </div>

                  <div className="space-y-2">
                    {section.items.map((item, index) => {
                      const action = fieldCardAction(item)
                      const previous = section.items[index - 1]
                      const next = section.items[index + 1]
                      return (
                        <div
                          key={item.assignmentId}
                          draggable
                          onDragStart={() => setDragging(item.caseId)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault()
                            if (dragging === null) return
                            moveTo(section.date, section.items, dragging, item.caseId)
                            setDragging(null)
                          }}
                          className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm"
                        >
                          <div className="flex flex-col items-center gap-0.5 text-slate-300">
                            <button
                              type="button"
                              aria-label="เลื่อนขึ้น"
                              disabled={previous === undefined || savingDate !== null}
                              onClick={() => {
                                if (previous !== undefined) moveTo(section.date, section.items, item.caseId, previous.caseId)
                              }}
                              className="focus-ring rounded px-1 text-xs text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                            >
                              ▲
                            </button>
                            <IconGrip className="h-4 w-4" />
                            <button
                              type="button"
                              aria-label="เลื่อนลง"
                              disabled={next === undefined || savingDate !== null}
                              onClick={() => {
                                if (next !== undefined) moveTo(section.date, section.items, item.caseId, next.caseId)
                              }}
                              className="focus-ring rounded px-1 text-xs text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                            >
                              ▼
                            </button>
                          </div>

                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-bold text-indigo-700">
                            {index + 1}
                          </span>

                          <button
                            type="button"
                            onClick={() => setDetailCaseId(item.caseId)}
                            className="focus-ring min-w-0 flex-1 text-left"
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-[15px] font-bold text-slate-800">
                                {item.debtorName ?? '—'}
                              </span>
                              {item.hasDraft && <StatusBadge status={DRAFT_BADGE_LABEL} group={DRAFT_BADGE_GROUP} />}
                              {item.hasPendingReassignment && (
                                <StatusBadge status={REASSIGNMENT_BADGE_LABEL} group={REASSIGNMENT_BADGE_GROUP} />
                              )}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
                              <IconMapPin className="h-4 w-4 shrink-0" />
                              {[item.district, item.province].filter((part) => part !== null).join(', ') || '—'} · รอบที่{' '}
                              {item.trackingRound}
                            </div>
                          </button>

                          {action !== null && <CardButton action={action} onClick={() => runAction(action, item.caseId)} />}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )
      )}

      <FieldCaseDetailModal
        open={detailCaseId !== null}
        caseId={detailCaseId}
        onClose={() => setDetailCaseId(null)}
        onChanged={() => {
          void reload()
        }}
        onRespondReassignment={(detail) => {
          setDetailCaseId(null)
          openReassignment(detail.caseId)
        }}
      />

      {closeCaseId !== null && (
        <CloseCaseModal
          key={closeCaseId}
          caseId={closeCaseId}
          onClose={closeCloseForm}
          onDone={() => {
            void reload()
          }}
        />
      )}
    </>
  )
}
