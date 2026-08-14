'use client'

import { useState, type ReactNode } from 'react'
import { Button, Field, InlineAlert, Input, Modal, useToast } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { FileViewerModal, type ViewableFile } from '@/components/cases/file-viewer-modal'
import { apiPath } from '@/lib/api/contract'
import { callApi, jsonRequest, type ApiCallError } from '@/lib/api/types'
import { fromInputDateTime, toInputDateTime } from '@/lib/format/datetime'
import {
  LOT_DOCUMENT_ACCEPT,
  lotDocumentMime,
  lotDocumentSlots,
  type LotDocumentSlot,
} from '@/lib/warehouse/lot-documents'
import { canConfirmLot, type LotDocument } from '@/lib/warehouse/lot-status'
import type { LotConfirmResultDto, LotDetailDto } from '@/lib/warehouse/types'
import { uploadLotDocument, WarehouseUploadError } from '@/lib/warehouse/upload-client'
import { HANDOVER_TYPE_LABEL } from '@/lib/warehouse/warehouse-ui'

/**
 * Modal "แนบเอกสาร + ยืนยันส่งมอบ" (`44` §8.4) — **จุดที่ปลดล็อก expense และเปิดเกต Revenue** (§11)
 *
 * - จำนวนช่องอัปโหลดมาจาก `lotDocumentSlots()` ตามชนิดล็อต (§6.3): 1 ช่อง (`finance_pickup`)
 *   หรือ 2 ช่อง (`we_deliver`) — หน้าจอไม่ if ชนิดล็อตเอง
 * - ปุ่มยืนยัน disabled จนกว่า `canConfirmLot()` จะผ่าน — **กติกาเดียวกับ `assertLotConfirmDocuments()`
 *   ที่ API** (หน้าจอเป็นแค่ UX ส่วนการบังคับจริงอยู่ที่ endpoint เสมอ — DEC-002)
 * - ไฟล์อัปโหลดขึ้น Storage ทันทีที่เลือก แล้วส่ง **path** ไปกับคำขอ confirm (แนวเดียวกับรูป 7 มุมของ §8.2)
 */
