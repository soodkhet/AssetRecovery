'use client'

import { useState } from 'react'
import { AssetSummaryHeader } from '@/components/warehouse/asset-summary-header'
import { Button, Field, InlineAlert, Modal, Textarea, useToast } from '@/components/ui'
import { apiPath } from '@/lib/api/contract'
import { callApi, jsonRequest, type ApiCallError } from '@/lib/api/types'
import { LOT_REMOVE_ASSET_REASON_MAX } from '@/lib/warehouse/schemas'
import type { AssetListItemDto, LotDetailDto } from '@/lib/warehouse/types'

/**
 * Modal "นำออกจากล็อต" — มติชั่วคราว M5 (mytester WH-05): ล็อตที่จัดผิดแต่ยังไม่ยืนยัน
 * เครื่องกลับไป "ในคลัง" รอจัดล็อตใหม่ · เหตุผลบังคับ (ลง audit) · ปุ่มยืนยันทำงานจริงเมื่อกรอกเหตุผลแล้ว
 * server ตรวจซ้ำทุกข้อ (สิทธิ์ · ล็อต pending_attach ที่ยังไม่แนบใบเซ็นรับ · เครื่องอยู่ในล็อตนี้)
 *
 * ⚠️ ผู้เรียกต้องส่ง `key={asset.id}` — ฟอร์มรีเซ็ตด้วยการ remount
 */
export function RemoveFromLotModal({
  open,
  lot,
  asset,
  onClose,
  onDone,
}: {
  open: boolean
  lot: LotDetailDto
  asset: AssetListItemDto
  onClose: () => void
  onDone: (lot: LotDetailDto) => void
}) {
  const { showToast } = useToast()
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<ApiCallError | null>(null)
  const lastAsset = lot.assets.length <= 1

  async function submit(): Promise<void> {
    setError(null)
    if (reason.trim() === '') {
      setError({ title: 'ต้องระบุเหตุผล', message: 'ต้องระบุเหตุผลที่นำเครื่องออกจากล็อต' })
      return
    }
    setSubmitting(true)
    try {
      const response = await callApi<LotDetailDto>(
        apiPath('lot.remove_asset', { id: lot.id }),
        jsonRequest('PATCH', { assetId: asset.id, reason: reason.trim() }),
      )
      if (response.error !== undefined || response.data === undefined) {
        setError(response.error ?? { title: 'นำเครื่องออกไม่สำเร็จ', message: 'ลองใหม่อีกครั้ง' })
        return
      }
      showToast({ tone: 'success', title: 'นำเครื่องออกจากล็อตแล้ว', description: `${asset.caseRef} · ${lot.lotNumber}` })
      onDone(response.data)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`นำเครื่องออกจากล็อต ${lot.lotNumber}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            ยกเลิก
          </Button>
          <Button variant="danger" loading={submitting} onClick={() => void submit()}>
            ยืนยันนำออกจากล็อต
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <AssetSummaryHeader asset={asset} tone="danger" />

        <InlineAlert tone="warning" title="เครื่องจะกลับไปรอจัดล็อต">
          เครื่องนี้จะกลับไปอยู่ในแท็บ &quot;ในคลัง&quot; เพื่อจัดเข้าล็อตใหม่ได้
          {lastAsset && ' — นี่คือเครื่องสุดท้ายของล็อต ล็อตที่ไม่มีเครื่องจะยืนยันส่งมอบไม่ได้'}
        </InlineAlert>

        {error !== null && (
          <InlineAlert tone="error" title={error.title}>
            {error.message}
          </InlineAlert>
        )}

        <Field label="เหตุผลที่นำออกจากล็อต" required hint="บันทึกลงประวัติการใช้งาน">
          <Textarea
            rows={3}
            value={reason}
            maxLength={LOT_REMOVE_ASSET_REASON_MAX}
            placeholder="เช่น จัดเข้าล็อตผิดบริษัท / เครื่องต้องส่งรอบถัดไป"
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  )
}
