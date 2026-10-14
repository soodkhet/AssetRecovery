'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { FieldCaseDetailView } from '@/components/field/field-case-detail'
import { IconAlert, IconChevronLeft, IconChevronRight } from '@/components/field/field-icons'
import { useFieldCases } from '@/components/field/field-cases-provider'
import { Button, ErrorState, LoadingState, Modal, useToast } from '@/components/ui'
import { TOUCH_TARGET_CLASS } from '@/components/ui/button'
import { cn } from '@/components/ui/cn'
import { installFocusTrap } from '@/components/ui/focus-trap'
import { guardModalHistory } from '@/components/ui/modal-history'
import { isTopModal, registerModal, unregisterModal } from '@/components/ui/modal-stack'
import { apiPath } from '@/lib/api/contract'
import { callApi, jsonRequest, type ApiCallError } from '@/lib/api/types'
import {
  WEEKDAY_LABELS_TH,
  buildMonthGrid,
  countCasesByDate,
  monthLabelTH,
  monthOf,
  pickedDayPhrase,
  shiftMonth,
  withWeekdayPrefix,
  type CalendarMonth,
} from '@/lib/field/calendar'
import { casesScheduledOn, teammatesInProvince } from '@/lib/field/field-ui'
import { nextScheduleOrder } from '@/lib/field/schedule'
import type {
  FieldActionResultDto,
  FieldCaseDetailResponseDto,
  FieldCaseListItemDto,
  FieldCaseListResultDto,
} from '@/lib/field/types'
import { fmtDate, toInputDate } from '@/lib/format/datetime'

/**
 * Calendar Picker (`41` §7.4) — เลือกวันลงพื้นที่ของเคสที่รับงานแล้ว
 *
 * - **custom grid เอง** (ไม่ใช้ `<input type="date">`) เพราะต้องมี badge จำนวนเคสต่อวัน
 * - คลิกวัน = เปิด popup ยืนยันเสมอ (ไม่จัดวันทันทีจากการคลิก) · วันย้อนหลังกดไม่ได้
 * - **ใต้ปฏิทินแสดงรายละเอียดเคสเต็มแบบ static** (component เดียวกับ modal รายละเอียด — §7.7)
 * - banner ม่วงเมื่อเพื่อนร่วมทีมมีเคสจังหวัดเดียวกัน — **ข้อมูลแนะนำ ไม่บล็อกการเลือกวัน**
 *
 * ⚠️ ผู้เรียกต้องส่ง `key` เป็นรหัสเคส เพื่อให้ modal เกิดใหม่ทุกครั้งที่เปลี่ยนเคส
 * (เดือนที่เลื่อนไว้/วันที่เลือกค้าง/รายละเอียดของเคสเดิมจะได้ไม่ตกค้าง)
 */
