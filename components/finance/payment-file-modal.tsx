'use client'

import { buttonClass } from '@/components/ui/button'
import { useCallback, useEffect, useId, useState } from 'react'
import {
  Button,
  Field,
  FormSubmitFooter,
  InlineAlert,
  Modal,
  ModalCancelButton,
  RefText,
  Select,
  Textarea,
  useRevealFieldError,
  useSubmitError,
  useToast,
} from '@/components/ui'
import { REASON_MIN_LENGTH } from '@/components/settings/reason-confirm-modal'
import { callApi, jsonRequest, type ApiWarning } from '@/lib/api/types'
import { fmtCount, fmtSatangSymbol } from '@/lib/format/money'
import {
  defaultPayoutBankAccountId,
  hasAdvanceOffset,
  isDuplicatePaymentFile,
  paymentFileBankMismatchText,
  payoutTransferText,
} from '@/lib/payout/payout-ui'
import type { PaymentFileResultDto, PayoutBatchDto } from '@/lib/payout/types'
import type { BankAccountDto, BankFileFormatDto } from '@/lib/settings/types'
import { defaultPaymentFileFormatId } from '@/lib/settings/bank-account'

/**
 * Modal "สร้างไฟล์โอนเงินธนาคาร" (`17` §8/§6.3 · mockup `finance.html` `payment-file`)
 *
 * ### จุดที่ห้ามพลาด
 * - **ยิง 2 ครั้งเสมอเมื่อรอบนี้เคยสร้างไฟล์แล้ว**: ครั้งแรก API ตอบ `generated: false` +
 *   `warning: DUPLICATE_PAYMENT_FILE` → หน้าจอโชว์คำเตือนพร้อมวันที่ครั้งก่อน → กดยืนยันจึงส่ง
 *   `confirmDuplicate: true` (เตือน ไม่ reject — `24` กลุ่ม "เตือนอย่างเดียว")
 * - **`reason` บังคับ** ทุกครั้ง (เงิน + ธนาคาร — `90` §13)
 * - รูปแบบไฟล์ที่ยัง `test_status ≠ passed` เลือกไม่ได้ (`BANK_FILE_NOT_TESTED` — `13` §6.8)
 * - ดาวน์โหลดเป็น `<a href>` ตรงไป endpoint (bucket private ไม่แจก signed URL ให้ browser)
 * - ยอดทุกช่องมาจากรอบจ่ายที่ API ส่งมา — หน้าจอไม่คิดยอดเอง (Rule 01)
 */
