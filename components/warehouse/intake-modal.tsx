'use client'

import { useState } from 'react'
import { AssetSummaryHeader } from '@/components/warehouse/asset-summary-header'
import { Button, Field, InlineAlert, Modal, Textarea, useToast } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { apiPath } from '@/lib/api/contract'
import { callApi, jsonRequest, type ApiCallError } from '@/lib/api/types'
import { WarehouseError } from '@/lib/warehouse/errors'
import type { AssetCondition } from '@/lib/generated/prisma/enums'
import { compareAssetIdentity, IMEI_LENGTH, isValidImei } from '@/lib/warehouse/imei'
import {
  INTAKE_PHOTO_ANGLES,
  INTAKE_PHOTO_ANGLE_LABELS,
  IMEI_MISMATCH_WARNING,
  assertIntakeCondition,
  requiresConditionNote,
  type IntakePhotoAngle,
} from '@/lib/warehouse/intake'
import {
  flattenIntakePhotos,
  groupIntakePhotos,
  intakePhotoWarning,
  type IntakePhotoGroups,
} from '@/lib/warehouse/intake-photos'
import { ASSET_CONDITIONS } from '@/lib/warehouse/schemas'
import type { AssetDetailDto, AssetListItemDto } from '@/lib/warehouse/types'
import { INTAKE_PHOTO_ACCEPT, WarehouseUploadError, uploadIntakePhoto } from '@/lib/warehouse/upload-client'
import { ASSET_CONDITION_LABEL } from '@/lib/warehouse/warehouse-ui'

/**
 * Modal "รับเข้าคลัง" — 3 ขั้นตอนใน modal เดียว (`44` §8.2)
 *
 * 1. เทียบ IMEI/serial กับสัญญา — ตรง = เขียว, ไม่ตรง = **แดงแต่ไปต่อได้** (`IMEI_MISMATCH` เตือน ไม่ block)
 *    การยืนยันทับคำเตือนต้องกดยืนยันซ้ำอีกครั้ง (force proceed — ธุรการต้องตั้งใจ ไม่ใช่เผลอ)
 * 2. สภาพเครื่อง + รายละเอียด (บังคับเมื่อไม่ใช่ "ปกติ") — ตรวจด้วย `assertIntakeCondition()` ตัวเดียวกับ API
 * 3. รูป 7 มุม — ถ่ายไม่ครบ **เตือนอย่างเดียว** (`44` §12 ไม่มี code สำหรับรูปไม่ครบ)
 *
 * ปุ่ม "รับใหม่" ของเครื่องที่เคยตีกลับเปิด modal ตัวเดียวกันนี้ (`44` §8.2 retry · §9.1)
 * ⚠️ ผู้เรียกต้องส่ง `key={asset.id}` — state ของฟอร์มรีเซ็ตด้วยการ remount (ไม่ setState ใน effect)
 */
