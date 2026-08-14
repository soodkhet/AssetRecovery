'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFieldCases } from '@/components/field/field-cases-provider'
import { IconAlert, IconCalendar } from '@/components/field/field-icons'
import { ReassignmentModal } from '@/components/field/reassignment-modal'
import { useToast } from '@/components/ui'
import {
  EMPTY_REASSIGNMENT_WATCH,
  nextReassignmentPopup,
  reassignedAwayMessage,
  trackReassignments,
} from '@/lib/field/reassignment-ui'

/**
 * เจ้าของ **Pending Reassignment Flow** ทั้งหมดของ Field Tracker (`41` §7.8) — อยู่ระดับ shell
 * เพื่อให้ทั้ง 3 ทางเข้าเปิด modal ตัวเดียวกันและมี auto-popup ชุดเดียวไม่ซ้อนกัน:
 *
 * 1. **auto-popup** ทุกครั้งที่โหลดหน้าแล้วมีคำขอที่ยังไม่ตอบและยังไม่กด "ดูทีหลัง" ในเซสชันนี้
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
  const [dismissed, setDismissed] = useState<readonly string[]>([])
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

  function respondFromPopup(caseId: string): void {
    setDismissed((current) => (current.includes(caseId) ? current : [...current, caseId]))
    setOpenCaseId(caseId)
  }

  function handleResponded(caseId: string): void {
    watch.current = { ...watch.current, answered: [...watch.current.answered, caseId] }
    void reload()
  }

  return (
    <ReassignmentContext.Provider value={value}>
      {children}

      {popupCase !== null && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-5">
          <div className="fade-in w-full max-w-[420px] rounded-2xl bg-white p-5 shadow-lg">
            <div className="mb-3 flex items-center gap-2.5">
              <IconAlert className="h-5 w-5 text-purple-600" />
              <div className="text-base font-extrabold text-slate-900">มีคำขอเปลี่ยนผู้รับผิดชอบ</div>
            </div>
            <div className="mb-3 rounded-2xl border-2 border-purple-200 bg-purple-50 p-3.5">
              <div className="text-sm font-bold text-slate-800">{popupCase.debtorName ?? '—'}</div>
              <div className="mb-2 text-xs text-slate-500">
                {[popupCase.district, popupCase.province].filter((part) => part !== null).join(', ') || '—'}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-purple-600">
                <IconCalendar className="h-4 w-4" /> เปิดดูรายละเอียดคำขอและเวลาหมดเขตได้ที่ปุ่ม &ldquo;ตอบเลย&rdquo;
              </div>
            </div>
            <p className="mb-4 text-xs text-slate-400">
              ถ้าไม่ตอบภายในเวลาที่กำหนด ระบบจะเปลี่ยนผู้รับผิดชอบให้อัตโนมัติ
            </p>
            <button
              type="button"
              onClick={() => respondFromPopup(popupCase.caseId)}
              className="focus-ring mb-2 w-full rounded-xl bg-slate-900 py-3.5 text-sm font-extrabold text-white hover:bg-slate-800"
            >
              ตอบเลย
            </button>
            <button
              type="button"
              onClick={() =>
                setDismissed((current) =>
                  current.includes(popupCase.caseId) ? current : [...current, popupCase.caseId],
                )
              }
              className="focus-ring w-full py-2.5 text-xs font-bold text-slate-400 hover:text-slate-600"
            >
              ดูทีหลัง
            </button>
          </div>
        </div>
      )}

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
