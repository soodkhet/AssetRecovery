'use client'

import { useCallback, useEffect, useState } from 'react'
import { Can } from '@/components/auth/permission-provider'
import {
  MANAGE_TAX_PROFILES,
  TAX_DOC_LANGUAGE_LABEL,
  TAX_DOC_PAPER_SIZE_LABEL,
} from '@/components/settings/shared'
import {
  Button,
  Card,
  ErrorState,
  Field,
  InlineAlert,
  Input,
  LoadingState,
  Select,
  Textarea,
  useToast,
} from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import { toFieldErrors } from '@/lib/api/validation'
import { fmtDate } from '@/lib/format/datetime'
import type { TaxDocLanguage, TaxDocPaperSize, TaxDocumentType } from '@/lib/generated/prisma/enums'
import { taxDocTemplateUpdateSchema } from '@/lib/settings/schemas'
import type { TaxDocTemplateDto } from '@/lib/settings/types'

/**
 * แท็บ "เทมเพลตเอกสารภาษี" (`13` §6.13) — 1 การ์ดต่อชนิดเอกสาร (ใบกำกับภาษี / 50 ทวิ)
 *
 * ปรับได้แค่ **ภาพลักษณ์** — ฟิลด์บังคับตามกฎหมาย (`28` §6.2–6.3) ปิดหรือซ่อนไม่ได้ จึงแสดงรายการนั้น
 * ไว้ให้เห็นชัดว่าไม่มีสวิตช์ปิด · 1 record ต่อ (องค์กร, ชนิดเอกสาร) ⇒ PATCH เป็น upsert ไม่มี POST/DELETE
 *
 * capability = `manage_tax_profiles` (ตรงกับที่ route ใช้) **ไม่ใช่** `manage_settings`
 */

interface TemplatesPayload {
  templates: TaxDocTemplateDto[]
  legallyRequiredFields: string[]
}

interface FormState {
  logoUrl: string
  footerNote: string
  signatureImageUrl: string
  paperSize: TaxDocPaperSize
  language: TaxDocLanguage
  reason: string
}

function formOf(template: TaxDocTemplateDto): FormState {
  return {
    logoUrl: template.logoUrl ?? '',
    footerNote: template.footerNote ?? '',
    signatureImageUrl: template.signatureImageUrl ?? '',
    paperSize: template.paperSize,
    language: template.language,
    reason: '',
  }
}

