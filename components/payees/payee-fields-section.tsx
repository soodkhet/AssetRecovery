'use client'

import Link from 'next/link'
import { AddressFields } from '@/components/address/address-fields'
import { useSession } from '@/components/auth/permission-provider'
import { PayeeIdDocumentField } from '@/components/payees/payee-id-document-field'
import { SettingHelp } from '@/components/settings/setting-help'
import { useTaxRuleSettings } from '@/components/teams/use-tax-rule-settings'
import { Field, InlineAlert, Input, Select } from '@/components/ui'
import type { TeamSide } from '@/lib/teams/team'
import {
  canOpenTaxProfileTab,
  payeeDefaultTaxMissing,
  payeeDefaultTaxOptionLabel,
  payeeDefaultTaxRule,
  payeeEffectiveTaxRule,
  PER_PAYEE_TAX_PROFILE_SUFFIX,
  TAX_PROFILE_TAB_PATH,
} from '@/lib/teams/team-tax-rule'
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
  payoutSide,
}: {
  /**
   * ฝั่งของผู้รับสำหรับกติกาภาษี (มติ PO U164) — ฟอร์มผู้ใช้ = ทีม/กลุ่มที่เลือกอยู่ · หน้าผู้รับเงิน = ค่าที่ระบบ
   * resolve (`PayeeDto.payoutSide`) · `null` = ไม่มีฝั่ง ⇒ "ไม่มีค่าเริ่มต้นที่ใช้ได้ — กรุณาเลือก"
   */
  payoutSide: TeamSide | null
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

  /** U164 — ตัวเลือกแรก = ค่าที่ใช้จริงเมื่อไม่ผูกรายคน (ฝั่ง × ชนิดผู้รับในฟอร์ม — อัปเดตตามทันที) */
  const session = useSession()
  const taxRule = useTaxRuleSettings()
  const defaultLine =
    taxRule.data === null
      ? null
      : payeeDefaultTaxRule(payoutSide, form.payeeType, taxRule.data.policy, taxRule.data.defaults)
  const defaultOptionLabel =
    taxRule.error !== null
      ? 'ตามค่าเริ่มต้นตามประเภทผู้รับ (โหลดค่าตั้งไม่สำเร็จ)'
      : taxRule.data === null
        ? 'กำลังโหลดค่าเริ่มต้น…'
        : payeeDefaultTaxOptionLabel(payoutSide, defaultLine)
  const defaultMissing = taxRule.data !== null && payeeDefaultTaxMissing(defaultLine)
  const showTaxTabLink = session !== null && canOpenTaxProfileTab(session)
  // BUG-181 — ผู้รับที่หักตามอัตรารายคน (40(1)/40(2)) แต่เลือก Tax Profile ไว้ ⇒ บอกชัดว่า Tax Profile ไม่มีผล
  const effectiveRule =
    defaultLine === null
      ? null
      : payeeEffectiveTaxRule(defaultLine, {
          taxProfileName: selectedProfileDto?.name ?? null,
          whtPct: selectedProfileDto?.whtPct ?? null,
          wht402Pct: pctFromInput(form.wht402Pct),
        })
  const ignoredProfileName = effectiveRule?.ignoredProfileName ?? null

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

    <Field
      id="payee-tax-profile"
      label="กติกาภาษี (Tax Profile)"
      error={errors.taxProfileId}
      hint="ไม่ต้องเลือก — เลือกเฉพาะกรณีคนนี้มีอัตราพิเศษ เช่น มีหนังสือลดอัตรา"
    >
      <Select
        id="payee-tax-profile"
        value={form.taxProfileId}
        onChange={(event) => onChange('taxProfileId', event.target.value)}
      >
        <option value="">{defaultOptionLabel}</option>
        {taxProfiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.name} · {fmtPercent(profile.whtPct)} {PER_PAYEE_TAX_PROFILE_SUFFIX}
          </option>
        ))}
      </Select>
    </Field>
    {defaultMissing && form.taxProfileId === '' && (
      <InlineAlert tone="warning" title="ยังไม่มีค่าเริ่มต้นที่ใช้ได้">
        {payoutSide === null
          ? 'ผู้รับรายนี้ไม่อยู่ฝั่ง Inhouse/Outsource จึงไม่มี Tax Profile ค่าเริ่มต้น — กรุณาเลือก Tax Profile ให้คนนี้'
          : 'ยังไม่ได้ตั้ง Tax Profile ค่าเริ่มต้นของฝั่งและประเภทผู้รับนี้ — ตั้งค่าเริ่มต้นก่อน หรือเลือก Tax Profile ให้คนนี้'}
        {showTaxTabLink && (
          <>
            {' '}
            <Link href={TAX_PROFILE_TAB_PATH} className="font-semibold text-emerald-700 hover:underline">
              ไปแท็บ Tax Profile →
            </Link>
          </>
        )}
      </InlineAlert>
    )}
    {ignoredProfileName !== null && effectiveRule !== null && (
      <InlineAlert tone="info" title="Tax Profile ที่เลือกไม่มีผลกับผู้รับรายนี้">
        {`ระบบ${effectiveRule.label} — "${ignoredProfileName}" จะไม่ถูกใช้ ไม่ต้องเลือกก็ได้`}
      </InlineAlert>
    )}
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
