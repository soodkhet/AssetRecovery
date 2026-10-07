'use client'

import { useCallback, useEffect, useState } from 'react'
import { Can } from '@/components/auth/permission-provider'
import { SettingHelp } from '@/components/settings/setting-help'
import { MANAGE_DATA_RETENTION } from '@/components/settings/shared'
import {
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
import {
  DEFAULT_DEBTOR_DOCUMENT_RETENTION_YEARS,
  MAX_DEBTOR_DOCUMENT_RETENTION_YEARS,
  MIN_DEBTOR_DOCUMENT_RETENTION_YEARS,
} from '@/lib/settings/data-retention'
import { dataRetentionHelp, intFromInput } from '@/lib/settings/help'
import { dataRetentionUpdateSchema } from '@/lib/settings/schemas'
import type { DataRetentionPolicyDto } from '@/lib/settings/types'

/**
 * แท็บ "ระยะเก็บเอกสารลูกหนี้" (PDPA — `13` §6.16 · มติ PO 06/10/2569 U97) — **1 record ต่อองค์กร**
 * ⇒ มีแต่ PATCH ไม่มี create/delete (โครงเดียวกับแท็บเกณฑ์ SLA)
 *
 * ค่านี้ใช้กับงานเบื้องหลังรายวันที่ลบไฟล์เอกสารลูกหนี้ของเคสที่ปิดนานกว่าจำนวนปีที่ตั้ง
 */

const ENDPOINT = '/api/settings/data-retention'

interface FormState {
  years: string
  reason: string
}

function formOf(policy: DataRetentionPolicyDto): FormState {
  return { years: String(policy.debtorDocumentRetentionYears), reason: '' }
}

export function DataRetentionTab() {
  const { showToast } = useToast()
  const [policy, setPolicy] = useState<DataRetentionPolicyDto | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  // ปุ่ม "ลองใหม่" บน ErrorState — เพิ่มตัวนับให้ effect โหลดซ้ำ (R3-027)
  const [retryKey, setRetryKey] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  /** ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** (กฎ `react-hooks/set-state-in-effect`) */
  const fetchPolicy = useCallback(async () => callApi<DataRetentionPolicyDto>(ENDPOINT), [])

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

  async function save(): Promise<void> {
    if (form === null) return

    const parsed = dataRetentionUpdateSchema.safeParse({
      debtorDocumentRetentionYears: Number(form.years),
      reason: form.reason.trim(),
    })
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error))
      return
    }

    setErrors({})
    setSaving(true)
    try {
      const result = await callApi<DataRetentionPolicyDto>(ENDPOINT, jsonRequest('PATCH', parsed.data))
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      if (result.data !== undefined) {
        setPolicy(result.data)
        setForm(formOf(result.data))
      }
      showToast({ tone: 'success', title: 'บันทึกระยะเก็บเอกสารลูกหนี้แล้ว' })
    } finally {
      setSaving(false)
    }
  }

  const retryLoad = () => {
    setError(null)
    setLoading(true)
    setRetryKey((key) => key + 1)
  }

  if (loading) return <Card><LoadingState message="กำลังโหลดระยะเก็บเอกสารลูกหนี้" /></Card>
  if (error !== null) return <Card><ErrorState title={error.title} message={error.message} onRetry={retryLoad} /></Card>
  if (form === null || policy === null) return null

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">ระยะเก็บเอกสารลูกหนี้</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            จำนวนปีหลังปิดเคสที่เก็บไฟล์สัญญา บัตรประชาชน เอกสารชุด และเอกสารอื่นจากไฟแนนซ์ไว้ — ครบแล้วระบบลบไฟล์ให้อัตโนมัติ
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
          id="retention-years"
          label="ระยะเก็บหลังปิดเคส (ปี)"
          required
          hint={`ค่าเริ่มต้น ${DEFAULT_DEBTOR_DOCUMENT_RETENTION_YEARS} ปี · ตั้งได้ ${MIN_DEBTOR_DOCUMENT_RETENTION_YEARS}–${MAX_DEBTOR_DOCUMENT_RETENTION_YEARS} ปี`}
          error={errors.debtorDocumentRetentionYears}
        >
          <div className="w-32">
            <Input
              id="retention-years"
              numeric
              inputMode="numeric"
              value={form.years}
              onChange={(event) => set('years', event.target.value.replace(/\D/g, ''))}
              placeholder={String(DEFAULT_DEBTOR_DOCUMENT_RETENTION_YEARS)}
            />
          </div>
        </Field>
        <SettingHelp defaultOpen help={dataRetentionHelp(intFromInput(form.years))} />

        <Field id="retention-reason" label="เหตุผล" required error={errors.reason}>
          <Textarea
            maxLength={500}
            id="retention-reason"
            value={form.reason}
            onChange={(event) => set('reason', event.target.value)}
            placeholder="เช่น ปรับตามนโยบายคุ้มครองข้อมูลส่วนบุคคลขององค์กร"
          />
        </Field>

        <InlineAlert tone="warning" title="ลบเฉพาะไฟล์เอกสารลูกหนี้ — กู้คืนไม่ได้">
          ระบบลบเฉพาะไฟล์ ข้อมูลเคสและประวัติยังอยู่ครบ หน้าเคสจะแสดงวันที่ที่ลบ · ไม่ลบรูปสินค้า หลักฐานปิดงาน
          และเอกสารบัญชี (ใบกำกับภาษี หนังสือรับรองหัก ณ ที่จ่าย ชุดข้อมูลส่งบัญชี ใบเสร็จ) · ลดจำนวนปีแล้ว
          เคสที่ครบตามค่าใหม่จะถูกลบในรอบถัดไปของงานรายวัน
        </InlineAlert>

        <Can action="manage" resource={MANAGE_DATA_RETENTION}>
          <div className="flex justify-end">
            <Button onClick={() => void save()} loading={saving}>
              บันทึกระยะเก็บเอกสาร
            </Button>
          </div>
        </Can>
      </div>
    </Card>
  )
}