export function CalendarPickerModal({
  open,
  target,
  onClose,
  onScheduled,
}: {
  open: boolean
  /** เคสที่กำลังจัดวัน (จากรายการแท็บ "รับงานแล้ว") */
  target: FieldCaseListItemDto | null
  onClose: () => void
  onScheduled: () => void
}) {
  const { items } = useFieldCases()
  const { showToast } = useToast()

  const todayIso = toInputDate(new Date())
  const [current, setCurrent] = useState<CalendarMonth>(() => monthOf(todayIso))
  const [pickedDate, setPickedDate] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [detail, setDetail] = useState<FieldCaseDetailResponseDto | null>(null)
  const [detailError, setDetailError] = useState<ApiCallError | null>(null)
  const [teamItems, setTeamItems] = useState<readonly FieldCaseListItemDto[]>([])
  /** เพิ่มค่าเมื่อกด "ลองใหม่" หลังโหลดเคสไม่สำเร็จ (preship R2-022) */
  const [retryKey, setRetryKey] = useState(0)

  const caseId = target?.caseId ?? null

  // กล่องยืนยันวันที่ซ้อนบน Modal ⇒ เป็นชั้นบนสุดของตัวเอง: Esc ปิดเฉพาะกล่องนี้ · กักโฟกัสในกล่อง ·
  // ปิดแล้วคืนโฟกัสให้ช่องวันที่ที่กด (ตรวจ a11y staging SV5-C1-01)
  const confirmRef = useRef<HTMLDivElement>(null)
  const confirmTitleId = useId()
  const confirmOpen = pickedDate !== null
  useEffect(() => {
    if (!confirmOpen) return
    const token = registerModal()
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && isTopModal(token)) setPickedDate(null)
    }
    // ปุ่ม Back ของมือถือ = ปิดเฉพาะกล่องนี้ (เดิมกล่องไม่ลงชั้น ⇒ Back ปิดทั้งปฏิทิน)
    const releaseHistory = guardModalHistory({
      onBack: () => (isTopModal(token) ? 'close' : 'stay'),
      onClose: () => setPickedDate(null),
    })
    document.addEventListener('keydown', handleKey)
    const releaseFocus = installFocusTrap({ getContainer: () => confirmRef.current, isTop: () => isTopModal(token) })
    return () => {
      unregisterModal(token)
      releaseHistory()
      document.removeEventListener('keydown', handleKey)
      releaseFocus()
    }
  }, [confirmOpen])

  useEffect(() => {
    if (!open || caseId === null) return
    let cancelled = false
    void (async () => {
      const [detailResponse, teamResponse] = await Promise.all([
        callApi<FieldCaseDetailResponseDto>(apiPath('field.caseDetail', { id: caseId })),
        callApi<FieldCaseListResultDto>(apiPath('field.caseList', undefined, { view: 'team' })),
      ])
      if (cancelled) return
      setDetail(detailResponse.data ?? null)
      setDetailError(detailResponse.error ?? null)
      setTeamItems(teamResponse.data?.items ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [open, caseId, retryKey])

  /** badge ต่อวัน = เคสของเราที่จัดวันไว้แล้ว (`41` §7.4) */
  const countByDate = useMemo(
    () => countCasesByDate(items.filter((item) => item.status === 'scheduled')),
    [items],
  )

  const cells = useMemo(
    () => buildMonthGrid({ current, todayIso, countByDate }),
    [current, todayIso, countByDate],
  )

  const casesOnPickedDate = useMemo(
    () => (pickedDate === null ? [] : casesScheduledOn(items, pickedDate)),
    [items, pickedDate],
  )
  /** "วันนี้" เฉพาะเมื่อเลือกวันปัจจุบันจริง — วันอื่นระบุวันที่ (mytester DO-06) */
  const pickedPhrase = pickedDate === null ? '' : pickedDayPhrase(pickedDate, todayIso, fmtDate(pickedDate))

  /** ลำดับที่เคสนี้จะได้ = ต่อท้ายเสมอ — ใช้ฟังก์ชันเดียวกับที่ BE คิด (`41` §8) */
  const nextOrder = nextScheduleOrder(casesOnPickedDate.map((item) => item.scheduleOrder))

  const teammates = useMemo(
    () => teammatesInProvince(teamItems, target?.province ?? null, target?.agentId ?? ''),
    [teamItems, target?.province, target?.agentId],
  )

  async function confirmSchedule(): Promise<void> {
    if (target === null || pickedDate === null) return
    setSaving(true)
    try {
      const response = await callApi<FieldActionResultDto>(
        apiPath('field.scheduleCase', { id: target.caseId }),
        jsonRequest('POST', { scheduleDate: pickedDate }),
      )
      if (response.error !== undefined) {
        showToast({ tone: 'error', title: response.error.title, description: response.error.message })
        return
      }
      showToast({
        tone: 'success',
        title: 'จัดวันที่ติดตามแล้ว',
        description: `${target.caseRef} → ${fmtDate(pickedDate)} — ดูได้ที่แท็บ "กำลังติดตาม"`,
      })
      setPickedDate(null)
      onScheduled()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      // ปุ่มจัดวันอยู่ใน body ⇒ ล็อกระหว่างบันทึก (preship R4-006)
      busy={saving}
      size="lg"
      title="เลือกวันที่จะไปติดตาม"
      description={target === null ? undefined : `${target.caseRef} · ${target.debtorName ?? '—'}`}
      footer={
        <Button variant="secondary" onClick={onClose}>
          ปิดหน้าต่าง
        </Button>
      }
    >
      <div className="space-y-3">
        {teammates.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl border-2 border-purple-200 bg-purple-50 p-3">
            <IconAlert className="h-5 w-5 shrink-0 text-purple-500" />
            <div className="text-xs text-purple-700">
              มี <strong>{teammates.join(', ')}</strong> มีเคสในจังหวัด{target?.province} ด้วย —
              ลองคุยเรื่องจัดวันที่/ที่พักร่วมกันไหม?
            </div>
          </div>
        )}

        {/*
          จอแตะ: ช่องวัน/ปุ่มเลื่อนเดือนต้องสูง ≥44px (preship R2-026) — จอ 320px กว้างไม่พอให้ช่องกว้าง 44px ครบ 7 คอลัมน์
          ⇒ ลด padding/gap ใต้ sm ให้ช่องกว้างที่สุด แล้วยืดความสูงเป็น 44px (เลิก aspect-square บน pointer-coarse)
        */}
        <div className="rounded-2xl border-2 border-slate-200 bg-white p-1.5 sm:p-3">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              aria-label="เดือนก่อนหน้า"
              onClick={() => setCurrent((month) => shiftMonth(month, -1))}
              className={cn('focus-ring inline-flex items-center justify-center rounded-lg p-2 text-slate-600 hover:bg-slate-100', TOUCH_TARGET_CLASS)}
            >
              <IconChevronLeft className="h-5 w-5" />
            </button>
            <div className="text-base font-extrabold text-slate-800">{monthLabelTH(current)}</div>
            <button
              type="button"
              aria-label="เดือนถัดไป"
              onClick={() => setCurrent((month) => shiftMonth(month, 1))}
              className={cn('focus-ring inline-flex items-center justify-center rounded-lg p-2 text-slate-600 hover:bg-slate-100', TOUCH_TARGET_CLASS)}
            >
              <IconChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="mb-1.5 grid grid-cols-7 gap-0.5 sm:gap-1">
            {WEEKDAY_LABELS_TH.map((weekday) => (
              <div key={weekday} className="py-1 text-center text-xs font-extrabold text-slate-400">
                {weekday}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
            {cells.map((cell, index) =>
              cell.dateIso === null ? (
                <div key={`empty-${index}`} />
              ) : (
                <button
                  key={cell.dateIso}
                  type="button"
                  disabled={cell.isPast}
                  onClick={() => setPickedDate(cell.dateIso)}
                  className={cn(
                    'focus-ring relative flex aspect-square flex-col items-center justify-center rounded-xl pointer-coarse:aspect-auto pointer-coarse:min-h-11',
                    cell.isPast ? 'cursor-not-allowed text-slate-300' : 'text-slate-800 hover:bg-blue-50',
                    cell.isToday && 'ring-2 ring-slate-900',
                  )}
                >
                  <span className="text-[15px] font-extrabold">{cell.day}</span>
                  {cell.count > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[9px] font-extrabold text-white">
                      {cell.count}
                    </span>
                  )}
                </button>
              ),
            )}
          </div>
        </div>

        <div className="text-xs font-extrabold text-slate-500">รายละเอียดเคสที่กำลังจัดวันที่</div>
        {detailError !== null ? (
          <ErrorState
            title={detailError.title}
            message={detailError.message}
            onRetry={() => {
              setDetailError(null)
              setRetryKey((key) => key + 1)
            }}
          />
        ) : detail === null ? (
          <LoadingState message="กำลังโหลดรายละเอียดเคส..." />
        ) : (
          <FieldCaseDetailView detail={detail} />
        )}
      </div>

      {pickedDate !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-5">
          <div className="absolute inset-0 bg-slate-900/55" onClick={() => setPickedDate(null)} aria-hidden="true" />
          <div
            ref={confirmRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={confirmTitleId}
            tabIndex={-1}
            className="relative w-full max-w-[360px] rounded-2xl bg-white p-4 focus:outline-none"
          >
            <div id={confirmTitleId} className="mb-3 text-base font-extrabold text-slate-900">
              {withWeekdayPrefix(pickedDate, fmtDate(pickedDate))}
            </div>

            {casesOnPickedDate.length > 0 ? (
              <>
                <div className="mb-1.5 text-xs font-extrabold text-slate-500">
                  เคสที่จัดไว้{pickedPhrase}แล้ว ({casesOnPickedDate.length})
                </div>
                <div className="mb-3 max-h-[180px] space-y-1.5 overflow-y-auto">
                  {casesOnPickedDate.map((item, index) => (
                    <div key={item.assignmentId} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                        {index + 1}
                      </span>
                      <span className="truncate text-sm font-bold text-slate-700">{item.debtorName ?? '—'}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="mb-3 text-sm text-slate-400 italic">{pickedPhrase}ยังไม่มีเคสจัดไว้</div>
            )}

            <p className="mb-3 text-xs text-slate-500">
              ยืนยันจัดเคส <strong>{target?.debtorName ?? '—'}</strong> ลง{pickedPhrase}
              {casesOnPickedDate.length > 0 && <> (จะเป็นลำดับที่ {nextOrder})</>}?
            </p>

            <div className="flex gap-2">
              <Button variant="secondary" fullWidth onClick={() => setPickedDate(null)}>
                ยกเลิก
              </Button>
              <Button
                fullWidth
                loading={saving}
                onClick={() => {
                  void confirmSchedule()
                }}
              >
                ยืนยันเลือก{pickedPhrase}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
