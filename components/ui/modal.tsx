'use client'

import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react'
import { Button, type ButtonVariant } from '@/components/ui/button'
import { cn } from '@/components/ui/cn'
import { busyElementLocksModal, decideModalClose } from '@/components/ui/modal-close-guard'
import { guardModalHistory } from '@/components/ui/modal-history'
import { isTopModal, registerModal, unregisterModal } from '@/components/ui/modal-stack'

/**
 * Modal — centered + backdrop ตาม `04` §8/§10
 * ปิดด้วย Esc (เฉพาะ modal บนสุดเมื่อซ้อนกัน — `modal-stack.ts`) / คลิก backdrop · ล็อก scroll ของหน้าเบื้องหลังระหว่างเปิด
 * ระหว่างบันทึก (`busy` หรือมี `<Button loading>` อยู่ใน modal นี้) ปิดไม่ได้และช่องกรอกถูกล็อก ·
 * กรอกข้อมูลแล้วสั่งปิดต้องยืนยันทิ้งก่อน (`confirmDiscard`) — preship PS-001 (`modal-close-guard.ts`)
 * ⚠️ Modal ที่ทำลายข้อมูล (ยกเลิก/ลบ/ปลดล็อก) **ต้อง confirm** และคำบนปุ่มต้องตรง action (`04` §10)
 */

/** คลิก backdrop ภายในช่วงนี้หลังเปิด ⇒ ไม่ปิด (คลิกที่สองของดับเบิลคลิก ~300ms) */
const BACKDROP_CLICK_GRACE_MS = 400

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

const SIZE_CLASS: Readonly<Record<ModalSize, string>> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-3xl',
  /** modal 2 คอลัมน์ที่เนื้อหายาว เช่น Assignment Modal ของ `40` §7.3 */
  xl: 'max-w-6xl',
}