export function TaxDocTemplatesTab() {
  const { showToast } = useToast()
  const [payload, setPayload] = useState<TemplatesPayload | null>(null)
  const [forms, setForms] = useState<Record<string, FormState>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({})
  const [savingType, setSavingType] = useState<TaxDocumentType | null>(null)

  /** ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** (กฎ `react-hooks/set-state-in-effect`) */
  const fetchTemplates = useCallback(
    async () => callApi<TemplatesPayload>('/api/settings/tax-document-templates'),
    [],
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchTemplates()
      if (cancelled) return
      if (result.error !== undefined) {
        setError({ title: result.error.title, message: result.error.message })
        setLoading(false)
        return
      }
      if (result.data !== undefined) {
        setPayload(result.data)
        setForms(Object.fromEntries(result.data.templates.map((item) => [item.documentType, formOf(item)])))
      }
      setError(null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchTemplates])

  function set<K extends keyof FormState>(documentType: TaxDocumentType, key: K, value: FormState[K]): void {
    setForms((current) => {
      const form = current[documentType]
      if (form === undefined) return current
      return { ...current, [documentType]: { ...form, [key]: value } }
    })
  }

  async function save(template: TaxDocTemplateDto): Promise<void> {
    const form = forms[template.documentType]
    if (form === undefined) return

    const parsed = taxDocTemplateUpdateSchema.safeParse({
      documentType: template.documentType,
      logoUrl: form.logoUrl.trim(),
      footerNote: form.footerNote.trim(),
      signatureImageUrl: form.signatureImageUrl.trim(),
      paperSize: form.paperSize,
      language: form.language,
      reason: form.reason.trim(),
    })
    if (!parsed.success) {
      setErrors((current) => ({ ...current, [template.documentType]: toFieldErrors(parsed.error) }))
      return
    }

    setErrors((current) => ({ ...current, [template.documentType]: {} }))
    setSavingType(template.documentType)
    try {
      const result = await callApi<TaxDocTemplateDto>(
        '/api/settings/tax-document-templates',
        jsonRequest('PATCH', parsed.data),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      const saved = result.data
      if (saved !== undefined) {
        setPayload((current) =>
          current === null
            ? current
            : {
                ...current,
                templates: current.templates.map((item) =>
                  item.documentType === saved.documentType ? saved : item,
                ),
              },
        )
        setForms((current) => ({ ...current, [saved.documentType]: formOf(saved) }))
      }
      showToast({ tone: 'success', title: 'บันทึกเทมเพลตแล้ว', description: template.documentTypeLabel })
    } finally {
      setSavingType(null)
    }
  }

  if (loading) {
    return (
      <Card>
        <LoadingState message="กำลังโหลดเทมเพลตเอกสารภาษี" />
      </Card>
    )
  }
  if (error !== null) {
    return (
      <Card>
        <ErrorState title={error.title} message={error.message} />
      </Card>
    )
  }
  if (payload === null) return null

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-sm font-bold text-slate-900">เทมเพลตเอกสารภาษี (Tax Document Template)</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          ปรับหน้าตาเอกสารภาษีทางการที่ระบบออกให้ — ใบกำกับภาษี (ไฟล์ 31) และหนังสือรับรองหัก ณ ที่จ่าย 50 ทวิ (ไฟล์ 33)
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {payload.templates.map((template) => {
          const form = forms[template.documentType]
          const fieldErrors = errors[template.documentType] ?? {}
          if (form === undefined) return null

          return (
            <Card key={template.documentType}>
              <div className="mb-4 flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-800">{template.documentTypeLabel}</h3>
                <span className="text-[10px] text-slate-400">
                  {template.updatedAt === null ? 'ยังไม่เคยตั้งค่า' : `แก้ไขล่าสุด ${fmtDate(template.updatedAt)}`}
                </span>
              </div>

              <div className="space-y-4">
                <Field
                  id={`logo-${template.documentType}`}
                  label="ลิงก์โลโก้บริษัท"
                  error={fieldErrors.logoUrl}
                  hint="เว้นว่าง = ไม่แสดงโลโก้บนเอกสาร"
                >
                  <Input
                    id={`logo-${template.documentType}`}
                    value={form.logoUrl}
                    onChange={(event) => set(template.documentType, 'logoUrl', event.target.value)}
                    placeholder="https://…/logo-company.png"
                  />
                </Field>

                <Field
                  id={`signature-${template.documentType}`}
                  label="ลิงก์รูปลายเซ็นผู้มีอำนาจ"
                  error={fieldErrors.signatureImageUrl}
                  hint="เว้นว่าง = เว้นที่ให้เซ็นสด"
                >
                  <Input
                    id={`signature-${template.documentType}`}
                    value={form.signatureImageUrl}
                    onChange={(event) => set(template.documentType, 'signatureImageUrl', event.target.value)}
                    placeholder="https://…/signature.png"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field id={`paper-${template.documentType}`} label="ขนาดกระดาษ" required error={fieldErrors.paperSize}>
                    <Select
                      id={`paper-${template.documentType}`}
                      value={form.paperSize}
                      onChange={(event) =>
                        set(template.documentType, 'paperSize', event.target.value as TaxDocPaperSize)
                      }
                    >
                      {(Object.keys(TAX_DOC_PAPER_SIZE_LABEL) as TaxDocPaperSize[]).map((value) => (
                        <option key={value} value={value}>
                          {TAX_DOC_PAPER_SIZE_LABEL[value]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field id={`language-${template.documentType}`} label="ภาษา" required error={fieldErrors.language}>
                    <Select
                      id={`language-${template.documentType}`}
                      value={form.language}
                      onChange={(event) =>
                        set(template.documentType, 'language', event.target.value as TaxDocLanguage)
                      }
                    >
                      {(Object.keys(TAX_DOC_LANGUAGE_LABEL) as TaxDocLanguage[]).map((value) => (
                        <option key={value} value={value}>
                          {TAX_DOC_LANGUAGE_LABEL[value]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <Field
                  id={`footer-${template.documentType}`}
                  label="ข้อความท้ายเอกสาร (Footer)"
                  error={fieldErrors.footerNote}
                >
                  <Textarea
                    id={`footer-${template.documentType}`}
                    value={form.footerNote}
                    onChange={(event) => set(template.documentType, 'footerNote', event.target.value)}
                    placeholder="เช่น เงื่อนไขการชำระเงิน หรือข้อความขอบคุณ"
                  />
                </Field>

                <Field id={`reason-${template.documentType}`} label="เหตุผล" required error={fieldErrors.reason}>
                  <Textarea
                    id={`reason-${template.documentType}`}
                    value={form.reason}
                    onChange={(event) => set(template.documentType, 'reason', event.target.value)}
                    placeholder="เช่น เปลี่ยนโลโก้บริษัทตามที่ฝ่ายบริหารอนุมัติ"
                  />
                </Field>

                <Can action="manage" resource={MANAGE_TAX_PROFILES}>
                  <div className="flex justify-end">
                    <Button onClick={() => void save(template)} loading={savingType === template.documentType}>
                      บันทึกเทมเพลต
                    </Button>
                  </div>
                </Can>
              </div>
            </Card>
          )
        })}
      </div>

      <Card>
        <InlineAlert tone="warning" title="ฟิลด์บังคับตามกฎหมายปิดหรือซ่อนไม่ได้">
          เอกสารทุกฉบับต้องมีรายการต่อไปนี้เสมอ ไม่มีสวิตช์ปิดในระบบ (ไฟล์ 28 §6.2–6.3):
        </InlineAlert>
        <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {payload.legallyRequiredFields.map((field) => (
            <li key={field} className="flex items-start gap-1.5 text-xs text-slate-600">
              <span className="text-emerald-600">✓</span>
              {field}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
