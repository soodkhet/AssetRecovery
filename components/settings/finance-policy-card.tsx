'use client'

import { useCallback, useEffect, useState } from 'react'
import { Can } from '@/components/auth/permission-provider'
import { MANAGE_SETTINGS } from '@/components/settings/shared'
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  InlineAlert,
  Input,
  LoadingState,
  Textarea,
  useToast,
} from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import { toFieldErrors } from '@/lib/api/validation'
import { fmtDate } from '@/lib/format/datetime'
import { parseBahtInput, toBahtInput } from '@/lib/format/money'
import { MAX_AGING_BUCKETS, MIN_AGING_BUCKETS, describeAgingBuckets } from '@/lib/settings/finance-policy'
import { financePolicyUpdateSchema } from '@/lib/settings/schemas'
import type { FinancePolicyDto } from '@/lib/settings/types'

/**
 * นโยบายการเงินระดับองค์กร (`13` §6.2.1) — **1 record ต่อองค์กร** ⇒ มีแต่ PATCH ไม่มี create/delete
 *
 * ช่องเงินกรอกเป็น **บาท** แล้วแปลงด้วย `parseBahtInput()` — ห้ามคูณ/หาร 100 เองในหน้าจอ (Rule 01)
 */

interface FormState {
  advanceMaxAmountPerRequest: string
  requirePayeeIdDocument: boolean
  arAgingBuckets: string[]
  writeOffTolerance: string
  advanceUnclearedToEmployeeReceivable: boolean
  reason: string
}

function formOf(policy: FinancePolicyDto): FormState {
  return {
    advanceMaxAmountPerRequest: toBahtInput(policy.advanceMaxAmountPerRequestSatang),
    requirePayeeIdDocument: policy.requirePayeeIdDocument,
    arAgingBuckets: policy.arAgingBuckets.map((days) => String(days)),
    writeOffTolerance: toBahtInput(policy.writeOffToleranceSatang),
    advanceUnclearedToEmployeeReceivable: policy.advanceUnclearedToEmployeeReceivable,
    reason: '',
  }
}

