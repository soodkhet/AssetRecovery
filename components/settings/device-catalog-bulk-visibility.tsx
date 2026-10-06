'use client'

import { useState } from 'react'
import { Button, Field, InlineAlert, Modal, Textarea, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import { toFieldErrors } from '@/lib/api/validation'
import type { DeviceCatalogStatusCode } from '@/lib/device-catalog/catalog'
import { deviceCatalogBulkVisibilitySchema, type DeviceCatalogBulkVisibilityInput } from '@/lib/device-catalog/schemas'
import type { DeviceCatalogBulkResultDto } from '@/lib/device-catalog/types'

/**
 * ปุ่ม "เลือกทั้งหมด / ไม่เลือกทั้งหมด" ของหน้า Model Phone (มติ PO U162)
 *
 * ตั้งการแสดงด้วยมือให้**ทุกรายการที่ตรงตัวกรอง/คำค้นที่ใช้อยู่** (ทั้งชุด ไม่ใช่แค่หน้าที่เห็น) — แจ้งจำนวนจาก `total`
 * ของรายการปัจจุบันก่อนยืนยัน · เหตุผลบังคับ · server ใช้เงื่อนไขชุดเดียวกับหน้ารายการแล้วลง audit 1 แถวต่อการกด
 */

type BulkCriteria =
  | Omit<Extract<DeviceCatalogBulkVisibilityInput, { target: 'brands' }>, 'manualStatus' | 'reason'>
  | Omit<Extract<DeviceCatalogBulkVisibilityInput, { target: 'models' }>, 'manualStatus' | 'reason'>

const ACTION_LABEL: Readonly<Record<DeviceCatalogStatusCode, string>> = {
  active: 'เลือกทั้งหมด (แสดง)',
  hidden: 'ไม่เลือกทั้งหมด (ไม่แสดง)',
}

export function DeviceCatalogBulkVisibility({
  criteria,
  total,
  unitLabel,
  conditionText,
  disabled,
  onDone,
}: {
  criteria: BulkCriteria
  /** จำนวนรายการที่ตรงเงื่อนไขปัจจุบัน (ทั้งชุด) */
  total: number
  /** "แบรนด์" / "รุ่น" */
  unitLabel: string
  /** สรุปเงื่อนไขที่ใช้อยู่ — แสดงในกล่องยืนยัน */
  conditionText: string
  disabled: boolean
  onDone: () => void
}) {
  const { showToast } = useToast()
  const [pending, setPending] = useState<DeviceCatalogStatusCode | null>(null)
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  function open(status: DeviceCatalogStatusCode): void {
    setPending(status)
    setReason('')
    setErrors({})
  }

  async function confirm(): Promise<void> {
    if (pending === null) return
    const payload = { ...criteria, manualStatus: pending, reason }
    const parsed = deviceCatalogBulkVisibilitySchema.safeParse(payload)
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error))
      return
    }
    setSaving(true)
    try {
      const result = await callApi<DeviceCatalogBulkResultDto>(
        '/api/settings/device-catalog/bulk-visibility',
        jsonRequest('POST', parsed.data),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      const updated = result.data?.updated ?? 0
      const unchanged = result.data?.unchanged ?? 0
      showToast({
        tone: 'success',
        title: `ตั้ง${pending === 'active' ? 'แสดง' : 'ไม่แสดง'} ${updated.toLocaleString('th-TH')} ${unitLabel}`,
        description: unchanged > 0 ? `อีก ${unchanged.toLocaleString('th-TH')} ${unitLabel}เป็นค่านี้อยู่แล้ว` : undefined,
      })
      setPending(null)
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" disabled={disabled || total === 0} onClick={() => open('active')}>
        {ACTION_LABEL.active}
      </Button>
      <Button variant="secondary" size="sm" disabled={disabled || total === 0} onClick={() => open('hidden')}>
        {ACTION_LABEL.hidden}
      </Button>
      {pending !== null && (
        <Modal
          open
          onClose={() => setPending(null)}
          title={ACTION_LABEL[pending]}
          footer={
            <>
              <Button variant="ghost" onClick={() => setPending(null)} disabled={saving}>
                ยกเลิก
              </Button>
              <Button onClick={() => void confirm()} loading={saving}>
                ยืนยันตั้ง{pending === 'active' ? 'แสดง' : 'ไม่แสดง'} {total.toLocaleString('th-TH')} {unitLabel}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <InlineAlert tone="warning" title={`มีผลกับ ${total.toLocaleString('th-TH')} ${unitLabel} ที่ตรงเงื่อนไข (ทุกหน้า)`}>
              เงื่อนไข: {conditionText} — ทุกรายการจะเป็น “{pending === 'active' ? 'แสดง' : 'ไม่แสดง'} (ตั้งเอง)” และการดึงข้อมูลอัตโนมัติจะไม่เปลี่ยนค่านี้
            </InlineAlert>
            <Field id="device-bulk-reason" label="เหตุผล" required error={errors.reason}>
              <Textarea id="device-bulk-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
          </div>
        </Modal>
      )}
    </>
  )
}
