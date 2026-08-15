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
import { slaPolicyUpdateSchema } from '@/lib/settings/schemas'
import {
  DEFAULT_SLA_ALERT_HOURS,
  MAX_SLA_ALERT_HOURS,
  MIN_SLA_ALERT_HOURS,
  describeSlaThreshold,
} from '@/lib/settings/sla-policy'
import type { SlaPolicyDto } from '@/lib/settings/types'

/**
 * แท็บ "เกณฑ์ SLA งานติดตาม" (`13` §6.14 — มติ PO 15/08/2569 · D18) — **1 record ต่อองค์กร**
 * ⇒ มีแต่ PATCH ไม่มี create/delete (โครงเดียวกับ `<FinancePolicyCard>` ของ §6.2.1)
 *
 * ค่านี้ถูกใช้โดย **รายงาน O2/O4 เท่านั้น** — เปลี่ยนแล้วรายงานรอบถัดไปเปลี่ยนตามทันที
 * (แคชรายชั่วโมงของ `96` §8 ⇒ อาจเห็นตัวเลขเดิมได้ไม่เกิน 1 ชั่วโมง หรือกดรีเฟรชที่หน้ารายงาน)
 */

interface FormState {
  slaAlertHours: string
  reason: string
}

function formOf(policy: SlaPolicyDto): FormState {
  return { slaAlertHours: String(policy.slaAlertHours), reason: '' }
}

export function SlaPolicyTab() {
  const { showToast } = useToast()
  const [policy, setPolicy] = useState<SlaPolicyDto | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  /** ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** (กฎ `react-hooks/set-state-in-effect`) */
  const fetchPolicy = useCallback(async () => callApi<SlaPolicyDto>('/api/settings/sla-policy'), [])

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

  async function save(): Promise<void> {
    if (form === null) return

    const parsed = slaPolicyUpdateSchema.safeParse({
      slaAlertHours: Number(form.slaAlertHours),
      reason: form.reason.trim(),
    })
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error))
      return
    }

    setErrors({})
    setSaving(true)
    try {
      const result = await callApi<SlaPolicyDto>('/api/settings/sla-policy', jsonRequest('PATCH', parsed.data))
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      if (result.data !== undefined) {
        setPolicy(result.data)
        setForm(formOf(result.data))
      }
      showToast({ tone: 'success', title: 'บันทึกเกณฑ์ SLA แล้ว' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Card><LoadingState message="กำลังโหลดเกณฑ์ SLA" /></Card>
  if (error !== null) return <Card><ErrorState title={error.title} message={error.message} /></Card>
  if (form === null || policy === null) return null

  const typed = Number(form.slaAlertHours)
  const previewValid = Number.isInteger(typed) && typed >= MIN_SLA_ALERT_HOURS && typed <= MAX_SLA_ALERT_HOURS

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">เกณฑ์ SLA งานติดตามทรัพย์</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            เวลาที่ถือว่าเคสยังไม่เกินกำหนด นับจากวันที่รับเคสเข้าระบบ — ใช้กับรายงาน O2 (ประสิทธิภาพทีม) และ O4
            (เคสค้างเกิน SLA)
          </p>
        </div>
        <div className="text-[10px] text-slate-400">
          {policy.updatedAt === null
            ? 'ยังไม่เคยตั้งค่า (แสดงค่าเริ่มต้นของระบบ)'
            : `แก้ไขล่าสุด ${fmtDate(policy.updatedAt)}`}
        </div>
      </div>

      <div className="space-y-4">
        <Field
          id="sla-hours"
          label="เกณฑ์ SLA (ชั่วโมง)"
          required
          hint={`ค่าเริ่มต้นของระบบ ${describeSlaThreshold(DEFAULT_SLA_ALERT_HOURS)}`}
          error={errors.slaAlertHours}
        >
          <div className="flex items-center gap-3">
            <div className="w-32">
              <Input
                id="sla-hours"
                numeric
                inputMode="numeric"
                value={form.slaAlertHours}
                onChange={(event) => set('slaAlertHours', event.target.value.replace(/\D/g, ''))}
                placeholder={String(DEFAULT_SLA_ALERT_HOURS)}
              />
            </div>
            {previewValid && (
              <Badge className="bg-slate-100 text-slate-600">{describeSlaThreshold(typed)}</Badge>
            )}
          </div>
        </Field>

        <Field id="sla-reason" label="เหตุผล" required error={errors.reason}>
          <Textarea
            id="sla-reason"
            value={form.reason}
            onChange={(event) => set('reason', event.target.value)}
            placeholder="เช่น ปรับเกณฑ์ SLA ตามข้อตกลงกับบริษัทไฟแนนซ์ 15/08/2569"
          />
        </Field>

        <InlineAlert tone="warning" title="ค่านี้ใช้กับรายงานเท่านั้น">
          เกินเกณฑ์แล้วระบบไม่บล็อกงาน ไม่มอบหมายใหม่อัตโนมัติ และไม่มีค่าปรับ — เป็นตัวเลขสำหรับติดตามผลในรายงาน
          O2/O4 เท่านั้น (มติ PO 15/08/2569 · D18)
        </InlineAlert>

        <Can action="manage" resource={MANAGE_SETTINGS}>
          <div className="flex justify-end">
            <Button onClick={() => void save()} loading={saving}>
              บันทึกเกณฑ์ SLA
            </Button>
          </div>
        </Can>
      </div>
    </Card>
  )
}
