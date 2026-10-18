'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFieldCases } from '@/components/field/field-cases-provider'
import { IconAlert, IconCalendar } from '@/components/field/field-icons'
import { ReassignmentModal } from '@/components/field/reassignment-modal'
import { Button, Modal, useToast } from '@/components/ui'
import {
  EMPTY_REASSIGNMENT_WATCH,
  nextReassignmentPopup,
  parseDismissedPopups,
  pruneDismissedPopups,
  REASSIGNMENT_DISMISSED_STORAGE_KEY,
  reassignedAwayMessage,
  reassignmentCountdown,
  reassignmentPopupKey,
  trackReassignments,
} from '@/lib/field/reassignment-ui'
import { fmtDateTime } from '@/lib/format/datetime'

/**
 * เจ้าของ **Pending Reassignment Flow** ทั้งหมดของ Field Tracker (`41` §7.8) — อยู่ระดับ shell
 * เพื่อให้ทั้ง 3 ทางเข้าเปิด modal ตัวเดียวกันและมี auto-popup ชุดเดียวไม่ซ้อนกัน:
 *
 * 1. **auto-popup** ทุกครั้งที่โหลดหน้าแล้วมีคำขอที่ยังไม่ตอบและยังไม่กด "ดูทีหลัง" ในเซสชันนี้
 *    — "ดูทีหลัง" จำต่อคำขอใน sessionStorage ⇒ รีเฟรช/เปิดลิงก์ใหม่ในแท็บเดิมไม่เด้งซ้ำ (mytester7 S7-AG6-06)
 * 2. ปุ่ม "ตอบคำขอ" บนการ์ดแท็บกำลังติดตาม → `openReassignment(caseId)`
 * 3. ปุ่ม "ตอบคำขอนี้" ในหน้ารายละเอียดเคส → `openReassignment(caseId)`
 *
 * "ดูทีหลัง" ปิดแค่ popup — **badge ม่วงยังค้าง** เพราะ badge นับจาก `hasPendingReassignment`
 * ที่ `<FieldCasesProvider>` ไม่ได้ดูรายการที่ dismiss
 */

interface ReassignmentContextValue {
  openReassignment: (caseId: string) => void
  /** พักการเด้ง auto-popup ระหว่างที่มี modal อื่นเปิดอยู่ (เช่น ฟอร์มปิดงาน) */
  setPopupPaused: (paused: boolean) => void
}

const ReassignmentContext = createContext<ReassignmentContextValue | null>(null)

export function useReassignment(): ReassignmentContextValue {
  return useContext(ReassignmentContext) ?? { openReassignment: () => {}, setPopupPaused: () => {} }
}

