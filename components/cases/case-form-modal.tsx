'use client'

import { useEffect, useState } from 'react'
import { AddressFields } from '@/components/address/address-fields'
import { CaseAttachmentsFields, type StagedFile } from '@/components/cases/case-attachments-fields'
import { CaseContactsFields, normalizePhoneEvent } from '@/components/cases/case-contacts-fields'
import { DeviceAttributeSelect } from '@/components/cases/device-attribute-select'
import { DeviceModelPicker } from '@/components/cases/device-model-picker'
import { useDeviceAttributeOptions } from '@/components/cases/use-device-attribute-options'
import { TeamSuggestionPanel } from '@/components/cases/team-suggestion-panel'
import { Button, ConfirmModal, Field, InlineAlert, Input, Modal, Select, Textarea, useToast } from '@/components/ui'
import { callApi, jsonRequest, type ApiCallError } from '@/lib/api/types'
import { apiPath } from '@/lib/api/contract'
import {
  assertIdentityFormats,
  CASE_REQUIRED_ADDRESS_FIELDS,
  DEBTOR_NATIONALITIES,
  DEBTOR_NATIONALITY_LABEL,
  digitsOnly,
  toAsciiDigits,
  PHONE_INPUT_MAX_LENGTH,
  phoneInputError,
  DOCUMENT_SLOT_LABEL,
  isCaseDocumentDeletable,
  imeiBlurError,
  type DebtorNationalityCode,
} from '@/lib/cases/case'
import {
  buildCasePayload,
  caseFormFromDetail,
  contactsPayload,
  identityFieldOf,
  mapCaseErrorField,
  readDuplicateCase,
  zodFieldErrors,
  type CaseFormState,
} from '@/lib/cases/case-form'
import { CaseError } from '@/lib/cases/errors'
import { caseCreateSchema, caseUpdateSchema } from '@/lib/cases/schemas'
import { ASSET_TYPE_LABEL, caseReviewNoteNotice } from '@/lib/cases/status-display'
import type { CaseDetailDto, CaseDocumentDto, CaseTeamOptionDto, CaseTeamOptionsDto } from '@/lib/cases/types'
import { uploadCaseFile } from '@/lib/cases/upload-client'
import { parseBahtInput } from '@/lib/format/money'
import {
  assetIdentifierWarning,
  IMEI_MULTIPLE_INPUT_MESSAGE,
  imeiPickerCandidates,
  multipleImeiInputCandidates,
} from '@/lib/warehouse/imei'

/** ความยาวช่องเบอร์โทรขณะกรอก — ยาวกว่า 10 หลักเพื่อให้วางเบอร์ที่มีขีด/ช่องว่างได้ไม่ถูกตัดกลางเลข */

/**
 * ฟอร์มรับเคสแบบกรอกมือ + แก้ไขเคส (`38` §7.3 · §8 `create_case_manual`/`edit_case`)
 * โครงหน้า/ลำดับ section ตาม mockup `38-case-submission-mockup.html` (`renderCreateCaseModal`)
 *
 * ลำดับ section ตาม §7.3: ข้อมูลสัญญา → ข้อมูลลูกหนี้ → ที่อยู่ 3 ชุด → ผู้ติดต่ออื่น →
 * ข้อมูลทรัพย์ → เอกสารแนบ → รูปสินค้า → **ทีมที่เสนอ (ท้ายสุด)**
 *
 * กติกาที่บังคับในฟอร์มนี้
 * - validate ด้วย **Zod ชุดเดียวกับ backend** (`caseCreateSchema`/`caseUpdateSchema`) ห้าม validate ซ้ำเอง
 * - ช่องเลขบัตร/เบอร์โทรกรอง non-digit ทิ้งตั้งแต่ตอนพิมพ์ (`38` §7.3) + ตรวจซ้ำด้วย `assertIdentityFormats()`
 *   ผ่าน `CaseError` ตัวเดียวกับ API (ข้อความเดียวกันทั้งสองฝั่ง)
 * - ช่องเงินกรอกเป็น **บาท** แล้วแปลงเป็น **สตางค์** ด้วย `parseBahtInput()` ก่อนส่ง (Rule 01)
 * - `case_ref` ซ้ำ = hard block พร้อมข้อมูลเคสเดิม (`38` §7.3/§11) — ไม่ใช่ warning
 * - ไฟล์แนบถูก **อัปโหลดหลังบันทึกเคสสำเร็จ** (เคสใหม่ยังไม่มี `case_id` ให้ผูกไฟล์) — เคสถูกบันทึกแล้ว
 *   แม้ไฟล์บางไฟล์อัปโหลดไม่ผ่าน จึงรายงานเป็น warning ไม่ใช่ล้มทั้งการบันทึก
 * - กล่องทีมที่เสนอบนฟอร์มเป็น **ข้อมูลประกอบ** — การยืนยัน/เปลี่ยนทีมจริงเกิดตอน `accept`
 *   ผ่าน Review Modal เท่านั้น (`38` §7.5 "ปุ่มเปลี่ยนทีม active เฉพาะตอน pending_review")
 */

