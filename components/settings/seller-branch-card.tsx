'use client'

import { useCallback, useEffect, useState } from 'react'
import { Can } from '@/components/auth/permission-provider'
import { MANAGE_INVOICE_NUMBERING } from '@/components/settings/shared'
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
  Textarea,
  useToast,
} from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import { toFieldErrors } from '@/lib/api/validation'
import { formatTaxId } from '@/lib/finance-companies/company'
import { branchCodeFromForm, branchKindOf, isHeadOfficeBranch, type BranchKind } from '@/lib/format/branch'
import { sellerBranchUpdateSchema } from '@/lib/settings/schemas'
import type { SellerBranchDto } from '@/lib/settings/types'

/**
 * การ์ด "ข้อมูลผู้ขายบนใบกำกับภาษี" ในแท็บเลขที่ใบกำกับภาษี (มติ PO U82 · ม.86/4)
 *
 * ชื่อ/เลขประจำตัวผู้เสียภาษีขององค์กรแสดงอย่างเดียว · แก้ได้เฉพาะ "สำนักงานใหญ่/สาขาที่" (เหตุผลบังคับ)
 * · capability = `manage_invoice_numbering` (ล็อก Superadmin) · ค่าปัจจุบันถูก snapshot ลงใบตอนออก
 */

interface FormState {
  kind: BranchKind
  branchNumber: string
  reason: string
}

export function SellerBranchCard() {
  const { showToast } = useToast()
  const [seller, setSeller] = useState<SellerBranchDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<FormState>({ kind: 'head_office', branchNumber: '', reason: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  /** ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** (กฎ `react-hooks/set-state-in-effect`) */
  const fetchSeller = useCallback(async () => callApi<SellerBranchDto>('/api/settings/seller-branch'), [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchSeller()
      if (cancelled) return
      if (result.error !== undefined) {
        setError({ title: result.error.title, message: result.error.message })
        setLoading(false)
        return
      }
      setSeller(result.data ?? null)
      setError(null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchSeller])

  function openForm(current: SellerBranchDto): void {
    setForm({
      kind: branchKindOf(current.branchCode),
      branchNumber: isHeadOfficeBranch(current.branchCode) ? '' : current.branchCode,
      reason: '',
    })
    setErrors({})
    setFormOpen(true)
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function save(): Promise<void> {
    const parsed = sellerBranchUpdateSchema.safeParse({
      branchCode: branchCodeFromForm(form.kind, form.branchNumber),
      reason: form.reason.trim(),
    })
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error))
      return
    }

    setErrors({})
    setSaving(true)
    try {
      const result = await callApi<SellerBranchDto>('/api/settings/seller-branch', jsonRequest('PATCH', parsed.data))
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      setSeller(result.data ?? null)
      showToast({ tone: 'success', title: 'บันทึกสำนักงานใหญ่/สาขาของผู้ขายแล้ว' })
      setFormOpen(false)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <LoadingState message="กำลังโหลดข้อมูลผู้ขาย" />
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
  if (seller === null) return null

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">ข้อมูลผู้ขายบนใบกำกับภาษี</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            พิมพ์สำนักงานใหญ่/สาขาต่อจากเลขประจำตัวผู้เสียภาษีของผู้ขาย — ใบที่ออกแล้วไม่เปลี่ยนตาม
          </p>
        </div>
        <Can action="manage" resource={MANAGE_INVOICE_NUMBERING}>
          <Button onClick={() => openForm(seller)}>แก้ไขสาขา</Button>
        </Can>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-[10px] font-bold uppercase text-slate-400">ชื่อนิติบุคคล</div>
          <div className="mt-1 text-sm font-bold text-slate-900">{seller.name}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-[10px] font-bold uppercase text-slate-400">เลขประจำตัวผู้เสียภาษี</div>
          <div className="mt-1 font-mono text-sm font-bold text-slate-900">{formatTaxId(seller.taxId)}</div>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-[10px] font-bold uppercase text-emerald-700">สำนักงานใหญ่ / สาขา</div>
          <div className="mt-1 text-sm font-bold text-emerald-900">{seller.branchLabel}</div>
        </div>
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="แก้ไขสำนักงานใหญ่/สาขาของผู้ขาย"
        description="มีผลกับใบกำกับภาษีที่ออกหลังบันทึกเท่านั้น"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              บันทึกสาขา
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="seller-branch-kind" label="สำนักงานใหญ่ / สาขา" required>
              <Select
                id="seller-branch-kind"
                value={form.kind}
                onChange={(event) => set('kind', event.target.value as BranchKind)}
              >
                <option value="head_office">สำนักงานใหญ่</option>
                <option value="branch">สาขาที่</option>
              </Select>
            </Field>
            {form.kind === 'branch' && (
              <Field id="seller-branch-no" label="เลขที่สาขา (5 หลัก)" required error={errors.branchCode}>
                <Input
                  id="seller-branch-no"
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

          <Field id="seller-branch-reason" label="เหตุผล" required error={errors.reason}>
            <Textarea
              id="seller-branch-reason"
              value={form.reason}
              onChange={(event) => set('reason', event.target.value)}
              placeholder="เช่น ย้ายการออกใบกำกับไปที่สาขาที่จดทะเบียนใหม่"
            />
          </Field>

          <InlineAlert tone="warning" title="ข้อมูลนี้พิมพ์บนใบกำกับภาษีทุกฉบับที่ออกหลังจากนี้">
            ตรวจให้ตรงกับใบทะเบียนภาษีมูลค่าเพิ่มก่อนบันทึก — ใบที่ออกไปแล้วยังพิมพ์สาขาเดิม
          </InlineAlert>
        </div>
      </Modal>
    </Card>
  )
}