export function FieldReassignmentProvider({ children }: { children: ReactNode }) {
  const { items, reload } = useFieldCases()
  const { showToast } = useToast()
  const [openCaseId, setOpenCaseId] = useState<string | null>(null)
  // อ่านค่าครั้งแรกจาก sessionStorage — ตอน render ฝั่ง server/โหมดส่วนตัวที่เข้าถึงไม่ได้ = เริ่มว่าง
  // (รายการเคสเริ่มว่างเสมอจนกว่าจะโหลดเสร็จ จึงไม่ทำให้ hydration ไม่ตรง)
  const [dismissed, setDismissed] = useState<readonly string[]>(readDismissedPopups)
  const [paused, setPaused] = useState(false)
  /** สถานะติดตามคำขอข้ามรอบโหลด — เก็บใน ref เพราะไม่ต้อง re-render เมื่อเปลี่ยน */
  const watch = useRef(EMPTY_REASSIGNMENT_WATCH)

  // เคสที่ถูกโอนไปเพราะตอบไม่ทัน = toast เบา ๆ ครั้งเดียว (ไม่ใช้ popup — §7.8 ท้ายหัวข้อ)
  useEffect(() => {
    void (async () => {
      const { next, autoResolved } = trackReassignments(items, watch.current)
      watch.current = next
      for (const entry of autoResolved) {
        showToast({
          tone: 'info',
          title: reassignedAwayMessage(entry),
          description: 'ดูรายละเอียดย้อนหลังได้ที่แท็บ "จบงาน"',
        })
      }
    })()
  }, [items, showToast])

  const openReassignment = useCallback((caseId: string) => setOpenCaseId(caseId), [])
  const setPopupPaused = useCallback((value: boolean) => setPaused(value), [])

  const value = useMemo<ReassignmentContextValue>(
    () => ({ openReassignment, setPopupPaused }),
    [openReassignment, setPopupPaused],
  )

  const popupCase = openCaseId !== null || paused ? null : nextReassignmentPopup(items, dismissed)

  /** "ดูทีหลัง" — ปิดเฉพาะ popup ในเซสชันนี้ (badge ม่วงยังค้าง) · จำข้ามการโหลดหน้า (S7-AG6-06) */
  function dismissPopup(key: string): void {
    if (dismissed.includes(key)) return
    const next = pruneDismissedPopups([...dismissed, key], items)
    writeDismissedPopups(next)
    setDismissed(next)
  }

  function respondFromPopup(caseId: string, key: string): void {
    dismissPopup(key)
    setOpenCaseId(caseId)
  }

  const popupCountdown =
    popupCase?.pendingReassignmentExpiresAt == null
      ? null
      : reassignmentCountdown(popupCase.pendingReassignmentExpiresAt, new Date())

  function handleResponded(caseId: string): void {
    watch.current = { ...watch.current, answered: [...watch.current.answered, caseId] }
    void reload()
  }

  return (
    <ReassignmentContext.Provider value={value}>
      {children}

      {/*
        โมดัลกลาง (role=dialog · aria-modal · กักโฟกัส · คืนโฟกัส) — เดิมเป็น div ธรรมดา โฟกัสหลุดไปหลังจอ (mytester6 T-001)
        · คำขอนี้เลื่อนตอบได้ ("ดูทีหลัง" — badge ยังค้าง) ⇒ Esc/X/Back = "ดูทีหลัง" · ไม่มีช่องกรอก จึงไม่ถามทิ้งข้อมูล
        · `closeOnBack` = ผูก Back แม้ปิดการถาม (เดิม Back ออกจากหน้าแล้ว popup เด้งใหม่ที่หน้าก่อนหน้า — mytester6 SV6-01)
      */}
      <Modal
        open={popupCase !== null}
        onClose={() => {
          if (popupCase !== null) dismissPopup(reassignmentPopupKey(popupCase))
        }}
        size="sm"
        confirmDiscard={false}
        closeOnBack
        title={
          <span className="flex items-center gap-2.5">
            <IconAlert className="h-5 w-5 text-purple-600" />
            มีคำขอเปลี่ยนผู้รับผิดชอบ
          </span>
        }
        footer={
          popupCase === null ? undefined : (
            <div className="flex w-full flex-col gap-2">
              <Button
                variant="primary"
                className="w-full justify-center py-3.5"
                data-autofocus
                onClick={() => respondFromPopup(popupCase.caseId, reassignmentPopupKey(popupCase))}
              >
                ตอบเลย
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-center"
                onClick={() => dismissPopup(reassignmentPopupKey(popupCase))}
              >
                ดูทีหลัง
              </Button>
            </div>
          )
        }
      >
        {popupCase !== null && (
          <>
            <div className="mb-3 rounded-2xl border-2 border-purple-200 bg-purple-50 p-3.5">
              <div className="text-sm font-bold text-slate-800">{popupCase.debtorName ?? '—'}</div>
              <div className="mb-2 text-xs text-slate-500">
                {[popupCase.district, popupCase.province].filter((part) => part !== null).join(', ') || '—'}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-purple-600">
                <IconCalendar className="h-4 w-4" />
                {popupCase.pendingReassignmentExpiresAt == null ? (
                  <>เปิดดูรายละเอียดคำขอและเวลาหมดเขตได้ที่ปุ่ม &ldquo;ตอบเลย&rdquo;</>
                ) : (
                  <>หมดเขตตอบ {fmtDateTime(popupCase.pendingReassignmentExpiresAt)}</>
                )}
              </div>
            </div>
            {popupCountdown?.expired === true ? (
              // หมดเวลาแล้วแต่ระบบยังไม่ทันโอน — บอกก่อนกด ไม่ให้กดตอบแล้วโดนปฏิเสธ (S7-AG5-03)
              <p className="rounded-xl border-2 border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-700">
                หมดเวลาตอบแล้ว — ระบบจะเปลี่ยนผู้รับผิดชอบให้อัตโนมัติตามกติกา
              </p>
            ) : (
              <p className="text-xs text-slate-500">ถ้าไม่ตอบภายในเวลาที่กำหนด ระบบจะเปลี่ยนผู้รับผิดชอบให้อัตโนมัติ</p>
            )}
          </>
        )}
      </Modal>

      {openCaseId !== null && (
        <ReassignmentModal
          key={openCaseId}
          caseId={openCaseId}
          onClose={() => setOpenCaseId(null)}
          onResponded={handleResponded}
        />
      )}
    </ReassignmentContext.Provider>
  )
}

/** sessionStorage อาจโยนได้ (โหมดส่วนตัว/บล็อกข้อมูลเว็บ/render ฝั่ง server) — ล้ม = เริ่มว่าง ไม่พังหน้า */
function readDismissedPopups(): string[] {
  try {
    if (typeof window === 'undefined') return []
    return parseDismissedPopups(window.sessionStorage.getItem(REASSIGNMENT_DISMISSED_STORAGE_KEY))
  } catch {
    return []
  }
}

function writeDismissedPopups(keys: readonly string[]): void {
  try {
    window.sessionStorage.setItem(REASSIGNMENT_DISMISSED_STORAGE_KEY, JSON.stringify(keys))
  } catch {
    // เก็บไม่ได้ = จำได้แค่ในหน้านี้ (พฤติกรรมเดิม)
  }
}
