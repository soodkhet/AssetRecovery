'use client'

import { useEffect, useState } from 'react'
import { REASON_MIN_LENGTH } from '@/components/settings/reason-confirm-modal'
import { Button, Field, InlineAlert, Input, Modal, Select, Textarea, useToast } from '@/components/ui'
import {
  ClosedPeriodCutoffAlert,
  isClosedPeriodCutoffError,
  isCutoffInClosedPeriod,
  ClosedPeriodsUnavailableNote,
  useClosedPeriods,
} from '@/components/finance/closed-period-cutoff-alert'
import { callApi, jsonRequest, type ApiCallError } from '@/lib/api/types'
import type { FinanceCompanyDto } from '@/lib/finance-companies/types'
import { fmtDate, toInputDate } from '@/lib/format/datetime'
import type { BillingBatchDetailDto } from '@/lib/revenue/types'
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
  const { showToast } = useToast()
  const [companies, setCompanies] = useState<readonly FinanceCompanyDto[]>([])
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

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      const companyResult = await callApi<FinanceCompanyDto[]>('/api/finance-companies?status=active')
      if (cancelled) return
      setCompaniesError(companyResult.error ?? null)
      setCompanies(companyResult.data ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [open, companiesVersion])

  if (!open) return null

  const selectedCompany = companies.find((company) => company.id === companyId)
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

  function selectCompany(nextCompanyId: string): void {
    setCompanyId(nextCompanyId)
    // เปลี่ยนบริษัท = กลับไปใช้วันที่ระบบเสนอตามรอบบิลของบริษัทใหม่
    setCutoffOverride(null)
  }
  const ready = companyId !== '' && cycle !== null && cutoffDate !== '' && reason.trim().length >= REASON_MIN_LENGTH

  async function submit(): Promise<void> {
    if (!ready) return
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
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({
      tone: 'success',
      title: `สร้างรอบวางบิล ${result.data?.batchNumber ?? ''} แล้ว`,
      description: `${result.data?.companyName ?? ''} งวด ${result.data?.period ?? ''} — ตรวจยอดก่อนกดส่งบิล`,
    })
    setCompanyId('')
    setCutoffOverride(null)
    setReason('')
    onCreated()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="สร้างรอบวางบิล (Create Billing Batch)"
      description="ระบบรวม Revenue ที่รอวางบิลของบริษัทนั้นในงวดให้อัตโนมัติ"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button loading={saving} disabled={!ready} onClick={() => void submit()}>
            สร้างรอบวางบิล
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <InlineAlert tone="info">
          ระบบรวมรายได้ที่ยังไม่วางบิลทั้งหมดของบริษัทจนถึงวันตัดรอบ (รวมที่ค้างจากเดือนก่อน)
          — สร้างได้หลายรอบต่อเดือน แต่ต้องไม่มีรอบร่างของบริษัทเดียวกันค้างอยู่
        </InlineAlert>

        <Field label="บริษัทไฟแนนซ์" required>
          <Select value={companyId} onChange={(event) => selectCompany(event.target.value)}>
            <option value="">— เลือกบริษัท —</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </Select>
        </Field>

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
          label="วันตัดรอบ (Cut-off Date)"
          required
          hint={
            dueDatePreview === null
              ? 'ระบบเสนอวันตัดรอบล่าสุดตามรอบบิลให้ — แก้ได้'
              : `ครบกำหนดชำระ ${fmtDate(dueDatePreview)} · ระบบเสนอวันตัดรอบตามรอบบิลให้ แก้ได้`
          }
        >
          <Input type="date" value={cutoffDate} onChange={(event) => setCutoffOverride(event.target.value)} />
          {closedPeriods.status === 'error' && <ClosedPeriodsUnavailableNote />}
        </Field>

        {((closedCutoff !== null && closedCutoff === cutoffDate) || isCutoffInClosedPeriod(cutoffDate, isPeriodClosed)) && (
          <ClosedPeriodCutoffAlert onUseToday={setCutoffOverride} />
        )}

        <Field label="เหตุผล" required hint={`อย่างน้อย ${REASON_MIN_LENGTH} ตัวอักษร — บันทึกลง audit log`}>
          <Textarea
            maxLength={500}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="เช่น ตัดรอบวางบิลประจำเดือนตามกำหนดของบริษัท"
          />
        </Field>
      </div>
    </Modal>
  )
}
