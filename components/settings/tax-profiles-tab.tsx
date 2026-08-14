'use client'

import { useCallback, useEffect, useState } from 'react'
import { Can } from '@/components/auth/permission-provider'
import { ReasonConfirmModal } from '@/components/settings/reason-confirm-modal'
import {
  ACTIVE_BADGE_GROUP,
  MANAGE_TAX_PROFILES,
  STATUS_FILTER_LABEL,
  WHT_BASIS_LABEL,
  WHT_FILING_FORM_LABEL,
  type StatusFilter,
} from '@/components/settings/shared'
import {
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
import type { WhtFilingForm } from '@/lib/generated/prisma/enums'
import { taxProfileCreateSchema } from '@/lib/settings/schemas'
import {
  DEFAULT_WHT_MIN_THRESHOLD_SATANG,
  DEFAULT_WHT_PCT,
  WHT_BASIS_VALUES,
  type WhtBasis,
} from '@/lib/settings/tax-profile'
import type { TaxProfileDto } from '@/lib/settings/types'

/**
 * แท็บ "กติกาภาษี (Tax Profile)" (`13` §6.4) — อัตรา/ฐาน/เกณฑ์ขั้นต่ำของ WHT ต่อประเภทผู้รับเงิน
 *
 * ⚠️ ฟิลด์บนหน้านี้ยึด **ตาราง `tax_profiles` ใน `02`** ไม่ใช่ตารางใน `13` §6.4 (ลำดับความสำคัญ
 * เอกสาร: `02` ชนะ) — `vat_mode` เป็นของบริษัทไฟแนนซ์ฝั่งขาย และ `applies_to` สะท้อนผ่าน
 * `filing_form` (ภ.ง.ด.3/53) ตามที่ `lib/settings/tax-profile.ts` อธิบายไว้
 *
 * capability = `manage_tax_profiles` (ล็อก Superadmin ตาม `25` §16.1) **ไม่ใช่** `manage_settings`
 * · เกณฑ์ขั้นต่ำกรอกเป็นบาท แปลงด้วย `parseBahtInput()` เท่านั้น (Rule 01 — ห้ามคูณ 100 เอง)
 */

interface FormState {
  name: string
  whtPct: string
  whtBasis: WhtBasis
  whtMinThreshold: string
  incomeType: string
  filingForm: WhtFilingForm
  reason: string
}

const EMPTY_FORM: FormState = {
  name: '',
  whtPct: String(DEFAULT_WHT_PCT),
  whtBasis: 'before_vat',
  whtMinThreshold: toBahtInput(DEFAULT_WHT_MIN_THRESHOLD_SATANG),
  incomeType: '',
  filingForm: 'PND3',
  reason: '',
}

export function TaxProfilesTab() {
  const { showToast } = useToast()
  const [items, setItems] = useState<readonly TaxProfileDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  const [status, setStatus] = useState<StatusFilter>('active')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<TaxProfileDto | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<TaxProfileDto | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleting, setDeleting] = useState(false)

  /** ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** (กฎ `react-hooks/set-state-in-effect`) */
  const fetchItems = useCallback(
    async () => callApi<TaxProfileDto[]>(`/api/settings/tax-profiles?status=${status}`),
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

  function openForm(target: TaxProfileDto | null): void {
    setEditing(target)
    setForm(
      target === null
        ? EMPTY_FORM
        : {
            name: target.name,
            whtPct: String(target.whtPct),
            whtBasis: target.whtBasis,
            whtMinThreshold: toBahtInput(target.whtMinThresholdSatang),
            incomeType: target.incomeType,
            filingForm: target.filingForm,
            reason: '',
          },
    )
    setErrors({})
    setFormOpen(true)
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function save(): Promise<void> {
    const parsed = taxProfileCreateSchema.safeParse({
      name: form.name.trim(),
      whtPct: Number(form.whtPct),
      whtBasis: form.whtBasis,
      whtMinThresholdSatang: parseBahtInput(form.whtMinThreshold),
      incomeType: form.incomeType.trim(),
      filingForm: form.filingForm,
      reason: form.reason.trim(),
    })
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error))
      return
    }

    setErrors({})
    setSaving(true)
    try {
      const result = await callApi<TaxProfileDto>(
        editing === null ? '/api/settings/tax-profiles' : `/api/settings/tax-profiles/${editing.id}`,
        jsonRequest(editing === null ? 'POST' : 'PATCH', parsed.data),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({
        tone: 'success',
        title: editing === null ? 'สร้างกติกาภาษีแล้ว' : 'บันทึกกติกาภาษีแล้ว',
        description: form.name.trim(),
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
        `/api/settings/tax-profiles/${deleteTarget.id}`,
        jsonRequest('DELETE', { reason: deleteReason.trim() }),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({ tone: 'success', title: 'ปิดใช้งานกติกาภาษีแล้ว', description: deleteTarget.name })
      setDeleteTarget(null)
      setDeleteReason('')
      await reload()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">กติกาภาษี (Tax Profile)</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            อัตราหัก ณ ที่จ่าย ฐานที่ใช้หัก และเกณฑ์ขั้นต่ำต่อประเภทผู้รับเงิน — ใช้ตอนสร้างรอบจ่ายเงิน (ไฟล์ 13 §6.4)
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
          <Can action="manage" resource={MANAGE_TAX_PROFILES}>
            <Button onClick={() => openForm(null)}>+ เพิ่ม Tax Profile</Button>
          </Can>
        </div>
      </div>

      <InlineAlert tone="warning" title="การแก้ Tax Profile กระทบยอดภาษีทุกรายการที่ใช้ profile นี้">
        ระบบบันทึก audit log พร้อมเหตุผลทุกครั้ง — รายการที่จ่ายไปแล้วยังอ้างค่าที่ snapshot ไว้ตอนตั้งรอบจ่าย (ไฟล์ 92 §7.1)
      </InlineAlert>

      <div className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th>ชื่อ Profile</Th>
              <Th>ประเภทเงินได้</Th>
              <Th>แบบนำส่ง</Th>
              <Th className="text-right">อัตรา WHT</Th>
              <Th>ฐานที่ใช้หัก</Th>
              <Th className="text-right">ขั้นต่ำที่ต้องหัก</Th>
              <Th className="text-right">สถานะ / จัดการ</Th>
            </Tr>
          </THead>
          {/* `TableState` เรนเดอร์ `<tbody>` ของตัวเอง — วางเป็นพี่น้องกับ `TBody` */}
          <TableState
            colSpan={7}
            loading={loading}
            error={error}
            isEmpty={items.length === 0}
            emptyTitle="ยังไม่มีกติกาภาษี"
            emptyDescription="สร้าง profile แรกเพื่อให้ระบบรู้ว่าต้องหักภาษี ณ ที่จ่ายเท่าไรกับผู้รับเงินแต่ละประเภท"
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
                    <div className="font-semibold text-slate-900">{item.name}</div>
                    <div className="mt-0.5 text-[10px] text-slate-500">แก้ไขล่าสุด {fmtDate(item.updatedAt)}</div>
                  </Td>
                  <Td>
                    <span className="text-xs text-slate-600">{item.incomeType}</span>
                  </Td>
                  <Td>
                    <span className="text-xs text-slate-600">{WHT_FILING_FORM_LABEL[item.filingForm]}</span>
                  </Td>
                  <Td numeric>
                    <span className="font-semibold text-rose-700">{item.whtPct}%</span>
                  </Td>
                  <Td>
                    <span className="text-xs text-slate-600">{WHT_BASIS_LABEL[item.whtBasis]}</span>
                  </Td>
                  <Td numeric>{fmtSatang(item.whtMinThresholdSatang)}</Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <StatusBadge
                        group={ACTIVE_BADGE_GROUP[item.isActive ? 'active' : 'inactive']}
                        label={item.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}
                      />
                      <Can action="manage" resource={MANAGE_TAX_PROFILES}>
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
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        size="lg"
        title={editing === null ? 'เพิ่ม Tax Profile' : `แก้ไข Tax Profile — ${editing.name}`}
        description="อัตราและเกณฑ์ทั้งหมดเป็นค่าตั้งได้ — ระบบไม่ hardcode อัตราภาษีไว้ในสูตรคำนวณ"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              {editing === null ? 'เพิ่ม Profile' : 'บันทึกการแก้ไข'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="tax-name" label="ชื่อ Profile" required error={errors.name}>
              <Input
                id="tax-name"
                value={form.name}
                onChange={(event) => set('name', event.target.value)}
                placeholder='เช่น "Outsource บุคคลธรรมดา"'
              />
            </Field>
            <Field id="tax-income-type" label="ประเภทเงินได้" required error={errors.incomeType}>
              <Input
                id="tax-income-type"
                value={form.incomeType}
                onChange={(event) => set('incomeType', event.target.value)}
                placeholder="เช่น ค่าจ้างทำของ/ค่าบริการ ม.40(8)"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="tax-wht-pct" label="อัตราหัก ณ ที่จ่าย (%)" required error={errors.whtPct}>
              <Input
                id="tax-wht-pct"
                numeric
                inputMode="decimal"
                value={form.whtPct}
                onChange={(event) => set('whtPct', event.target.value)}
                placeholder={String(DEFAULT_WHT_PCT)}
              />
            </Field>
            <Field id="tax-filing-form" label="แบบนำส่ง" required error={errors.filingForm}>
              <Select
                id="tax-filing-form"
                value={form.filingForm}
                onChange={(event) => set('filingForm', event.target.value as WhtFilingForm)}
              >
                {(Object.keys(WHT_FILING_FORM_LABEL) as WhtFilingForm[]).map((value) => (
                  <option key={value} value={value}>
                    {WHT_FILING_FORM_LABEL[value]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="tax-wht-basis" label="ฐานที่ใช้หัก" required error={errors.whtBasis}>
              <Select
                id="tax-wht-basis"
                value={form.whtBasis}
                onChange={(event) => set('whtBasis', event.target.value as WhtBasis)}
              >
                {WHT_BASIS_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {WHT_BASIS_LABEL[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              id="tax-threshold"
              label="ยอดขั้นต่ำที่ต้องหัก (บาท)"
              required
              error={errors.whtMinThresholdSatang}
              hint="ต่ำกว่ายอดนี้ไม่หัก — มาตรฐานกรมสรรพากรคือ 1,000 บาท"
            >
              <Input
                id="tax-threshold"
                numeric
                inputMode="decimal"
                value={form.whtMinThreshold}
                onChange={(event) => set('whtMinThreshold', event.target.value)}
                placeholder="1,000.00"
              />
            </Field>
          </div>

          <Field id="tax-reason" label="เหตุผล" required error={errors.reason}>
            <Textarea
              id="tax-reason"
              value={form.reason}
              onChange={(event) => set('reason', event.target.value)}
              placeholder="เช่น ปรับอัตราตามประกาศกรมสรรพากรฉบับใหม่"
            />
          </Field>

          <InlineAlert tone="info" title="อัตราของ Payee ชนะอัตราของ Plan เสมอ">
            เมื่อผู้รับเงินผูก Tax Profile ไว้ ระบบใช้อัตรานี้ก่อนค่าจากแผนค่าตอบแทนเสมอ (ไฟล์ 22 §6.9)
          </InlineAlert>
        </div>
      </Modal>

      <ReasonConfirmModal
        open={deleteTarget !== null}
        title={`ปิดใช้งาน Tax Profile "${deleteTarget?.name ?? ''}"`}
        description="ปิดใช้งานเป็น soft delete — เอกสารและรอบจ่ายเดิมยังอ้าง profile นี้ได้ตามปกติ"
        confirmLabel="ยืนยันปิดใช้งาน"
        loading={deleting}
        reason={deleteReason}
        onReasonChange={setDeleteReason}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
        placeholder="เช่น เลิกใช้ profile นี้ตั้งแต่รอบจ่าย 09/2569"
      />
    </Card>
  )
}
