'use client'

import { useState } from 'react'
import { Button, Field, InlineAlert, Modal, Select, Textarea, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import type { CostCenterOptionDto, ExpenseRecordDto } from '@/lib/expenses/types'
import { fmtCount } from '@/lib/format/money'

/**
 * Modal "ระบุศูนย์ต้นทุนหลายรายการ" (staging E-065) — ศูนย์ต้นทุน + หมายเหตุเดียวกับทุกรายการที่เลือก
 * API ทำแบบ all-or-nothing (รายการใดไม่ผ่าน ⇒ ไม่บันทึกเลยสักรายการ) · หมายเหตุ = `reason` ของ audit (บังคับ)
 */
export function CostCenterBulkMapModal({
  open,
  expenseRecordIds,
  costCenters,
  onClose,
  onMapped,
}: {
  open: boolean
  expenseRecordIds: readonly string[]
  costCenters: readonly CostCenterOptionDto[]
  onClose: () => void
  onMapped: () => void
}) {
  const { showToast } = useToast()
  const [costCenterId, setCostCenterId] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  if (!open) return null

  const ready = expenseRecordIds.length > 0 && costCenterId !== '' && reason.trim() !== ''

  async function submit(): Promise<void> {
    if (!ready) return
    setSaving(true)
    const result = await callApi<ExpenseRecordDto[]>(
      '/api/accounting/expenses/cost-center/bulk',
      jsonRequest('POST', { expenseRecordIds, costCenterId, reason: reason.trim() }),
    )
    setSaving(false)
    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({
      tone: 'success',
      title: `บันทึกศูนย์ต้นทุน ${fmtCount(expenseRecordIds.length)} รายการแล้ว`,
      description: 'รายการที่เลือกพร้อมรวมเข้าชุดเอกสารส่งสำนักงานบัญชี',
    })
    onMapped()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`ระบุศูนย์ต้นทุน ${fmtCount(expenseRecordIds.length)} รายการ`}
      description="ใช้ศูนย์ต้นทุนและหมายเหตุเดียวกันกับทุกรายการที่เลือก"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button loading={saving} disabled={!ready} onClick={() => void submit()}>
            บันทึกศูนย์ต้นทุน
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="เลือก Cost Center" required>
          <Select value={costCenterId} onChange={(event) => setCostCenterId(event.target.value)}>
            <option value="">— เลือกศูนย์ต้นทุน —</option>
            {costCenters.map((option) => (
              <option key={option.id} value={option.id}>
                {option.code} — {option.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="หมายเหตุการ Mapping" required hint="บังคับกรอก — บันทึกเป็นเหตุผลใน audit log ของทุกรายการ">
          <Textarea
            maxLength={1000}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="อธิบายเหตุผลที่เลือกศูนย์ต้นทุนนี้..."
          />
        </Field>
        <InlineAlert tone="info" title="บันทึกทั้งชุดหรือไม่บันทึกเลย">
          ถ้ามีรายการใดบันทึกไม่ได้ (เช่น งวดล็อกแล้ว) ระบบจะไม่บันทึกรายการใดเลย และแจ้งรายการที่ติด
        </InlineAlert>
      </div>
    </Modal>
  )
}
