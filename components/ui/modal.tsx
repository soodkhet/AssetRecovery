'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { Button, type ButtonVariant } from '@/components/ui/button'
import { cn } from '@/components/ui/cn'

/**
 * Modal — centered + backdrop ตาม `04` §8/§10
 * ปิดด้วย Esc / คลิก backdrop · ล็อก scroll ของหน้าเบื้องหลังระหว่างเปิด
 * ⚠️ Modal ที่ทำลายข้อมูล (ยกเลิก/ลบ/ปลดล็อก) **ต้อง confirm** และคำบนปุ่มต้องตรง action (`04` §10)
 */

export type ModalSize = 'sm' | 'md' | 'lg'

const SIZE_CLASS: Readonly<Record<ModalSize, string>> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-3xl',
}

export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  children,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  size?: ModalSize
  footer?: ReactNode
  children?: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKey)
    panelRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          'fade-in relative w-full rounded-xl border border-slate-200 bg-white shadow-lg focus:outline-none',
          SIZE_CLASS[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
            {description !== undefined && <p className="mt-1 text-xs text-slate-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="focus-ring rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {children !== undefined && <div className="px-5 py-4 text-sm text-slate-700">{children}</div>}

        {footer !== undefined && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
            {footer}
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
