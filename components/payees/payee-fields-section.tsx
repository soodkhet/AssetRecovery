'use client'

import { AddressFields } from '@/components/address/address-fields'
import { PayeeIdDocumentField } from '@/components/payees/payee-id-document-field'
import { SettingHelp } from '@/components/settings/setting-help'
import { Field, Input, Select } from '@/components/ui'
import { EMPTY_ADDRESS, addressFromDto, type AddressValue } from '@/lib/address/address-value'
import { branchCodeFromForm, branchKindOf, isHeadOfficeBranch, type BranchKind } from '@/lib/format/branch'
import { fmtPercent } from '@/lib/format/money'
import type { WhtCondition } from '@/lib/generated/prisma/enums'
import {
  nameTitleChoiceOf,
  nameTitleFromForm,
  PAYEE_NAME_TITLE_OPTIONS,
  PAYEE_REQUIRED_ADDRESS_FIELDS,
  WHT_CONDITION_LABEL,
  selectableWhtConditions,
  whtConditionHint,
  type PayeeNameTitleChoice,
} from '@/lib/payees/payee'
import type { PayeeDto } from '@/lib/payees/types'
import { payeeConditionHelp, payeeTaxProfileHelp, payeeWht402Help, pctFromInput } from '@/lib/settings/help'
import type { TaxProfileDto } from '@/lib/settings/types'

/**
 * ช่องกรอกข้อมูลผู้รับเงิน (ไฟล์ 18 §7.1/§8) — **ชุดเดียว**ใช้ทั้งหน้า "ผู้รับเงิน" และส่วน "ข้อมูลรับเงิน"
 * ในฟอร์มเพิ่ม/แก้ผู้ใช้ (มติ PO U131) · ชื่อผู้รับไม่อยู่ในชุดนี้ — มาจากชื่อผู้ใช้จุดเดียว
 * ตรวจรูปแบบด้วย `payeeFieldsSchema` (Zod ชุดเดียว FE/BE) · ความครบบังคับตอนยืนยัน
 */

export const PAYEE_TYPE_LABEL: Readonly<Record<'individual' | 'corporate', string>> = {
  individual: 'บุคคลธรรมดา',
  corporate: 'นิติบุคคล',
}

export interface PayeeFieldsForm {
  payeeType: 'individual' | 'corporate'
  taxProfileId: string
  nationalId: string
  bankName: string
  accountName: string
  accountNumber: string
  /** path ไฟล์เอกสารยืนยันตัวตน (มติ PO U150 — อัปโหลดผ่าน server) · ว่าง = ไม่มี */
  idDocumentUrl: string
  /** เอกสารที่โหลดมาผ่านการตรวจของ server แล้ว — UI เท่านั้น (ไม่ส่งเข้า API) · URL เก่าที่พิมพ์เอง = `false` */
  idDocumentVerified: boolean
  /** อัตราหัก 40(2) ต่อคน (มติ PO 05/10/2569 UAT U7) — ว่าง = ยังไม่กรอก */
  wht402Pct: string
  /** คำนำหน้า (บุคคลธรรมดา — มติ PO U94 ข้อ 1) */
  nameTitleChoice: PayeeNameTitleChoice
  nameTitleOther: string
  /** ที่อยู่ผู้ถูกหักภาษี — บังคับครบก่อนยืนยัน */
  address: AddressValue
  /** สำนักงานใหญ่/สาขา (นิติบุคคล) */
  branchKind: BranchKind
  branchNumber: string
  whtCondition: WhtCondition
}

export const EMPTY_PAYEE_FIELDS: PayeeFieldsForm = {
  payeeType: 'individual',
  taxProfileId: '',
  nationalId: '',
  bankName: '',
  accountName: '',
  accountNumber: '',
  idDocumentUrl: '',
  idDocumentVerified: false,
  wht402Pct: '',
  nameTitleChoice: '',
  nameTitleOther: '',
  address: EMPTY_ADDRESS,
  branchKind: 'head_office',
  branchNumber: '',
  whtCondition: 'withhold',
}

export function payeeFieldsFromDto(payee: PayeeDto): PayeeFieldsForm {
  return {
    payeeType: payee.payeeType,
    taxProfileId: payee.taxProfileId ?? '',
    nationalId: payee.nationalId ?? '',
    bankName: payee.bankName ?? '',
    accountName: payee.accountName ?? '',
    accountNumber: payee.accountNumber ?? '',
    idDocumentUrl: payee.idDocumentUrl ?? '',
    idDocumentVerified: payee.idDocumentVerified,
    wht402Pct: payee.wht402Pct === null ? '' : String(payee.wht402Pct),
    nameTitleChoice: nameTitleChoiceOf(payee.nameTitle),
    nameTitleOther: nameTitleChoiceOf(payee.nameTitle) === 'other' ? (payee.nameTitle ?? '') : '',
    address: addressFromDto(payee.address),
    branchKind: branchKindOf(payee.branchCode),
    branchNumber: isHeadOfficeBranch(payee.branchCode) ? '' : payee.branchCode,
    whtCondition: payee.whtCondition,
  }
}

