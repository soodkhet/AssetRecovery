'use client'

import { useCallback, useEffect, useState } from 'react'
import { Can } from '@/components/auth/permission-provider'
import { MANAGE_INVOICE_NUMBERING, NUMBERING_MODE_LABEL } from '@/components/settings/shared'
import {
  Button,
  Card,
  ErrorState,
  Field,
  InlineAlert,
  Input,
  LoadingState,
  Modal,
  Select,
  StatCard,
  Textarea,
  useToast,
} from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import { toFieldErrors } from '@/lib/api/validation'
import { fmtCount } from '@/lib/format/money'
import type { InvoiceNumberingMode } from '@/lib/generated/prisma/enums'
import { MAX_DIGIT_LENGTH, MIN_DIGIT_LENGTH, previewNextNumber } from '@/lib/settings/numbering'
import { numberingUpdateSchema } from '@/lib/settings/schemas'
import type { NumberingDto } from '@/lib/settings/types'

/**
 * แท็บ "เลขที่ใบกำกับภาษี" (`13` §6.12) — **1 ชุดค่าต่อองค์กร** (อยู่บน `organizations`) ⇒ มีแต่ PATCH
 *
 * ⚠️ `lastNumber` / `lastResetYear` **ห้ามให้แก้มือ** — ระบบเดินให้เองแบบ atomic ตอนออกเอกสาร
 * (ส่งมาใน body = `NUMBERING_SEQ_NOT_EDITABLE`) จึงแสดงเป็นตัวเลขอ่านอย่างเดียว ไม่มีช่องกรอก
 *
 * capability = `manage_invoice_numbering` (ล็อก Superadmin ตาม `25` §16.1) **ไม่ใช่** `manage_settings`
 * · ตัวอย่างเลขถัดไปคำนวณด้วย `previewNextNumber()` (pure module เดียวกับตัวเดินเลขจริง)
 */

interface FormState {
  mode: InvoiceNumberingMode
  prefix: string
  digitLength: string
  reason: string
}

const DIGIT_OPTIONS = Array.from(
  { length: MAX_DIGIT_LENGTH - MIN_DIGIT_LENGTH + 1 },
  (_, index) => MIN_DIGIT_LENGTH + index,
)

