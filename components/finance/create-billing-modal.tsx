'use client'

import { useEffect, useState } from 'react'
import { REASON_MIN_LENGTH } from '@/components/settings/reason-confirm-modal'
import { Button, Field, InlineAlert, Input, Modal, Select, Textarea, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import type { FinanceCompanyDto } from '@/lib/finance-companies/types'
import type { BillingBatchDetailDto } from '@/lib/revenue/types'
import type { CycleDto } from '@/lib/settings/types'

/**
 * Modal "สร้างรอบวางบิล" (`19` §9.1 · mockup `finance.html` `create-billing`)
 *
 * ผู้ใช้เลือกแค่ **บริษัท + วันตัดรอบ (+ รอบ AR)** — ระบบดึง Revenue ที่ `ready_for_billing`
 * ของบริษัทนั้นตั้งแต่ต้นเดือนถึงวันตัดรอบมารวมเอง (`19` §9.1) ⇒ **ห้ามคิดยอดล่วงหน้าบนหน้าจอ**
 *
 * ⚠️ วันครบกำหนดมี 2 แหล่ง (A5): เลือกรอบ AR = รอบชนะเสมอ · ไม่เลือก = `payment_due_days`
 *    ของบริษัทนั้น — ที่มาถูกบันทึกลง audit ทุกครั้ง (ดูกับดักใน REUSE_INDEX)
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
  const [cycles, setCycles] = useState<readonly CycleDto[]>([])
  const [companyId, setCompanyId] = useState('')
  const [cutoffDate, setCutoffDate] = useState('')
  const [cycleId, setCycleId] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      const [companyResult, cycleResult] = await Promise.all([
        callApi<FinanceCompanyDto[]>('/api/finance-companies?status=active'),
        callApi<CycleDto[]>('/api/settings/cycles?type=AR&status=active'),
      ])
      if (cancelled) return
      setCompanies(companyResult.data ?? [])
      setCycles(cycleResult.data ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  if (!open) return null

  const selectedCompany = companies.find((company) => company.id === companyId)
  const ready = companyId !== '' && cutoffDate !== '' && reason.trim().length >= REASON_MIN_LENGTH

  async function submit(): Promise<void> {
    if (!ready) return
    setSaving(true)
    const result = await callApi<BillingBatchDetailDto>(
      '/api/billing-batches',
      jsonRequest('POST', {
        companyId,
        cutoffDate,
        cycleId: cycleId === '' ? null : cycleId,
        reason: reason.trim(),
      }),
    )
    setSaving(false)
    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({
      tone: 'success',
      title: 'สร้างรอบวางบิลแล้ว',
      description: `${result.data?.companyName ?? ''} งวด ${result.data?.period ?? ''} — ตรวจยอดก่อนกดส่งบิล`,
    })
    setCompanyId('')
    setCutoffDate('')
    setCycleId('')
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
          <Button variant="ghost" onClick={onClose}>
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
          1 บริษัท 1 รอบเดือน = 1 รอบวางบิลเท่านั้น (`19` §6.2) — ไม่มีรายได้ที่รอวางบิลในงวดนั้นจะถูกปฏิเสธ
          ด้วย NO_REVENUE_TO_BILL
        </InlineAlert>

        <Field label="บริษัทไฟแนนซ์" required>
          <Select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
            <option value="">— เลือกบริษัท —</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="วันตัดรอบ (Cut-off Date)" required>
          <Input type="date" value={cutoffDate} onChange={(event) => setCutoffDate(event.target.value)} />
        </Field>

        <Field
          label="รอบวางบิล (AR) ที่ใช้คำนวณวันครบกำหนด"
          hint={
            selectedCompany === undefined
              ? 'ไม่เลือก = ใช้เครดิตเทอมของบริษัทที่ตั้งไว้ในข้อมูลบริษัท'
              : `ไม่เลือก = ใช้เครดิตเทอมของ ${selectedCompany.name} (${selectedCompany.paymentDueDays} วัน)`
          }
        >
          <Select value={cycleId} onChange={(event) => setCycleId(event.target.value)}>
            <option value="">— ใช้เครดิตเทอมของบริษัท —</option>
            {cycles.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>
                {cycle.name} · {cycle.dueRule}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="เหตุผล" required hint={`อย่างน้อย ${REASON_MIN_LENGTH} ตัวอักษร — บันทึกลง audit log`}>
          <Textarea
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