/** ค่าที่ส่งเข้า `payeeFieldsSchema` — แปลงคำนำหน้า/สาขา/อัตราจากรูปแบบฟอร์ม */
export function payeeFieldsPayload(form: PayeeFieldsForm): Record<string, unknown> {
  return {
    payeeType: form.payeeType,
    taxProfileId: form.taxProfileId,
    nationalId: form.nationalId,
    bankName: form.bankName,
    accountName: form.accountName,
    accountNumber: form.accountNumber,
    idDocumentUrl: form.idDocumentUrl,
    wht402Pct: form.wht402Pct.trim() === '' ? null : Number(form.wht402Pct),
    nameTitle: form.payeeType === 'individual' ? nameTitleFromForm(form.nameTitleChoice, form.nameTitleOther) : '',
    address: form.address,
    branchCode: form.payeeType === 'corporate' ? branchCodeFromForm(form.branchKind, form.branchNumber) : '00000',
    whtCondition: form.whtCondition,
  }
}

/** error ของช่องที่อยู่จาก Zod (`address.postalCode` …) → คีย์ของ `AddressFields` */
function addressErrors(errors: Record<string, string | undefined>): Partial<Record<keyof AddressValue, string>> {
  return {
    detail: errors['address.detail'],
    postalCode: errors['address.postalCode'],
    province: errors['address.province'],
    district: errors['address.district'],
    subdistrict: errors['address.subdistrict'],
  }
}

