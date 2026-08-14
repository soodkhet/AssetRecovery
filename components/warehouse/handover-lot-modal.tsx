'use client'

import { useState } from 'react'
import { Badge, Button, Field, InlineAlert, Input, Modal, RefText, Textarea, useToast } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { HandoverNotePreview } from '@/components/warehouse/handover-note-preview'
import { apiPath } from '@/lib/api/contract'
import { callApi, jsonRequest, type ApiCallError } from '@/lib/api/types'
import { fromInputDateTime } from '@/lib/format/datetime'
import type { HandoverType } from '@/lib/generated/prisma/enums'
import { documentIdentifier } from '@/lib/warehouse/handover-doc'
import { HANDOVER_TYPES, lotCreateSchema } from '@/lib/warehouse/schemas'
import type { AssetListItemDto, LotDetailDto } from '@/lib/warehouse/types'
import { assetConditionLabel, HANDOVER_TYPE_LABEL, LOT_TAB_LABEL } from '@/lib/warehouse/warehouse-ui'

/**
 * Modal "นัดวันส่งมอบ" = สร้างล็อต (`44` §8.3 ปุ่มบนแท็บ "ในคลัง" → modal `handover-lot`)
 *
 * - เลือกรูปแบบส่งมอบก่อนเสมอ (§6.3) แล้วช่องกรอกจึงเปลี่ยนตามรูปแบบ:
 *   `finance_pickup` = วันนัดรับ + ผู้ประสานงาน · `we_deliver` = กำหนดส่ง + **ที่อยู่จัดส่ง (บังคับ)** + เลขพัสดุ
 * - เลข `LOT-`/`DLV-` **ไม่แสดงล่วงหน้า** — เดินจาก sequence ระดับ DB ตอนบันทึกเท่านั้น (§6.2 · §10)
 *   mockup โชว์เลขถัดไปได้เพราะเป็นข้อมูลจำลอง ของจริงเดาแล้วชนกันเมื่อมีคนสร้างพร้อมกัน
 * - ตรวจฟอร์มด้วย `lotCreateSchema` **ตัวเดียวกับ API** (Rule 13) ก่อนยิงจริง
 *
 * ⚠️ ผู้เรียกต้องส่ง `key` ที่ผูกกับชุดเครื่องที่เลือก — ฟอร์มรีเซ็ตด้วยการ remount (ไม่ setState ใน effect)
 */
