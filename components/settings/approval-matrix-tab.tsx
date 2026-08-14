'use client'

import { useCallback, useEffect, useState } from 'react'
import { Can } from '@/components/auth/permission-provider'
import { FinancePolicyCard } from '@/components/settings/finance-policy-card'
import { ReasonConfirmModal } from '@/components/settings/reason-confirm-modal'
import { ACTIVE_BADGE_GROUP, MANAGE_SETTINGS, STATUS_FILTER_LABEL, type StatusFilter } from '@/components/settings/shared'
import {
  Badge,
  Button,
  Card,
  Field,
  InlineAlert,
  Input,
  Modal,
  Select,
  StatusBadge,
  TBody,
  THead,
  Table,
  TableState,
  Td,
  Textarea,
  Th,
  Tr,
  useToast,
} from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import { toFieldErrors } from '@/lib/api/validation'
import { fmtDate } from '@/lib/format/datetime'
import { fmtSatang, parseBahtInput, toBahtInput } from '@/lib/format/money'
import { MAX_APPROVAL_STEPS, duplicateApprovalSteps } from '@/lib/settings/approval-matrix'
import { approvalMatrixCreateSchema } from '@/lib/settings/schemas'
import type { ApprovalMatrixDto } from '@/lib/settings/types'

/**
 * แท็บ "สายการอนุมัติ" (`13` §6.2) + การ์ด "นโยบายการเงินระดับองค์กร" (§6.2.1)
 *
 * สายอนุมัติมีได้ **1–5 ขั้น** (`MAX_APPROVAL_STEPS`) · เพดานเงินกรอกเป็น **บาท** แล้วแปลงเป็น
 * satang ด้วย `parseBahtInput()` (Rule 01 — ห้ามคูณ/หาร 100 เองในหน้าจอ) · เว้นว่าง = ไม่จำกัด
 *
 * "บังคับแยกหน้าที่" (segregation of duties) เปิดแล้วใส่บทบาทซ้ำในสายไม่ได้ — เตือน inline
 * ตั้งแต่ในฟอร์ม แต่ API ปฏิเสธซ้ำเสมอ (UI เป็นแค่ UX)
 */

interface FormState {
  condition: string
  threshold: string
  approvalFlow: string[]
  enforceSegregationOfDuties: boolean
  reason: string
}

const EMPTY_FORM: FormState = {
  condition: '',
  threshold: '',
  approvalFlow: [''],
  enforceSegregationOfDuties: false,
  reason: '',
}

