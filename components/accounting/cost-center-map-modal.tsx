'use client'

import { useState } from 'react'
import { Button, Field, InlineAlert, Modal, Select, Textarea, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import type { CostCenterOptionDto, ExpenseRecordDto } from '@/lib/expenses/types'
import { fmtDate } from '@/lib/format/datetime'
import { fmtSatangSymbol } from '@/lib/format/money'

/**
 * Modal "Map Cost Center" (`32` §6.2/§8 · mockup `accounting.html` `cost-center-map`)
 *
 * เปิดได้เฉพาะรายการที่ `mapping_rule = manual` — รายการ `auto` ต้องไปแก้ที่ทีมของผู้รับเงินต้นทาง
 * (ปุ่มถูกซ่อนที่ตาราง และ API ปฏิเสธด้วย `COST_CENTER_AUTO_EDIT` อีกชั้น)
 * · หมายเหตุการ mapping = `reason` ของ audit จึง**บังคับกรอก** (Rule 03)
 */
export function CostCenterMapModal({
  record,
  costCenters,
  onClose,
  onMapped,
}: {
  record: ExpenseRecordDto | null
  costCenters: readonly CostCenterOptionDto[]
  onClose: () => void
  onMapped: () => void
}) {
  const { showToast } = useToast()
  const [costCenterId, setCostCenterId] = useState(record?.costCenterId ?? '')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  if (record === null) return null

  const ready = costCenterId !== '' && reason.trim() !== ''

  async function submit(): Promise<void> {
    if (!ready || record === null) return
    setSaving(true)
    const result = await callApi<ExpenseRecordDto>(
      `/api/accounting/expenses/${record.id}/cost-center`,
      jsonRequest('PATCH', { costCenterId, reason: reason.trim() }),
    )
    setSaving(false)

    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({
      tone: 'success',
      title: 'บันทึก Cost Center แล้ว',
      description: 'รายการนี้พร้อมรวมเข้าชุดเอกสารส่งสำนักงานบัญชี',
    })
    onMapped()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Map Cost Center — ${record.payeeName}`}
      description="เลือกศูนย์ต้นทุนของรายการจ่ายนี้ เพื่อให้บัญชีแยกวิเคราะห์ต้นทุนตามหน่วยงานได้"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button loading={saving} disabled={!ready} onClick={() => void submit()}>
            บันทึก Cost Center
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">ผู้รับเงิน / ประเภท:</span>
            <span className="font-semibold">
              {record.payeeName} · {record.category}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">วันที่จ่าย / รอบจ่าย:</span>
            <span className="font-mono">
              {fmtDate(record.paymentDate)} · {record.payoutBatchName}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">ยอดจ่ายจริง (Net):</span>
            <span className="font-bold text-emerald-700">{fmtSatangSymbol(record.netSatang)}</span>
          </div>
        </div>

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

        <Field label="หมายเหตุการ Mapping" required hint="บังคับกรอก — บันทึกเป็นเหตุผลใน audit log">
          <Textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="อธิบายเหตุผลที่เลือกศูนย์ต้นทุนนี้..."
          />
        </Field>

        <InlineAlert tone="info" title="แก้ยอดเงินที่นี่ไม่ได้">
          ยอด Gross/WHT/Net เป็นข้อมูลจากรอบจ่ายเงินจริง (ไฟล์ 17) — ถ้ายอดผิดต้องสร้าง Adjustment ผ่านเมนู
          การเงิน (ไฟล์ 20)
        </InlineAlert>
      </div>
    </Modal>
  )
}
