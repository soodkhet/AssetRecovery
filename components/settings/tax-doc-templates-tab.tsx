'use client'

import { SettingHelp } from '@/components/settings/setting-help'
import { taxDocTemplateHelp } from '@/lib/settings/help'
import { useCallback, useEffect, useState } from 'react'
import { fetchSamplePdf } from '@/components/accounting/document-samples-view'
import { Can } from '@/components/auth/permission-provider'
import { MANAGE_TAX_PROFILES } from '@/components/settings/shared'
import {
  Button,
  Card,
  ErrorState,
  Field,
  InlineAlert,
  LoadingState,
  Textarea,
  useToast,
} from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import { toFieldErrors } from '@/lib/api/validation'
import { DOCUMENT_SAMPLES_CAPABILITY } from '@/lib/documents/samples/catalog'
import { fmtDate } from '@/lib/format/datetime'
import type { TemplateDocumentType } from '@/lib/generated/prisma/enums'
import { taxDocTemplateUpdateSchema } from '@/lib/settings/schemas'
import { MAX_FOOTER_NOTE_LENGTH } from '@/lib/settings/tax-doc-template'
import type { TaxDocTemplateDto } from '@/lib/settings/types'

/**
 * แท็บ "เทมเพลตเอกสาร" (`13` §6.13 · มติ PO U122 · mockup `settings.html` `renderSettingsTaxDoc`)
 * — 1 การ์ดต่อชนิดเอกสาร (ใบแจ้งหนี้ · ใบเสร็จ/ใบกำกับภาษี · ใบส่งมอบทรัพย์)
 *
 * ตั้งได้เฉพาะค่าที่**ต่างกันตามชนิด**: ข้อความท้ายเอกสาร + เปิด/ปิดพิมพ์รูปลายเซ็น — โลโก้/ข้อมูลบริษัท/รูปลายเซ็น
 * อยู่ที่ "ข้อมูลองค์กร" · แบบเอกสาร A4 ภาษาไทยตายตัว · 50 ทวิ ใช้แบบทางการ (ไม่มีการ์ด)
 * · "ดูตัวอย่าง PDF" ใช้ระบบตัวอย่างเอกสารตัวเดียวกับเมนูบัญชี (ค่าที่บันทึกแล้ว)
 * · 1 record ต่อ (องค์กร, ชนิดเอกสาร) ⇒ PATCH เป็น upsert · capability แก้ = `manage_tax_profiles` (ตรงกับ route)
 */

interface TemplatesPayload {
  templates: TaxDocTemplateDto[]
  hasSignature: boolean
  legallyRequiredFields: string[]
}

interface FormState {
  footerNote: string
  printSignature: boolean
  reason: string
}

function formOf(template: TaxDocTemplateDto): FormState {
  return { footerNote: template.footerNote ?? '', printSignature: template.printSignature, reason: '' }
}