export function FinancePolicyCard() {
  const { showToast } = useToast()
  const [policy, setPolicy] = useState<FinancePolicyDto | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  /** ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** (กฎ `react-hooks/set-state-in-effect`) */
  const fetchPolicy = useCallback(async () => callApi<FinancePolicyDto>('/api/settings/finance-policy'), [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchPolicy()
      if (cancelled) return
      if (result.error !== undefined) {
        setError({ title: result.error.title, message: result.error.message })
        setLoading(false)
        return
      }
      if (result.data !== undefined) {
        setPolicy(result.data)
        setForm(formOf(result.data))
      }
      setError(null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchPolicy])

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => (current === null ? current : { ...current, [key]: value }))
  }

  function setBucket(index: number, value: string): void {
    setForm((current) => {
      if (current === null) return current
      const buckets = [...current.arAgingBuckets]
      buckets[index] = value.replace(/\D/g, '')
      return { ...current, arAgingBuckets: buckets }
    })
  }

  function addBucket(): void {
    setForm((current) =>
      current === null || current.arAgingBuckets.length >= MAX_AGING_BUCKETS
        ? current
        : { ...current, arAgingBuckets: [...current.arAgingBuckets, ''] },
    )
  }

  function removeBucket(index: number): void {
    setForm((current) =>
      current === null || current.arAgingBuckets.length <= MIN_AGING_BUCKETS
        ? current
        : { ...current, arAgingBuckets: current.arAgingBuckets.filter((_, position) => position !== index) },
    )
  }

  async function save(): Promise<void> {
    if (form === null) return

    const parsed = financePolicyUpdateSchema.safeParse({
      advanceMaxAmountPerRequestSatang: parseBahtInput(form.advanceMaxAmountPerRequest),
      requirePayeeIdDocument: form.requirePayeeIdDocument,
      arAgingBuckets: form.arAgingBuckets.filter((value) => value.trim() !== '').map((value) => Number(value)),
      writeOffToleranceSatang: parseBahtInput(form.writeOffTolerance) ?? 0,
      advanceUnclearedToEmployeeReceivable: form.advanceUnclearedToEmployeeReceivable,
      reason: form.reason.trim(),
    })
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error))
      return
    }

    setErrors({})
    setSaving(true)
    try {
      const result = await callApi<FinancePolicyDto>('/api/settings/finance-policy', jsonRequest('PATCH', parsed.data))
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      if (result.data !== undefined) {
        setPolicy(result.data)
        setForm(formOf(result.data))
      }
      showToast({ tone: 'success', title: 'บันทึกนโยบายการเงินแล้ว' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Card><LoadingState message="กำลังโหลดนโยบายการเงิน" /></Card>
  if (error !== null) return <Card><ErrorState title={error.title} message={error.message} /></Card>
  if (form === null || policy === null) return null

  const bucketPreview = describeAgingBuckets(
    form.arAgingBuckets.filter((value) => value.trim() !== '').map((value) => Number(value)),
  )

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">นโยบายการเงินระดับองค์กร</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            ค่ากลางที่ใช้ทั้งระบบ — เพดานเงินทดรอง เอกสารผู้รับเงิน ช่วงอายุหนี้ และเพดานตัดส่วนต่าง (ไฟล์ 13 §6.2.1)
          </p>
        </div>
        <div className="text-[10px] text-slate-400">
          {policy.updatedAt === null ? 'ยังไม่เคยตั้งค่า (แสดงค่าเริ่มต้นของระบบ)' : `แก้ไขล่าสุด ${fmtDate(policy.updatedAt)}`}
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id="policy-advance-max"
            label="เพดานเงินทดรองจ่ายต่อครั้ง (บาท)"
            error={errors.advanceMaxAmountPerRequestSatang}
          >
            <Input
              id="policy-advance-max"
              numeric
              inputMode="decimal"
              value={form.advanceMaxAmountPerRequest}
              onChange={(event) => set('advanceMaxAmountPerRequest', event.target.value)}
              placeholder="เว้นว่าง = ไม่จำกัด"
            />
          </Field>

          <Field id="policy-writeoff" label="เพดานตัดส่วนต่างค่าธรรมเนียม (บาท)" required error={errors.writeOffToleranceSatang}>
            <Input
              id="policy-writeoff"
              numeric
              inputMode="decimal"
              value={form.writeOffTolerance}
              onChange={(event) => set('writeOffTolerance', event.target.value)}
              placeholder="50.00"
            />
          </Field>
        </div>

        <Field id="policy-aging" label={`ช่วงอายุหนี้ AR (วัน — ${MIN_AGING_BUCKETS}-${MAX_AGING_BUCKETS} ช่วง)`} required error={errors.arAgingBuckets}>
          <div id="policy-aging" className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {form.arAgingBuckets.map((value, index) => (
                <div key={index} className="flex items-center gap-1">
                  <div className="w-24">
                    <Input
                      aria-label={`ช่วงอายุหนี้ที่ ${index + 1}`}
                      numeric
                      inputMode="numeric"
                      value={value}
                      onChange={(event) => setBucket(index, event.target.value)}
                      placeholder="30"
                    />
                  </div>
                  {form.arAgingBuckets.length > MIN_AGING_BUCKETS && (
                    <button
                      type="button"
                      onClick={() => removeBucket(index)}
                      aria-label={`ลบช่วงอายุหนี้ที่ ${index + 1}`}
                      className="focus-ring rounded-md px-1.5 py-1 text-xs text-slate-400 hover:text-red-600"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {form.arAgingBuckets.length < MAX_AGING_BUCKETS && (
                <Button variant="secondary" onClick={addBucket}>
                  + เพิ่มช่วง
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {bucketPreview.map((label) => (
                <Badge key={label} className="bg-slate-100 text-slate-600">
                  {label}
                </Badge>
              ))}
            </div>
          </div>
        </Field>

        <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={form.requirePayeeIdDocument}
              onChange={(event) => set('requirePayeeIdDocument', event.target.checked)}
              className="focus-ring h-4 w-4 rounded border-slate-300"
            />
            บังคับแนบเอกสารยืนยันตัวตนผู้รับเงินก่อนอนุมัติจ่าย
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={form.advanceUnclearedToEmployeeReceivable}
              onChange={(event) => set('advanceUnclearedToEmployeeReceivable', event.target.checked)}
              className="focus-ring h-4 w-4 rounded border-slate-300"
            />
            เงินทดรองที่ยังไม่เคลียร์ให้ตั้งเป็นลูกหนี้พนักงาน
          </label>
        </div>

        <Field id="policy-reason" label="เหตุผล" required error={errors.reason}>
          <Textarea
            id="policy-reason"
            value={form.reason}
            onChange={(event) => set('reason', event.target.value)}
            placeholder="เช่น ปรับเพดานเงินทดรองตามมติที่ประชุมการเงิน 14/08/2569"
          />
        </Field>

        <InlineAlert tone="warning" title="ค่าเหล่านี้กระทบตัวเลขทั้งระบบ">
          เปลี่ยนแล้วมีผลกับรายการใหม่เท่านั้น — เอกสารและงวดที่ปิดไปแล้วยังอ้างค่าที่ snapshot ไว้เสมอ (ไฟล์ 92 §7.1)
        </InlineAlert>

        <Can action="manage" resource={MANAGE_SETTINGS}>
          <div className="flex justify-end">
            <Button onClick={() => void save()} loading={saving}>
              บันทึกนโยบายการเงิน
            </Button>
          </div>
        </Can>
      </div>
    </Card>
  )
}
