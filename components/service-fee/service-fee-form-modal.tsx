'use client'

import { useState } from 'react'
import { Button, Field, InlineAlert, Input, Modal, Select, Textarea, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import { serviceFeeTemplateCreateSchema } from '@/lib/service-fee/schemas'
import {
  SERVICE_FEE_BASIS_LABEL,
  SERVICE_FEE_MODEL_LABEL,
  type ServiceFeeBasis,
  type ServiceFeeModel,
} from '@/lib/service-fee/template'
import type { ServiceFeeTemplateListDto } from '@/lib/service-fee/types'
import { parseBahtInput, toBahtInput } from '@/lib/format/money'

/**
 * ฟอร์มสร้าง/แก้ไขเทมเพลตค่าบริการ — โครงตาม mockup `settings.html` (modal `create-sf`/`edit-sf`)
 *
 * เลือก model ก่อน → แสดงเฉพาะฟิลด์ที่ model นั้นใช้ (`12` §8 — ซ่อนที่เหลือกัน confusion)
 * ค่าที่ซ่อนถูกส่งเป็น 0/null จริง ไม่ใช่แค่ไม่แสดง (`12` §7.1) · validation ใช้ Zod ตัวเดียวกับ API
 */

interface FormState {
  name: string
  model: ServiceFeeModel
  base: string
  ratePct: string
  basis: ServiceFeeBasis
  chargeOnFail: boolean
  chargePerTrackingRound: boolean
  reason: string
}

function emptyForm(): FormState {
  return {
    name: '',
    model: 'SUCCESS_FEE',
    base: '',
    ratePct: '',
    basis: 'debt_amount',
    chargeOnFail: false,
    chargePerTrackingRound: true,
    reason: '',
  }
}

function formOf(template: ServiceFeeTemplateListDto): FormState {
  return {
    name: template.name,
    model: template.model,
    base: toBahtInput(template.baseSatang),
    ratePct: String(template.ratePct),
    basis: template.basis ?? 'debt_amount',
    chargeOnFail: template.chargeOnFail,
    chargePerTrackingRound: template.chargePerTrackingRound,
    reason: '',
  }
}

/** ฟิลด์ที่ model ไม่ได้ใช้ต้องเป็น 0 / null จริง (`12` §7.1) ไม่ใช่ค่าค้างจากตอนสลับ model */
function payloadOf(form: FormState): Record<string, unknown> {
  const usesBase = form.model === 'FLAT' || form.model === 'HYBRID'
  const usesRate = form.model === 'SUCCESS_FEE' || form.model === 'HYBRID'
  return {
    name: form.name.trim(),
    model: form.model,
    baseSatang: usesBase ? (parseBahtInput(form.base) ?? 0) : 0,
    ratePct: usesRate ? Number(form.ratePct === '' ? Number.NaN : form.ratePct) : 0,
    basis: usesRate ? form.basis : null,
    chargeOnFail: usesBase && form.chargeOnFail,
    chargePerTrackingRound: form.chargePerTrackingRound,
    reason: form.reason.trim(),
  }
}

export function ServiceFeeFormModal({
  open,
  template,
  onClose,
  onSaved,
}: {
  open: boolean
  /** null = สร้างใหม่ */
  template: ServiceFeeTemplateListDto | null
  onClose: () => void
  onSaved: () => void
}) {
  const { showToast } = useToast()
  const [form, setForm] = useState<FormState>(template === null ? emptyForm() : formOf(template))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const isEdit = template !== null
  const usesBase = form.model === 'FLAT' || form.model === 'HYBRID'
  const usesRate = form.model === 'SUCCESS_FEE' || form.model === 'HYBRID'

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function save(): Promise<void> {
    const parsed = serviceFeeTemplateCreateSchema.safeParse(payloadOf(form))
    if (!parsed.success) {
      const fields: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.') || '_'
        if (fields[path] === undefined) fields[path] = issue.message
      }
      setErrors(fields)
      return
    }

    setErrors({})
    setSaving(true)
    try {
      const result = await callApi<ServiceFeeTemplateListDto>(
        isEdit ? `/api/service-fee-templates/${template.id}` : '/api/service-fee-templates',
        jsonRequest(isEdit ? 'PATCH' : 'POST', parsed.data),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }

      showToast({
        tone: 'success',
        title: isEdit ? 'บันทึกเป็นเวอร์ชันใหม่แล้ว' : 'สร้างเทมเพลตค่าบริการแล้ว',
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
      title={isEdit ? `แก้ไขเทมเพลตค่าบริการ — ${template.name}` : 'สร้างเทมเพลตค่าบริการ'}
      description={
        isEdit
          ? `บันทึกแล้วระบบจะสร้างเวอร์ชัน ${template.version + 1} ใหม่ ไม่ทับของเดิม (ไฟล์ 12 §9)`
          : 'ฐานคำนวณรายได้ที่เรียกเก็บจากบริษัทไฟแนนซ์ — ตรงข้ามกับแผนค่าตอบแทน (จ่ายออก)'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button onClick={() => void save()} loading={saving}>
            {isEdit ? 'บันทึกเป็นเวอร์ชันใหม่' : 'สร้างเทมเพลต'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {isEdit && template.companyCount > 0 && (
          <InlineAlert tone="warning" title={`มี ${template.companyCount} บริษัทผูกอยู่กับเทมเพลตนี้`}>
            บริษัททั้งหมดถูกย้ายมาใช้เวอร์ชันใหม่ทันที — เคสที่อนุมัติแล้วใช้ snapshot เดิม ไม่กระทบ (ไฟล์ 12 §9)
          </InlineAlert>
        )}

        <Field id="sf-name" label="ชื่อเทมเพลตค่าบริการ" required error={errors.name}>
          <Input
            id="sf-name"
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
            placeholder='เช่น "Standard Success Fee 10%"'
          />
        </Field>

        <Field id="sf-model" label="โมเดลเก็บเงิน (Pricing Model)" required error={errors.model}>
          <Select
            id="sf-model"
            value={form.model}
            onChange={(event) => set('model', event.target.value as ServiceFeeModel)}
          >
            {(Object.keys(SERVICE_FEE_MODEL_LABEL) as ServiceFeeModel[]).map((model) => (
              <option key={model} value={model}>
                {SERVICE_FEE_MODEL_LABEL[model]}
              </option>
            ))}
          </Select>
        </Field>

        {usesBase && (
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <Field id="sf-base" label="ค่าดำเนินการคงที่ (Base Fee) — บาท" required error={errors.baseSatang}>
              <Input
                id="sf-base"
                numeric
                inputMode="decimal"
                value={form.base}
                onChange={(event) => set('base', event.target.value)}
                placeholder="3,000.00"
              />
            </Field>

            <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={form.chargeOnFail}
                onChange={(event) => set('chargeOnFail', event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              เรียกเก็บค่าเปิดเคสแม้เคสไม่สำเร็จ (`charge_on_fail`)
            </label>
          </div>
        )}

        {usesRate && (
          <div className="grid grid-cols-1 gap-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 sm:grid-cols-2">
            <Field id="sf-rate" label="อัตราความสำเร็จ (%)" required error={errors.ratePct}>
              <Input
                id="sf-rate"
                numeric
                inputMode="decimal"
                value={form.ratePct}
                onChange={(event) => set('ratePct', event.target.value)}
                placeholder="10"
              />
            </Field>

            <Field id="sf-basis" label="ฐานคำนวณ" required error={errors.basis}>
              <Select
                id="sf-basis"
                value={form.basis}
                onChange={(event) => set('basis', event.target.value as ServiceFeeBasis)}
              >
                {(Object.keys(SERVICE_FEE_BASIS_LABEL) as ServiceFeeBasis[]).map((basis) => (
                  <option key={basis} value={basis}>
                    {SERVICE_FEE_BASIS_LABEL[basis]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
          <input
            type="checkbox"
            checked={form.chargePerTrackingRound}
            onChange={(event) => set('chargePerTrackingRound', event.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          คิดค่าบริการต่อรอบการติดตาม (แต่ละรอบอิสระ — มติ PO 2026-08-12 ข้อ A3)
        </label>

        <Field id="sf-reason" label="เหตุผล" required hint="บันทึกลง audit log ถาวร (ไฟล์ 12 §13 — กระทบรายได้)" error={errors.reason}>
          <Textarea
            id="sf-reason"
            value={form.reason}
            onChange={(event) => set('reason', event.target.value)}
            placeholder="เช่น ปรับอัตราตามสัญญาฉบับใหม่กับบริษัทไฟแนนซ์"
          />
        </Field>
      </div>
    </Modal>
  )
}