const NATIONALITY_HINT = 'สัญชาติกำหนดว่าใช้เลขบัตรประชาชน (ไทย) หรือเลข Passport/เอกสารอื่น'

export interface CaseFormModalProps {
  open: boolean
  /** null = สร้างเคสใหม่ · มีค่า = แก้ไขเคสเดิม (`38` §8 `edit_case`) */
  editing: CaseDetailDto | null
  companies: ReadonlyArray<{ id: string; name: string }>
  onClose: () => void
  onSaved: (saved: CaseDetailDto) => void
  /** เปิดดูเคสที่ใช้เลขที่สัญญาซ้ำ (ลิงก์ตาม `38` §7.3) */
  onOpenExistingCase?: (info: { id: string; caseRef: string }) => void
  /** เอกสารของเคสเปลี่ยนโดยไม่ได้กดบันทึก (เช่น ลบไฟล์) — ให้หน้ารายการรีเฟรชจำนวนเอกสาร */
  onDocumentsChanged?: () => void
}

export function CaseFormModal({
  open,
  editing,
  companies,
  onClose,
  onSaved,
  onOpenExistingCase,
  onDocumentsChanged,
}: CaseFormModalProps) {
  const { showToast } = useToast()
  const [form, setForm] = useState<CaseFormState>(() => caseFormFromDetail(editing))
  /** id ของเคสที่ฟอร์มกำลังถืออยู่ — ใช้ตรวจว่าต้อง reset ค่าเมื่อ modal เปลี่ยนเป้าหมาย */
  const [loadedId, setLoadedId] = useState<string | null>(editing?.id ?? null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<ApiCallError | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [staged, setStaged] = useState<StagedFile[]>([])
  const [teamOptions, setTeamOptions] = useState<readonly CaseTeamOptionDto[]>([])
  /** ไฟล์ที่อัปโหลดแล้ว — อัปเดตทันทีหลังลบ (มติ PO 04/10/2569 v3.4) โดยไม่ต้องปิดฟอร์ม */
  const [documents, setDocuments] = useState<readonly CaseDocumentDto[]>(editing?.documents ?? [])
  const [deleteTarget, setDeleteTarget] = useState<CaseDocumentDto | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleting, setDeleting] = useState(false)
  /** `updatedAt` ของเคสที่ฟอร์มนี้แก้อยู่ — ส่งไปตรวจว่าไม่มีใครบันทึกทับระหว่างนี้ (preship R3-003) */
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string | null>(editing?.updatedAt ?? null)
  /** staging E-027 — เลขที่สัญญาซ้ำที่ตรวจพบระหว่างกรอก (ก่อนกดบันทึก) */
  const [refDuplicate, setRefDuplicate] = useState<{ id: string; caseRef: string; trackingRound: number } | null>(null)

  async function checkRefDuplicate(): Promise<void> {
    const caseRef = form.caseRef.trim()
    if (caseRef === '' || form.financeCompanyId === '') {
      setRefDuplicate(null)
      return
    }
    const result = await callApi<{ duplicate: { id: string; caseRef: string; trackingRound: number } | null }>(
      apiPath('case.refCheck', undefined, {
        companyId: form.financeCompanyId,
        caseRef,
        ...(editing === null ? {} : { excludeCaseId: editing.id }),
      }),
    )
    setRefDuplicate(result.data?.duplicate ?? null)
  }

  /** staging E-027 — ตรวจรูปแบบ IMEI ตอนออกจากช่อง (กติกาเดียวกับตอนบันทึก) */
  function checkImeiOnBlur(): void {
    const message = imeiBlurError(form.assetImeiSerial)
    setFieldErrors((current) => {
      const { assetImeiSerial: _ignored, ...rest } = current
      return message === null ? rest : { ...rest, assetImeiSerial: message }
    })
  }

  // เปลี่ยนเป้าหมายของ modal (สร้าง ↔ แก้ไขเคสอื่น) = โหลดค่าเริ่มต้นใหม่ระหว่าง render
  // (ไม่ใช้ `useEffect` — กฎ `react-hooks/set-state-in-effect` ใน REUSE_INDEX)
  const targetId = editing?.id ?? null
  if (targetId !== loadedId) {
    setLoadedId(targetId)
    setBaseUpdatedAt(editing?.updatedAt ?? null)
    setDocuments(editing?.documents ?? [])
    setForm(caseFormFromDetail(editing))
    setFieldErrors({})
    setFormError(null)
  }

  const isEdit = editing !== null
  // เหตุผลที่ผู้ตรวจขอข้อมูลเพิ่ม — ธุรการต้องเห็นตอนเปิดแก้ (staging E-003)
  const reviewNotice = editing === null ? null : caseReviewNoteNotice(editing.status, editing.reviewNote)
  const identityKind = identityFieldOf(form.debtorNationality)
  const duplicate = readDuplicateCase(formError)

  // ตัวเลือกทีม + ค่าใช้จ่ายของแต่ละทีม (`38` §7.4) — โหลดครั้งเดียวตอนเปิดฟอร์ม
  // การจับคู่จังหวัดทำฝั่ง client ด้วย pure ตัวเดียวกับ API จึงอัปเดตทันทีที่เปลี่ยนจังหวัด
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      const response = await callApi<CaseTeamOptionsDto>(apiPath('case.teamOptions'))
      if (cancelled) return
      setTeamOptions(response.data?.teams ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  // มติ PO U166 — ตัวเลือกความจุ/สี (ผู้ดูแลแก้ได้ในหน้า Model Phone)
  const attributeOptions = useDeviceAttributeOptions(open)

  function patch(next: Partial<CaseFormState>): void {
    setForm((current) => ({ ...current, ...next }))
  }

  async function submit(): Promise<void> {
    setFormError(null)

    const debt = parseBahtInput(form.outstandingDebtBaht)
    if (Number.isNaN(debt)) {
      setFieldErrors({ outstandingDebtSatang: 'มูลหนี้คงเหลือต้องเป็นตัวเลข (บาท)' })
      return
    }

    const payload = {
      ...buildCasePayload(form, isEdit ? 'edit' : 'create'),
      ...(isEdit && baseUpdatedAt !== null ? { expectedUpdatedAt: baseUpdatedAt } : {}),
    }
    const schema = isEdit ? caseUpdateSchema : caseCreateSchema
    const parsed = schema.safeParse(payload)
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error))
      return
    }

    // รูปแบบเลขบัตร/เบอร์โทร — ใช้ตัวตรวจ pure ตัวเดียวกับ API (`38` §12)
    try {
      assertIdentityFormats({
        nationality: form.debtorNationality === '' ? null : form.debtorNationality,
        nationalId: form.debtorNationalId,
        phoneMobile: form.debtorPhoneMobile,
        phoneWork: form.debtorPhoneWork,
        contactPhones: contactsPayload(form.contacts).map((contact) => contact.contactPhone),
      })
    } catch (error) {
      if (!(error instanceof CaseError)) throw error
      const field = typeof error.context?.field === 'string' ? error.context.field : '_'
      setFieldErrors({ [mapCaseErrorField(field)]: error.userMessage })
      return
    }

    setFieldErrors({})
    setSubmitting(true)
    try {
      const result = isEdit
        ? await callApi<CaseDetailDto>(
            apiPath('case.update', { id: editing.id }),
            jsonRequest('PATCH', parsed.data),
          )
        : await callApi<CaseDetailDto>(apiPath('case.create'), jsonRequest('POST', parsed.data))

      if (result.error !== undefined || result.data === undefined) {
        const failure = result.error ?? { title: 'บันทึกไม่สำเร็จ', message: 'กรุณาลองใหม่' }
        setFormError(failure)
        setFieldErrors(result.error?.fields ?? {})
        // ข้อความในฟอร์มอยู่บนสุด — ผู้ใช้ที่เลื่อนลงล่างไม่เห็น ⇒ แจ้ง toast ด้วยเสมอ (preship R4-004)
        showToast({ tone: 'error', title: failure.title, description: failure.message })
        return
      }

      const saved = await uploadStagedFiles(result.data)

      showToast({
        tone: 'success',
        title: isEdit ? 'บันทึกการแก้ไขเคสแล้ว' : 'สร้างเคสร่างแล้ว',
        description: `${saved.caseRef} · ${saved.financeCompanyName}`,
      })
      // มติ PO U129 — IMEI ชนเครื่องที่ยังไม่ส่งมอบ: บันทึกได้ แต่เตือนให้ตรวจสอบกับคลังก่อนปิดงาน
      if (saved.activeAssetImeiWarning !== null) {
        showToast({ tone: 'warning', title: 'IMEI ซ้ำกับเครื่องที่ยังไม่ส่งมอบ', description: saved.activeAssetImeiWarning })
      }
      setStaged([])
      onSaved(saved)
    } finally {
      setSubmitting(false)
    }
  }

  /**
   * ลบเอกสารที่แนบผิด (ก่อนส่งตรวจ — มติ PO 04/10/2569 v3.4) — server soft-delete + audit · ไฟล์ใน Storage ยังอยู่
   * ลบไฟล์ของโหมดเดิมหมดแล้ว ตัวเลือกโหมดเอกสารสลับได้ทันที (คำนวณจาก `documents` ล่าสุด)
   */
  async function confirmDeleteDocument(): Promise<void> {
    if (editing === null || deleteTarget === null) return
    setDeleting(true)
    try {
      const response = await callApi<CaseDetailDto>(
        apiPath('case.deleteDocument', { id: editing.id, documentId: deleteTarget.id }),
        jsonRequest('DELETE', { reason: deleteReason }),
      )
      if (response.error !== undefined || response.data === undefined) {
        showToast({
          tone: 'error',
          title: response.error?.title ?? 'ลบเอกสารไม่สำเร็จ',
          description: response.error?.message ?? 'กรุณาลองใหม่',
        })
        return
      }
      setDocuments(response.data.documents)
      setBaseUpdatedAt(response.data.updatedAt)
      showToast({ tone: 'success', title: 'ลบเอกสารแล้ว', description: deleteTarget.originalName })
      setDeleteTarget(null)
      onDocumentsChanged?.()
    } finally {
      setDeleting(false)
    }
  }

  /**
   * อัปโหลดไฟล์ที่ค้างอยู่บนฟอร์มหลังเคสถูกบันทึกแล้ว — ไฟล์ที่ล้มเหลวรายงานเป็น toast เตือน
   * (เคสถูกบันทึกไปแล้ว การล้มของไฟล์ต้องไม่ทำให้ข้อมูลเคสหาย) · คืน detail ล่าสุดที่ API ส่งกลับมา
   */
  async function uploadStagedFiles(saved: CaseDetailDto): Promise<CaseDetailDto> {
    if (staged.length === 0) return saved

    let latest = saved
    const failed: string[] = []
    for (const item of staged) {
      try {
        const payload = await uploadCaseFile(saved.id, item.slot, item.file)
        const response = await callApi<CaseDetailDto>(
          apiPath('case.uploadDocument', { id: saved.id }),
          jsonRequest('POST', payload),
        )
        if (response.error !== undefined || response.data === undefined) {
          failed.push(`${item.file.name} (${response.error?.message ?? 'บันทึกไฟล์ไม่สำเร็จ'})`)
          continue
        }
        latest = response.data
      } catch (error) {
        failed.push(`${item.file.name} (${error instanceof Error ? error.message : 'อัปโหลดไม่สำเร็จ'})`)
      }
    }

    if (failed.length > 0) {
      showToast({
        tone: 'warning',
        title: `อัปโหลดไฟล์ไม่สำเร็จ ${failed.length} ไฟล์`,
        description: `${failed.join(' · ')} — เปิดเคสแล้วแนบใหม่ได้`,
      })
    }
    return latest
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? `แก้ไขเคส ${editing.caseRef}` : 'รับเคส (กรอกมือ)'}
      description={
        isEdit
          ? 'แก้ไขได้เฉพาะสถานะ ร่าง / รอพิจารณา / ขอข้อมูลเพิ่ม — ทุกครั้งที่บันทึกจะถูกเก็บไว้ในประวัติการแก้ไข'
          : 'บันทึกเป็นเคสร่างก่อน แล้วค่อยแนบเอกสาร/ส่งตรวจสอบ — ข้อมูลไม่ครบก็บันทึกร่างได้'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            ยกเลิก
          </Button>
          <Button onClick={() => void submit()} loading={submitting}>
            {isEdit ? 'บันทึกการแก้ไข' : 'บันทึกเคสร่าง'}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {formError !== null && (
          <InlineAlert tone="error" title={formError.title}>
            <p>{formError.message}</p>
            {duplicate !== null && (
              <p className="mt-2">
                เคสเดิม: <span className="font-mono font-bold">{duplicate.caseRef}</span> (รอบที่{' '}
                {duplicate.trackingRound})
                {onOpenExistingCase !== undefined && (
                  <button
                    type="button"
                    className="focus-ring ml-2 rounded font-semibold text-red-700 underline"
                    onClick={() => onOpenExistingCase({ id: duplicate.id, caseRef: duplicate.caseRef })}
                  >
                    เปิดเคสเดิม
                  </button>
                )}
              </p>
            )}
          </InlineAlert>
        )}

        {reviewNotice !== null && (
          <InlineAlert tone={reviewNotice.tone} title={reviewNotice.title}>
            <p className="whitespace-pre-line">{reviewNotice.message}</p>
          </InlineAlert>
        )}

        {!isEdit && (
          <InlineAlert tone="warning" title="เลขที่สัญญาห้ามซ้ำ">
            ระบบตรวจซ้ำอัตโนมัติภายในบริษัทไฟแนนซ์เดียวกัน — เลขที่ซ้ำจะบันทึกไม่ได้
          </InlineAlert>
        )}

        <section>
          <h3 className="mb-3 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">ข้อมูลสัญญา</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              id="case-company"
              label="บริษัทไฟแนนซ์"
              required
              error={fieldErrors.financeCompanyId}
            >
              <Select
                id="case-company"
                value={form.financeCompanyId}
                invalid={fieldErrors.financeCompanyId !== undefined}
                onChange={(event) => patch({ financeCompanyId: event.target.value })}
              >
                <option value="">— เลือกบริษัทไฟแนนซ์ —</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              id="case-ref"
              label="เลขที่สัญญา (case_ref)"
              required
              error={fieldErrors.caseRef}
              hint="เก็บค่าดิบตามที่ไฟแนนซ์ส่งมา — ระบบ normalize ให้เองสำหรับเทียบซ้ำ"
            >
              <Input
                id="case-ref"
                className="font-mono"
                value={form.caseRef}
                placeholder="เช่น SF-2026-00999"
                invalid={fieldErrors.caseRef !== undefined}
                onChange={(event) => {
                  patch({ caseRef: event.target.value })
                  setRefDuplicate(null)
                }}
                onBlur={() => void checkRefDuplicate()}
              />
              {refDuplicate !== null && (
                <p className="mt-1 text-[11px] font-semibold text-red-600">
                  เลขที่สัญญานี้มีอยู่แล้ว: <span className="font-mono">{refDuplicate.caseRef}</span> (รอบที่{' '}
                  {refDuplicate.trackingRound}) — บันทึกซ้ำไม่ได้
                  {onOpenExistingCase !== undefined && (
                    <button
                      type="button"
                      className="focus-ring ml-2 rounded underline"
                      onClick={() => onOpenExistingCase({ id: refDuplicate.id, caseRef: refDuplicate.caseRef })}
                    >
                      เปิดเคสเดิม
                    </button>
                  )}
                </p>
              )}
            </Field>
          </div>
        </section>

        <section>
          <h3 className="mb-3 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">ข้อมูลลูกหนี้</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="debtor-name" label="ชื่อ-นามสกุล" required error={fieldErrors.debtorName}>
              <Input
                id="debtor-name"
                value={form.debtorName}
                invalid={fieldErrors.debtorName !== undefined}
                onChange={(event) => patch({ debtorName: event.target.value })}
              />
            </Field>
            <Field
              id="debtor-nationality"
              label="สัญชาติ"
              required
              hint={NATIONALITY_HINT}
              error={fieldErrors.debtorNationality}
            >
              <Select
                id="debtor-nationality"
                value={form.debtorNationality}
                invalid={fieldErrors.debtorNationality !== undefined}
                onChange={(event) => patch({ debtorNationality: event.target.value as DebtorNationalityCode | '' })}
              >
                <option value="">— เลือกสัญชาติ —</option>
                {DEBTOR_NATIONALITIES.map((code) => (
                  <option key={code} value={code}>
                    {DEBTOR_NATIONALITY_LABEL[code]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {form.debtorNationality === 'OTHER' && (
            <div className="mt-4">
              <Field id="debtor-nationality-other" label="ระบุสัญชาติ" required error={fieldErrors.debtorNationalityOther}>
                <Input
                  id="debtor-nationality-other"
                  value={form.debtorNationalityOther}
                  placeholder="เช่น เวียดนาม, จีน"
                  invalid={fieldErrors.debtorNationalityOther !== undefined}
                  onChange={(event) => patch({ debtorNationalityOther: event.target.value })}
                />
              </Field>
            </div>
          )}

          <div className="mt-4">
            {identityKind === 'national_id' ? (
              <Field
                id="debtor-national-id"
                label="เลขบัตรประชาชน"
                required
                hint="13 หลัก ตัวเลขล้วน — ระบบตัดตัวอักษรออกให้อัตโนมัติ"
                error={fieldErrors.debtorNationalId}
              >
                <Input
                  id="debtor-national-id"
                  className="font-mono"
                  value={form.debtorNationalId}
                  inputMode="numeric"
                  maxLength={13}
                  placeholder="13 หลัก"
                  invalid={fieldErrors.debtorNationalId !== undefined}
                  onChange={(event) => patch({ debtorNationalId: digitsOnly(toAsciiDigits(event.target.value)).slice(0, 13) })}
                />
              </Field>
            ) : (
              <Field
                id="debtor-passport"
                label="เลข Passport / เอกสารอื่น (ใบอนุญาตทำงาน ฯลฯ)"
                required
                hint="ไม่จำกัดรูปแบบ/จำนวนหลัก เพราะเอกสารแต่ละประเทศต่างกัน"
                error={fieldErrors.debtorPassportNo}
              >
                <Input
                  id="debtor-passport"
                  className="font-mono"
                  value={form.debtorPassportNo}
                  placeholder="กรอกตามเอกสารจริง"
                  invalid={fieldErrors.debtorPassportNo !== undefined}
                  onChange={(event) => patch({ debtorPassportNo: event.target.value })}
                />
              </Field>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="debtor-mobile" label="เบอร์โทรมือถือ" required error={fieldErrors.debtorPhoneMobile ?? phoneInputError(form.debtorPhoneMobile) ?? undefined}>
              <Input
                id="debtor-mobile"
                className="font-mono"
                value={form.debtorPhoneMobile}
                inputMode="numeric"
                // เผื่อตัวคั่น/+66 ตอนวาง — onChange แปลงเป็นตัวเลขเอง ไม่ตัดความยาวเงียบ (preship PS-031/R2-008)
                maxLength={PHONE_INPUT_MAX_LENGTH}
                placeholder="10 หลัก"
                invalid={fieldErrors.debtorPhoneMobile !== undefined || phoneInputError(form.debtorPhoneMobile) !== null}
                onChange={(event) => patch({ debtorPhoneMobile: normalizePhoneEvent(event.target) })}
              />
            </Field>
            <Field
              id="debtor-work-phone"
              label="เบอร์โทรที่ทำงาน"
              error={fieldErrors.debtorPhoneWork ?? phoneInputError(form.debtorPhoneWork) ?? undefined}
              hint="9-10 หลัก (ไม่บังคับ)"
            >
              <Input
                id="debtor-work-phone"
                className="font-mono"
                value={form.debtorPhoneWork}
                inputMode="numeric"
                // เผื่อตัวคั่น/+66 ตอนวาง — onChange แปลงเป็นตัวเลขเอง ไม่ตัดความยาวเงียบ (preship PS-031/R2-008)
                maxLength={PHONE_INPUT_MAX_LENGTH}
                invalid={fieldErrors.debtorPhoneWork !== undefined || phoneInputError(form.debtorPhoneWork) !== null}
                onChange={(event) => patch({ debtorPhoneWork: normalizePhoneEvent(event.target) })}
              />
            </Field>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="debtor-line" label="LINE ID" error={fieldErrors.debtorLineId}>
              <Input
                id="debtor-line"
                value={form.debtorLineId}
                placeholder="ไม่บังคับ"
                onChange={(event) => patch({ debtorLineId: event.target.value })}
              />
            </Field>
            <Field id="debtor-facebook" label="Facebook" error={fieldErrors.debtorFacebook}>
              <Input
                id="debtor-facebook"
                value={form.debtorFacebook}
                placeholder="ชื่อ/ลิงก์ — ไม่บังคับ"
                onChange={(event) => patch({ debtorFacebook: event.target.value })}
              />
            </Field>
          </div>
        </section>

        <section>
          <h3 className="mb-3 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">ที่อยู่</h3>
          <div className="space-y-4">
            <AddressFields
              label="ที่อยู่ปัจจุบัน (ที่พักอาศัยจริง)"
              routing
              requiredFields={CASE_REQUIRED_ADDRESS_FIELDS}
              value={form.addressCurrent}
              onChange={(next) => patch({ addressCurrent: next })}
              errors={{ postalCode: fieldErrors['addressCurrent.postalCode'] }}
            />
            <AddressFields
              label="ที่อยู่ที่ทำงาน (ไม่บังคับ)"
              value={form.addressWork}
              onChange={(next) => patch({ addressWork: next })}
              errors={{ postalCode: fieldErrors['addressWork.postalCode'] }}
            />
            <AddressFields
              label="ที่อยู่ตามบัตรประชาชน"
              requiredFields={CASE_REQUIRED_ADDRESS_FIELDS}
              value={form.addressIdCard}
              onChange={(next) => patch({ addressIdCard: next })}
              errors={{ postalCode: fieldErrors['addressIdCard.postalCode'] }}
            />
          </div>
        </section>

        <CaseContactsFields
          contacts={form.contacts}
          errors={fieldErrors}
          onChange={(next) => patch({ contacts: next })}
        />

        <section>
          <h3 className="mb-3 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">ข้อมูลทรัพย์/สินค้า</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="asset-type" label="ประเภททรัพย์" required error={fieldErrors.assetType}>
              <Select
                id="asset-type"
                value={form.assetType}
                invalid={fieldErrors.assetType !== undefined}
                // เปลี่ยนประเภททรัพย์ = รุ่นที่เลือกจากรายการเดิมไม่ตรงประเภทแล้ว (ข้อความยังคงไว้)
                onChange={(event) =>
                  patch({ assetType: event.target.value as CaseFormState['assetType'], deviceModelId: null })
                }
              >
                <option value="">— เลือกประเภท —</option>
                {Object.entries(ASSET_TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              id="asset-imei"
              label="IMEI / Serial Number"
              required
              hint="IMEI = ตัวเลข 15 หลัก (เว้นวรรค ขีด หรือจุดคั่นได้) · ถ้ามีตัวอักษรถือเป็น Serial"
              error={fieldErrors.assetImeiSerial}
            >
              <Input
                id="asset-imei"
                className="font-mono"
                value={form.assetImeiSerial}
                invalid={fieldErrors.assetImeiSerial !== undefined}
                onChange={(event) => patch({ assetImeiSerial: event.target.value })}
                onBlur={checkImeiOnBlur}
              />
              {/* เตือนก่อนบันทึก ไม่บล็อก — ยังบันทึกเป็น Serial ได้ (มติ PO U54) */}
              {fieldErrors.assetImeiSerial === undefined && assetIdentifierWarning(form.assetImeiSerial) !== null && (
                <p className="mt-1 text-[11px] font-semibold text-amber-600">
                  {assetIdentifierWarning(form.assetImeiSerial)}
                </p>
              )}
              {/* วางคู่ IMEI ตัวเลขล้วน (`3569… 3569…` / `3569…/3569…`) — ช่องรับเลขเดียว ให้กดเลือกเอง (R3-031) */}
              {multipleImeiInputCandidates(form.assetImeiSerial).length > 0 && (
                <p className="mt-1 text-[11px] font-semibold text-amber-600">{IMEI_MULTIPLE_INPUT_MESSAGE}</p>
              )}
              {/* วาง IMEI มาพร้อมข้อความ — เสนอให้ผู้ใช้กดใช้เฉพาะตัวเลขเอง ไม่ตัดให้เงียบ ๆ (preship PS-005)
                  เครื่องสองซิมมีหลายเลข ⇒ แสดงปุ่มทุกเลขให้เลือกเลขหลักเอง (R2-014 · R3-031 ตัวเลขล้วน)
                  แสดงแม้มี error ของช่อง (หลังกดบันทึก) — ทางแก้คือกดเลือกเลขเดียว */}
              {imeiPickerCandidates(form.assetImeiSerial).length > 0 && (
                <div className="mt-1 flex flex-wrap gap-2">
                  {imeiPickerCandidates(form.assetImeiSerial).map((imei) => (
                    <Button key={imei} variant="secondary" onClick={() => patch({ assetImeiSerial: imei })}>
                      ใช้ <span className="font-mono">{imei}</span> เป็น IMEI
                    </Button>
                  ))}
                </div>
              )}
            </Field>
            {/* มติ PO U166 — กรอก IMEI ก่อน แล้วเติมยี่ห้อ/รุ่นจากฐาน TAC (แก้ได้) */}
            <Field id="asset-model" label="ยี่ห้อ/รุ่นเครื่อง" required error={fieldErrors.assetBrandModel}>
              <DeviceModelPicker
                id="asset-model"
                assetKind={form.assetType === '' ? null : form.assetType}
                value={{ deviceModelId: form.deviceModelId, text: form.assetBrandModel }}
                identifier={form.assetImeiSerial}
                invalid={fieldErrors.assetBrandModel !== undefined}
                onChange={(next) => patch({ deviceModelId: next.deviceModelId, assetBrandModel: next.text })}
              />
            </Field>
            <Field id="asset-capacity" label="ความจุ" required error={fieldErrors.assetCapacity}>
              <DeviceAttributeSelect
                id="asset-capacity"
                value={form.assetCapacity}
                options={attributeOptions.capacityOptions}
                customPlaceholder="เช่น 128GB"
                invalid={fieldErrors.assetCapacity !== undefined}
                onChange={(next) => patch({ assetCapacity: next })}
              />
            </Field>
            <Field id="asset-color" label="สี" required error={fieldErrors.assetColor}>
              <DeviceAttributeSelect
                id="asset-color"
                value={form.assetColor}
                options={attributeOptions.colorOptions}
                customPlaceholder="เช่น ม่วงลาเวนเดอร์"
                invalid={fieldErrors.assetColor !== undefined}
                onChange={(next) => patch({ assetColor: next })}
              />
            </Field>
            <Field
              id="asset-debt"
              label="มูลหนี้คงเหลือ (บาท)"
              required
              hint="ระบบไม่มีเกณฑ์ตัดรับอัตโนมัติจากมูลค่า — ใช้ประกอบการพิจารณาเท่านั้น"
              error={fieldErrors.outstandingDebtSatang}
            >
              <Input
                id="asset-debt"
                numeric
                inputMode="decimal"
                value={form.outstandingDebtBaht}
                placeholder="0.00"
                invalid={fieldErrors.outstandingDebtSatang !== undefined}
                onChange={(event) => patch({ outstandingDebtBaht: event.target.value })}
              />
            </Field>
          </div>
        </section>

        <CaseAttachmentsFields
          documents={documents}
          staged={staged}
          onChange={setStaged}
          mode={form.documentMode}
          onModeChange={(documentMode) => patch({ documentMode })}
          productPhotoInContract={form.productPhotoInContract}
          onProductPhotoInContractChange={(productPhotoInContract) => patch({ productPhotoInContract })}
          onDeleteDocument={
            isEdit && isCaseDocumentDeletable(editing.status)
              ? (document) => {
                  setDeleteReason('')
                  setDeleteTarget(document)
                }
              : undefined
          }
        />
        <ConfirmModal
          open={deleteTarget !== null}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => void confirmDeleteDocument()}
          title="ลบเอกสารที่แนบ"
          description={`ลบ “${deleteTarget?.originalName ?? ''}” (${deleteTarget === null ? '' : DOCUMENT_SLOT_LABEL[deleteTarget.documentType]}) ออกจากเคสนี้ — ระบบเก็บประวัติไว้ตรวจย้อนหลัง แต่ไฟล์นี้จะไม่นับเป็นเอกสารของเคสอีก`}
          confirmLabel="ลบเอกสาร"
          confirmVariant="danger"
          loading={deleting}
        >
          <Field id="delete-document-reason" label="เหตุผล (ไม่บังคับ)" hint="เช่น แนบผิดเคส / ไฟล์ไม่ชัด">
            <Input
              id="delete-document-reason"
              value={deleteReason}
              maxLength={500}
              onChange={(event) => setDeleteReason(event.target.value)}
            />
          </Field>
        </ConfirmModal>

        <TeamSuggestionPanel
          province={form.addressCurrent.province}
          teams={teamOptions}
          selectedTeamId={editing?.assignedTeamId ?? editing?.suggestedTeamId ?? null}
        />

        {isEdit && (
          <section>
            <h3 className="mb-3 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">
              หมายเหตุการแก้ไข
            </h3>
            <Field
              id="edit-note"
              label="บันทึกไว้ในประวัติการแก้ไข"
              hint="ไม่บังคับ — แต่ช่วยให้ผู้พิจารณาเห็นว่าแก้อะไรเพราะอะไร"
              error={fieldErrors.editNote}
            >
              <Textarea
                id="edit-note"
                maxLength={500}
                value={form.editNote}
                onChange={(event) => patch({ editNote: event.target.value })}
              />
            </Field>
          </section>
        )}

        <p className="text-[11px] text-slate-400">
          เคสที่บันทึกจากหน้านี้เป็นสถานะ “ร่าง” จนกว่าจะแนบเอกสารครบแล้วกด “ส่งตรวจสอบ” ที่รายการเคส ·
          การยืนยัน/เปลี่ยนทีมทำตอนผู้พิจารณากด “รับเคส & ยืนยันทีม”
        </p>
      </div>
    </Modal>
  )
}