export function TaxDocTemplatesTab() {
  const { showToast } = useToast()
  const [payload, setPayload] = useState<TemplatesPayload | null>(null)
  const [forms, setForms] = useState<Record<string, FormState>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  // ปุ่ม "ลองใหม่" บน ErrorState — เพิ่มตัวนับให้ effect โหลดซ้ำ (R3-027)
  const [retryKey, setRetryKey] = useState(0)
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({})
  const [savingType, setSavingType] = useState<TemplateDocumentType | null>(null)
  const [previewType, setPreviewType] = useState<TemplateDocumentType | null>(null)

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
  }, [fetchTemplates, retryKey])

  function set<K extends keyof FormState>(documentType: TemplateDocumentType, key: K, value: FormState[K]): void {
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
      footerNote: form.footerNote.trim(),
      printSignature: form.printSignature,
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
                templates: current.templates.map((item) => (item.documentType === saved.documentType ? saved : item)),
              },
        )
        setForms((current) => ({ ...current, [saved.documentType]: formOf(saved) }))
      }
      showToast({
        tone: 'success',
        title: 'บันทึกเทมเพลตแล้ว',
        description: `${template.documentTypeLabel} — มีผลกับเอกสารที่ออกหลังจากนี้`,
      })
    } finally {
      setSavingType(null)
    }
  }

  /** เปิด PDF ตัวอย่าง (ค่าที่บันทึกแล้ว) ในแท็บใหม่ — เปิดหน้าต่างก่อนรอผล กันเบราว์เซอร์บล็อกป๊อปอัป */
  async function preview(template: TaxDocTemplateDto): Promise<void> {
    const opened = window.open('', '_blank')
    setPreviewType(template.documentType)
    try {
      const result = await fetchSamplePdf(template.sampleType)
      if ('error' in result) {
        opened?.close()
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      const url = URL.createObjectURL(result.blob)
      if (opened === null) window.location.assign(url)
      else opened.location.href = url
      // ให้แท็บใหม่โหลดเสร็จก่อนคืนหน่วยความจำ
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } finally {
      setPreviewType(null)
    }
  }

  const retryLoad = () => {
    setError(null)
    setLoading(true)
    setRetryKey((key) => key + 1)
  }

  if (loading) {
    return (
      <Card>
        <LoadingState message="กำลังโหลดเทมเพลตเอกสาร" />
      </Card>
    )
  }
  if (error !== null) {
    return (
      <Card>
        <ErrorState title={error.title} message={error.message} onRetry={retryLoad} />
      </Card>
    )
  }
  if (payload === null) return null

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-sm font-bold text-slate-900">เทมเพลตเอกสาร (Document Template)</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          ค่าที่ต่างกันตามชนิดเอกสาร — โลโก้ ข้อมูลบริษัท และรูปลายเซ็นผู้มีอำนาจ ตั้งที่ ตั้งค่าทั่วไป → ข้อมูลองค์กร
        </p>
        <SettingHelp className="mt-3" help={taxDocTemplateHelp()} />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
                  id={`footer-${template.documentType}`}
                  label="ข้อความท้ายเอกสาร"
                  error={fieldErrors.footerNote}
                  hint={`พิมพ์เหนือช่องลายเซ็น · เว้นว่าง = ไม่พิมพ์ · ไม่เกิน ${MAX_FOOTER_NOTE_LENGTH} ตัวอักษร`}
                >
                  <Textarea
                    id={`footer-${template.documentType}`}
                    value={form.footerNote}
                    maxLength={MAX_FOOTER_NOTE_LENGTH}
                    onChange={(event) => set(template.documentType, 'footerNote', event.target.value)}
                    placeholder="เช่น เงื่อนไขการชำระเงิน หรือข้อความขอบคุณ"
                  />
                </Field>

                <label className="flex items-start gap-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.printSignature}
                    onChange={(event) => set(template.documentType, 'printSignature', event.target.checked)}
                    className="focus-ring mt-0.5 h-4 w-4 rounded border-slate-300"
                  />
                  <span>
                    พิมพ์รูปลายเซ็นผู้มีอำนาจ ในช่อง &quot;{template.signatureSlotLabel}&quot;
                    <span className="mt-0.5 block text-[11px] font-normal text-slate-400">
                      {payload.hasSignature
                        ? 'มีรูปลายเซ็นในข้อมูลองค์กรแล้ว'
                        : 'ยังไม่ได้อัปโหลดรูปลายเซ็นในข้อมูลองค์กร — เอกสารจะเว้นช่องให้เซ็นมือ'}
                    </span>
                  </span>
                </label>

                <Field id={`reason-${template.documentType}`} label="เหตุผล" required error={fieldErrors.reason}>
                  <Textarea
                    id={`reason-${template.documentType}`}
                    value={form.reason}
                    onChange={(event) => set(template.documentType, 'reason', event.target.value)}
                    placeholder="เช่น เพิ่มเงื่อนไขการชำระเงินตามที่ฝ่ายบริหารอนุมัติ"
                  />
                </Field>

                <div className="flex items-center justify-between gap-2">
                  <Can action="view" resource={DOCUMENT_SAMPLES_CAPABILITY}>
                    <button
                      type="button"
                      onClick={() => void preview(template)}
                      disabled={previewType === template.documentType}
                      className="text-xs font-semibold text-blue-600 hover:underline disabled:opacity-50"
                      title="เปิดตัวอย่างตามค่าที่บันทึกแล้ว"
                    >
                      {previewType === template.documentType ? 'กำลังเปิดตัวอย่าง…' : 'ดูตัวอย่าง PDF'}
                    </button>
                  </Can>
                  <Can action="manage" resource={MANAGE_TAX_PROFILES}>
                    <Button onClick={() => void save(template)} loading={savingType === template.documentType}>
                      บันทึกเทมเพลต
                    </Button>
                  </Can>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <Card>
        <InlineAlert tone="warning" title="ฟิลด์บังคับตามกฎหมายปิดหรือซ่อนไม่ได้">
          เอกสารทุกฉบับต้องมีรายการต่อไปนี้เสมอ ไม่มีสวิตช์ปิดในระบบ · แบบเอกสารเป็น A4 ภาษาไทย · หนังสือรับรองหัก ณ
          ที่จ่าย (50 ทวิ) ใช้แบบฟอร์มทางการ ไม่มีค่าตั้ง · ค่าที่ตั้งถูกบันทึกลงเอกสารตอนออก แก้ภายหลังเอกสารเดิมไม่เปลี่ยน
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
