'use client'

import { StoredPhotoThumb } from '@/components/ui/stored-photo-thumb'
import { useId, useState } from 'react'
import { AssetSummaryHeader } from '@/components/warehouse/asset-summary-header'
import {
  Button,
  Field,
  FieldGroupBox,
  InlineAlert,
  Modal,
  ModalCancelButton,
  Textarea,
  fieldControlAria,
  useRevealFieldError,
  useRovingRadio,
  useToast,
} from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { apiPath } from '@/lib/api/contract'
import { callApi, jsonRequest, type ApiCallError } from '@/lib/api/types'
import { WarehouseError } from '@/lib/warehouse/errors'
import type { AssetCondition } from '@/lib/generated/prisma/enums'
import { compareAssetIdentity, IMEI_FORMAT_MESSAGE, IMEI_INPUT_MAX_LENGTH, parseImei } from '@/lib/warehouse/imei'
import {
  INTAKE_PHOTO_ANGLES,
  INTAKE_PHOTO_ANGLE_LABELS,
  IMEI_MISMATCH_FORM_WARNING,
  identityMismatchNoun,
  identityMismatchTitle,
  requiredIntakeIdentity,
  requiresConditionNote,
  type IntakePhotoAngle,
} from '@/lib/warehouse/intake'
import { collectIntakeFieldErrors, hasIntakeFieldErrors, type IntakeFieldErrors } from '@/lib/warehouse/intake-form'
import {
  flattenIntakePhotos,
  groupIntakePhotos,
  intakePhotoWarning,
  type IntakePhotoGroups,
} from '@/lib/warehouse/intake-photos'
import { ASSET_CONDITIONS } from '@/lib/warehouse/schemas'
import type { AssetDetailDto, AssetListItemDto } from '@/lib/warehouse/types'
import { createStagedUploadDiscarder } from '@/lib/uploads/client'
import { INTAKE_PHOTO_ACCEPT, WarehouseUploadError, uploadIntakePhoto } from '@/lib/warehouse/upload-client'
import { ASSET_CONDITION_LABEL } from '@/lib/warehouse/warehouse-ui'

const COLOR_CAPACITY_CHOICES = [
  { value: true, label: 'ตรง' },
  { value: false, label: 'ไม่ตรง' },
] as const

