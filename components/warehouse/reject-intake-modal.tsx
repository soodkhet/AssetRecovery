'use client'

import { useState } from 'react'
import { AssetSummaryHeader } from '@/components/warehouse/asset-summary-header'
import { Button, Field, InlineAlert, Modal, Textarea, useToast } from '@/components/ui'
import { apiPath } from '@/lib/api/contract'
import { callApi, jsonRequest, type ApiCallError } from '@/lib/api/types'
import { fmtDateTime } from '@/lib/format/datetime'
import { WarehouseError } from '@/lib/warehouse/errors'
import { assertRejectReason } from '@/lib/warehouse/intake'
import type { AssetDetailDto, AssetListItemDto } from '@/lib/warehouse/types'

/**
 * Modal "ตีกลับ" (`44` §8.2) — ไม่รับเครื่องเข้าคลัง
 *
 * `rejectReason` เป็นทั้งข้อมูลของเครื่องและ **`reason` ของ audit** (`90` §13 — การตีกลับกระทบเงิน
 * ของฝ่ายสนามเพราะ expense ยังปลดล็อกไม่ได้) จึงบังคับกรอกด้วย `assertRejectReason()` ตัวเดียวกับ API
 *
 * ⚠️ ผู้เรียกต้องส่ง `key={asset.id}` — ฟอร์มรีเซ็ตด้วยการ remount
 */
export function RejectIntakeModal({
  open,
  asset,
  onClose,
  onDone,
}: {
  open: boolean
  asset: AssetListItemDto
  onClose: () => void
  onDone: () => void
}) {
  const { showToast } = useToast()
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<ApiCallError | null>(null)

  async function submit(): Promise<void> {
    setError(null)
    try {
      assertRejectReason(reason)
    } catch (assertError) {
      if (assertError instanceof WarehouseError) {
        setError({ code: assertError.code, title: assertError.title, message: assertError.userMessage })
        return
      }
      throw assertError
    }

    setSubmitting(true)
    try {
      const response = await callApi<AssetDetailDto>(
        apiPath('asset.rejectIntake', { id: asset.id }),
        jsonRequest('POST', { rejectReason: reason.trim() }),
      )
      if (response.error !== undefined) {
        setError(response.error)
        return
      }
      showToast({ tone: 'success', title: 'ตีกลับเครื่องแล้ว', description: asset.caseRef })
      onDone()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ตีกลับ — ไม่รับเครื่องเข้าคลัง"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            ยกเลิก
          </Button>
          <Button variant="danger" loading={submitting} onClick={() => void submit()}>
            ยืนยันตีกลับ
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <AssetSummaryHeader asset={asset} tone="danger" />

        <InlineAlert tone="warning" title="ตีกลับ = ไม่รับเข้าคลัง">
          เคสยังไม่จบ — เจ้าหน้าที่ภาคสนามยังเบิกค่าใช้จ่ายของเคสนี้ไม่ได้จนกว่าจะรับเครื่องเข้าคลังสำเร็จ
        </InlineAlert>

        <div className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-2">
          <IdentityRow label="IMEI ในสัญญา" value={asset.imeiContract} />
          <IdentityRow label="IMEI ที่บันทึกไว้" value={asset.imeiActual} tone="danger" />
          {asset.serialContract !== null && <IdentityRow label="Serial ในสัญญา" value={asset.serialContract} />}
          {asset.serialActual !== null && (
            <IdentityRow label="Serial ที่บันทึกไว้" value={asset.serialActual} tone="danger" />
          )}
        </div>

        {error !== null && (
          <InlineAlert tone="error" title={error.title}>
            {error.message}
          </InlineAlert>
        )}

        <Field label="เหตุผลที่ตีกลับ" required hint="บันทึกลง audit log — อธิบายให้ทีมภาคสนามแก้ไขได้">
          <Textarea
            rows={3}
            value={reason}
            maxLength={1000}
            placeholder="เช่น IMEI บนเครื่องไม่ตรงกับสัญญา / เครื่องไม่ตรงรุ่นที่ระบุ"
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  )
}

/** Modal "ดูเหตุผลตีกลับ" (`44` §8.2) — read-only */
export function ViewRejectModal({
  open,
  asset,
  onClose,
}: {
  open: boolean
  asset: AssetListItemDto
  onClose: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="เหตุผลที่ตีกลับ"
      footer={
        <Button variant="secondary" onClick={onClose}>
          ปิดหน้าต่าง
        </Button>
      }
    >
      <div className="space-y-4">
        <AssetSummaryHeader asset={asset} tone="danger" />
        <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="text-sm font-semibold text-red-800">{asset.rejectReason ?? '(ไม่ได้บันทึกเหตุผล)'}</div>
          <div className="text-xs text-slate-500">ตีกลับเมื่อ {fmtDateTime(asset.rejectedAt)}</div>
          <div className="grid gap-3 border-t border-red-200 pt-3 sm:grid-cols-2">
            <IdentityRow label="IMEI ในสัญญา" value={asset.imeiContract} />
            <IdentityRow label="IMEI ที่พบ" value={asset.imeiActual} tone="danger" />
          </div>
        </div>
      </div>
    </Modal>
  )
}

function IdentityRow({
  label,
  value,
  tone = 'slate',
}: {
  label: string
  value: string | null
  tone?: 'slate' | 'danger'
}) {
  return (
    <div className="text-xs">
      <div className="mb-0.5 text-slate-400">{label}</div>
      <div className={`font-mono font-bold ${tone === 'danger' ? 'text-red-700' : 'text-slate-800'}`}>
        {value ?? '(ไม่ได้บันทึก)'}
      </div>
    </div>
  )
}