export function AttachDocModal({
  open,
  lot,
  onClose,
  onConfirmed,
}: {
  open: boolean
  lot: LotDetailDto
  onClose: () => void
  onConfirmed: (result: LotConfirmResultDto) => void
}) {
  const { showToast } = useToast()

  const [urls, setUrls] = useState<Readonly<Record<LotDocument, string | null>>>({
    signed_doc: lot.signedDocUrl,
    delivery_proof: lot.deliveryProofUrl,
  })
  const [deliveredLocal, setDeliveredLocal] = useState(toInputDateTime(lot.deliveredAt ?? new Date()))
  const [uploading, setUploading] = useState<LotDocument | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<ApiCallError | null>(null)
  const [dateError, setDateError] = useState<string | null>(null)
  const [viewing, setViewing] = useState<ViewableFile | null>(null)

  const slots = lotDocumentSlots({
    type: lot.type,
    status: lot.status,
    signedDocUrl: urls.signed_doc,
    deliveryProofUrl: urls.delivery_proof,
  })
  const ready = canConfirmLot(lot.type, { signedDocUrl: urls.signed_doc, deliveryProofUrl: urls.delivery_proof })
  const isPickup = lot.type === 'finance_pickup'

  async function attach(document: LotDocument, files: FileList | null): Promise<void> {
    const file = files?.item(0) ?? null
    if (file === null) return
    setUploading(document)
    try {
      const path = await uploadLotDocument(lot.id, document, file)
      setUrls((current) => ({ ...current, [document]: path }))
    } catch (uploadError) {
      showToast({
        tone: 'error',
        title: 'แนบไฟล์ไม่สำเร็จ',
        description: uploadError instanceof WarehouseUploadError ? uploadError.message : 'อัปโหลดไฟล์ไม่สำเร็จ',
      })
    } finally {
      setUploading(null)
    }
  }

  async function confirm(): Promise<void> {
    setError(null)
    const deliveredAt = fromInputDateTime(deliveredLocal)
    if (deliveredAt === null) {
      setDateError(`ต้องระบุวันเวลาที่${isPickup ? 'ผู้รับมารับ' : 'ส่งมอบ'}จริง`)
      return
    }
    setDateError(null)

    setSubmitting(true)
    try {
      const response = await callApi<LotConfirmResultDto>(
        apiPath('lot.confirm', { id: lot.id }),
        jsonRequest('PATCH', {
          deliveredAt: deliveredAt.toISOString(),
          signedDocUrl: urls.signed_doc,
          deliveryProofUrl: urls.delivery_proof,
        }),
      )
      if (response.error !== undefined || response.data === undefined) {
        setError(response.error ?? { title: 'ยืนยันส่งมอบไม่สำเร็จ', message: 'กรุณาลองใหม่' })
        return
      }
      const result = response.data
      showToast({
        tone: 'success',
        title: `ยืนยันส่งมอบ ${lot.lotNumber} แล้ว`,
        description: `เครื่อง ${result.assetIdsHandedOver.length} เครื่องส่งมอบแล้ว · ปลดล็อกรายการเบิก ${result.expenseIdsUnlocked.length} รายการ`,
      })
      onConfirmed(result)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="lg"
        title={`แนบ${isPickup ? 'ใบเซ็นรับ' : 'หลักฐานจัดส่ง'} — ${lot.lotNumber}`}
        description="แนบเอกสารให้ครบแล้วยืนยัน — เป็นขั้นตอนที่ปิดล็อตและปลดล็อกรายการเบิก"
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={submitting}>
              ยกเลิก
            </Button>
            <Button
              variant="primary"
              loading={submitting}
              disabled={!ready || uploading !== null}
              onClick={() => void confirm()}
            >
              ยืนยันส่งมอบสำเร็จ
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error !== null && (
            <InlineAlert tone="error" title={error.title}>
              {error.message}
            </InlineAlert>
          )}

          <dl className="rounded-xl border border-slate-200 p-4 text-xs">
            <Row label="เลขล็อต" value={<span className="font-mono font-bold text-slate-700">{lot.lotNumber}</span>} />
            <Row label="เลขที่ใบส่งมอบ" value={<span className="font-mono text-slate-700">{lot.docRef}</span>} />
            <Row label="บริษัทไฟแนนซ์" value={lot.companyName} />
            <Row label="รูปแบบ" value={`${isPickup ? '🏢' : '🚚'} ${HANDOVER_TYPE_LABEL[lot.type]}`} />
            <Row label="จำนวนเครื่อง" value={`${lot.assetCount} เครื่อง`} />
            {lot.trackingNo !== null && (
              <Row label="เลขพัสดุ" value={<span className="font-mono">{lot.trackingNo}</span>} />
            )}
          </dl>

          <InlineAlert tone={isPickup ? 'info' : 'warning'} title={HANDOVER_TYPE_LABEL[lot.type]}>
            {isPickup
              ? 'ต้องการเอกสารชิ้นเดียว: ใบส่งมอบที่มีลายเซ็นผู้รับ (พิมพ์จากระบบ ให้เซ็นรับ แล้วสแกนแนบกลับ)'
              : 'ต้องการ 2 เอกสาร: ใบส่งมอบที่มีลายเซ็นผู้รับ และหลักฐานส่งพัสดุ / Delivered'}
          </InlineAlert>

          {slots.map((slot) => (
            <DocumentSlotField
              key={slot.document}
              slot={slot}
              uploading={uploading === slot.document}
              disabled={submitting || (uploading !== null && uploading !== slot.document)}
              onPick={(files) => void attach(slot.document, files)}
              onView={() =>
                slot.fileUrl === null
                  ? undefined
                  : setViewing({
                      fileUrl: slot.fileUrl,
                      originalName: slot.label,
                      mimeType: lotDocumentMime(slot.fileUrl),
                    })
              }
            />
          ))}

          <Field
            label={`วันเวลาที่${isPickup ? 'ผู้รับมารับ' : 'ส่งมอบ'}จริง`}
            required
            error={dateError}
            hint="เวลาไทย — ค่าตั้งต้นคือตอนนี้ แก้ให้ตรงกับที่เกิดขึ้นจริงได้"
          >
            <Input
              type="datetime-local"
              value={deliveredLocal}
              invalid={dateError !== null}
              onChange={(event) => setDeliveredLocal(event.target.value)}
            />
          </Field>

          <InlineAlert tone="success" title="เมื่อยืนยันแล้ว ระบบจะทำให้ทันทีในทรานแซกชันเดียว">
            <ul className="mt-1 space-y-0.5">
              <li>· เครื่องทุกเครื่องในล็อต → “ส่งมอบแล้ว” (สถานะสุดท้าย)</li>
              <li>· ปลดล็อกรายการเบิกของทีมภาคสนามให้เข้าคิวอนุมัติ</li>
              <li>· เปิดเกตรายได้เพื่อรอวางบิลบริษัทไฟแนนซ์</li>
            </ul>
            <div className="mt-1 font-semibold">ล็อตที่ยืนยันแล้วแก้ไขไม่ได้ทุกกรณี (`44` §10)</div>
          </InlineAlert>
        </div>
      </Modal>

      <FileViewerModal open={viewing !== null} document={viewing} onClose={() => setViewing(null)} />
    </>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-right font-semibold text-slate-700">{value}</dd>
    </div>
  )
}

function DocumentSlotField({
  slot,
  uploading,
  disabled,
  onPick,
  onView,
}: {
  slot: LotDocumentSlot
  uploading: boolean
  disabled: boolean
  onPick: (files: FileList | null) => void
  onView: () => void
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-bold text-slate-700">
        {slot.ordinal} {slot.label} <span className="text-red-500">*</span>
      </div>
      <div
        className={cn(
          'rounded-xl border-2 border-dashed p-4 text-center transition-colors',
          slot.attached ? 'border-emerald-300 bg-emerald-50' : 'border-slate-300 hover:bg-slate-50',
        )}
      >
        <div className="text-xs text-slate-500">{slot.hint}</div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <label className="focus-ring cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            {uploading ? 'กำลังอัปโหลด...' : slot.attached ? 'แนบไฟล์ใหม่แทน' : 'เลือกไฟล์'}
            <input
              type="file"
              accept={LOT_DOCUMENT_ACCEPT}
              className="sr-only"
              disabled={disabled || uploading}
              onChange={(event) => {
                onPick(event.target.files)
                event.target.value = ''
              }}
            />
          </label>
          {slot.fileUrl !== null && (
            <Button variant="secondary" size="sm" onClick={onView}>
              ดูไฟล์ที่แนบ
            </Button>
          )}
        </div>
        {slot.attached && <div className="mt-2 text-[11px] font-semibold text-emerald-700">แนบแล้ว ✅</div>}
      </div>
    </div>
  )
}
