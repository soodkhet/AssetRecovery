'use client'

import { useEffect, useId, useState } from 'react'
import { REASON_MIN_LENGTH } from '@/components/settings/reason-confirm-modal'
import {
  Button,
  Field,
  FormSubmitFooter,
  InlineAlert,
  Input,
  Modal,
  ModalCancelButton,
  Select,
  Textarea,
  useClearOnClose,
  useRevealFieldError,
  useSubmitError,
  useToast,
} from '@/components/ui'
import {
  ClosedPeriodCutoffAlert,
  isClosedPeriodCutoffError,
  isCutoffInClosedPeriod,
  ClosedPeriodsUnavailableNote,
  useClosedPeriods,
} from '@/components/finance/closed-period-cutoff-alert'
import { BillingPreview } from '@/components/finance/billing-preview'
import { callApi, jsonRequest, type ApiCallError } from '@/lib/api/types'
import type { FinanceCompanyDto } from '@/lib/finance-companies/types'
import { fmtDate, toInputDate } from '@/lib/format/datetime'
import { billingCompanyOptions, type BillingCompanyOption } from '@/lib/revenue/revenue-ui'
import type { BillingBatchDetailDto, RevenueDto } from '@/lib/revenue/types'
import { resolveDueDate, suggestOpenCutoffDate } from '@/lib/settings/cycles'

/** วันนี้ตามเวลาไทยในรูป date-only (เที่ยงคืน UTC) — ฐานของการเสนอวันตัดรอบ */
function todayDateOnly(): Date {
  return new Date(`${toInputDate(new Date())}T00:00:00Z`)
}

/**
 * Modal "สร้างรอบวางบิล" (`19` §9.1 · mockup `finance.html` `create-billing`)
 *
 * ผู้ใช้เลือกแค่ **บริษัท + วันตัดรอบ (+ รอบ AR)** — ระบบดึง Revenue ที่ `ready_for_billing` ที่ยังไม่ผูกรอบ
 * ของบริษัทนั้นทั้งหมดที่ `revenue_date ≤ วันตัดรอบ` มารวมเอง (มติ U86 · `19` §9.1) ⇒ **ห้ามคิดยอดล่วงหน้าบนหน้าจอ**
 *
 * ⚠️ มติ PO U146: **รอบบิลที่บริษัทใช้เป็นแหล่งเดียว** ของวันตัดรอบ + เครดิตเทอม (ไม่มี "ไม่ใช้รอบ" แล้ว) —
 *    เลือกบริษัทแล้วระบบเสนอวันตัดรอบล่าสุดตามกติกาของรอบ (แก้ได้) และแสดงวันครบกำหนดที่จะได้ ·
 *    บริษัทที่ยังไม่มีรอบบิล = สร้างไม่ได้ (API ตอบ `BILLING_CYCLE_NOT_SET`) ให้ไปเลือกที่หน้าบริษัท
 * ⚠️ มติ PO U132: แสดงคำเตือนเอกสารบริษัท (ไม่มีหนังสือรับรอง/ภ.พ.20 · หนังสือรับรองเกิน 6 เดือน) — ไม่บล็อก
 * ⚠️ `<input type="date">` เป็นข้อยกเว้นเดียวที่ใช้ ค.ศ. (browser บังคับ — Rule 01)
 */