export function InvoiceNumberingTab() {
  const { showToast } = useToast()
  const [numbering, setNumbering] = useState<NumberingDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<FormState | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  /** ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** (กฎ `react-hooks/set-state-in-effect`) */
  const fetchNumbering = useCallback(async () => callApi<NumberingDto>('/api/settings/tax-invoice-numbering'), [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchNumbering()
      if (cancelled) return
      if (result.error !== undefined) {
        setError({ title: result.error.title, message: result.error.message })
        setLoading(false)
        return
      }
      setNumbering(result.data ?? null)
      setError(null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchNumbering])

  function openForm(current: NumberingDto): void {
    setForm({
      mode: current.mode,
      prefix: current.prefix,
      digitLength: String(current.digitLength),
      reason: '',
    })
    setErrors({})
    setFormOpen(true)
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => (current === null ? current : { ...current, [key]: value }))
  }

  async function save(): Promise<void> {
    if (form === null) return

    // ไม่ส่ง `lastNumber`/`lastResetYear` เด็ดขาด — route ตรวจก่อน parse แล้วตอบ NUMBERING_SEQ_NOT_EDITABLE
    const parsed = numberingUpdateSchema.safeParse({
      mode: form.mode,
      prefix: form.prefix.trim(),
      digitLength: Number(form.digitLength),
      reason: form.reason.trim(),
    })
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error))
      return
    }

    setErrors({})
    setSaving(true)
    try {
      const result = await callApi<NumberingDto>(
        '/api/settings/tax-invoice-numbering',
        jsonRequest('PATCH', parsed.data),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      setNumbering(result.data ?? null)
      // "เปลี่ยนรูปแบบหลังออกเอกสารไปแล้ว" = เตือน ไม่ block (`13` §6.12) — API ส่งมาใน `warning`
      if (result.warning !== undefined) {
        showToast({ tone: 'warning', title: result.warning.title, description: result.warning.message })
      } else {
        showToast({ tone: 'success', title: 'บันทึกรูปแบบเลขที่ใบกำกับภาษีแล้ว' })
      }
      setFormOpen(false)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <LoadingState message="กำลังโหลดรูปแบบเลขที่ใบกำกับภาษี" />
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
  if (numbering === null) return null

  /**
   * แสดง "ลำดับ" ล่าสุดเป็นตัวเลขล้วน ไม่ประกอบเป็นเลขเอกสารเต็ม — เลขเอกสารของฉบับล่าสุดผูกกับ
   * **ปีที่ออกจริง** ซึ่งอาจไม่ใช่ปีนี้ (โหมด `yearly_reset`) การเดาปีให้จะได้เลขที่ไม่มีอยู่จริง
   */
  const lastIssued =
    numbering.lastNumber === 0
      ? 'ยังไม่เคยออกเอกสาร'
      : `ลำดับที่ ${String(numbering.lastNumber).padStart(numbering.digitLength, '0')}${
          numbering.lastResetYear === null ? '' : ` (ปี ${numbering.lastResetYear})`
        }`

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">เลขที่ใบกำกับภาษี (Tax Invoice Numbering)</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            รูปแบบเลขรันนิ่งของใบกำกับภาษี — ปีในเลขเอกสารเป็น พ.ศ. เสมอ (ไฟล์ 13 §6.12 · 31 §6.2)
          </p>
        </div>
        <Can action="manage" resource={MANAGE_INVOICE_NUMBERING}>
          <Button onClick={() => openForm(numbering)}>แก้ไขการตั้งค่า</Button>
        </Can>
      </div>

      <InlineAlert tone="warning" title="ควรตั้งครั้งแรกแล้วไม่เปลี่ยนอีก">
        เลขที่ใบกำกับภาษีต้องต่อเนื่องตามกฎหมาย — เปลี่ยนรูปแบบหลังออกเอกสารไปแล้วระบบยอมให้ทำได้แต่จะเตือนและบันทึก audit
        พร้อมเหตุผลทุกครั้ง
      </InlineAlert>

      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="รูปแบบ" value={NUMBERING_MODE_LABEL[numbering.mode]} />
        <StatCard
          label="ข้อความนำหน้า"
          value={
            numbering.prefix === '' ? '— ไม่มี —' : <span className="font-mono">{numbering.prefix}</span>
          }
        />
        <StatCard label="ความยาวตัวเลข" value={`${numbering.digitLength} หลัก`} />
        <StatCard label="ออกเอกสารไปแล้ว" value={`${fmtCount(numbering.issuedInvoiceCount)} ฉบับ`} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-[10px] font-bold uppercase text-slate-400">เลขล่าสุดที่ออกไปแล้ว</div>
          <div className="mt-1 font-mono text-sm font-bold text-slate-900">{lastIssued}</div>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-[10px] font-bold uppercase text-emerald-700">ตัวอย่างเลขถัดไป</div>
          <div className="mt-1 font-mono text-sm font-bold text-emerald-900">{numbering.nextNumberPreview}</div>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-slate-400">
        ตัวเดินเลข (<span className="font-mono">last_number</span>) ระบบจัดการให้เองแบบ atomic ตอนออกเอกสาร —{' '}
        <b>แก้มือไม่ได้ทุกกรณี</b> เพื่อกันเลขซ้ำ/เลขขาด (<span className="font-mono">INVOICE_NUMBER_GAP</span>)
      </p>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="แก้ไขรูปแบบเลขที่ใบกำกับภาษี"
        description="ปรับได้เฉพาะรูปแบบ — ตัวเลขล่าสุดที่ออกไปแล้วระบบเดินต่อให้เอง"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              บันทึกรูปแบบ
            </Button>
          </>
        }
      >
        {form !== null && (
          <div className="space-y-4">
            <Field id="numbering-mode" label="รูปแบบการเดินเลข" required error={errors.mode}>
              <Select
                id="numbering-mode"
                value={form.mode}
                onChange={(event) => set('mode', event.target.value as InvoiceNumberingMode)}
              >
                {(Object.keys(NUMBERING_MODE_LABEL) as InvoiceNumberingMode[]).map((value) => (
                  <option key={value} value={value}>
                    {NUMBERING_MODE_LABEL[value]}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                id="numbering-prefix"
                label="ข้อความนำหน้า"
                error={errors.prefix}
                hint="A-Z และ 0-9 เท่านั้น — ระบบใส่ขีดคั่นให้เอง"
              >
                <Input
                  id="numbering-prefix"
                  value={form.prefix}
                  onChange={(event) => set('prefix', event.target.value.toUpperCase())}
                  placeholder="INV"
                />
              </Field>
              <Field id="numbering-digits" label="จำนวนหลักของเลขรันนิ่ง" required error={errors.digitLength}>
                <Select
                  id="numbering-digits"
                  value={form.digitLength}
                  onChange={(event) => set('digitLength', event.target.value)}
                >
                  {DIGIT_OPTIONS.map((value) => (
                    <option key={value} value={String(value)}>
                      {value} หลัก
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-[10px] font-bold uppercase text-slate-400">ตัวอย่างเลขถัดไปตามรูปแบบที่เลือก</div>
              <div className="mt-1 font-mono text-sm font-bold text-slate-900">
                {previewNextNumber(
                  {
                    mode: form.mode,
                    prefix: form.prefix.trim().toUpperCase(),
                    digitLength: Number(form.digitLength),
                    lastNumber: numbering.lastNumber,
                    lastResetYear: numbering.lastResetYear,
                  },
                  new Date(),
                )}
              </div>
            </div>

            <Field id="numbering-reason" label="เหตุผล" required error={errors.reason}>
              <Textarea
                id="numbering-reason"
                value={form.reason}
                onChange={(event) => set('reason', event.target.value)}
                placeholder="เช่น ตั้งรูปแบบเลขที่ใบกำกับภาษีครั้งแรกตามที่สำนักงานบัญชีแนะนำ"
              />
            </Field>

            {numbering.issuedInvoiceCount > 0 && (
              <InlineAlert tone="warning" title="ออกใบกำกับภาษีไปแล้ว">
                ระบบออกเอกสารไปแล้ว {fmtCount(numbering.issuedInvoiceCount)} ฉบับ — เปลี่ยนรูปแบบตอนนี้ทำให้เลขชุดเก่ากับชุดใหม่หน้าตาต่างกัน
                ควรยืนยันกับสำนักงานบัญชีก่อน
              </InlineAlert>
            )}
          </div>
        )}
      </Modal>
    </Card>
  )
}