export function PayeeFieldsSection({
  form,
  onChange,
  errors,
  taxProfiles,
  allowGrossUp,
  originalCondition,
}: {
  form: PayeeFieldsForm
  onChange: (key: keyof PayeeFieldsForm, value: PayeeFieldsForm[keyof PayeeFieldsForm]) => void
  /** error ตามชื่อฟิลด์ของ `payeeFieldsSchema` (`nationalId`, `address.postalCode` …) */
  errors: Record<string, string | undefined>
  taxProfiles: readonly TaxProfileDto[]
  /** มติ PO U105 — ค่าตั้ง "อนุญาตเงื่อนไข (2)/(3)" ที่มีผลวันนี้ */
  allowGrossUp: boolean
  /** เงื่อนไขเดิมของผู้รับ (คงไว้ได้แม้ค่าตั้งปิด) · ผู้รับใหม่ = `null` */
  originalCondition: WhtCondition | null
}) {
  /** U108 — ค่าของ Tax Profile ที่เลือกอยู่ในฟอร์ม (ตัวอย่างคำนวณสด) */
  const selectedProfileDto = taxProfiles.find((profile) => profile.id === form.taxProfileId)
  const selectedTaxProfile =
    selectedProfileDto === undefined
      ? undefined
      : {
          whtPct: selectedProfileDto.whtPct,
          whtBasis: selectedProfileDto.whtBasis,
          whtMinThresholdSatang: selectedProfileDto.whtMinThresholdSatang,
        }

  return (
    <>
    <Field id="payee-type" label="ประเภทผู้รับเงิน" required error={errors.payeeType}>
      <Select
        id="payee-type"
        value={form.payeeType}
        onChange={(event) => onChange('payeeType', event.target.value as PayeeFieldsForm['payeeType'])}
      >
        {(Object.keys(PAYEE_TYPE_LABEL) as (keyof typeof PAYEE_TYPE_LABEL)[]).map((value) => (
          <option key={value} value={value}>
            {PAYEE_TYPE_LABEL[value]}
          </option>
        ))}
      </Select>
    </Field>

    {form.payeeType === 'individual' ? (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          id="payee-name-title"
          label="คำนำหน้าชื่อ"
          hint="พิมพ์บนหนังสือรับรองการหักภาษี ณ ที่จ่าย"
          error={errors.nameTitle}
        >
          <Select
            id="payee-name-title"
            value={form.nameTitleChoice}
            onChange={(event) => onChange('nameTitleChoice', event.target.value as PayeeNameTitleChoice)}
          >
            <option value="">— ไม่ระบุ —</option>
            {PAYEE_NAME_TITLE_OPTIONS.map((title) => (
              <option key={title} value={title}>
                {title}
              </option>
            ))}
            <option value="other">อื่น ๆ (ระบุ)</option>
          </Select>
        </Field>
        {form.nameTitleChoice === 'other' && (
          <Field id="payee-name-title-other" label="ระบุคำนำหน้า" required error={errors.nameTitle}>
            <Input
              id="payee-name-title-other"
              value={form.nameTitleOther}
              onChange={(event) => onChange('nameTitleOther', event.target.value)}
              placeholder="เช่น ดร."
            />
          </Field>
        )}
      </div>
    ) : (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          id="payee-branch-kind"
          label="สำนักงานใหญ่ / สาขา"
          required
          hint="พิมพ์บนหนังสือรับรองการหักภาษี ณ ที่จ่ายต่อจากเลขประจำตัวผู้เสียภาษี"
        >
          <Select
            id="payee-branch-kind"
            value={form.branchKind}
            onChange={(event) => onChange('branchKind', event.target.value as BranchKind)}
          >
            <option value="head_office">สำนักงานใหญ่</option>
            <option value="branch">สาขาที่</option>
          </Select>
        </Field>
        {form.branchKind === 'branch' && (
          <Field id="payee-branch-no" label="เลขที่สาขา (5 หลัก)" required error={errors.branchCode}>
            <Input
              id="payee-branch-no"
              numeric
              inputMode="numeric"
              maxLength={5}
              value={form.branchNumber}
              onChange={(event) => onChange('branchNumber', event.target.value)}
              placeholder="00001"
            />
          </Field>
        )}
      </div>
    )}

    <Field
      id="payee-national-id"
      label="เลขบัตรประชาชน / เลขทะเบียนนิติบุคคล (13 หลัก)"
      error={errors.nationalId}
    >
      <Input
        id="payee-national-id"
        value={form.nationalId}
        onChange={(event) => onChange('nationalId', event.target.value)}
        className="font-mono"
        inputMode="numeric"
        placeholder="1234567890123"
      />
    </Field>

    <Field id="payee-tax-profile" label="กติกาภาษี (Tax Profile)" error={errors.taxProfileId}>
      <Select
        id="payee-tax-profile"
        value={form.taxProfileId}
        onChange={(event) => onChange('taxProfileId', event.target.value)}
      >
        <option value="">— ยังไม่ผูก (ใช้ค่าเริ่มต้นตามประเภทผู้รับ ถ้าไม่มีใช้อัตราจากแผนชั่วคราว) —</option>
        {taxProfiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.name} · {fmtPercent(profile.whtPct)}
          </option>
        ))}
      </Select>
    </Field>
    <SettingHelp help={payeeTaxProfileHelp(selectedTaxProfile ?? null)} />

    <Field
      id="payee-wht-40-2"
      label="อัตราหัก 40(1)/40(2) (%)"
      error={errors.wht402Pct}
      hint="ใช้เมื่อค่าตั้งภาษีจัดผู้รับเป็นเงินได้ 40(1) หรือ 40(2) เท่านั้น — กรอกอัตราที่สำนักงานบัญชีคำนวณให้ (0.00 ได้) · เว้นว่าง = ยังไม่กรอก"
    >
      <Input
        id="payee-wht-40-2"
        numeric
        inputMode="decimal"
        value={form.wht402Pct}
        onChange={(event) => onChange('wht402Pct', event.target.value)}
        placeholder="เช่น 2.50"
      />
    </Field>
    <SettingHelp help={payeeWht402Help(pctFromInput(form.wht402Pct))} />

    <div className="rounded-lg border border-slate-200 p-3">
      <AddressFields
        label="ที่อยู่ผู้ถูกหักภาษี (พิมพ์บนหนังสือรับรองการหักภาษี ณ ที่จ่าย — ต้องครบก่อนยืนยัน)"
        value={form.address}
        onChange={(next) => onChange('address', next)}
        requiredFields={PAYEE_REQUIRED_ADDRESS_FIELDS}
        errors={addressErrors(errors)}
      />
    </div>

    <Field
      id="payee-wht-condition"
      label="เงื่อนไขการหักภาษี ณ ที่จ่าย"
      error={errors.whtCondition}
      hint={whtConditionHint(form.whtCondition, allowGrossUp)}
    >
      <Select
        id="payee-wht-condition"
        value={form.whtCondition}
        onChange={(event) => onChange('whtCondition', event.target.value as WhtCondition)}
      >
        {selectableWhtConditions(allowGrossUp, originalCondition).map((condition) => (
          <option key={condition} value={condition}>
            {WHT_CONDITION_LABEL[condition]}
          </option>
        ))}
      </Select>
    </Field>
    <SettingHelp
      help={payeeConditionHelp({
        condition: form.whtCondition,
        allowGrossUp,
        whtPct: selectedTaxProfile?.whtPct ?? null,
      })}
    />

    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="mb-3 text-xs font-semibold text-slate-700">ข้อมูลบัญชีธนาคาร</p>
      <div className="space-y-3">
        <Field id="payee-bank" label="ธนาคาร" error={errors.bankName}>
          <Input
            id="payee-bank"
            value={form.bankName}
            onChange={(event) => onChange('bankName', event.target.value)}
            placeholder="ธนาคารกสิกรไทย"
          />
        </Field>
        <Field id="payee-account-name" label="ชื่อบัญชี" error={errors.accountName}>
          <Input
            id="payee-account-name"
            value={form.accountName}
            onChange={(event) => onChange('accountName', event.target.value)}
          />
        </Field>
        <Field id="payee-account-number" label="เลขบัญชี" error={errors.accountNumber}>
          <Input
            id="payee-account-number"
            value={form.accountNumber}
            onChange={(event) => onChange('accountNumber', event.target.value)}
            className="font-mono"
            inputMode="numeric"
          />
        </Field>
      </div>
    </div>

    <PayeeIdDocumentField
      path={form.idDocumentUrl}
      verified={form.idDocumentVerified}
      error={errors.idDocumentUrl}
      onUploaded={(path) => onChange('idDocumentUrl', path)}
      onClear={() => onChange('idDocumentUrl', '')}
    />
    </>
  )
}