export function CreateBillingModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  // id ผูก label ↔ ช่อง + aria-invalid/aria-describedby ผ่าน `<Field id>` (ตรวจซ้ำ staging SV5-R9-01)
  const fieldId = useId()
  const { showToast } = useToast()
  const [companies, setCompanies] = useState<readonly BillingCompanyOption<FinanceCompanyDto>[]>([])
  const [companyId, setCompanyId] = useState('')
  /** วันตัดรอบที่ผู้ใช้แก้เอง — `null` = ใช้ค่าที่ระบบเสนอ (คำนวณใหม่เมื่องวดปิดโหลดเสร็จ · R8-008) */
  const [cutoffOverride, setCutoffOverride] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  /** วันตัดรอบที่ server ปฏิเสธเพราะงวดปิดแล้ว — แสดงคำแนะนำใต้ช่องจนกว่าจะเปลี่ยนวัน (R7-009) */
  const [closedCutoff, setClosedCutoff] = useState<string | null>(null)
  const closedPeriods = useClosedPeriods(open)
  const isPeriodClosed = closedPeriods.isClosed

  /** โหลดรายชื่อบริษัทไม่สำเร็จ — แจ้ง + ปุ่มลองใหม่ (เดิม dropdown ว่างเงียบ · preship R9-012) */
  const [companiesError, setCompaniesError] = useState<ApiCallError | null>(null)
  /** เพิ่มเพื่อโหลดรายชื่อบริษัทใหม่ (ปุ่มลองใหม่ — เช่นหลังเข้าสู่ระบบในแท็บใหม่) */
  const [companiesVersion, setCompaniesVersion] = useState(0)
  const { ref: formRef, reveal: revealFormError } = useRevealFieldError()
  const submitError = useSubmitError(revealFormError)
  // ค้าง mount ⇒ ปิดแล้วล้างข้อผิดจากการกดส่ง (ร่างยังอยู่) · มติผู้ใช้ 15/10/2569
  useClearOnClose(open, submitError.clear)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      // mytester7 S7-AG2-07 (มติ D7-05) — บริษัทที่ระงับยังวางบิลรายได้ที่เกิดแล้วได้ ⇒ ดึงทุกสถานะ
      // แล้วตรวจว่าบริษัทที่ระงับรายไหนมีรายได้รอวางบิล (ปกติมีไม่กี่ราย)
      const companyResult = await callApi<FinanceCompanyDto[]>('/api/finance-companies?status=all')
      const all = companyResult.data ?? []
      const suspended = all.filter((company) => company.status === 'suspended')
      const pending = await Promise.all(
        suspended.map((company) =>
          callApi<RevenueDto[]>(
            `/api/revenues?${new URLSearchParams({ status: 'ready_for_billing', unbilledOnly: 'true', companyId: company.id }).toString()}`,
          ),
        ),
      )
      if (cancelled) return
      const pendingIds = new Set(
        suspended.filter((_company, index) => (pending[index]?.data?.length ?? 0) > 0).map((company) => company.id),
      )
      setCompaniesError(companyResult.error ?? pending.find((result) => result.error !== undefined)?.error ?? null)
      setCompanies(billingCompanyOptions(all, pendingIds))
    })()
    return () => {
      cancelled = true
    }
  }, [open, companiesVersion])

  if (!open) return null

  const selectedOption = companies.find((option) => option.company.id === companyId)
  const selectedCompany = selectedOption?.company
  const cycle = selectedCompany?.billingCycle ?? null
  // มติ PO U146 — เสนอวันตัดรอบล่าสุดตามกติกาของรอบบิล (ผู้ใช้แก้ได้) · ไม่เสนอวันในงวดที่ปิดแล้ว (P11 · R7-009)
  // คำนวณทุก render — งวดปิดโหลดเสร็จหลังเลือกบริษัทแล้วค่าที่เสนอขยับตาม (เดิมค้าง 30/09 · R8-008)
  const cutoffDate =
    cutoffOverride ??
    (cycle === null ? '' : suggestOpenCutoffDate(cycle, todayDateOnly(), isPeriodClosed).toISOString().slice(0, 10))
  // วันครบกำหนดที่จะได้ — สูตรเดียวกับฝั่ง server (`resolveDueDate`) แสดงให้ตรวจก่อนสร้าง
  const dueDatePreview =
    cycle !== null && /^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)
      ? resolveDueDate(new Date(`${cutoffDate}T00:00:00Z`), cycle)
      : null

  /** ล้างร่าง + ข้อผิด — หลังสร้างสำเร็จ และเมื่อผู้ใช้ยืนยัน "ทิ้งข้อมูล" */
  function resetDraft(): void {
    setCompanyId('')
    setCutoffOverride(null)
    setReason('')
    setClosedCutoff(null)
    submitError.clear()
  }

  function selectCompany(nextCompanyId: string): void {
    submitError.clearField('companyId')
    setCompanyId(nextCompanyId)
    // เปลี่ยนบริษัท = กลับไปใช้วันที่ระบบเสนอตามรอบบิลของบริษัทใหม่
    setCutoffOverride(null)
  }
  const ready = companyId !== '' && cycle !== null && cutoffDate !== '' && reason.trim().length >= REASON_MIN_LENGTH

  async function submit(): Promise<void> {
    if (!ready) return
    submitError.clear()
    setSaving(true)
    const result = await callApi<BillingBatchDetailDto>(
      '/api/billing-batches',
      jsonRequest('POST', {
        companyId,
        cutoffDate,
        cycleId: cycle?.id ?? null,
        reason: reason.trim(),
      }),
    )
    setSaving(false)
    if (isClosedPeriodCutoffError(result.error)) {
      setClosedCutoff(cutoffDate)
      return
    }
    if (result.error !== undefined) {
      submitError.fail(result.error)
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({
      tone: 'success',
      title: `สร้างรอบวางบิล ${result.data?.batchNumber ?? ''} แล้ว`,
      description: `${result.data?.companyName ?? ''} งวด ${result.data?.period ?? ''} — ตรวจยอดก่อนกดส่งบิล`,
    })
    resetDraft()
    onCreated()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="สร้างรอบวางบิล"
      description="ระบบรวมรายได้ที่รอวางบิลของบริษัทนั้นให้อัตโนมัติ"
      // ค้าง mount ⇒ ยกเลิก/Esc/X/Back ถามเมื่อมีร่าง · "ทิ้งข้อมูล" ล้างร่างจริง (มติผู้ใช้ 15/10/2569)
      onDiscard={resetDraft}
      footer={
        <FormSubmitFooter message={submitError.message} tick={submitError.tick}>
          <ModalCancelButton onClose={onClose} />
          <Button loading={saving} disabled={!ready} onClick={() => void submit()}>
            สร้างรอบวางบิล
          </Button>
        </FormSubmitFooter>
      }
    >
      <div ref={formRef} className="space-y-4">
        <InlineAlert tone="info">
          ระบบรวมรายได้ที่ยังไม่วางบิลทั้งหมดของบริษัทจนถึงวันตัดรอบ (รวมที่ค้างจากเดือนก่อน)
          — สร้างได้หลายรอบต่อเดือน แต่ต้องไม่มีรอบร่างของบริษัทเดียวกันค้างอยู่
        </InlineAlert>

        <Field id={`${fieldId}-company-id`} label="บริษัทไฟแนนซ์" required error={submitError.fields.companyId}>
          <Select id={`${fieldId}-company-id`} value={companyId} onChange={(event) => selectCompany(event.target.value)}>
            <option value="">— เลือกบริษัท —</option>
            {companies.map((option) => (
              <option key={option.company.id} value={option.company.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        {selectedOption?.suspended === true && (
          <InlineAlert tone="warning" title="บริษัทนี้ถูกระงับ">
            บริษัทที่ระงับรับเคสใหม่ไม่ได้ แต่ยังวางบิลและรับชำระรายได้ที่เกิดแล้วได้ตามปกติ
          </InlineAlert>
        )}

        {companiesError !== null && (
          <InlineAlert tone="error" title="โหลดรายชื่อบริษัทไม่สำเร็จ">
            <p>{companiesError.message}</p>
            <Button size="sm" variant="secondary" className="mt-2" onClick={() => setCompaniesVersion((value) => value + 1)}>
              ลองใหม่
            </Button>
          </InlineAlert>
        )}

        {selectedCompany !== undefined && selectedCompany.documentWarnings.length > 0 && (
          <InlineAlert tone="warning" title="เอกสารบริษัทยังไม่ครบ (สร้างรอบต่อได้)">
            <ul className="list-disc pl-4">
              {selectedCompany.documentWarnings.map((warning) => (
                <li key={warning.kind}>{warning.message}</li>
              ))}
            </ul>
          </InlineAlert>
        )}

        {selectedCompany !== undefined && cycle === null && (
          <InlineAlert tone="warning" title="บริษัทนี้ยังไม่มีรอบบิล">
            เลือก “รอบบิลที่ใช้” ที่หน้าบริษัทไฟแนนซ์ก่อน — รอบบิลกำหนดวันตัดรอบและวันครบกำหนดชำระ
          </InlineAlert>
        )}

        {cycle !== null && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            รอบบิลที่ใช้: <span className="font-semibold text-slate-800">{cycle.name}</span> · ตัดรอบ{cycle.cutoffLabel} ·
            ครบกำหนด {cycle.dueLabel}
          </div>
        )}

        <Field
          id={`${fieldId}-cutoff-date`}
          label="วันตัดรอบ"
          required
          error={submitError.fields.cutoffDate}
          hint={
            dueDatePreview === null
              ? 'ระบบเสนอวันตัดรอบล่าสุดตามรอบบิลให้ — แก้ได้'
              : `ครบกำหนดชำระ ${fmtDate(dueDatePreview)} · ระบบเสนอวันตัดรอบตามรอบบิลให้ แก้ได้`
          }
        >
          <Input
            id={`${fieldId}-cutoff-date`}
            type="date"
            value={cutoffDate}
            onChange={(event) => {
              setCutoffOverride(event.target.value)
              submitError.clearField('cutoffDate')
            }}
          />
          {closedPeriods.status === 'error' && <ClosedPeriodsUnavailableNote />}
        </Field>

        {/* staging E-049 / mytester G-05 — สรุปจำนวน/ยอดที่จะดึงเข้ารอบก่อนกดสร้าง */}
        {cycle !== null && (
          <BillingPreview
            companyId={companyId}
            cutoffDate={cutoffDate}
            today={toInputDate(new Date())}
            onUseToday={setCutoffOverride}
          />
        )}

        {((closedCutoff !== null && closedCutoff === cutoffDate) || isCutoffInClosedPeriod(cutoffDate, isPeriodClosed)) && (
          <ClosedPeriodCutoffAlert onUseToday={setCutoffOverride} />
        )}

        <Field
          id={`${fieldId}-reason`}
          label="เหตุผล"
          required
          hint={`อย่างน้อย ${REASON_MIN_LENGTH} ตัวอักษร — บันทึกไว้ในประวัติการใช้งาน`}
          error={submitError.fields.reason}
        >
          <Textarea
            id={`${fieldId}-reason`}
            maxLength={500}
            rows={3}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value)
              submitError.clearField('reason')
            }}
            placeholder="เช่น ตัดรอบวางบิลประจำเดือนตามกำหนดของบริษัท"
          />
        </Field>
      </div>
    </Modal>
  )
}