/**
 * Modal "รับเข้าคลัง" — 3 ขั้นตอนใน modal เดียว (`44` §8.2)
 *
 * 1. เทียบ IMEI/serial กับสัญญา — ตรง = เขียว, ไม่ตรง = **แดงแต่ไปต่อได้** (`IMEI_MISMATCH` เตือน ไม่ block)
 *    การยืนยันทับคำเตือนต้องกดยืนยันซ้ำอีกครั้ง (force proceed — ธุรการต้องตั้งใจ ไม่ใช่เผลอ)
 * 2. สภาพเครื่อง + รายละเอียด (บังคับเมื่อไม่ใช่ "ปกติ") — ตรวจด้วย `collectIntakeFieldErrors()` (ตัว assert ชุดเดียวกับ API)
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
  // id ผูก label ↔ ช่อง + aria-invalid/aria-describedby ผ่าน `<Field id>` (ตรวจซ้ำ staging SV5-R9-01)
  const fieldId = useId()
  const { showToast } = useToast()

  const [imeiActual, setImeiActual] = useState(asset.imeiActual ?? '')
  const [serialActual, setSerialActual] = useState(asset.serialActual ?? '')
  const [condition, setCondition] = useState<AssetCondition | null>(asset.condition)
  const [conditionNote, setConditionNote] = useState(asset.conditionNote ?? '')
  // มติ O77 — ตัวเลือกบังคับ ตรง/ไม่ตรง (แทนช่องติ๊กของ U166) · ไม่ตรง ⇒ ระบุสิ่งที่พบ
  const [colorCapacityMatched, setColorCapacityMatched] = useState<boolean | null>(asset.colorCapacityMatched)
  const [colorCapacityNote, setColorCapacityNote] = useState(asset.colorCapacityNote ?? '')
  const [photos, setPhotos] = useState<readonly string[]>([])
  // ทิ้งรูปค้างเฉพาะเมื่อรู้ผลการส่งแน่ชัด — ส่งแล้วไม่รู้ผล (หมดเวลา/502–504) server อาจผูกรูปไปแล้ว (mytester6 รีวิว)
  const [uploadDiscarder] = useState(() => createStagedUploadDiscarder())
  const [uploading, setUploading] = useState<IntakePhotoAngle | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<ApiCallError | null>(null)
  // ช่อง/กลุ่มบังคับที่ยังไม่ได้ตรวจ = ข้อผิดของช่อง (ใต้ช่อง + aria-invalid + โฟกัส) ไม่ใช่กล่องแจ้งเตือน
  // (ตรวจซ้ำ staging SV5-A11Y-A2-02 · SV5-B2-01 — สี/ความจุ · IMEI/Serial ที่ตรวจจริง)
  const [fieldErrors, setFieldErrors] = useState<IntakeFieldErrors>({})
  const { ref: formRef, reveal } = useRevealFieldError()
  /** ยืนยันทับคำเตือน IMEI ไม่ตรงแล้วหรือยัง (force proceed — `44` §8.2) */
  const [forceProceed, setForceProceed] = useState(false)

  const groups: IntakePhotoGroups = groupIntakePhotos(photos)
  const photoWarning = intakePhotoWarning(groups.filledAngles)

  /** ตัดช่องว่าง/ขีด/จุด แล้วต้องเหลือ 15 หลักพอดี (มติ PO U24) — ตัวเดียวกับ schema ฝั่ง API */
  const imeiNormalized = parseImei(imeiActual)
  const imeiForCompare = imeiActual.trim() === '' ? null : (imeiNormalized ?? imeiActual.trim())
  const comparison = compareAssetIdentity(
    { imeiContract: asset.imeiContract, serialContract: asset.serialContract },
    {
      imeiActual: imeiForCompare,
      serialActual: serialActual.trim() === '' ? null : serialActual.trim(),
    },
  )
  /** รูปแบบผิด (ไม่ครบ/เกิน 15 หลัก หรือมีอักขระอื่น) = พิมพ์ผิด (schema ปฏิเสธ) ไม่ใช่ "ไม่ตรงสัญญา" */
  const imeiFormatInvalid = imeiActual.trim() !== '' && imeiNormalized === null
  const imeiError = imeiFormatInvalid ? IMEI_FORMAT_MESSAGE : null
  /** ข้อผิดใต้ช่อง IMEI — รูปแบบผิด (คำนวณสด) ก่อน แล้วจึง "ยังไม่ได้กรอก" จากการกดยืนยัน */
  const imeiFieldError = imeiError ?? fieldErrors.imei ?? null
  const imeiTouched = imeiActual.trim() !== '' || serialActual.trim() !== ''
  // รูปแบบผิดแสดงแค่ข้อความรูปแบบ — ไม่ขึ้นคำเตือน "ไม่ตรงสัญญา" ซ้อน (UAT BUG-083)
  const mismatch = imeiTouched && !imeiFormatInvalid && !comparison.matched
  /** เครื่องมีแต่ Serial = เรียก "Serial" ไม่ใช่ "IMEI" (S7-AG1-05) */
  const mismatchNoun = identityMismatchNoun(comparison)
  /** ช่องที่ต้องกรอกค่าที่ตรวจจริง (UAT BUG-074) — ตัวเดียวกับที่ API บังคับ */
  const requiredIdentity = requiredIntakeIdentity({
    imeiContract: asset.imeiContract,
    serialContract: asset.serialContract,
  })
  const showSerialInput = asset.serialContract !== null || asset.imeiContract === null

  /**
   * พิมพ์ช่องไหน ล้างข้อผิดของช่องนั้น · สัญญาไม่มีทั้ง IMEI และ Serial (กรอกช่องใดก็ได้) ⇒ ล้างทั้งคู่
   * (รีวิว SV5-B2-01 — เคสบังคับ IMEI พิมพ์ Serial แล้วข้อผิด IMEI ต้องไม่หาย)
   */
  function clearIdentityError(field: 'imei' | 'serial'): void {
    setFieldErrors((current) =>
      requiredIdentity === 'either' ? { ...current, imei: undefined, serial: undefined } : { ...current, [field]: undefined },
    )
  }

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
    // รูปที่ถ่ายในรอบนี้แล้วลบทิ้ง ⇒ ลบออกจาก Storage ด้วย (ยังไม่ผูก record — mytester6 T-019)
    uploadDiscarder.discard([path])
  }

  // กลุ่ม radio ใช้คีย์บอร์ดแบบ roving tabindex + ลูกศร (รีวิวรอบ 2 SV5-A11Y-A2-03)
  const colorCapacityRadio = useRovingRadio({
    options: COLOR_CAPACITY_CHOICES.map((choice) => choice.value),
    value: colorCapacityMatched,
    onSelect: (value) => {
      setColorCapacityMatched(value)
      setFieldErrors((current) => ({ ...current, colorCapacity: undefined, colorCapacityNote: undefined }))
    },
  })
  const conditionRadio = useRovingRadio({
    options: ASSET_CONDITIONS,
    value: condition,
    onSelect: (value) => {
      setCondition(value)
      // เปลี่ยนสภาพแล้วข้อผิดของสภาพเดิม (ยังไม่เลือก/ต้องระบุรายละเอียด) ไม่ค้าง (รีวิว SV5-A11Y-A2-02)
      setFieldErrors((current) => ({ ...current, condition: undefined, conditionNote: undefined }))
    },
  })

  async function submit(): Promise<void> {
    setError(null)
    // ตรวจทุกช่องบังคับในรอบเดียว ⇒ ข้อผิดขึ้นใต้ช่อง/กลุ่มของมันพร้อมกัน แล้วโฟกัสช่องแรกที่ผิดตามลำดับบนจอ
    // (useRevealFieldError) — ไม่ใช้กล่องแจ้งเตือนบนสุดที่เลื่อนพ้นจอ (ตรวจซ้ำ staging SV5-B2-01)
    let next: IntakeFieldErrors
    try {
      next = collectIntakeFieldErrors({
        contract: { imeiContract: asset.imeiContract, serialContract: asset.serialContract },
        imeiActual,
        serialActual,
        colorCapacityMatched,
        colorCapacityNote,
        condition,
        conditionNote,
      })
    } catch (assertError) {
      if (!(assertError instanceof WarehouseError)) throw assertError
      setFieldErrors({})
      setError({ code: assertError.code, title: assertError.title, message: assertError.userMessage })
      return
    }
    setFieldErrors(next)
    if (hasIntakeFieldErrors(next)) {
      reveal()
      return
    }

    // ไม่ตรงกับสัญญา = เตือนก่อน 1 ครั้ง แล้วจึงยอมให้ยืนยันทับ (`44` §8.2 force proceed)
    if (mismatch && !forceProceed) {
      setForceProceed(true)
      return
    }

    setSubmitting(true)
    uploadDiscarder.beginSubmit()
    let submitError: ApiCallError | undefined = { title: '', message: '', outcomeUnknown: true }
    try {
      const response = await callApi<AssetDetailDto>(
        apiPath('asset.intake', { id: asset.id }),
        jsonRequest('POST', {
          imeiActual: imeiNormalized,
          serialActual: serialActual.trim() === '' ? null : serialActual.trim(),
          condition,
          conditionNote: conditionNote.trim() === '' ? null : conditionNote.trim(),
          colorCapacityMatched,
          colorCapacityNote: colorCapacityMatched ? null : colorCapacityNote.trim(),
          photos,
        }),
      )
      submitError = response.error
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
      uploadDiscarder.endSubmit(submitError)
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      // "ทิ้งข้อมูล" ⇒ รูปที่ถ่ายในรอบนี้ยังไม่ผูก record ⇒ ลบออกจาก Storage ไม่ให้ค้าง (mytester6 T-019)
      // · เคยส่งแล้วไม่รู้ผล ⇒ ไม่ทิ้ง (รีวิว mytester6)
      onDiscard={() => void uploadDiscarder.discard(photos)}
      size="lg"
      title={isRetry ? 'รับเครื่องเข้าคลังอีกครั้ง' : 'รับเครื่องเข้าคลัง'}
      description="ตรวจ IMEI → บันทึกสภาพ → ถ่ายรูปหลักฐาน 7 มุม"
      footer={
        <>
          <ModalCancelButton onClose={onClose} disabled={submitting}>
            ยกเลิก
          </ModalCancelButton>
          <Button
            variant={mismatch && forceProceed ? 'danger' : 'primary'}
            loading={submitting}
            disabled={submitting || uploading !== null}
            onClick={() => void submit()}
          >
            {mismatch && forceProceed ? `ยืนยันรับทั้งที่ ${mismatchNoun} ไม่ตรง` : 'ยืนยันรับเข้าคลัง'}
          </Button>
        </>
      }
    >
      <div ref={formRef} className="space-y-5">
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
              id={`${fieldId}-imei`}
              label="IMEI ที่ตรวจจริงบนเครื่อง"
              required={requiredIdentity === 'imei'}
              error={imeiFieldError}
            >
              <input
                id={`${fieldId}-imei`}
                {...fieldControlAria(`${fieldId}-imei`, { error: imeiFieldError, required: requiredIdentity === 'imei' })}
                type="text"
                inputMode="numeric"
                maxLength={IMEI_INPUT_MAX_LENGTH}
                value={imeiActual}
                placeholder="พิมพ์หรือสแกน IMEI"
                onChange={(event) => {
                  setImeiActual(event.target.value)
                  setForceProceed(false)
                  clearIdentityError('imei')
                }}
                className={cn(
                  'focus-ring w-full rounded-lg border px-3 py-2 font-mono text-sm',
                  imeiFieldError !== null || mismatch
                    ? 'border-red-400 bg-red-50 text-red-700'
                    : comparison.matched
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                      : 'border-slate-300 bg-white',
                )}
              />
            </Field>

            {showSerialInput && (
              <>
                <Field label="Serial ในสัญญา">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700">
                    {asset.serialContract ?? '—'}
                  </div>
                </Field>
                <Field
                  id={`${fieldId}-serial`}
                  label="Serial ที่ตรวจจริงบนเครื่อง"
                  required={requiredIdentity === 'serial'}
                  error={fieldErrors.serial}
                >
                  <input
                    id={`${fieldId}-serial`}
                    {...fieldControlAria(`${fieldId}-serial`, { error: fieldErrors.serial, required: requiredIdentity === 'serial' })}
                    type="text"
                    maxLength={100}
                    value={serialActual}
                    onChange={(event) => {
                      setSerialActual(event.target.value)
                      setForceProceed(false)
                      clearIdentityError('serial')
                    }}
                    className={cn(
                      'focus-ring w-full rounded-lg border px-3 py-2 font-mono text-sm',
                      fieldErrors.serial !== undefined || mismatch ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-300 bg-white',
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
            <InlineAlert className="mt-3" tone="error" title={identityMismatchTitle(comparison)}>
              {IMEI_MISMATCH_FORM_WARNING.message}
              {forceProceed && (
                <div className="mt-1 font-semibold">
                  กด “ยืนยันรับทั้งที่ {mismatchNoun} ไม่ตรง” อีกครั้งเพื่อรับเข้าคลัง — ระบบจะบันทึกค่าที่ตรวจจริงไว้
                </div>
              )}
            </InlineAlert>
          )}

          {/* มติ PO U166 → O77 — เทียบสี/ความจุของเครื่องจริงกับค่าตามสัญญา: ตัวเลือกบังคับ ตรง/ไม่ตรง */}
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            {/* กลุ่ม radio ใน Field group ⇒ ชื่อกลุ่ม + ข้อผิด "ยังไม่ได้ตรวจสี/ความจุ" ผูกกับกล่อง + โฟกัสตัวเลือกที่รับ Tab (SV5-B2-01) */}
            <Field
              id={`${fieldId}-color-capacity`}
              group
              label="สี/ความจุตรงกับสัญญา"
              labelClassName="mb-0 text-sm font-semibold text-slate-800"
              required
              error={fieldErrors.colorCapacity}
            >
              <div className="mt-0.5 text-xs text-slate-500">
                ตามสัญญา: ความจุ {asset.deviceCapacity ?? '—'} · สี {asset.deviceColor ?? '—'}
              </div>
              <FieldGroupBox role="radiogroup" aria-required className="mt-2 grid grid-cols-2 gap-2">
                {COLOR_CAPACITY_CHOICES.map((choice, index) => (
                  <button
                    key={choice.label}
                    type="button"
                    {...colorCapacityRadio.radioProps(choice.value, index)}
                    className={cn(
                      'focus-ring rounded-xl border-2 py-2 text-xs font-bold transition-colors',
                      colorCapacityMatched === choice.value
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300',
                    )}
                  >
                    {choice.label}
                  </button>
                ))}
              </FieldGroupBox>
            </Field>
            {colorCapacityMatched === false && (
              <Field id={`${fieldId}-color-capacity-note`} className="mt-2" label="สิ่งที่พบ" required error={fieldErrors.colorCapacityNote} hint="ระบุสี/ความจุของเครื่องที่รับจริง">
                <Textarea
                  id={`${fieldId}-color-capacity-note`}
                  rows={2}
                  value={colorCapacityNote}
                  maxLength={500}
                  placeholder="เช่น สีขาว ความจุ 64GB"
                  onChange={(event) => {
                    setColorCapacityNote(event.target.value)
                    setFieldErrors((current) => ({ ...current, colorCapacityNote: undefined }))
                  }}
                />
              </Field>
            )}
          </div>
        </section>

        {/* ── ขั้น 2/3: บันทึกสภาพ ───────────────────────────────── */}
        <section>
          <StepTitle step={2} label="บันทึกสภาพเครื่อง" />
          {/* กลุ่ม radio ใน Field group ⇒ ชื่อกลุ่ม + ข้อผิด "ยังไม่เลือกสภาพ" ผูกกับกล่อง (SV5-A11Y-A2-03 · รีวิวรอบ 2) */}
          <Field id={`${fieldId}-condition`} group label="สภาพเครื่อง" labelClassName="sr-only" required error={fieldErrors.condition}>
            <FieldGroupBox role="radiogroup" aria-required className="grid grid-cols-3 gap-2">
              {ASSET_CONDITIONS.map((value, index) => (
                <button
                  key={value}
                  type="button"
                  {...conditionRadio.radioProps(value, index)}
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
            </FieldGroupBox>
          </Field>
          <Field
            id={`${fieldId}-condition-note`}
            className="mt-3"
            label="รายละเอียดสภาพเครื่อง"
            required={requiresConditionNote(condition)}
            error={fieldErrors.conditionNote}
            hint={requiresConditionNote(condition) ? 'สภาพชำรุด/อุปกรณ์ขาดหาย ต้องกรอกรายละเอียดกำกับเสมอ' : undefined}
          >
            <Textarea
              id={`${fieldId}-condition-note`}
              rows={2}
              value={conditionNote}
              maxLength={1000}
              placeholder="อธิบายสภาพที่พบ เช่น จอร้าว ไม่มีสายชาร์จ"
              onChange={(event) => {
                setConditionNote(event.target.value)
                setFieldErrors((current) => ({ ...current, conditionNote: undefined }))
              }}
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
                  {/* staging E-041 — ภาพย่อให้ตรวจว่าถ่ายถูกมุมก่อนยืนยัน */}
                  {path !== null && <StoredPhotoThumb path={path} alt={INTAKE_PHOTO_ANGLE_LABELS[angle]} />}
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
