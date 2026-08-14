'use client'

import { ConfirmModal, Field, Textarea } from '@/components/ui'

/**
 * กล่องยืนยันที่บังคับกรอก "เหตุผล" — ใช้ร่วมทุกแท็บของการตั้งค่าบัญชี/การเงิน (ไฟล์ 13)
 *
 * ทุกตารางในไฟล์ 13 อยู่หมวด money/permission/bank/tax ⇒ `reason` **บังคับทุก mutation**
 * (`90` §13 · `lib/audit/reason-policy.ts`) — API ปฏิเสธซ้ำเสมอ ปุ่มที่ disable เป็นแค่ UX
 */

export const REASON_MIN_LENGTH = 5

export function ReasonConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  confirmVariant = 'danger',
  loading = false,
  reason,
  onReasonChange,
  onClose,
  onConfirm,
  placeholder,
  children,
}: {
  open: boolean
  title: string
  description?: string
  confirmLabel: string
  confirmVariant?: 'primary' | 'danger'
  loading?: boolean
  reason: string
  onReasonChange: (value: string) => void
  onClose: () => void
  onConfirm: () => void
  placeholder?: string
  children?: React.ReactNode
}) {
  return (
    <ConfirmModal
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      confirmVariant={confirmVariant}
      loading={loading}
      confirmDisabled={reason.trim().length < REASON_MIN_LENGTH}
    >
      {children}
      <Field id="settings-reason" label="เหตุผล" required>
        <Textarea
          id="settings-reason"
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
          placeholder={placeholder ?? 'เช่น ปรับตามมติที่ประชุมการเงิน 14/08/2569'}
        />
      </Field>
    </ConfirmModal>
  )
}