export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  children,
  busy = false,
  lockClose = false,
  confirmDiscard = true,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  size?: ModalSize
  footer?: ReactNode
  children?: ReactNode
  /** กำลังบันทึก — ไม่จำเป็นต้องส่งถ้าปุ่มบันทึกใช้ `<Button loading>` อยู่แล้ว (modal ตรวจเจอเอง) */
  busy?: boolean
  /**
   * ห้ามปิดแต่ยังกรอกต่อได้ — ใช้ตอนงานเบื้องหลังที่ผู้ใช้แก้ฟอร์มต่อได้ระหว่างรอ เช่นอัปโหลดหลักฐาน
   * (ปิดกลางทางแล้วไฟล์ค้างใน storage โดยไม่ผูกกับเคส — preship R2-005)
   */
  lockClose?: boolean
  /** ถามยืนยันก่อนปิดเมื่อผู้ใช้กรอก/เปลี่ยนค่าใน modal แล้ว — ปิดได้สำหรับ modal ที่ช่องกรอกเป็นแค่ตัวกรอง */
  confirmDiscard?: boolean
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [ownBusy, setOwnBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const isBusy = busy || ownBusy
  const closeLocked = isBusy || lockClose
  // handler ของ Esc ผูกกับ `open` อย่างเดียว (ดูเหตุผลด้านล่าง) จึงอ่านค่าล่าสุดผ่าน ref
  const dirtyRef = useRef(false)
  /** เวลาที่เปิด — คลิกที่สองของดับเบิลคลิกปุ่มเปิดตกที่ backdrop ⇒ ไม่นับเป็นสั่งปิด (preship R6-007) */
  const openedAtRef = useRef(0)
  const guardRef = useRef({ closeLocked, confirming, confirmDiscard })
  useEffect(() => {
    guardRef.current = { closeLocked, confirming, confirmDiscard }
  }, [closeLocked, confirming, confirmDiscard])
  // ผู้เรียกมักส่ง `onClose` เป็น arrow ใหม่ทุก render — เก็บใน ref เพื่อให้ effect ด้านล่างผูกกับ `open` อย่างเดียว
  // (ไม่งั้น modal ข้างหลังที่ re-render จะลงทะเบียนชั้นใหม่ขึ้นไปทับตัวบน + แย่ง focus กลับมา)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  /** ปิดตามคำสั่งผู้ใช้ (Esc / backdrop / X) — ผ่าน guard ก่อนเสมอ */
  function requestClose() {
    const { closeLocked: busyNow, confirmDiscard: confirmNow } = guardRef.current
    const decision = decideModalClose({ busy: busyNow, dirty: dirtyRef.current, confirmDiscard: confirmNow })
    if (decision === 'confirm-discard') setConfirming(true)
    else if (decision === 'close') onCloseRef.current()
  }
  const requestCloseRef = useRef(requestClose)
  useEffect(() => {
    requestCloseRef.current = requestClose
  })

  useEffect(() => {
    if (!open) return

    dirtyRef.current = false
    openedAtRef.current = Date.now()
    const panel = panelRef.current
    // ตรวจปุ่ม `<Button loading>` (aria-busy) ของ modal นี้เอง — ไม่นับของ modal ที่ซ้อนอยู่ข้างใน
    // ยกเว้นปุ่มย่อยที่ติด data-modal-busy="ignore" เช่นค้นหา (preship R3-002 → R4-006)
    const observer = new MutationObserver(() => {
      if (panel) setOwnBusy(hasOwnBusyElement(panel))
    })
    if (panel) {
      observer.observe(panel, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-busy'] })
    }

    // modal ซ้อนกัน: Esc ปิดเฉพาะตัวบนสุด (UAT BUG-031 — เดิมตัวข้างหลังปิดแต่หน้าดูไฟล์ค้าง)
    const token = registerModal()

    function handleKey(event: KeyboardEvent) {
      if (event.key !== 'Escape' || !isTopModal(token)) return
      if (guardRef.current.confirming) setConfirming(false)
      else requestCloseRef.current()
    }

    // กรอกแล้วกด refresh/ปิดแท็บ ⇒ ให้ browser ถามก่อนทิ้ง (preship R3-014 — เดิมข้อมูลฟอร์มยาวหายเงียบ)
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current || !guardRef.current.confirmDiscard) return
      event.preventDefault()
      event.returnValue = ''
    }

    // ปุ่ม Back ของ browser = สั่งปิด modal (ผ่าน guard เดียวกับ Esc) แทนการออกจากหน้า — preship R3-014 / R4-005
    // modal ที่ปิดการถามยืนยัน (ช่องกรอกเป็นแค่ตัวกรอง) ไม่ยุ่งกับ history
    const releaseHistory = guardRef.current.confirmDiscard
      ? guardModalHistory({
          onBack: () => {
            // มี modal อื่นซ้อนอยู่ข้างบน (เช่นหน้าดูไฟล์) ⇒ ไม่ปิดตัวข้างหลังทะลุ — อยู่หน้าเดิม
            if (!isTopModal(token)) return 'stay'
            const { closeLocked: busyNow, confirmDiscard: confirmNow } = guardRef.current
            const decision = decideModalClose({ busy: busyNow, dirty: dirtyRef.current, confirmDiscard: confirmNow })
            if (decision === 'close') return 'close'
            if (decision === 'confirm-discard') setConfirming(true)
            return 'stay'
          },
          onClose: () => onCloseRef.current(),
        })
      : null

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKey)
    window.addEventListener('beforeunload', handleBeforeUnload)
    panelRef.current?.focus()

    return () => {
      observer.disconnect()
      setOwnBusy(false)
      setConfirming(false)
      unregisterModal(token)
      releaseHistory?.()
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKey)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [open])

  /** ผู้ใช้กรอก/เปลี่ยนค่าเอง (ไม่นับค่าที่โค้ดตั้ง และช่องค้นหา) ⇒ ถือว่ามีข้อมูลที่ยังไม่บันทึก */
  function markDirty(event: SyntheticEvent) {
    if (!event.nativeEvent.isTrusted) return
    const target = event.target
    if (!(target instanceof HTMLElement) || target.closest('[role="dialog"]') !== panelRef.current) return
    if (target instanceof HTMLInputElement && target.type === 'search') return
    dirtyRef.current = true
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40"
        onClick={() => {
          if (Date.now() - openedAtRef.current < BACKDROP_CLICK_GRACE_MS) return
          requestClose()
        }}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-busy={isBusy || undefined}
        tabIndex={-1}
        onInput={markDirty}
        onChange={markDirty}
        className={cn(
          // header/footer คงที่ · body เลื่อนได้เมื่อเนื้อหายาว (`40` §7.3 — modal ที่ยาวกว่าปกติ)
          'fade-in relative flex max-h-[90vh] w-full flex-col rounded-xl border border-slate-200 bg-white shadow-lg focus:outline-none',
          SIZE_CLASS[size],
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
            {description !== undefined && <p className="mt-1 text-xs text-slate-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={closeLocked}
            aria-label="ปิด"
            // จอสัมผัสขยายพื้นที่แตะเป็น 44×44 (เดิม 24×24 — preship PS-018)
            className="focus-ring inline-flex items-center justify-center rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:-m-2.5 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {children !== undefined && (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm text-slate-700">
            {/* ล็อกช่องกรอกระหว่างบันทึก — ค่าที่แก้ตอนนี้ไม่ได้ไปกับ request ที่กำลังส่ง */}
            <fieldset disabled={isBusy} className="m-0 min-w-0 border-0 p-0">
              {children}
            </fieldset>
          </div>
        )}

        {footer !== undefined && (
          // มุมล่างโค้งตามกรอบ — เดิมพื้น slate-50 มุมเหลี่ยมโผล่เกินขอบ rounded-xl (preship R9-007)
          <div className="shrink-0 rounded-b-xl border-t border-slate-200 bg-slate-50 px-5 py-3">
            {/* ปุ่มใน footer (รวม "ยกเลิก") ล็อกระหว่างบันทึกด้วย — เดิมปุ่มยกเลิกปิด modal กลางคำขอได้ (preship R2-006) */}
            <fieldset disabled={isBusy} className="m-0 flex w-full min-w-0 items-center justify-end gap-2 border-0 p-0">
              {footer}
            </fieldset>
          </div>
        )}

        {confirming && (
          <div
            role="alertdialog"
            aria-labelledby="modal-discard-title"
            className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/90 p-4"
          >
            <div className="w-full max-w-xs rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
              <h3 id="modal-discard-title" className="text-sm font-bold text-slate-900">
                ทิ้งข้อมูลที่กรอกไว้?
              </h3>
              <p className="mt-1 text-xs text-slate-500">ข้อมูลที่ยังไม่ได้บันทึกในหน้าต่างนี้จะหายไป</p>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setConfirming(false)} autoFocus>
                  กลับไปแก้ไข
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    setConfirming(false)
                    onCloseRef.current()
                  }}
                >
                  ทิ้งข้อมูล
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Modal ยืนยันการทำรายการ — ใช้กับทุก action ที่ทำลายข้อมูล/กระทบเงิน
 * งานที่ `90` §13 บังคับ `reason` (เงิน/สิทธิ์/ธนาคาร/ภาษี/lock period) ให้ส่งช่องกรอกเหตุผลเข้ามาทาง `children`
 */
export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel = 'ยกเลิก',
  confirmVariant = 'danger',
  loading = false,
  confirmDisabled = false,
  children,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: ReactNode
  description?: ReactNode
  /** คำบนปุ่มต้องตรงกับ action จริง เช่น "ยืนยันส่งมอบล็อต" ไม่ใช่ "ตกลง" (`04` §10) */
  confirmLabel: string
  cancelLabel?: string
  confirmVariant?: ButtonVariant
  loading?: boolean
  confirmDisabled?: boolean
  children?: ReactNode
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      busy={loading}
      // ช่องเหตุผลสั้นๆ — ไม่ต้องถามยืนยันทิ้ง
      confirmDiscard={false}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} loading={loading} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  )
}

/** มีปุ่มกำลังทำงาน (`aria-busy`) ของ panel นี้เอง (ไม่ใช่ของ modal ที่ซ้อนข้างใน) — เกณฑ์ใน `busyElementLocksModal` */
function hasOwnBusyElement(panel: HTMLElement): boolean {
  return Array.from(panel.querySelectorAll('[aria-busy="true"]')).some((element) => {
    if (element === panel || element.closest('[role="dialog"]') !== panel) return false
    return busyElementLocksModal({ optedOut: element.getAttribute('data-modal-busy') === 'ignore' })
  })
}