export function HandoverLotModal({
  open,
  companyId,
  assets,
  defaultDeliveryAddr,
  onClose,
  onCreated,
}: {
  open: boolean
  companyId: string
  /** เครื่องที่ติ๊กเลือกมาจากแท็บ "ในคลัง" — ทั้งหมดต้องเป็นบริษัทเดียวกัน (§6.2 บังคับซ้ำที่ API) */
  assets: readonly AssetListItemDto[]
  /** ที่อยู่บริษัทไฟแนนซ์จาก master data — เติมให้อัตโนมัติเมื่อเลือก "เราจัดส่งไปให้" */
  defaultDeliveryAddr: string | null
  onClose: () => void
  onCreated: (lot: LotDetailDto) => void
}) {
  const { showToast } = useToast()

  const [type, setType] = useState<HandoverType | null>(null)
  const [scheduledLocal, setScheduledLocal] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [deliveryAddr, setDeliveryAddr] = useState('')
  const [trackingNo, setTrackingNo] = useState('')
  const [note, setNote] = useState('')

  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({})
  const [error, setError] = useState<ApiCallError | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [listOpen, setListOpen] = useState(false)

  const companyName = assets[0]?.companyName ?? ''
  const isPickup = type === 'finance_pickup'
  const scheduledAt = fromInputDateTime(scheduledLocal)

  function chooseType(next: HandoverType): void {
    setType(next)
    setFieldErrors({})
    // ที่อยู่จัดส่งตั้งต้นจากบริษัท (mockup §8.3) — ธุรการแก้ทับได้ถ้าส่งไปที่สาขาอื่น
    if (next === 'we_deliver' && deliveryAddr.trim() === '' && defaultDeliveryAddr !== null) {
      setDeliveryAddr(defaultDeliveryAddr)
    }
  }

  function buildInput(): unknown {
    return {
      companyId,
      assetIds: assets.map((asset) => asset.id),
      type,
      scheduledAt: scheduledAt === null ? null : scheduledAt.toISOString(),
      contactPerson: isPickup ? contactPerson : null,
      deliveryAddr: isPickup ? null : deliveryAddr,
      trackingNo: isPickup ? null : trackingNo,
      note,
    }
  }

  async function submit(): Promise<void> {
    setError(null)

    // วันนัดเป็นสาระสำคัญของหน้าจอนี้ (mockup §8.3 ติด *) — schema ปล่อยผ่านได้เพราะ API รับ null ได้
    if (scheduledLocal.trim() === '') {
      setFieldErrors({ scheduledAt: `ต้องระบุ${isPickup ? 'วันนัดรับ' : 'กำหนดจัดส่ง'}` })
      return
    }

    const parsed = lotCreateSchema.safeParse(buildInput())
    if (!parsed.success) {
      const errors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form')
        errors[key] = errors[key] ?? issue.message
      }
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})

    setSubmitting(true)
    try {
      const response = await callApi<LotDetailDto>(apiPath('lot.create'), jsonRequest('POST', parsed.data))
      if (response.error !== undefined || response.data === undefined) {
        setError(response.error ?? { title: 'สร้างล็อตไม่สำเร็จ', message: 'กรุณาลองใหม่' })
        return
      }
      showToast({
        tone: 'success',
        title: `สร้างล็อต ${response.data.lotNumber} แล้ว`,
        description: `${response.data.assetCount} เครื่อง · ใบส่งมอบ ${response.data.docRef} · ไปต่อที่แท็บ “${LOT_TAB_LABEL[response.data.tab]}”`,
      })
      onCreated(response.data)
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
        title={`นัดวันส่งมอบ — ${companyName}`}
        description={`${assets.length} เครื่อง · 1 ล็อต = 1 บริษัทไฟแนนซ์เสมอ (44 §6.2)`}
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={submitting}>
              ยกเลิก
            </Button>
            <Button variant="primary" loading={submitting} disabled={type === null} onClick={() => void submit()}>
              บันทึกการนัด
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {error !== null && (
            <InlineAlert tone="error" title={error.title}>
              {error.message}
            </InlineAlert>
          )}

          {/* ── รูปแบบการส่งมอบ (`44` §6.3) ───────────────────────── */}
          <section>
            <div className="mb-2 text-xs font-bold text-slate-700">
              รูปแบบการส่งมอบ <span className="text-red-500">*</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {HANDOVER_TYPES.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={type === value}
                  onClick={() => chooseType(value)}
                  className={cn(
                    'focus-ring rounded-xl border-2 p-4 text-left transition-colors',
                    type === value ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300',
                  )}
                >
                  <div className="text-sm font-bold text-slate-900">
                    {value === 'finance_pickup' ? '🏢' : '🚚'} {HANDOVER_TYPE_LABEL[value]}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {value === 'finance_pickup'
                      ? 'ลูกค้านัดมารับที่คลังของเรา — แนบใบเซ็นรับในแท็บ “รอส่งมอบ”'
                      : 'ส่งพัสดุหรือเดินทางไปส่ง — เครื่องออกจากคลังทันที แนบหลักฐานในแท็บ “ส่งมอบแล้ว”'}
                  </div>
                </button>
              ))}
            </div>
          </section>

          {type === null ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">
              เลือกรูปแบบการส่งมอบก่อน แล้วช่องกรอกจะปรากฏตามรูปแบบที่เลือก
            </div>
          ) : (
            <section className="space-y-4 border-t border-slate-100 pt-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field
                  label={isPickup ? 'วันเวลานัดรับ' : 'กำหนดวันเวลาจัดส่ง'}
                  required
                  error={fieldErrors.scheduledAt ?? null}
                  hint="เวลาไทย — ระบบเก็บเป็น UTC ให้เอง"
                >
                  <Input
                    type="datetime-local"
                    value={scheduledLocal}
                    invalid={fieldErrors.scheduledAt !== undefined}
                    onChange={(event) => setScheduledLocal(event.target.value)}
                  />
                </Field>

                {isPickup ? (
                  <Field label="ชื่อผู้ประสานงาน (ถ้าแจ้งมาแล้ว)" error={fieldErrors.contactPerson ?? null}>
                    <Input
                      maxLength={200}
                      placeholder="เช่น คุณวิภา ฝ่ายติดตามทรัพย์"
                      value={contactPerson}
                      onChange={(event) => setContactPerson(event.target.value)}
                    />
                  </Field>
                ) : (
                  <Field label="ที่อยู่จัดส่ง" required error={fieldErrors.deliveryAddr ?? null}>
                    <Textarea
                      rows={2}
                      maxLength={500}
                      placeholder="ที่อยู่ที่จะส่งเครื่องคืน"
                      value={deliveryAddr}
                      invalid={fieldErrors.deliveryAddr !== undefined}
                      onChange={(event) => setDeliveryAddr(event.target.value)}
                    />
                  </Field>
                )}
              </div>

              {!isPickup && (
                <Field label="เลขพัสดุ (ถ้ามีแล้ว)" hint="กรณีไรเดอร์/ขนส่งที่ยังไม่มีเลข เว้นว่างได้">
                  <Input
                    maxLength={100}
                    className="font-mono"
                    value={trackingNo}
                    onChange={(event) => setTrackingNo(event.target.value)}
                  />
                </Field>
              )}

              <Field label="หมายเหตุ (ถ้ามี)" error={fieldErrors.note ?? null}>
                <Textarea
                  rows={1}
                  maxLength={1000}
                  placeholder="บันทึกเพิ่มเติม..."
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </Field>
            </section>
          )}

          {/* ── เลขล็อต/ใบส่งมอบ (ออกอัตโนมัติ — อ่านอย่างเดียว §6.2) ── */}
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase">เลขล็อต / เลขที่ใบส่งมอบ</div>
                <div className="mt-0.5 font-mono text-sm font-bold text-slate-700">LOT-…… / DLV-……</div>
                <div className="mt-1 text-[10px] text-slate-500">
                  ออกอัตโนมัติเป็นปี พ.ศ. ตอนบันทึก — ไม่ซ้ำและแก้ไขไม่ได้
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setPreviewOpen(true)} disabled={type === null}>
                ดูตัวอย่างใบส่งมอบ
              </Button>
            </div>
          </section>

          {/* ── รายการเครื่องที่จะส่งมอบ (พับได้) ─────────────────── */}
          <section className="overflow-hidden rounded-xl border border-slate-200">
            <button
              type="button"
              aria-expanded={listOpen}
              onClick={() => setListOpen((current) => !current)}
              className="focus-ring flex w-full items-center justify-between gap-3 bg-slate-50 px-4 py-2 text-left"
            >
              <span className="text-[10px] font-bold text-slate-500 uppercase">
                รายการเครื่องที่จะส่งมอบ ({assets.length} เครื่อง)
              </span>
              <span className="text-xs font-semibold text-slate-600">{listOpen ? 'ซ่อน ▲' : 'ดูรายการ ▼'}</span>
            </button>
            {listOpen && (
              <div className="max-h-48 divide-y divide-slate-100 overflow-y-auto">
                {assets.map((asset) => (
                  <div key={asset.id} className="flex items-center justify-between gap-3 px-4 py-2 text-xs">
                    <div className="min-w-0">
                      <RefText className="font-bold">{asset.caseRef}</RefText>
                      <span className="ml-2 text-slate-500">{asset.debtorName}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-slate-600">{asset.deviceDesc}</span>
                      <span className="hidden font-mono text-slate-400 sm:inline">{documentIdentifier(asset)}</span>
                      <Badge className="bg-slate-100 text-slate-600">{assetConditionLabel(asset.condition)}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-slate-100 px-4 py-2 text-[10px] text-slate-400">
              ใบส่งมอบ PDF และ Export Excel ของล็อตนี้ดาวน์โหลดได้ที่การ์ดล็อตหลังบันทึกการนัด
            </div>
          </section>
        </div>
      </Modal>

      {type !== null && (
        <HandoverNotePreview
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          companyName={companyName}
          type={type}
          scheduledAt={scheduledAt === null ? null : scheduledAt.toISOString()}
          contactPerson={contactPerson.trim() === '' ? null : contactPerson.trim()}
          deliveryAddr={deliveryAddr.trim() === '' ? null : deliveryAddr.trim()}
          note={note.trim() === '' ? null : note.trim()}
          assets={assets}
        />
      )}
    </>
  )
}