export function PaymentFileModal({
  batch,
  onClose,
  onDone,
}: {
  batch: PayoutBatchDto | null
  onClose: () => void
  onDone: () => void
}) {
  // id ผูก label ↔ ช่อง + aria-invalid/aria-describedby ผ่าน `<Field id>` (ตรวจซ้ำ staging SV5-R9-01)
  const fieldId = useId()
  const { showToast } = useToast()
  const [formats, setFormats] = useState<readonly BankFileFormatDto[]>([])
  const [accounts, setAccounts] = useState<readonly BankAccountDto[]>([])
  const [formatId, setFormatId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [duplicateWarning, setDuplicateWarning] = useState<ApiWarning | null>(null)
  const [generated, setGenerated] = useState<PaymentFileResultDto | null>(null)
  // ข้อผิดตอนกดสร้างไฟล์ ⇒ footer ติดจอ + ใต้ช่อง (มติผู้ใช้ 15/10/2569)
  const { ref: formRef, reveal: revealFormError } = useRevealFieldError()
  const submitError = useSubmitError(revealFormError)

  const batchId = batch?.id ?? null
  const previousAccountId = batch?.bankAccountId ?? null

  const loadOptions = useCallback(async () => {
    const [formatResult, accountResult] = await Promise.all([
      callApi<BankFileFormatDto[]>('/api/settings/bank-file-formats?status=active'),
      callApi<BankAccountDto[]>('/api/settings/bank-accounts?status=active'),
    ])
    return {
      // ไฟล์โอนเท่านั้น — รูปแบบ statement ใช้นำเข้ากระทบยอด ไม่ใช่สร้างไฟล์โอน (มติ PO U147)
      formats: (formatResult.data ?? []).filter((format) => format.purpose === 'payment'),
      accounts: (accountResult.data ?? []).filter((account) => account.canPay),
    }
  }, [])

  useEffect(() => {
    if (batchId === null) return
    let cancelled = false
    void (async () => {
      const options = await loadOptions()
      if (cancelled) return
      setFormats(options.formats)
      setAccounts(options.accounts)
      // mytester F-06 — บัญชีเดิมของรอบ → บัญชีที่ผูกรูปแบบไฟล์โอน → บัญชีหลัก
      const defaultAccountId = defaultPayoutBankAccountId(options.accounts, previousAccountId)
      const account = options.accounts.find((item) => item.id === defaultAccountId)
      setAccountId(defaultAccountId)
      // รูปแบบไฟล์โอนที่ตั้งไว้กับบัญชีต้นทาง (ตั้งค่า → บัญชีธนาคารบริษัท) ถูกเลือกให้ก่อน — Final ด่าน 5
      setFormatId(defaultPaymentFileFormatId(options.formats, account?.paymentFileFormatId))
    })()
    return () => {
      cancelled = true
    }
  }, [batchId, previousAccountId, loadOptions])

  function changeAccount(nextId: string): void {
    submitError.clearField('bankAccountId')
    setAccountId(nextId)
    const account = accounts.find((item) => item.id === nextId)
    if (account?.paymentFileFormatId) setFormatId(defaultPaymentFileFormatId(formats, account.paymentFileFormatId))
  }

  if (batch === null) return null

  const wasGeneratedBefore = isDuplicatePaymentFile(batch)
  const bankMismatch = paymentFileBankMismatchText(
    formats.find((format) => format.id === formatId),
    accounts.find((account) => account.id === accountId),
  )
  const ready = formatId !== '' && accountId !== '' && reason.trim().length >= REASON_MIN_LENGTH

  async function submit(): Promise<void> {
    if (batch === null || !ready) return
    submitError.clear()
    setSaving(true)
    const result = await callApi<PaymentFileResultDto>(
      `/api/payout-batches/${batch.id}/generate-payment-file`,
      jsonRequest('POST', {
        bankAccountId: accountId,
        bankFileFormatId: formatId,
        // ครั้งแรกส่ง false เสมอ — ยืนยันหลังเห็นคำเตือนแล้วเท่านั้นจึงเป็น true (`17` §6.3)
        confirmDuplicate: duplicateWarning !== null,
        reason: reason.trim(),
      }),
    )
    setSaving(false)

    if (result.error !== undefined) {
      submitError.fail(result.error)
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }

    const outcome = result.data
    if (outcome === undefined) return

    if (!outcome.generated) {
      // เคยสร้างไฟล์มาก่อน — ยังไม่สร้างจริง รอผู้ใช้ยืนยันอีกครั้ง
      setDuplicateWarning(result.warning ?? null)
      showToast({
        tone: 'warning',
        title: result.warning?.title ?? 'รอบจ่ายนี้เคยสร้างไฟล์โอนแล้ว',
        description: result.warning?.message ?? 'ตรวจสอบก่อนยืนยันสร้างซ้ำ',
      })
      return
    }

    setGenerated(outcome)
    showToast({
      tone: 'success',
      title: 'สร้างไฟล์โอนแล้ว',
      // ยอดโอนจริงจาก server (หักคืนเงินทดรองแล้ว — BUG-154)
      description: `${outcome.fileName ?? ''} · ${fmtCount(outcome.rowCount)} รายการ · ${payoutTransferText(outcome.batch)}`,
    })
    onDone()
  }

  /** ปิดทุกทาง (ยกเลิก/Esc/X/Back/ทิ้งข้อมูล/ปิดหลังสร้างแล้ว) ⇒ ล้างร่าง — ยกเลิกถามก่อนเมื่อมีร่าง (มติผู้ใช้ 15/10/2569) */
  function close(): void {
    // บัญชี/รูปแบบที่แก้ไว้ไม่ค้าง — เปิดใหม่ได้ค่าเริ่มต้นของรอบจาก effect (ไม่วาบค่าที่แก้ไว้)
    setFormatId('')
    setAccountId('')
    setReason('')
    submitError.clear()
    setDuplicateWarning(null)
    setGenerated(null)
    onClose()
  }

  const confirming = duplicateWarning !== null

  return (
    <Modal
      open
      onClose={close}
      // สร้างไฟล์แล้ว = บันทึกแล้ว ⇒ Esc/X ปิดได้ทันที ไม่ถาม "ทิ้งข้อมูลที่กรอกไว้?" (staging E-051)
      confirmDiscard={generated === null}
      size="lg"
      title={confirming ? '⚠️ สร้างไฟล์โอนซ้ำ' : 'สร้างไฟล์โอนเงินธนาคาร'}
      description={batch.name}
      footer={
        generated === null ? (
          <FormSubmitFooter message={submitError.message} tick={submitError.tick}>
            <ModalCancelButton onClose={close} />
            <Button
              variant={confirming ? 'danger' : 'primary'}
              loading={saving}
              disabled={!ready}
              onClick={() => void submit()}
            >
              {confirming ? 'ยืนยันสร้างซ้ำ (ระวังโอนซ้ำ)' : 'สร้างไฟล์โอน'}
            </Button>
          </FormSubmitFooter>
        ) : (
          <>
            {/* สร้างไฟล์แล้ว (confirmDiscard ปิด) ⇒ ปิดทันทีไม่ถาม */}
            <ModalCancelButton onClose={close}>ปิด</ModalCancelButton>
            <a
              href={`/api/payout-batches/${batch.id}/payment-file`}
              className={buttonClass('primary')}
            >
              ดาวน์โหลดไฟล์โอน
            </a>
          </>
        )
      }
    >
      <div ref={formRef} className="space-y-4">
        {wasGeneratedBefore && !confirming && generated === null && (
          <InlineAlert tone="warning" title="รอบจ่ายนี้เคยสร้างไฟล์โอนไปแล้ว">
            ระบบจะขอให้ยืนยันอีกครั้งก่อนสร้างไฟล์ใหม่ — ไฟล์ใหม่ใช้ Idempotency Key เดิม
            ตรวจให้แน่ใจว่ายังไม่ได้อัปโหลดไฟล์เดิมเข้าระบบธนาคาร
          </InlineAlert>
        )}

        {confirming && (
          <InlineAlert tone="error" title={duplicateWarning?.title}>
            {duplicateWarning?.message}
          </InlineAlert>
        )}

        {generated !== null ? (
          <div className="space-y-3">
            <InlineAlert tone="success" title="สร้างไฟล์โอนสำเร็จ">
              ไฟล์ <RefText>{generated.fileName}</RefText> · {fmtCount(generated.rowCount)} รายการ ·
              ยอดโอนสุทธิ {fmtSatangSymbol(generated.batch.transferSatang)}
              {hasAdvanceOffset(generated.batch) && (
                <span className="block">
                  หักคืนเงินทดรอง {fmtSatangSymbol(generated.batch.advanceOffsetSatang)} (ยอดหลังหักภาษี{' '}
                  {fmtSatangSymbol(generated.batch.netSatang)})
                </span>
              )}
            </InlineAlert>
            <div className="rounded-lg border border-slate-200 p-3 text-xs text-slate-600">
              <p>
                Idempotency Key: <RefText>{generated.batch.idempotencyKey}</RefText>
              </p>
              <p className="mt-1 break-all">
                SHA-256: <RefText>{generated.fileHash}</RefText>
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                ใช้ค่านี้ยืนยันว่าไฟล์ที่อัปโหลดเข้าระบบธนาคารคือไฟล์เดียวกับที่ระบบสร้าง
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id={`${fieldId}-format-id`} label="รูปแบบไฟล์ธนาคาร" required error={submitError.fields.bankFileFormatId}>
                <Select
                  id={`${fieldId}-format-id`}
                  value={formatId}
                  onChange={(event) => {
                    setFormatId(event.target.value)
                    submitError.clearField('bankFileFormatId')
                  }}
                >
                  <option value="">— เลือกรูปแบบ —</option>
                  {formats.map((format) => (
                    <option key={format.id} value={format.id} disabled={!format.usable}>
                      {format.label}
                      {format.usable ? '' : ' — ยังไม่ผ่านทดสอบ'}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field id={`${fieldId}-account-id`} label="บัญชีบริษัทที่จ่าย" required error={submitError.fields.bankAccountId}>
                <Select id={`${fieldId}-account-id`} value={accountId} onChange={(event) => changeAccount(event.target.value)}>
                  <option value="">— เลือกบัญชี —</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.bankName} {account.accountNumberMasked}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {bankMismatch !== null && <InlineAlert tone="warning">{bankMismatch}</InlineAlert>}

            {accounts.length === 0 && (
              <InlineAlert tone="error">
                ยังไม่มีบัญชีบริษัทที่ใช้จ่ายเงินได้ — ตั้งค่าที่หน้า “ตั้งค่าการเงิน › บัญชีธนาคาร” ก่อน
              </InlineAlert>
            )}

            <div
              className={`grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 ${
                hasAdvanceOffset(batch) ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'
              }`}
            >
              <Summary label="จำนวนรายการ" value={`${fmtCount(batch.itemCount)} รายการ`} />
              <Summary label="WHT รวม" value={fmtSatangSymbol(batch.whtSatang)} tone="deduction" />
              {/* มติ PO U30 — หักคืนเงินทดรองหลังภาษี ⇒ ยอดในไฟล์ธนาคาร = ยอดโอนจริง ไม่ใช่ net (BUG-154) */}
              {hasAdvanceOffset(batch) && (
                <Summary
                  label="หักคืนเงินทดรอง"
                  value={fmtSatangSymbol(batch.advanceOffsetSatang)}
                  tone="deduction"
                />
              )}
              <Summary label="ยอดโอนสุทธิ" value={fmtSatangSymbol(batch.transferSatang)} tone="emerald" />
            </div>

            <Field id={`${fieldId}-reason`} label="เหตุผล / อ้างอิงการอนุมัติจ่าย" required error={submitError.fields.reason}>
              <Textarea
                id={`${fieldId}-reason`}
                maxLength={500}
                rows={2}
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value)
                  submitError.clearField('reason')
                }}
                placeholder="เช่น อนุมัติจ่ายตามมติที่ประชุมการเงิน 05/07/2569"
              />
            </Field>

            <InlineAlert tone="info">
              ระบบผูก Idempotency Key ของรอบนี้ไว้กับไฟล์ทุกเวอร์ชัน — กันโอนซ้ำถ้าอัปโหลดไฟล์เดิมเข้าธนาคาร
              และไฟล์เวอร์ชันเก่าจะไม่ถูกทับ
            </InlineAlert>
          </>
        )}
      </div>
    </Modal>
  )
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: 'deduction' | 'emerald' }) {
  // สีตาม palette กลาง (`04` §8.1): ยอดหัก = red · ยอดสุทธิ = emerald — ห้ามใช้ตระกูลสีนอกระบบ (เดิมเป็น rose)
  const toneClass =
    tone === 'deduction' ? 'text-red-600' : tone === 'emerald' ? 'text-emerald-700' : 'text-slate-900'
  return (
    <div>
      <p className="mb-1 text-xs text-slate-500">{label}</p>
      <p className={`font-mono text-sm font-bold ${toneClass}`}>{value}</p>
    </div>
  )
}