export function IntakeModal({
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

  const [imeiActual, setImeiActual] = useState(asset.imeiActual ?? '')
  const [serialActual, setSerialActual] = useState(asset.serialActual ?? '')
  const [condition, setCondition] = useState<AssetCondition | null>(asset.condition)
  const [conditionNote, setConditionNote] = useState(asset.conditionNote ?? '')
  const [photos, setPhotos] = useState<readonly string[]>([])
  const [uploading, setUploading] = useState<IntakePhotoAngle | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<ApiCallError | null>(null)
  /** ยืนยันทับคำเตือน IMEI ไม่ตรงแล้วหรือยัง (force proceed — `44` §8.2) */
  const [forceProceed, setForceProceed] = useState(false)

  const groups: IntakePhotoGroups = groupIntakePhotos(photos)
  const photoWarning = intakePhotoWarning(groups.filledAngles)

  const comparison = compareAssetIdentity(
    { imeiContract: asset.imeiContract, serialContract: asset.serialContract },
    {
      imeiActual: imeiActual.trim() === '' ? null : imeiActual.trim(),
      serialActual: serialActual.trim() === '' ? null : serialActual.trim(),
    },
  )
  const imeiTouched = imeiActual.trim() !== '' || serialActual.trim() !== ''
  const mismatch = imeiTouched && !comparison.matched
  /** พิมพ์ไม่ครบ 15 หลัก = พิมพ์ผิด (schema ปฏิเสธ) ไม่ใช่ "ไม่ตรงสัญญา" */
  const imeiFormatInvalid = imeiActual.trim() !== '' && !isValidImei(imeiActual.trim())

  const isRetry = asset.assetStatus === 'intake_rejected'

  async function addPhoto(angle: IntakePhotoAngle, files: FileList | null): Promise<void> {
    const file = files?.item(0) ?? null
    if (file === null) return
    setUploading(angle)
    try {
      const path = await uploadIntakePhoto(asset.id, angle, file)
      setPhotos((current) => flattenIntakePhotos(groupIntakePhotos([...current, path])))
    } catch (uploadError) {
      showToast({
        tone: 'error',
        title: `เพิ่มรูป${INTAKE_PHOTO_ANGLE_LABELS[angle]}ไม่สำเร็จ`,
        description: uploadError instanceof WarehouseUploadError ? uploadError.message : 'อัปโหลดไฟล์ไม่สำเร็จ',
      })
    } finally {
      setUploading(null)
    }
  }

  function removePhoto(path: string): void {
    setPhotos((current) => current.filter((each) => each !== path))
  }

  async function submit(): Promise<void> {
    setError(null)

    // ตรวจด้วยตัว assert ชุดเดียวกับ API — ผู้ใช้เห็น code ของ `44` §12 ไม่ใช่ `REQUIRED_MISSING`
    try {
      assertIntakeCondition({ condition, conditionNote: conditionNote.trim() === '' ? null : conditionNote })
    } catch (assertError) {
      if (assertError instanceof WarehouseError) {
        setError({ code: assertError.code, title: assertError.title, message: assertError.userMessage })
        return
      }
      throw assertError
    }

    if (imeiFormatInvalid) {
      setError({
        title: 'รูปแบบ IMEI ไม่ถูกต้อง',
        message: `IMEI ต้องเป็นตัวเลข ${IMEI_LENGTH} หลัก — ตรวจสอบที่กรอกอีกครั้ง`,
      })
      return
    }

    // ไม่ตรงกับสัญญา = เตือนก่อน 1 ครั้ง แล้วจึงยอมให้ยืนยันทับ (`44` §8.2 force proceed)
    if (mismatch && !forceProceed) {
      setForceProceed(true)
      return
    }

    setSubmitting(true)
    try {
      const response = await callApi<AssetDetailDto>(
        apiPath('asset.intake', { id: asset.id }),
        jsonRequest('POST', {
          imeiActual: imeiActual.trim() === '' ? null : imeiActual.trim(),
          serialActual: serialActual.trim() === '' ? null : serialActual.trim(),
          condition,
          conditionNote: conditionNote.trim() === '' ? null : conditionNote.trim(),
          photos,
        }),
      )
      if (response.error !== undefined) {
        setError(response.error)
        return
      }
      showToast({
        tone: response.warning === undefined ? 'success' : 'warning',
        title: isRetry ? 'รับเครื่องเข้าคลังอีกครั้งแล้ว' : 'รับเครื่องเข้าคลังแล้ว',
        description: response.warning?.message ?? `${asset.caseRef} · ${asset.deviceDesc}`,
      })
      onDone()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isRetry ? 'รับเครื่องเข้าคลังอีกครั้ง' : 'รับเครื่องเข้าคลัง'}
      description="ตรวจ IMEI → บันทึกสภาพ → ถ่ายรูปหลักฐาน 7 มุม"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            ยกเลิก
          </Button>
          <Button
            variant={mismatch && forceProceed ? 'danger' : 'primary'}
            loading={submitting}
            disabled={submitting || uploading !== null}
            onClick={() => void submit()}
          >
            {mismatch && forceProceed ? 'ยืนยันรับทั้งที่ IMEI ไม่ตรง' : 'ยืนยันรับเข้าคลัง'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <AssetSummaryHeader asset={asset} />

        {error !== null && (
          <InlineAlert tone="error" title={error.title}>
            {error.message}
          </InlineAlert>
        )}

        {/* ── ขั้น 1/3: ตรวจสอบ IMEI ─────────────────────────────── */}
        <section>
          <StepTitle step={1} label="ตรวจสอบ IMEI / Serial" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="IMEI ในสัญญา">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700">
                {asset.imeiContract ?? '—'}
              </div>
            </Field>
            <Field
              label="IMEI ที่ตรวจจริงบนเครื่อง"
              error={imeiFormatInvalid ? `ต้องเป็นตัวเลข ${IMEI_LENGTH} หลัก` : null}
            >
              <input
                type="text"
                inputMode="numeric"
                maxLength={IMEI_LENGTH}
                value={imeiActual}
                placeholder="พิมพ์หรือสแกน IMEI"
                onChange={(event) => {
                  setImeiActual(event.target.value)
                  setForceProceed(false)
                }}
                className={cn(
                  'focus-ring w-full rounded-lg border px-3 py-2 font-mono text-sm',
                  imeiFormatInvalid || mismatch
                    ? 'border-red-400 bg-red-50 text-red-700'
                    : comparison.matched
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                      : 'border-slate-300 bg-white',
                )}
              />
            </Field>

            {asset.serialContract !== null && (
              <>
                <Field label="Serial ในสัญญา">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700">
                    {asset.serialContract}
                  </div>
                </Field>
                <Field label="Serial ที่ตรวจจริงบนเครื่อง">
                  <input
                    type="text"
                    maxLength={100}
                    value={serialActual}
                    onChange={(event) => {
                      setSerialActual(event.target.value)
                      setForceProceed(false)
                    }}
                    className={cn(
                      'focus-ring w-full rounded-lg border px-3 py-2 font-mono text-sm',
                      mismatch ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-300 bg-white',
                    )}
                  />
                </Field>
              </>
            )}
          </div>

          {comparison.matched && (
            <InlineAlert className="mt-3" tone="success" title="ตรงกับสัญญา">
              ตรวจแล้วตรงทุกช่อง — รับเข้าคลังได้เลย
            </InlineAlert>
          )}
          {mismatch && (
            <InlineAlert className="mt-3" tone="error" title={IMEI_MISMATCH_WARNING.title}>
              {IMEI_MISMATCH_WARNING.message}
              {forceProceed && (
                <div className="mt-1 font-semibold">
                  กด “ยืนยันรับทั้งที่ IMEI ไม่ตรง” อีกครั้งเพื่อรับเข้าคลัง — ระบบจะบันทึกค่าที่ตรวจจริงไว้
                </div>
              )}
            </InlineAlert>
          )}
        </section>

        {/* ── ขั้น 2/3: บันทึกสภาพ ───────────────────────────────── */}
        <section>
          <StepTitle step={2} label="บันทึกสภาพเครื่อง" />
          <div className="grid grid-cols-3 gap-2">
            {ASSET_CONDITIONS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={condition === value}
                onClick={() => setCondition(value)}
                className={cn(
                  'focus-ring rounded-xl border-2 py-3 text-xs font-bold transition-colors',
                  condition === value
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300',
                )}
              >
                {ASSET_CONDITION_LABEL[value]}
              </button>
            ))}
          </div>
          <Field
            className="mt-3"
            label="รายละเอียดสภาพเครื่อง"
            required={requiresConditionNote(condition)}
            hint={requiresConditionNote(condition) ? 'สภาพชำรุด/อุปกรณ์ขาดหาย ต้องกรอกรายละเอียดกำกับเสมอ' : undefined}
          >
            <Textarea
              rows={2}
              value={conditionNote}
              maxLength={1000}
              placeholder="อธิบายสภาพที่พบ เช่น จอร้าว ไม่มีสายชาร์จ"
              onChange={(event) => setConditionNote(event.target.value)}
            />
          </Field>
        </section>

        {/* ── ขั้น 3/3: รูปหลักฐาน 7 มุม ─────────────────────────── */}
        <section>
          <StepTitle step={3} label={`ถ่ายรูปหลักฐาน ${INTAKE_PHOTO_ANGLES.length} มุม`} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {INTAKE_PHOTO_ANGLES.map((angle) => {
              const path = groups.byAngle[angle]
              return (
                <label
                  key={angle}
                  className={cn(
                    'focus-ring flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed p-2 text-center transition-colors',
                    path === null
                      ? 'border-slate-200 hover:bg-slate-50'
                      : 'border-emerald-300 bg-emerald-50 text-emerald-800',
                  )}
                >
                  <span className="text-[11px] font-semibold">{INTAKE_PHOTO_ANGLE_LABELS[angle]}</span>
                  <span className="text-[10px] text-slate-500">
                    {uploading === angle ? 'กำลังอัปโหลด...' : path === null ? 'ยังไม่ถ่าย' : 'ถ่ายแล้ว'}
                  </span>
                  <input
                    type="file"
                    accept={INTAKE_PHOTO_ACCEPT}
                    capture="environment"
                    className="sr-only"
                    disabled={uploading !== null || submitting}
                    onChange={(event) => {
                      void addPhoto(angle, event.target.files)
                      event.target.value = ''
                    }}
                  />
                  {path !== null && (
                    <button
                      type="button"
                      className="focus-ring text-[10px] font-semibold text-red-600 underline"
                      onClick={(event) => {
                        event.preventDefault()
                        removePhoto(path)
                      }}
                    >
                      ลบรูป
                    </button>
                  )}
                </label>
              )
            })}
          </div>
          {photoWarning !== null && (
            <InlineAlert className="mt-3" tone="warning" title="รูปยังไม่ครบทุกมุม">
              {photoWarning}
            </InlineAlert>
          )}
        </section>
      </div>
    </Modal>
  )
}

function StepTitle({ step, label }: { step: number; label: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
        {step}
      </span>
      <span className="text-xs font-bold tracking-wider text-slate-500 uppercase">{label}</span>
    </div>
  )
}
