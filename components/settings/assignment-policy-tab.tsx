'use client'

import { useCallback, useEffect, useState } from 'react'
import { Can } from '@/components/auth/permission-provider'
import { ReasonConfirmModal } from '@/components/settings/reason-confirm-modal'
import { MANAGE_SETTINGS } from '@/components/settings/shared'
import { Button, Card, ErrorState, Field, InlineAlert, Input, LoadingState, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import { toFieldErrors } from '@/lib/api/validation'
import { fmtDate } from '@/lib/format/datetime'
import {
  DEFAULT_ASSIGNMENT_POLICY_VALUES,
  describeAcceptDeadline,
  type AssignmentPolicyValues,
} from '@/lib/settings/assignment-policy'
import { assignmentPolicyFieldsSchema, assignmentPolicyUpdateSchema } from '@/lib/settings/schemas'
import type { AssignmentPolicyDto } from '@/lib/settings/types'

/**
 * แท็บ "นโยบายการมอบหมายงาน" (`40` §6.4/§11/§13 — UAT BUG-002 · มติ PO 03/10/2569) — 1 record ต่อองค์กร
 *
 * mockup `settings.html` วางค่าชุดนี้ไว้ที่ "ตั้งค่าระบบกลาง → Operations Settings" ซึ่งแอปยังไม่มีหน้านั้น
 * ⇒ วางเป็นแท็บถัดจาก "เกณฑ์ SLA งานติดตาม" (ค่าอยู่ตารางเดียวกัน `assignment_policy_settings`)
 * · mockup มีแค่ช่อง Inhouse/Outsource แต่ `40` §6.4 กำหนด 3 Role Group (system/inhouse/outsource) ⇒ ยึดสเปค
 *
 * ปุ่มบันทึกเปิดกล่องยืนยันที่บังคับกรอกเหตุผล (กระทบสิทธิ์ของหัวหน้าทีม — `90` §13) · API ตรวจซ้ำเสมอ
 */

interface FormState {
  reassignTimeoutHours: string
  supervisorCanAssignSystem: boolean
  supervisorCanAssignInhouse: boolean
  supervisorCanAssignOutsource: boolean
  hasAcceptDeadline: boolean
  acceptDeadlineHours: string
}

function formOf(policy: AssignmentPolicyDto): FormState {
  return {
    reassignTimeoutHours: String(policy.reassignTimeoutHours),
    supervisorCanAssignSystem: policy.supervisorCanAssignSystem,
    supervisorCanAssignInhouse: policy.supervisorCanAssignInhouse,
    supervisorCanAssignOutsource: policy.supervisorCanAssignOutsource,
    hasAcceptDeadline: policy.acceptDeadlineHours !== null,
    acceptDeadlineHours: policy.acceptDeadlineHours === null ? '' : String(policy.acceptDeadlineHours),
  }
}

function valuesOf(form: FormState): AssignmentPolicyValues {
  return {
    reassignTimeoutHours: Number(form.reassignTimeoutHours),
    supervisorCanAssignSystem: form.supervisorCanAssignSystem,
    supervisorCanAssignInhouse: form.supervisorCanAssignInhouse,
    supervisorCanAssignOutsource: form.supervisorCanAssignOutsource,
    acceptDeadlineHours: form.hasAcceptDeadline ? Number(form.acceptDeadlineHours) : null,
  }
}

const SUPERVISOR_TOGGLES: readonly {
  key: 'supervisorCanAssignSystem' | 'supervisorCanAssignInhouse' | 'supervisorCanAssignOutsource'
  label: string
}[] = [
  { key: 'supervisorCanAssignSystem', label: 'หัวหน้าทีมกลุ่ม System มอบหมาย/เปลี่ยนผู้รับผิดชอบได้' },
  { key: 'supervisorCanAssignInhouse', label: 'หัวหน้าทีมกลุ่ม Inhouse มอบหมาย/เปลี่ยนผู้รับผิดชอบได้' },
  { key: 'supervisorCanAssignOutsource', label: 'หัวหน้าทีมกลุ่ม Outsource มอบหมาย/เปลี่ยนผู้รับผิดชอบได้' },
]

const onOff = (value: boolean): string => (value ? 'เปิด' : 'ปิด')

/** รายการที่เปลี่ยนจากค่าที่บันทึกไว้ — แสดงในกล่องยืนยันก่อนกรอกเหตุผล */
function changesOf(before: AssignmentPolicyValues, after: AssignmentPolicyValues): string[] {
  const lines: string[] = []
  if (before.reassignTimeoutHours !== after.reassignTimeoutHours) {
    lines.push(`เวลารอความยินยอม: ${before.reassignTimeoutHours} → ${after.reassignTimeoutHours} ชั่วโมง`)
  }
  for (const toggle of SUPERVISOR_TOGGLES) {
    if (before[toggle.key] !== after[toggle.key]) {
      lines.push(`${toggle.label}: ${onOff(before[toggle.key])} → ${onOff(after[toggle.key])}`)
    }
  }
  if (before.acceptDeadlineHours !== after.acceptDeadlineHours) {
    lines.push(
      `เส้นตายกดรับงาน: ${describeAcceptDeadline(before.acceptDeadlineHours)} → ${describeAcceptDeadline(after.acceptDeadlineHours)}`,
    )
  }
  return lines
}

export function AssignmentPolicyTab() {
  const { showToast } = useToast()
  const [policy, setPolicy] = useState<AssignmentPolicyDto | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  // ปุ่ม "ลองใหม่" บน ErrorState — เพิ่มตัวนับให้ effect โหลดซ้ำ (R3-027)
  const [retryKey, setRetryKey] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  /** ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** (กฎ `react-hooks/set-state-in-effect`) */
  const fetchPolicy = useCallback(
    async () => callApi<AssignmentPolicyDto>('/api/settings/assignment-policy'),
    [],
  )

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
  }, [fetchPolicy, retryKey])

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => (current === null ? current : { ...current, [key]: value }))
  }

  /** ตรวจค่าก่อนเปิดกล่องเหตุผล — ไม่ให้ผู้ใช้กรอกเหตุผลแล้วค่อยมารู้ว่าตัวเลขผิด */
  function openConfirm(): void {
    if (form === null) return
    const parsed = assignmentPolicyFieldsSchema.safeParse(valuesOf(form))
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error))
      return
    }
    setErrors({})
    setReason('')
    setConfirmOpen(true)
  }

  async function save(): Promise<void> {
    if (form === null) return
    const parsed = assignmentPolicyUpdateSchema.safeParse({ ...valuesOf(form), reason: reason.trim() })
    if (!parsed.success) {
      const fieldErrors = toFieldErrors(parsed.error)
      if (fieldErrors.reason !== undefined) {
        showToast({ tone: 'error', title: 'กรุณาระบุเหตุผล', description: fieldErrors.reason })
        return
      }
      setErrors(fieldErrors)
      setConfirmOpen(false)
      return
    }

    setSaving(true)
    try {
      const result = await callApi<AssignmentPolicyDto>(
        '/api/settings/assignment-policy',
        jsonRequest('PATCH', parsed.data),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      if (result.data !== undefined) {
        setPolicy(result.data)
        setForm(formOf(result.data))
      }
      setConfirmOpen(false)
      showToast({ tone: 'success', title: 'บันทึกนโยบายการมอบหมายงานแล้ว' })
    } finally {
      setSaving(false)
    }
  }

  const retryLoad = () => {
    setError(null)
    setLoading(true)
    setRetryKey((key) => key + 1)
  }

  if (loading) return <Card><LoadingState message="กำลังโหลดนโยบายการมอบหมายงาน" /></Card>
  if (error !== null) return <Card><ErrorState title={error.title} message={error.message} onRetry={retryLoad} /></Card>
  if (form === null || policy === null) return null

  const changes = changesOf(policy, valuesOf(form))

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">นโยบายการมอบหมายงาน</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            ค่ากลางระดับองค์กรของหน้า &quot;มอบหมายงาน&quot; — เวลารอความยินยอม สิทธิ์ของหัวหน้าทีม และเส้นตายกดรับงาน
          </p>
        </div>
        <div className="text-[10px] text-slate-400">
          {policy.updatedAt === null
            ? 'ยังไม่เคยตั้งค่า (แสดงค่าเริ่มต้นของระบบ)'
            : `แก้ไขล่าสุด ${fmtDate(policy.updatedAt)}`}
        </div>
      </div>

      <div className="space-y-5">
        <Field
          id="assignment-reassign-timeout"
          label="เวลารอความยินยอมเมื่อเปลี่ยนผู้รับผิดชอบ (ชั่วโมง)"
          required
          hint={`พนักงานคนเดิมต้องตอบภายในเวลานี้ ไม่ตอบ = ระบบเปลี่ยนให้อัตโนมัติ · ค่าเริ่มต้น ${DEFAULT_ASSIGNMENT_POLICY_VALUES.reassignTimeoutHours} ชั่วโมง`}
          error={errors.reassignTimeoutHours}
        >
          <div className="w-32">
            <Input
              id="assignment-reassign-timeout"
              numeric
              inputMode="numeric"
              value={form.reassignTimeoutHours}
              onChange={(event) => set('reassignTimeoutHours', event.target.value.replace(/\D/g, ''))}
              placeholder={String(DEFAULT_ASSIGNMENT_POLICY_VALUES.reassignTimeoutHours)}
            />
          </div>
        </Field>

        <div>
          <div className="mb-2 text-xs font-bold text-slate-700">สิทธิ์มอบหมายงานของหัวหน้าทีม (Supervisor)</div>
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            {SUPERVISOR_TOGGLES.map((toggle) => (
              <label key={toggle.key} className="flex items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={form[toggle.key]}
                  onChange={(event) => set(toggle.key, event.target.checked)}
                  className="focus-ring h-4 w-4 rounded border-slate-300"
                />
                {toggle.label}
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">
            ปิดแล้วหัวหน้าทีมกลุ่มนั้นจะไม่เห็นปุ่ม &quot;มอบหมาย&quot;/&quot;เปลี่ยนผู้รับผิดชอบ&quot; แต่ยังเห็นรายการ ภาพรวมทีม
            และประวัติได้ตามปกติ · ไม่มีผลกับผู้จัดการทีม
          </p>
        </div>

        <div>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={form.hasAcceptDeadline}
              onChange={(event) => set('hasAcceptDeadline', event.target.checked)}
              className="focus-ring h-4 w-4 rounded border-slate-300"
            />
            กำหนดเส้นตายกดรับงานครั้งแรก
          </label>
          {form.hasAcceptDeadline && (
            <div className="mt-2 pl-6">
              <Field
                id="assignment-accept-deadline"
                label="เส้นตายกดรับงาน (ชั่วโมง)"
                required
                error={errors.acceptDeadlineHours}
              >
                <div className="w-32">
                  <Input
                    id="assignment-accept-deadline"
                    numeric
                    inputMode="numeric"
                    value={form.acceptDeadlineHours}
                    onChange={(event) => set('acceptDeadlineHours', event.target.value.replace(/\D/g, ''))}
                    placeholder="24"
                  />
                </div>
              </Field>
            </div>
          )}
          <p className="mt-1.5 text-[11px] text-slate-500">
            ค่าเริ่มต้น: ไม่จำกัดเวลา · ระบบยังไม่บังคับใช้เส้นตายนี้ในรอบปัจจุบัน — บันทึกไว้เพื่อเปิดใช้ในอนาคต
          </p>
        </div>

        <InlineAlert tone="info" title="มีผลกับคำขอใหม่เท่านั้น">
          คำขอเปลี่ยนผู้รับผิดชอบที่ส่งไปแล้วใช้เวลาหมดอายุเดิมที่บันทึกไว้ตอนส่งคำขอ — ไม่ถูกปรับย้อนหลัง
        </InlineAlert>

        <Can action="manage" resource={MANAGE_SETTINGS}>
          <div className="flex justify-end">
            <Button onClick={openConfirm} disabled={changes.length === 0}>
              บันทึกนโยบายการมอบหมายงาน
            </Button>
          </div>
        </Can>
      </div>

      <ReasonConfirmModal
        open={confirmOpen}
        title="ยืนยันบันทึกนโยบายการมอบหมายงาน"
        description="การเปลี่ยนค่านี้กระทบสิทธิ์ของหัวหน้าทีม — ต้องระบุเหตุผลเพื่อบันทึกลงประวัติการใช้งาน"
        confirmLabel="บันทึก"
        confirmVariant="primary"
        loading={saving}
        reason={reason}
        onReasonChange={setReason}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void save()}
        placeholder="เช่น ปิดสิทธิ์มอบหมายของหัวหน้าทีม Outsource ตามมติที่ประชุม 03/10/2569"
      >
        <ul className="mb-3 list-disc space-y-1 pl-5 text-xs text-slate-700">
          {changes.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </ReasonConfirmModal>
    </Card>
  )
}