export function ApprovalMatrixTab() {
  const { showToast } = useToast()
  const [items, setItems] = useState<readonly ApprovalMatrixDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  const [status, setStatus] = useState<StatusFilter>('active')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ApprovalMatrixDto | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<ApprovalMatrixDto | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleting, setDeleting] = useState(false)

  /** ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** (กฎ `react-hooks/set-state-in-effect`) */
  const fetchItems = useCallback(
    async () => callApi<ApprovalMatrixDto[]>(`/api/settings/approval-matrix?status=${status}`),
    [status],
  )

  const reload = useCallback(async () => {
    const result = await fetchItems()
    if (result.error !== undefined) {
      setError({ title: result.error.title, message: result.error.message })
      setLoading(false)
      return
    }
    setItems(result.data ?? [])
    setError(null)
    setLoading(false)
  }, [fetchItems])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchItems()
      if (cancelled) return
      if (result.error !== undefined) {
        setError({ title: result.error.title, message: result.error.message })
        setLoading(false)
        return
      }
      setItems(result.data ?? [])
      setError(null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchItems])

  function openForm(target: ApprovalMatrixDto | null): void {
    setEditing(target)
    setForm(
      target === null
        ? EMPTY_FORM
        : {
            condition: target.condition,
            threshold: toBahtInput(target.conditionThresholdSatang),
            approvalFlow: target.approvalFlow.length === 0 ? [''] : [...target.approvalFlow],
            enforceSegregationOfDuties: target.enforceSegregationOfDuties,
            reason: '',
          },
    )
    setErrors({})
    setFormOpen(true)
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function setStep(index: number, value: string): void {
    setForm((current) => {
      const steps = [...current.approvalFlow]
      steps[index] = value
      return { ...current, approvalFlow: steps }
    })
  }

  function addStep(): void {
    setForm((current) =>
      current.approvalFlow.length >= MAX_APPROVAL_STEPS
        ? current
        : { ...current, approvalFlow: [...current.approvalFlow, ''] },
    )
  }

  function removeStep(index: number): void {
    setForm((current) =>
      current.approvalFlow.length <= 1
        ? current
        : { ...current, approvalFlow: current.approvalFlow.filter((_, position) => position !== index) },
    )
  }

  /** เตือนล่วงหน้าตั้งแต่ในฟอร์ม — ตัวบังคับจริงอยู่ที่ Zod (`refineApprovalMatrix`) และ API */
  const duplicateWarning = form.enforceSegregationOfDuties
    ? duplicateApprovalSteps(form.approvalFlow.map((role) => role.trim()).filter((role) => role !== ''))
    : []

  async function save(): Promise<void> {
    const parsed = approvalMatrixCreateSchema.safeParse({
      condition: form.condition.trim(),
      conditionThresholdSatang: parseBahtInput(form.threshold),
      approvalFlow: form.approvalFlow.map((role) => role.trim()).filter((role) => role !== ''),
      enforceSegregationOfDuties: form.enforceSegregationOfDuties,
      reason: form.reason.trim(),
    })
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error))
      return
    }

    setErrors({})
    setSaving(true)
    try {
      const result = await callApi<ApprovalMatrixDto>(
        editing === null ? '/api/settings/approval-matrix' : `/api/settings/approval-matrix/${editing.id}`,
        jsonRequest(editing === null ? 'POST' : 'PATCH', parsed.data),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({
        tone: 'success',
        title: editing === null ? 'สร้างสายอนุมัติแล้ว' : 'บันทึกสายอนุมัติแล้ว',
        description: form.condition.trim(),
      })
      setFormOpen(false)
      await reload()
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete(): Promise<void> {
    if (deleteTarget === null) return
    setDeleting(true)
    try {
      const result = await callApi(
        `/api/settings/approval-matrix/${deleteTarget.id}`,
        jsonRequest('DELETE', { reason: deleteReason.trim() }),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({ tone: 'success', title: 'ปิดใช้งานสายอนุมัติแล้ว', description: deleteTarget.condition })
      setDeleteTarget(null)
      setDeleteReason('')
      await reload()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">สายการอนุมัติ (Approval Matrix)</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              กำหนดว่ารายการแบบไหนต้องผ่านใครบ้าง — เรียงตามเพดานเงินจากน้อยไปมาก (ไฟล์ 13 §6.2)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-44">
              <Select
                aria-label="กรองตามสถานะ"
                value={status}
                onChange={(event) => {
                  setLoading(true)
                  setStatus(event.target.value as StatusFilter)
                }}
              >
                {(Object.keys(STATUS_FILTER_LABEL) as StatusFilter[]).map((value) => (
                  <option key={value} value={value}>
                    {STATUS_FILTER_LABEL[value]}
                  </option>
                ))}
              </Select>
            </div>
            <Can action="manage" resource={MANAGE_SETTINGS}>
              <Button onClick={() => openForm(null)}>+ เพิ่มกติกา</Button>
            </Can>
          </div>
        </div>

        <Table>
          <THead>
            <Tr>
              <Th>เงื่อนไข</Th>
              <Th className="text-right">เพดานเงิน</Th>
              <Th>ลำดับขั้นอนุมัติ</Th>
              <Th>แยกหน้าที่</Th>
              <Th className="text-right">สถานะ / จัดการ</Th>
            </Tr>
          </THead>
          {/* `TableState` เรนเดอร์ `<tbody>` ของตัวเอง — วางเป็นพี่น้องกับ `TBody` */}
          <TableState
            colSpan={5}
            loading={loading}
            error={error}
            isEmpty={items.length === 0}
            emptyTitle="ยังไม่มีสายการอนุมัติ"
            emptyDescription="เพิ่มกติกาแรกเพื่อกำหนดว่ารายการเบิก/จ่ายต้องผ่านการอนุมัติจากใคร"
            onRetry={
              <Button
                variant="secondary"
                onClick={() => {
                  setLoading(true)
                  void reload()
                }}
              >
                ลองใหม่
              </Button>
            }
          />
          <TBody>
            {!loading &&
              error === null &&
              items.map((item) => (
                <Tr key={item.id}>
                  <Td>
                    <div className="font-semibold text-slate-900">{item.condition}</div>
                    <div className="mt-0.5 text-[10px] text-slate-500">แก้ไขล่าสุด {fmtDate(item.updatedAt)}</div>
                  </Td>
                  <Td numeric>
                    {item.conditionThresholdSatang === null ? (
                      <span className="text-xs text-slate-400">ไม่จำกัด</span>
                    ) : (
                      <span className="text-xs text-slate-700">{fmtSatang(item.conditionThresholdSatang)}</span>
                    )}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-1">
                      {item.approvalFlow.map((role, index) => (
                        <span key={`${item.id}-${index}`} className="flex items-center gap-1">
                          {index > 0 && <span className="text-[10px] text-slate-400">→</span>}
                          <Badge className="bg-slate-100 text-slate-700">
                            {index + 1}. {role}
                          </Badge>
                        </span>
                      ))}
                    </div>
                  </Td>
                  <Td>
                    {item.enforceSegregationOfDuties ? (
                      <StatusBadge group="success" label="บังคับ" />
                    ) : (
                      <span className="text-xs text-slate-400">ไม่บังคับ</span>
                    )}
                  </Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <StatusBadge
                        group={ACTIVE_BADGE_GROUP[item.isActive ? 'active' : 'inactive']}
                        label={item.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}
                      />
                      <Can action="manage" resource={MANAGE_SETTINGS}>
                        <Button variant="secondary" onClick={() => openForm(item)}>
                          แก้ไข
                        </Button>
                        {item.isActive && (
                          <Button
                            variant="danger"
                            onClick={() => {
                              setDeleteTarget(item)
                              setDeleteReason('')
                            }}
                          >
                            ปิดใช้งาน
                          </Button>
                        )}
                      </Can>
                    </div>
                  </Td>
                </Tr>
              ))}
          </TBody>
        </Table>
      </Card>

      <FinancePolicyCard />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        size="lg"
        title={editing === null ? 'เพิ่มกติกาสายอนุมัติ' : `แก้ไขกติกา — ${editing.condition}`}
        description={`กำหนดได้สูงสุด ${MAX_APPROVAL_STEPS} ขั้น — เว้นเพดานเงินว่างไว้หมายถึงใช้กับทุกยอด`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              {editing === null ? 'เพิ่มกติกา' : 'บันทึกการแก้ไข'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field id="approval-condition" label="เงื่อนไขที่ทำให้ใช้สายนี้" required error={errors.condition}>
            <Input
              id="approval-condition"
              value={form.condition}
              onChange={(event) => set('condition', event.target.value)}
              placeholder='เช่น "เบิกค่าใช้จ่ายเกิน 10,000 บาท"'
            />
          </Field>

          <Field id="approval-threshold" label="เพดานเงิน (บาท)" error={errors.conditionThresholdSatang}>
            <Input
              id="approval-threshold"
              numeric
              inputMode="decimal"
              value={form.threshold}
              onChange={(event) => set('threshold', event.target.value)}
              placeholder="เว้นว่าง = ไม่จำกัด"
            />
          </Field>

          <Field id="approval-flow" label="ลำดับขั้นอนุมัติ" required error={errors.approvalFlow}>
            <div id="approval-flow" className="space-y-2">
              {form.approvalFlow.map((role, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="w-12 shrink-0 font-mono text-[10px] font-semibold text-slate-500">ขั้น {index + 1}</span>
                  <div className="flex-1">
                    <Input
                      aria-label={`บทบาทผู้อนุมัติขั้นที่ ${index + 1}`}
                      value={role}
                      onChange={(event) => setStep(index, event.target.value)}
                      placeholder='เช่น "ผู้จัดการทีม" หรือ "ผู้บริหาร"'
                    />
                  </div>
                  {form.approvalFlow.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeStep(index)}
                      aria-label={`ลบขั้นที่ ${index + 1}`}
                      className="focus-ring rounded-md px-1.5 py-1 text-xs text-slate-400 hover:text-red-600"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {form.approvalFlow.length < MAX_APPROVAL_STEPS && (
                <Button variant="secondary" onClick={addStep}>
                  + เพิ่มขั้นอนุมัติ
                </Button>
              )}
            </div>
          </Field>

          <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={form.enforceSegregationOfDuties}
              onChange={(event) => set('enforceSegregationOfDuties', event.target.checked)}
              className="focus-ring h-4 w-4 rounded border-slate-300"
            />
            บังคับแยกหน้าที่ (คนเดียวอนุมัติซ้ำหลายขั้นไม่ได้)
          </label>

          {duplicateWarning.length > 0 && (
            <InlineAlert tone="error" title="มีบทบาทซ้ำในสายอนุมัติ">
              เปิด “บังคับแยกหน้าที่” แล้วใส่บทบาทซ้ำไม่ได้: {duplicateWarning.join(', ')}
            </InlineAlert>
          )}

          <Field id="approval-reason" label="เหตุผล" required error={errors.reason}>
            <Textarea
              id="approval-reason"
              value={form.reason}
              onChange={(event) => set('reason', event.target.value)}
              placeholder="เช่น เพิ่มขั้นอนุมัติผู้บริหารสำหรับยอดเกิน 50,000 บาท"
            />
          </Field>
        </div>
      </Modal>

      <ReasonConfirmModal
        open={deleteTarget !== null}
        title={`ปิดใช้งานกติกา "${deleteTarget?.condition ?? ''}"`}
        description="รายการที่อยู่ระหว่างอนุมัติยังใช้สายเดิมที่ snapshot ไว้ — กติกานี้จะไม่ถูกใช้กับรายการใหม่"
        confirmLabel="ยืนยันปิดใช้งาน"
        loading={deleting}
        reason={deleteReason}
        onReasonChange={setDeleteReason}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
        placeholder="เช่น ยุบขั้นอนุมัติตามโครงสร้างใหม่"
      />
    </div>
  )
}
