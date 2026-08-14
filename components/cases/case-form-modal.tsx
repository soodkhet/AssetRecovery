'use client'

import { useEffect, useState } from 'react'
import { AddressFields } from '@/components/address/address-fields'
import { CaseAttachmentsFields, type StagedFile } from '@/components/cases/case-attachments-fields'
import { CaseContactsFields } from '@/components/cases/case-contacts-fields'
import { TeamSuggestionPanel } from '@/components/cases/team-suggestion-panel'
import { Button, Field, InlineAlert, Input, Modal, Select, Textarea, useToast } from '@/components/ui'
import { callApi, jsonRequest, type ApiCallError } from '@/lib/api/types'
import { apiPath } from '@/lib/api/contract'
import {
  assertIdentityFormats,
  DEBTOR_NATIONALITIES,
  DEBTOR_NATIONALITY_LABEL,
  digitsOnly,
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
import { ASSET_TYPE_LABEL } from '@/lib/cases/status-display'
import type { CaseDetailDto, CaseTeamOptionDto, CaseTeamOptionsDto } from '@/lib/cases/types'
import { uploadCaseFile } from '@/lib/cases/upload-client'
import { parseBahtInput } from '@/lib/format/money'

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

const NATIONALITY_HINT = 'สัญชาติกำหนดว่าใช้เลขบัตรประชาชน (ไทย) หรือเลข Passport/เอกสารอื่น (`38` §6.1.1)'

export interface CaseFormModalProps {
  open: boolean
  /** null = สร้างเคสใหม่ · มีค่า = แก้ไขเคสเดิม (`38` §8 `edit_case`) */
  editing: CaseDetailDto | null
  companies: ReadonlyArray<{ id: string; name: string }>
  onClose: () => void
  onSaved: (saved: CaseDetailDto) => void
  /** เปิดดูเคสที่ใช้เลขที่สัญญาซ้ำ (ลิงก์ตาม `38` §7.3) */
  onOpenExistingCase?: (info: { id: string; caseRef: string }) => void
}

export function CaseFormModal({
  open,
  editing,
  companies,
  onClose,
  onSaved,
  onOpenExistingCase,
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

  // เปลี่ยนเป้าหมายของ modal (สร้าง ↔ แก้ไขเคสอื่น) = โหลดค่าเริ่มต้นใหม่ระหว่าง render
  // (ไม่ใช้ `useEffect` — กฎ `react-hooks/set-state-in-effect` ใน REUSE_INDEX)
  const targetId = editing?.id ?? null
  if (targetId !== loadedId) {
    setLoadedId(targetId)
    setForm(caseFormFromDetail(editing))
    setFieldErrors({})
    setFormError(null)
  }

  const isEdit = editing !== null
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

    const payload = buildCasePayload(form, isEdit ? 'edit' : 'create')
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
        setFormError(result.error ?? { title: 'บันทึกไม่สำเร็จ', message: 'กรุณาลองใหม่' })
        setFieldErrors(result.error?.fields ?? {})
        return
      }

      const saved = await uploadStagedFiles(result.data)

      showToast({
        tone: 'success',
        title: isEdit ? 'บันทึกการแก้ไขเคสแล้ว' : 'สร้างเคสร่างแล้ว',
        description: `${saved.caseRef} · ${saved.financeCompanyName}`,
      })
      setStaged([])
      onSaved(saved)
    } finally {
      setSubmitting(false)
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
          ? 'แก้ไขได้เฉพาะสถานะ ร่าง / รอพิจารณา / ขอข้อมูลเพิ่ม — ทุกครั้งที่บันทึกจะถูกเก็บไว้ในประวัติการแก้ไข (`38` §8)'
          : 'บันทึกเป็นเคสร่างก่อน แล้วค่อยแนบเอกสาร/ส่งตรวจสอบ — ข้อมูลไม่ครบก็บันทึกร่างได้ (`38` §11)'
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

        {!isEdit && (
          <InlineAlert tone="warning" title="เลขที่สัญญาห้ามซ้ำ">
            ระบบตรวจซ้ำอัตโนมัติภายในบริษัทไฟแนนซ์เดียวกัน — เลขที่ซ้ำจะบันทึกไม่ได้ (`38` §11)
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
                onChange={(event) => patch({ caseRef: event.target.value })}
              />
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
                  onChange={(event) => patch({ debtorNationalId: digitsOnly(event.target.value).slice(0, 13) })}
                />
              </Field>
            ) : (
              <Field
                id="debtor-passport"
                label="เลข Passport / เอกสารอื่น (ใบอนุญาตทำงาน ฯลฯ)"
                required
                hint="ไม่จำกัดรูปแบบ/จำนวนหลัก เพราะเอกสารแต่ละประเทศต่างกัน (`38` §6.1.1)"
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
            <Field id="debtor-mobile" label="เบอร์โทรมือถือ" required error={fieldErrors.debtorPhoneMobile}>
              <Input
                id="debtor-mobile"
                className="font-mono"
                value={form.debtorPhoneMobile}
                inputMode="numeric"
                maxLength={10}
                placeholder="10 หลัก"
                invalid={fieldErrors.debtorPhoneMobile !== undefined}
                onChange={(event) => patch({ debtorPhoneMobile: digitsOnly(event.target.value).slice(0, 10) })}
              />
            </Field>
            <Field
              id="debtor-work-phone"
              label="เบอร์โทรที่ทำงาน"
              error={fieldErrors.debtorPhoneWork}
              hint="9-10 หลัก (ไม่บังคับ)"
            >
              <Input
                id="debtor-work-phone"
                className="font-mono"
                value={form.debtorPhoneWork}
                inputMode="numeric"
                maxLength={10}
                invalid={fieldErrors.debtorPhoneWork !== undefined}
                onChange={(event) => patch({ debtorPhoneWork: digitsOnly(event.target.value).slice(0, 10) })}
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
              required
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
              required
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
                onChange={(event) => patch({ assetType: event.target.value as CaseFormState['assetType'] })}
              >
                <option value="">— เลือกประเภท —</option>
                {Object.entries(ASSET_TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="asset-model" label="ยี่ห้อ/รุ่นเครื่อง" required error={fieldErrors.assetBrandModel}>
              <Input
                id="asset-model"
                value={form.assetBrandModel}
                placeholder="เช่น iPhone 14 Pro"
                invalid={fieldErrors.assetBrandModel !== undefined}
                onChange={(event) => patch({ assetBrandModel: event.target.value })}
              />
            </Field>
            <Field
              id="asset-imei"
              label="IMEI / Serial Number"
              required
              hint="ตัวเลข 15 หลัก = IMEI (ระบบเก็บแยกให้เอง) นอกนั้นถือเป็น Serial"
              error={fieldErrors.assetImeiSerial}
            >
              <Input
                id="asset-imei"
                className="font-mono"
                value={form.assetImeiSerial}
                invalid={fieldErrors.assetImeiSerial !== undefined}
                onChange={(event) => patch({ assetImeiSerial: event.target.value })}
              />
            </Field>
            <Field
              id="asset-debt"
              label="มูลหนี้/มูลค่าสินค้าคงเหลือ (บาท)"
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

        <CaseAttachmentsFields documents={editing?.documents ?? []} staged={staged} onChange={setStaged} />

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
              hint="ไม่บังคับ — แต่ช่วยให้ผู้พิจารณาเห็นว่าแก้อะไรเพราะอะไร (`38` §6.4)"
              error={fieldErrors.editNote}
            >
              <Textarea
                id="edit-note"
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
