'use client'

import { useEffect, useState } from 'react'
import { PaymentInfoIncompleteBadge } from '@/components/payees/payment-info-incomplete-badge'
import {
  EMPTY_PAYEE_FIELDS,
  PayeeFieldsSection,
  payeeFieldsFromDto,
  type PayeeFieldsForm,
} from '@/components/payees/payee-fields-section'
import { Field, InlineAlert, LoadingState, StatusBadge, Textarea } from '@/components/ui'
import { callApi } from '@/lib/api/types'
import { verificationHint } from '@/lib/payees/payee'
import type { PayeeDto } from '@/lib/payees/types'
import type { TaxProfileDto } from '@/lib/settings/types'

/**
 * ส่วน "ข้อมูลรับเงิน" ในฟอร์มเพิ่ม/แก้ผู้ใช้เจ้าหน้าที่ติดตามทรัพย์ (มติ PO U131)
 *
 * - ฟิลด์ชุดเดียวกับหน้า "ผู้รับเงิน" (`PayeeFieldsSection`) — ชื่อผู้รับ = ชื่อผู้ใช้จุดเดียว (ไม่มีช่องชื่อ)
 * - บันทึกพร้อมผู้ใช้ใน transaction เดียว · ติ๊ก "ยืนยันข้อมูลรับเงิน" = ยืนยันต่อทันที (สิทธิ์/audit เดิม · U106)
 * - แสดงเฉพาะผู้ถือ `manage:manage_payee_profile` (UX) — API ตรวจซ้ำเสมอ (DEC-002)
 * - ไม่แตะส่วนนี้ = ไม่ส่ง (ไม่สร้าง/แก้ Payee)
 */

export interface UserPaymentState {
  fields: PayeeFieldsForm
  verify: boolean
  reason: string
}

export const EMPTY_USER_PAYMENT: UserPaymentState = { fields: EMPTY_PAYEE_FIELDS, verify: false, reason: '' }

/** ส่วนนี้ถูกแก้/ติ๊กยืนยันไหม — ไม่ = ไม่ส่ง `payment` ไป API */
export function isUserPaymentTouched(state: UserPaymentState, initial: PayeeFieldsForm): boolean {
  return state.verify || JSON.stringify(state.fields) !== JSON.stringify(initial)
}

export function UserPaymentSection({
  payeeId,
  state,
  onChange,
  onLoaded,
  errors,
}: {
  /** Payee เดิมของผู้ใช้ (`UserDto.payeeId`) · `null` = ยังไม่มี (สร้างเมื่อบันทึก) */
  payeeId: string | null
  state: UserPaymentState
  onChange: (next: UserPaymentState) => void
  /** ค่าตั้งต้นของฟิลด์ (ใช้เทียบว่าแก้หรือยัง) */
  onLoaded: (initial: PayeeFieldsForm) => void
  /** error ตามชื่อฟิลด์ของ `payeeFieldsSchema` + `reason` */
  errors: Record<string, string | undefined>
}) {
  const [payee, setPayee] = useState<PayeeDto | null>(null)
  const [loading, setLoading] = useState(payeeId !== null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [taxProfiles, setTaxProfiles] = useState<readonly TaxProfileDto[]>([])
  const [allowGrossUp, setAllowGrossUp] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [profiles, policy, current] = await Promise.all([
        callApi<TaxProfileDto[]>('/api/settings/tax-profiles?status=active'),
        callApi<{ allowGrossUpConditions: boolean }>('/api/payees/wht-condition-policy'),
        payeeId === null ? Promise.resolve(null) : callApi<PayeeDto>(`/api/payees/${payeeId}`),
      ])
      if (cancelled) return
      setTaxProfiles(profiles.data ?? [])
      setAllowGrossUp(policy.data?.allowGrossUpConditions ?? false)
      if (current !== null) {
        if (current.error !== undefined || current.data === undefined) {
          setLoadError(current.error?.message ?? 'โหลดข้อมูลรับเงินไม่สำเร็จ')
        } else {
          setPayee(current.data)
          const initial = payeeFieldsFromDto(current.data)
          onLoaded(initial)
          onChange({ fields: initial, verify: false, reason: '' })
        }
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
    // โหลดครั้งเดียวต่อการเปิดฟอร์ม — onChange/onLoaded เปลี่ยนทุก render ของผู้เรียก
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payeeId])

  function setField(key: keyof PayeeFieldsForm, value: PayeeFieldsForm[keyof PayeeFieldsForm]): void {
    onChange({ ...state, fields: { ...state.fields, [key]: value } })
  }

  const missing = payee?.missingForVerification ?? null
  const hint = missing === null ? null : verificationHint(missing)

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 p-4" aria-labelledby="user-payment-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id="user-payment-heading" className="text-sm font-bold text-slate-900">
            ข้อมูลรับเงิน
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            ใช้จ่ายค่าตอบแทนและออกหนังสือรับรองการหักภาษี — ชื่อผู้รับเงินใช้ชื่อ-นามสกุลของผู้ใช้
          </p>
        </div>
        {payee !== null &&
          (payee.isVerified ? (
            <StatusBadge status="approved" group="success" label="ยืนยันแล้ว" />
          ) : payee.missingForVerification.length > 0 ? (
            <PaymentInfoIncompleteBadge title={hint ?? undefined} />
          ) : (
            <StatusBadge status="pending" group="pending" label="รอยืนยัน" />
          ))}
      </div>

      {loading && <LoadingState message="กำลังโหลดข้อมูลรับเงิน…" />}
      {loadError !== null && (
        <InlineAlert tone="error" title="โหลดข้อมูลรับเงินไม่สำเร็จ">
          {loadError}
        </InlineAlert>
      )}

      {!loading && loadError === null && (
        <>
          <PayeeFieldsSection
            form={state.fields}
            onChange={setField}
            errors={errors}
            taxProfiles={taxProfiles}
            allowGrossUp={allowGrossUp}
            originalCondition={payee?.whtCondition ?? null}
          />

          {payee?.isVerified === true && (
            <InlineAlert tone="info" title="แก้ข้อมูลภาษี/ที่อยู่/บัญชีแล้วต้องยืนยันใหม่">
              ถ้าแก้ประเภท เลขผู้เสียภาษี ที่อยู่ สาขา เงื่อนไขการหัก กติกาภาษี หรือข้อมูลธนาคาร สถานะจะกลับเป็น “รอยืนยัน”
            </InlineAlert>
          )}

          <label className="flex items-start gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={state.verify}
              onChange={(event) => onChange({ ...state, verify: event.target.checked })}
            />
            <span>
              <span className="font-semibold">ยืนยันข้อมูลรับเงิน</span> — ตรวจเลขบัญชีและข้อมูลภาษีกับเอกสารแล้ว
              (ยืนยันแล้วจึงรวมเข้ารอบจ่ายเงินได้ · ข้อมูลไม่ครบ ระบบจะไม่บันทึกและแจ้งช่องที่ขาด)
            </span>
          </label>

          <Field
            id="user-payment-reason"
            label="เหตุผลการแก้ข้อมูลรับเงิน"
            required
            hint="ข้อมูลธนาคาร/ภาษีกระทบเงินที่โอนจริง — บันทึกลงประวัติการแก้ไขเสมอ (กรอกเมื่อแก้ส่วนนี้หรือติ๊กยืนยัน)"
            error={errors.reason}
          >
            <Textarea
              id="user-payment-reason"
              rows={2}
              value={state.reason}
              onChange={(event) => onChange({ ...state, reason: event.target.value })}
            />
          </Field>
        </>
      )}
    </section>
  )
}
