'use client'

import { useState } from 'react'
import { toFieldErrors } from '@/lib/api/validation'
import { Button, Field, InlineAlert, Input, Modal, Select, Textarea, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import {
  branchCodeFromForm,
  branchKindOf,
  DEFAULT_CUSTOMER_WHT_PCT,
  DEFAULT_VAT_MODE,
  isHeadOfficeBranch,
  VAT_MODE_OPTIONS,
  type BranchKind,
  type InvoiceDeliveryFormat,
  type VatMode,
} from '@/lib/finance-companies/company'
import { financeCompanyCreateSchema } from '@/lib/finance-companies/schemas'
import type { FinanceCompanyDto } from '@/lib/finance-companies/types'
import type { ServiceFeeTemplateListDto } from '@/lib/service-fee/types'

/**
 * ฟอร์มสร้าง/แก้ไขบริษัทไฟแนนซ์ — โครงตาม mockup `settings.html` (modal `create-company`/`edit-company`)
 *
 * จุดบังคับ: `tax_id` ตัวเลข 13 หลัก (format-only — `10` §7.1 🔶) ห้ามซ้ำ (`DUPLICATE_TAX_ID`) ·
 * ต้องผูกเทมเพลตค่าบริการเสมอ (`10` §9.1) · การเปลี่ยนสถานะทำที่ปุ่ม “ระงับ/เปิดใช้งาน” บนการ์ด
 *
 * UAT BUG-001 (มติ PO 03/10/2569): เพิ่มช่อง “รูปแบบราคา/VAT” (`vat_mode`) และ
 * “ลูกค้าหักภาษี ณ ที่จ่ายก่อนโอน (%)” (`wht_withheld_by_customer_pct` — เว้นว่าง = ไม่หัก) ·
 * ค่าเริ่มต้นของฟอร์มสร้างใหม่ = default ของ DB (`exclude_vat` · 3.00) ไม่เปลี่ยนพฤติกรรมเดิม
 *
 * มติ PO U77 (ม.86/4): ช่อง “สำนักงานใหญ่ / สาขาที่” — ค่าเริ่มต้นสำนักงานใหญ่ (`00000`) ·
 * เลือกสาขาแล้วกรอกเลข 5 หลัก · พิมพ์บนใบกำกับภาษีต่อจากเลขผู้เสียภาษี (snapshot ตอนออกใบ)
 */

interface FormState {
  name: string
  shortName: string
  taxId: string
  branchKind: BranchKind
  /** เลขสาขา 5 หลัก — ใช้เมื่อ `branchKind = 'branch'` เท่านั้น */
  branchNumber: string
  address: string
  phone: string
  email: string
  contactName: string
  contactPhone: string
  signerName: string
  serviceFeeTemplateId: string
  vatRegistered: boolean
  vatMode: VatMode
  /** สตริงของช่องกรอก — ค่าว่าง = ลูกค้าไม่หัก (`null`) */
  whtWithheldByCustomerPct: string
  defaultInvoiceDeliveryFormat: InvoiceDeliveryFormat
  billingDay: string
  paymentDueDays: string
  reason: string
}

function emptyForm(defaultTemplateId: string): FormState {
  return {
    name: '',
    shortName: '',
    taxId: '',
    branchKind: 'head_office',
    branchNumber: '',
    address: '',
    phone: '',
    email: '',
    contactName: '',
    contactPhone: '',
    signerName: '',
    serviceFeeTemplateId: defaultTemplateId,
    vatRegistered: true,
    vatMode: DEFAULT_VAT_MODE,
    whtWithheldByCustomerPct: DEFAULT_CUSTOMER_WHT_PCT.toFixed(2),
    defaultInvoiceDeliveryFormat: 'paper_pdf',
    billingDay: '1',
    paymentDueDays: '30',
    reason: '',
  }
}

function formOf(company: FinanceCompanyDto): FormState {
  return {
    name: company.name,
    shortName: company.shortName,
    taxId: company.taxId,
    branchKind: branchKindOf(company.branchCode),
    branchNumber: isHeadOfficeBranch(company.branchCode) ? '' : company.branchCode,
    address: company.address ?? '',
    phone: company.phone ?? '',
    email: company.email ?? '',
    contactName: company.contactName ?? '',
    contactPhone: company.contactPhone ?? '',
    signerName: company.signerName ?? '',
    serviceFeeTemplateId: company.serviceFeeTemplateId,
    vatRegistered: company.vatRegistered,
    vatMode: company.vatMode,
    whtWithheldByCustomerPct:
      company.whtWithheldByCustomerPct === null ? '' : company.whtWithheldByCustomerPct.toFixed(2),
    defaultInvoiceDeliveryFormat: company.defaultInvoiceDeliveryFormat,
    billingDay: String(company.billingDay),
    paymentDueDays: String(company.paymentDueDays),
    reason: '',
  }
}

/** ช่องตัวเลขบนฟอร์มเป็นสตริง — แปลงเป็น number ก่อนให้ Zod ตรวจ (ค่าว่าง = NaN → error ชัดเจน) */
function toNumber(value: string): number {
  return value.trim() === '' ? Number.NaN : Number(value)
}

function payloadOf(form: FormState): Record<string, unknown> {
  return {
    name: form.name.trim(),
    shortName: form.shortName.trim(),
    taxId: form.taxId,
    branchCode: branchCodeFromForm(form.branchKind, form.branchNumber),
    address: form.address,
    phone: form.phone,
    email: form.email,
    contactName: form.contactName,
    contactPhone: form.contactPhone,
    signerName: form.signerName,
    serviceFeeTemplateId: form.serviceFeeTemplateId === '' ? undefined : form.serviceFeeTemplateId,
    vatRegistered: form.vatRegistered,
    vatMode: form.vatMode,
    // เว้นว่าง = ลูกค้าไม่หัก → ส่ง null ชัดเจน (ถ้าไม่ส่งเลย Zod จะเติม default 3.00 ให้)
    whtWithheldByCustomerPct:
      form.whtWithheldByCustomerPct.trim() === '' ? null : toNumber(form.whtWithheldByCustomerPct),
    defaultInvoiceDeliveryFormat: form.defaultInvoiceDeliveryFormat,
    billingDay: toNumber(form.billingDay),
    paymentDueDays: toNumber(form.paymentDueDays),
    reason: form.reason.trim(),
  }
}

export function CompanyFormModal({
  open,
  company,
  templates,
  onClose,
  onSaved,
}: {
  open: boolean
  /** null = สร้างใหม่ */
  company: FinanceCompanyDto | null
  templates: readonly ServiceFeeTemplateListDto[]
  onClose: () => void
  onSaved: () => void
}) {
  const { showToast } = useToast()
  const [form, setForm] = useState<FormState>(
    company === null ? emptyForm(templates[0]?.id ?? '') : formOf(company),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const isEdit = company !== null

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function save(): Promise<void> {
    const parsed = financeCompanyCreateSchema.safeParse(payloadOf(form))
    if (!parsed.success) {
      // ตัวแปลงกลาง — ข้อความ default ภาษาอังกฤษของ Zod ถูกแปลงเป็นไทยที่เดียว (UAT BUG-138)
      setErrors(toFieldErrors(parsed.error))
      return
    }

    setErrors({})
    setSaving(true)
    try {
      const result = await callApi<FinanceCompanyDto>(
        isEdit ? `/api/finance-companies/${company.id}` : '/api/finance-companies',
        jsonRequest(isEdit ? 'PATCH' : 'POST', parsed.data),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }

      showToast({
        tone: 'success',
        title: isEdit ? 'บันทึกข้อมูลบริษัทแล้ว' : 'สร้างบริษัทไฟแนนซ์แล้ว',
        description: form.name.trim(),
      })
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? `แก้ไขบริษัท — ${company.name}` : 'สร้างบริษัทไฟแนนซ์'}
      description="ข้อมูลนี้ใช้ออกใบกำกับภาษี/ใบวางบิล — ทุกบริษัทต้องผูกเทมเพลตค่าบริการเสมอ"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button onClick={() => void save()} loading={saving}>
            {isEdit ? 'บันทึกการแก้ไข' : 'สร้างบริษัท'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {templates.length === 0 && (
          <InlineAlert tone="warning" title="ยังไม่มีเทมเพลตค่าบริการที่ใช้งานอยู่">
            สร้างเทมเพลตที่หน้า “เทมเพลตค่าบริการ” ก่อน — บริษัทที่ไม่มีเทมเพลตสร้างไม่ได้
          </InlineAlert>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field id="co-name" label="ชื่อนิติบุคคลเต็ม" required error={errors.name} className="sm:col-span-2">
            <Input
              id="co-name"
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              placeholder='เช่น "บริษัท สยามไฟแนนซ์ จำกัด"'
            />
          </Field>
          <Field id="co-short" label="ชื่อย่อ" required error={errors.shortName}>
            <Input id="co-short" value={form.shortName} onChange={(event) => set('shortName', event.target.value)} placeholder="SF" />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id="co-taxid"
            label="เลขประจำตัวผู้เสียภาษี (13 หลัก)"
            required
            error={errors.taxId}
            hint="ตรวจรูปแบบอย่างเดียว ไม่มี checksum"
          >
            <Input
              id="co-taxid"
              numeric
              inputMode="numeric"
              value={form.taxId}
              onChange={(event) => set('taxId', event.target.value)}
              placeholder="0105512345678"
            />
          </Field>
          <Field id="co-phone" label="เบอร์โทรสำนักงาน" error={errors.phone}>
            <Input id="co-phone" value={form.phone} onChange={(event) => set('phone', event.target.value)} placeholder="021234567" />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id="co-branch-kind"
            label="สำนักงานใหญ่ / สาขา"
            required
            hint="พิมพ์บนใบกำกับภาษีต่อจากเลขประจำตัวผู้เสียภาษี"
          >
            <Select
              id="co-branch-kind"
              value={form.branchKind}
              onChange={(event) => set('branchKind', event.target.value as BranchKind)}
            >
              <option value="head_office">สำนักงานใหญ่</option>
              <option value="branch">สาขาที่</option>
            </Select>
          </Field>
          {form.branchKind === 'branch' && (
            <Field id="co-branch-no" label="เลขที่สาขา (5 หลัก)" required error={errors.branchCode}>
              <Input
                id="co-branch-no"
                numeric
                inputMode="numeric"
                maxLength={5}
                value={form.branchNumber}
                onChange={(event) => set('branchNumber', event.target.value)}
                placeholder="00001"
              />
            </Field>
          )}
        </div>

        <Field id="co-address" label="ที่อยู่ตามที่จดทะเบียน (ใช้ออกเอกสารทางการ)" error={errors.address}>
          <Textarea id="co-address" value={form.address} onChange={(event) => set('address', event.target.value)} />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="co-contact" label="ผู้ติดต่อประจำวัน" error={errors.contactName}>
            <Input id="co-contact" value={form.contactName} onChange={(event) => set('contactName', event.target.value)} />
          </Field>
          <Field id="co-contact-phone" label="เบอร์ผู้ติดต่อ" error={errors.contactPhone}>
            <Input
              id="co-contact-phone"
              value={form.contactPhone}
              onChange={(event) => set('contactPhone', event.target.value)}
            />
          </Field>
          <Field id="co-signer" label="ผู้มีอำนาจลงนาม" error={errors.signerName}>
            <Input id="co-signer" value={form.signerName} onChange={(event) => set('signerName', event.target.value)} />
          </Field>
          <Field id="co-email" label="อีเมลรับเอกสาร" error={errors.email}>
            <Input id="co-email" value={form.email} onChange={(event) => set('email', event.target.value)} placeholder="ar@company.co.th" />
          </Field>
        </div>

        <Field id="co-template" label="เทมเพลตค่าบริการที่ผูก" required error={errors.serviceFeeTemplateId}>
          <Select
            id="co-template"
            value={form.serviceFeeTemplateId}
            onChange={(event) => set('serviceFeeTemplateId', event.target.value)}
          >
            <option value="">— เลือกเทมเพลตค่าบริการ —</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} ({template.model} · v{template.version})
              </option>
            ))}
          </Select>
        </Field>

        {isEdit && company.serviceFeeTemplateId !== form.serviceFeeTemplateId && (
          <InlineAlert tone="info" title="เปลี่ยนเทมเพลตค่าบริการ">
            เคสที่อนุมัติ (approved) ไปแล้วใช้ตัวเลขที่ snapshot ไว้ที่ตัวเคส — ยอดเดิมไม่เปลี่ยน · เคสที่ยังไม่อนุมัติจะคิดตามเทมเพลตใหม่
          </InlineAlert>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="co-delivery" label="รูปแบบส่งใบกำกับภาษีเริ่มต้น" required error={errors.defaultInvoiceDeliveryFormat}>
            <Select
              id="co-delivery"
              value={form.defaultInvoiceDeliveryFormat}
              onChange={(event) => set('defaultInvoiceDeliveryFormat', event.target.value as InvoiceDeliveryFormat)}
            >
              <option value="paper_pdf">📄 กระดาษ/PDF</option>
              <option value="e_tax_invoice">📧 e-Tax Invoice</option>
            </Select>
          </Field>
          <Field id="co-vat" label="สถานะ VAT ของบริษัท" required>
            <Select
              id="co-vat"
              value={form.vatRegistered ? 'yes' : 'no'}
              onChange={(event) => set('vatRegistered', event.target.value === 'yes')}
            >
              <option value="yes">จด VAT แล้ว</option>
              <option value="no">ไม่จด VAT</option>
            </Select>
          </Field>
          <Field
            id="co-vat-mode"
            label="รูปแบบราคา/VAT"
            required
            error={errors.vatMode}
            hint="ใช้คำนวณ VAT ตอนสร้างรายได้ของบริษัทนี้"
          >
            <Select id="co-vat-mode" value={form.vatMode} onChange={(event) => set('vatMode', event.target.value as VatMode)}>
              {VAT_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            id="co-customer-wht"
            label="ลูกค้าหักภาษี ณ ที่จ่ายก่อนโอน (%)"
            error={errors.whtWithheldByCustomerPct}
            hint="เว้นว่าง = ลูกค้าไม่หัก · ใช้จับคู่ยอดเงินเข้ากับบิล (ยอดรวม − ภาษีที่ลูกค้าหัก)"
          >
            <Input
              id="co-customer-wht"
              numeric
              inputMode="decimal"
              value={form.whtWithheldByCustomerPct}
              onChange={(event) => set('whtWithheldByCustomerPct', event.target.value)}
              placeholder="เว้นว่าง = ไม่หัก"
            />
          </Field>
          <Field id="co-billing-day" label="วันตัดรอบบิล (1-31)" required error={errors.billingDay}>
            <Input
              id="co-billing-day"
              numeric
              inputMode="numeric"
              value={form.billingDay}
              onChange={(event) => set('billingDay', event.target.value)}
            />
          </Field>
          <Field id="co-due-days" label="เครดิตเทอม (วัน)" required error={errors.paymentDueDays}>
            <Input
              id="co-due-days"
              numeric
              inputMode="numeric"
              value={form.paymentDueDays}
              onChange={(event) => set('paymentDueDays', event.target.value)}
            />
          </Field>
        </div>

        {isEdit && company.vatMode !== form.vatMode && (
          <InlineAlert tone="info" title="เปลี่ยนรูปแบบราคา/VAT">
            รายได้ที่สร้างไปแล้วเก็บยอด VAT ไว้ที่ตัวรายการ — ยอดเดิมไม่เปลี่ยน · รูปแบบใหม่ใช้กับรายได้ที่เกิดหลังจากนี้
          </InlineAlert>
        )}

        <Field id="co-reason" label="เหตุผล" required error={errors.reason}>
          <Textarea
            id="co-reason"
            value={form.reason}
            onChange={(event) => set('reason', event.target.value)}
            placeholder="เช่น เพิ่มบริษัทคู่ค้าใหม่ตามสัญญาปี 2569"
          />
        </Field>
      </div>
    </Modal>
  )
}
