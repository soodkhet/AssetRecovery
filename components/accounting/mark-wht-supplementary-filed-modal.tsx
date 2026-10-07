'use client'

import { useState } from 'react'
import { Button, Field, InlineAlert, Modal, TBody, THead, Table, Td, Textarea, Th, Tr, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import { fmtDateTime } from '@/lib/format/datetime'
import { fmtSatangSymbol } from '@/lib/format/money'
import type { WhtFilingSummaryDto } from '@/lib/wht/types'

/** ยอดต่างพร้อมเครื่องหมาย — บวก = ต้องนำส่งเพิ่ม · ลบ = ยื่นเกิน */
export function signedSatangText(satang: number): string {
  if (satang === 0) return fmtSatangSymbol(0)
  return `${satang > 0 ? '+' : '−'}${fmtSatangSymbol(Math.abs(satang))}`
}

/**
 * Modal "ยื่นเพิ่มเติมแล้ว" (มติ PO 07/10/2569 U127) — ล้างธง "ต้องยื่นเพิ่มเติม" ของรอบที่ยื่นแล้ว
 *
 * แสดงยอดที่ยื่น / ยอดปัจจุบันจากใบที่ยังมีผล / ยอดต่าง ต่อแบบ · การยื่นจริงทำนอกระบบ · อ้างอิงบังคับ (เก็บใน audit)
 */
export function MarkWhtSupplementaryFiledModal({
  summary,
  onClose,
  onFiled,
}: {
  summary: WhtFilingSummaryDto | null
  onClose: () => void
  onFiled: () => void
}) {
  const { showToast } = useToast()
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  if (summary === null) return null
  const diff = summary.supplementaryDiff
  const ready = reason.trim() !== ''

  async function submit(): Promise<void> {
    if (!ready || summary === null) return
    setSaving(true)
    const result = await callApi<WhtFilingSummaryDto>(
      `/api/accounting/wht-filing-summary/${summary.id}/mark-supplementary-filed`,
      jsonRequest('PATCH', { reason: reason.trim() }),
    )
    setSaving(false)
    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({
      tone: 'success',
      title: `บันทึกว่ายื่นเพิ่มเติมรอบ ${summary.periodLabel} แล้ว`,
      description: 'ยอดที่ยื่นปรับเป็นยอดปัจจุบัน · อ้างอิงการยื่นเก็บไว้ใน audit log',
    })
    onFiled()
    onClose()
  }

  const rows: { label: string; filed: number; delta: number }[] = [
    { label: 'ภ.ง.ด.3', filed: summary.pnd3Satang, delta: diff?.pnd3Satang ?? 0 },
    { label: 'ภ.ง.ด.53', filed: summary.pnd53Satang, delta: diff?.pnd53Satang ?? 0 },
    { label: 'ภ.ง.ด.1', filed: summary.pnd1Satang, delta: diff?.pnd1Satang ?? 0 },
  ]

  return (
    <Modal
      open
      onClose={onClose}
      title={`ยื่นเพิ่มเติมแล้ว — รอบ ${summary.periodLabel}`}
      description="ยืนยันว่ายื่นแบบเพิ่มเติมของรอบนี้ต่อกรมสรรพากรเรียบร้อยแล้ว (ยื่นจริงนอกระบบ)"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            ปิด
          </Button>
          <Button loading={saving} disabled={!ready} onClick={() => void submit()}>
            ยืนยันว่ายื่นเพิ่มเติมแล้ว
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Table>
          <THead>
            <Tr>
              <Th className="px-3 py-2">แบบ</Th>
              <Th numeric className="px-3 py-2">
                ยอดที่ยื่นแล้ว
              </Th>
              <Th numeric className="px-3 py-2">
                ยอดปัจจุบัน
              </Th>
              <Th numeric className="px-3 py-2">
                ยอดต่าง
              </Th>
            </Tr>
          </THead>
          <TBody>
            {rows.map((row) => (
              <Tr key={row.label}>
                <Td className="px-3 py-2 text-xs font-semibold">{row.label}</Td>
                <Td numeric className="px-3 py-2 text-xs">
                  {fmtSatangSymbol(row.filed)}
                </Td>
                <Td numeric className="px-3 py-2 text-xs">
                  {fmtSatangSymbol(row.filed + row.delta)}
                </Td>
                <Td numeric className="px-3 py-2 text-xs font-bold">
                  {signedSatangText(row.delta)}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>

        {summary.supplementaryRequiredAt !== null && (
          <p className="text-xs text-slate-500">
            มีการยกเลิก/ออกหนังสือรับรองของเดือนนี้ภายหลังการยื่นล่าสุดเมื่อ {fmtDateTime(summary.supplementaryRequiredAt)} น.
          </p>
        )}

        <Field label="อ้างอิงการยื่นเพิ่มเติม" required hint="บังคับกรอก — เช่น เลขที่รับแบบ/วันที่ยื่น/ผู้ยื่น">
          <Textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="เช่น ยื่นเพิ่มเติมผ่าน e-Filing เลขที่รับ 2569-0101 เมื่อ 20/07/2569 โดยสำนักงานบัญชี"
          />
        </Field>

        <InlineAlert tone="info" title="หลังบันทึก">
          ยอดที่ยื่นของรอบนี้จะเปลี่ยนเป็นยอดปัจจุบันจากใบที่ยังใช้งานอยู่ และป้าย &quot;ต้องยื่นเพิ่มเติม&quot; จะหายไป
        </InlineAlert>
      </div>
    </Modal>
  )
}
