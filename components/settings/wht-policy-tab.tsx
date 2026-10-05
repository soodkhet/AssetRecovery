'use client'

import { useCallback, useEffect, useState } from 'react'
import { Can } from '@/components/auth/permission-provider'
import { MANAGE_WHT_POLICY } from '@/components/settings/shared'
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
import { EXPENSE_TYPE_LABEL } from '@/lib/field/expense-ui'
import { fmtDate, fromInputDate, nowDate, toInputDate } from '@/lib/format/datetime'
import type { ExpenseType } from '@/lib/generated/prisma/enums'
import { whtPolicyCreateSchema } from '@/lib/settings/schemas'
import type { WhtPolicyOverviewDto } from '@/lib/settings/types'
import {
  WHT_CERTIFICATE_MODES,
  WHT_CERTIFICATE_MODE_LABEL,
  WHT_FILING_METHODS,
  WHT_FILING_METHOD_LABEL,
  WHT_INCOME_CATEGORY_LABEL,
  WHT_INCOME_TYPE_MODES,
  WHT_INCOME_TYPE_MODE_LABEL,
  WHT_POLICY_EXPENSE_TYPES,
  WHT_TEAM_SIDE_INCOME_CATEGORIES,
  ISSUE_ZERO_RATE_40_2_LABEL,
  effectiveTeamSideCategories,
  normalizeBaseExpenseTypes,
  usesPerPayeeWhtRate,
  type WhtCertificateMode,
  type WhtFilingMethod,
  type WhtIncomeCategory,
  type WhtIncomeTypeMode,
  type WhtPolicySettings,
  type WhtPolicyValues,
} from '@/lib/settings/wht-policy'

/**
 * แท็บ "ค่าตั้งภาษีหัก ณ ที่จ่าย" (`13` §6.4.2 — มติ PO 05/10/2569 UAT U3/U4/U5/U7/U8/U33)
 *
 * effective-dated แบบอัตรา VAT แต่ **insert-only**: แก้ค่า = เพิ่มชุดใหม่พร้อมวันที่มีผล (ประวัติไม่ถูกแก้/ลบ)
 * · มีผลกับรอบจ่ายที่สร้างตั้งแต่วันที่มีผล · รอบที่สร้างแล้วใช้ค่าที่ snapshot ไว้ · แก้ได้เฉพาะ Superadmin/บริหาร
 * (`manage_wht_policy` — ปุ่มซ่อนด้วย `<Can>` เป็นแค่ UX · API ตรวจเอง DEC-002)
 *
 * ⚠️ ส่งวันที่เป็นค่าดิบ `YYYY-MM-DD` ให้ API (กับดักเดียวกับแท็บ VAT — `dateOnlySchema` แปลงเป็น `Date`)
 */

interface FormState {
  effectiveFrom: string
  baseExpenseTypes: ExpenseType[]
  certificateMode: WhtCertificateMode
  incomeTypeMode: WhtIncomeTypeMode
  issueZeroRate402Certificate: boolean
  inhouseIncomeCategory: WhtIncomeCategory
  outsourceIncomeCategory: WhtIncomeCategory
  filingMethod: WhtFilingMethod
  reason: string
}

function baseTypesText(types: readonly ExpenseType[]): string {
  return types.length === 0 ? 'ไม่มี (ไม่หักทุกรายการ)' : types.map((type) => EXPENSE_TYPE_LABEL[type]).join(' · ')
}

/** มติ PO 05/10/2569 UAT U16 */
function zeroRateText(issue: boolean): string {
  return issue ? 'ออก 50 ทวิ (ภาษี 0) + รวมใน ภ.ง.ด.1' : 'ไม่ออก 50 ทวิ'
}

/** ประเภทเงินได้ที่แสดงบนหน้าจอ — โหมดแยกตามประเภททีมแสดงการจับคู่ที่ตั้งไว้ (มติ PO 05/10/2569 UAT U33) */
function incomeTypeText(
  values: Pick<WhtPolicyValues, 'incomeTypeMode' | 'inhouseIncomeCategory' | 'outsourceIncomeCategory'>,
): string {
  if (values.incomeTypeMode !== 'by_team_side') return WHT_INCOME_TYPE_MODE_LABEL[values.incomeTypeMode]
  return `แยกตามประเภททีม: Inhouse = ${WHT_INCOME_CATEGORY_LABEL[values.inhouseIncomeCategory]} · Outsource = ${WHT_INCOME_CATEGORY_LABEL[values.outsourceIncomeCategory]}`
}

function PolicySummary({ values }: { values: WhtPolicySettings }) {
  const excluded = WHT_POLICY_EXPENSE_TYPES.filter((type) => !values.baseExpenseTypes.includes(type))
  return (
    <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-5">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <dt className="font-semibold text-slate-500">ฐาน WHT (รวม)</dt>
        <dd className="mt-1 text-slate-900">{baseTypesText(values.baseExpenseTypes)}</dd>
        <dd className="mt-1 text-slate-500">ไม่รวม: {excluded.length === 0 ? '—' : baseTypesText(excluded)}</dd>
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <dt className="font-semibold text-slate-500">การออก 50 ทวิ</dt>
        <dd className="mt-1 text-slate-900">{WHT_CERTIFICATE_MODE_LABEL[values.certificateMode]}</dd>
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <dt className="font-semibold text-slate-500">ประเภทเงินได้</dt>
        <dd className="mt-1 text-slate-900">{incomeTypeText(values)}</dd>
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <dt className="font-semibold text-slate-500">40(1)/40(2) อัตรา 0%</dt>
        <dd className="mt-1 text-slate-900">{zeroRateText(values.issueZeroRate402Certificate)}</dd>
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <dt className="font-semibold text-slate-500">วิธียื่น ภ.ง.ด.</dt>
        <dd className="mt-1 text-slate-900">{WHT_FILING_METHOD_LABEL[values.filingMethod]}</dd>
      </div>
    </dl>
  )
}

export function WhtPolicyTab() {
  const { showToast } = useToast()
  const [overview, setOverview] = useState<WhtPolicyOverviewDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<FormState | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  /** ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** (กฎ `react-hooks/set-state-in-effect`) */
  const fetchOverview = useCallback(async () => callApi<WhtPolicyOverviewDto>('/api/settings/wht-policy'), [])

  const apply = useCallback((result: Awaited<ReturnType<typeof fetchOverview>>) => {
    if (result.error !== undefined) {
      setError({ title: result.error.title, message: result.error.message })
    } else {
      setOverview(result.data ?? null)
      setError(null)
    }
    setLoading(false)
  }, [])

  const reload = useCallback(async () => apply(await fetchOverview()), [apply, fetchOverview])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchOverview()
      if (!cancelled) apply(result)
    })()
    return () => {
      cancelled = true
    }
  }, [apply, fetchOverview])

  function openForm(): void {
    if (overview === null) return
    setForm({
      effectiveFrom: toInputDate(new Date()),
      baseExpenseTypes: [...overview.current.baseExpenseTypes],
      certificateMode: overview.current.certificateMode,
      incomeTypeMode: overview.current.incomeTypeMode,
      issueZeroRate402Certificate: overview.current.issueZeroRate402Certificate,
      inhouseIncomeCategory: overview.current.inhouseIncomeCategory,
      outsourceIncomeCategory: overview.current.outsourceIncomeCategory,
      filingMethod: overview.current.filingMethod,
      reason: '',
    })
    setErrors({})
    setFormOpen(true)
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => (current === null ? current : { ...current, [key]: value }))
  }

  function toggleType(type: ExpenseType, checked: boolean): void {
    if (form === null) return
    const next = checked ? [...form.baseExpenseTypes, type] : form.baseExpenseTypes.filter((each) => each !== type)
    set('baseExpenseTypes', normalizeBaseExpenseTypes(next))
  }

  async function save(): Promise<void> {
    if (form === null || overview === null) return
    // BUG-157 — โหมดที่ไม่ใช่ "แยกตามประเภททีม" ไม่ส่งการจับคู่ที่ซ่อนอยู่ (คงค่าเดิมของชุดปัจจุบัน)
    const payload = { ...effectiveTeamSideCategories(form, overview.current), reason: form.reason.trim() }
    const parsed = whtPolicyCreateSchema.safeParse(payload)
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error))
      return
    }
    setErrors({})
    setSaving(true)
    try {
      const result = await callApi('/api/settings/wht-policy', jsonRequest('POST', payload))
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({
        tone: 'success',
        title: 'บันทึกค่าตั้งภาษีหัก ณ ที่จ่ายแล้ว',
        description: `มีผลกับรอบจ่ายที่สร้างตั้งแต่ ${fmtDate(fromInputDate(form.effectiveFrom))}`,
      })
      setFormOpen(false)
      await reload()
    } finally {
      setSaving(false)
    }
  }

  const history = overview?.history ?? []

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">ค่าตั้งภาษีหัก ณ ที่จ่าย (Effective-dated)</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            ฐาน WHT · การออกหนังสือรับรอง 50 ทวิ · ประเภทเงินได้ · 40(1)/40(2) อัตรา 0% — มีผลกับรอบจ่ายที่สร้างตั้งแต่วันที่มีผล
            รอบที่สร้างแล้วใช้ค่าเดิมเสมอ · วิธียื่น ภ.ง.ด. มีผลกับกำหนดยื่นของเดือนที่ยื่นตั้งแต่วันที่มีผล
          </p>
        </div>
        <Can action="manage" resource={MANAGE_WHT_POLICY}>
          <Button onClick={openForm} disabled={overview === null}>
            + ตั้งค่าชุดใหม่
          </Button>
        </Can>
      </div>

      {overview !== null && (
        <div className="mb-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700">ค่าที่มีผลวันนี้ ({nowDate()})</span>
            {overview.isDefault && <StatusBadge group="neutral" label="ค่าเริ่มต้น" />}
          </div>
          <PolicySummary values={overview.current} />
        </div>
      )}

      <InlineAlert tone="info" title="ระบบเตรียมข้อมูลภาษีเท่านั้น">
        เงินได้ 40(1) และ 40(2) ใช้ &quot;อัตราหัก 40(1)/40(2)&quot; ที่กรอกในข้อมูลผู้รับเงินแต่ละคน (สำนักงานบัญชีคำนวณให้ ระบบไม่คิดอัตราก้าวหน้า)
        และยื่น ภ.ง.ด.1 · เงินได้ 40(8) หักตามกติกาภาษีของผู้รับ (ไม่หักเมื่อฐานต่ำกว่าเกณฑ์ต่อคนต่อรอบ)
      </InlineAlert>

      <div className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th>มีผลตั้งแต่</Th>
              <Th>ฐาน WHT (รวม)</Th>
              <Th>การออก 50 ทวิ</Th>
              <Th>ประเภทเงินได้</Th>
              <Th>40(1)/40(2) อัตรา 0%</Th>
              <Th>วิธียื่น ภ.ง.ด.</Th>
              <Th>เหตุผล / ผู้บันทึก</Th>
              <Th className="text-right">สถานะ</Th>
            </Tr>
          </THead>
          <TableState
            colSpan={8}
            loading={loading}
            error={error}
            isEmpty={history.length === 0}
            emptyTitle="ยังไม่เคยตั้งค่า — ใช้ค่าเริ่มต้น"
            emptyDescription="ฐานไม่รวมค่าที่พัก/เบิกตามใบเสร็จ · 50 ทวิ ต่อผู้รับต่อรอบจ่าย · 40(8) ทั้งหมด · 40(1)/40(2) อัตรา 0% ออก 50 ทวิ · ยื่น ภ.ง.ด. ออนไลน์"
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
              history.map((item) => (
                <Tr key={item.id} className={item.isCurrent ? 'bg-emerald-50/40' : undefined}>
                  <Td>
                    <span className="font-mono text-xs text-slate-700">{fmtDate(item.effectiveFrom)}</span>
                  </Td>
                  <Td>
                    <span className="text-xs text-slate-700">{baseTypesText(item.baseExpenseTypes)}</span>
                  </Td>
                  <Td>
                    <span className="text-xs text-slate-700">{WHT_CERTIFICATE_MODE_LABEL[item.certificateMode]}</span>
                  </Td>
                  <Td>
                    <span className="text-xs text-slate-700">{incomeTypeText(item)}</span>
                  </Td>
                  <Td>
                    <span className="text-xs text-slate-700">{zeroRateText(item.issueZeroRate402Certificate)}</span>
                  </Td>
                  <Td>
                    <span className="text-xs text-slate-700">{WHT_FILING_METHOD_LABEL[item.filingMethod]}</span>
                  </Td>
                  <Td>
                    <div className="text-xs text-slate-700">{item.reason}</div>
                    <div className="text-[11px] text-slate-400">
                      {item.createdByName} · {fmtDate(item.createdAt)}
                    </div>
                  </Td>
                  <Td className="text-right">
                    <StatusBadge
                      group={item.isCurrent ? 'success' : 'neutral'}
                      label={item.isCurrent ? 'มีผลอยู่' : 'ไม่ใช่ชุดปัจจุบัน'}
                    />
                  </Td>
                </Tr>
              ))}
          </TBody>
        </Table>
      </div>

      <Modal
        open={formOpen && form !== null}
        onClose={() => setFormOpen(false)}
        title="ตั้งค่าภาษีหัก ณ ที่จ่ายชุดใหม่"
        description="บันทึกเป็นชุดใหม่พร้อมวันที่มีผล — ชุดเดิมยังอยู่ในประวัติ ไม่ถูกแก้หรือลบ"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              บันทึกค่าตั้ง
            </Button>
          </>
        }
      >
        {form !== null && (
          <div className="space-y-4">
            {/* `<input type="date">` เป็นข้อยกเว้นเดียวที่ใช้ ค.ศ. (Rule 01) */}
            <Field
              id="wht-policy-from"
              label="วันที่มีผล"
              required
              error={errors.effectiveFrom}
              hint="วันนี้หรือวันในอนาคตเท่านั้น — มีผลกับรอบจ่ายที่สร้างตั้งแต่วันนั้น"
            >
              <Input
                id="wht-policy-from"
                type="date"
                value={form.effectiveFrom}
                onChange={(event) => set('effectiveFrom', event.target.value)}
              />
            </Field>

            <div>
              <div className="mb-2 text-xs font-bold text-slate-700">ชนิดรายการที่รวมในฐาน WHT</div>
              <div className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
                {WHT_POLICY_EXPENSE_TYPES.map((type) => (
                  <label key={type} className="flex items-center gap-2 text-xs font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.baseExpenseTypes.includes(type)}
                      onChange={(event) => toggleType(type, event.target.checked)}
                      className="focus-ring h-4 w-4 rounded border-slate-300"
                    />
                    {EXPENSE_TYPE_LABEL[type]}
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">
                รายการที่ไม่รวมยังจ่ายเต็มตามปกติ แค่ไม่ถูกหักภาษีและไม่นับเข้าเกณฑ์ขั้นต่ำ — ค่าใช้จ่ายที่เบิกคืนตามใบเสร็จ
                ในนามบริษัทไม่ใช่เงินได้ของผู้รับ
              </p>
              {errors.baseExpenseTypes !== undefined && (
                <p className="mt-1 text-[11px] text-red-600">{errors.baseExpenseTypes}</p>
              )}
            </div>

            <Field id="wht-policy-cert" label="การออกหนังสือรับรอง 50 ทวิ" required error={errors.certificateMode}>
              <Select
                id="wht-policy-cert"
                value={form.certificateMode}
                onChange={(event) => set('certificateMode', event.target.value as WhtCertificateMode)}
              >
                {WHT_CERTIFICATE_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {WHT_CERTIFICATE_MODE_LABEL[mode]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              id="wht-policy-income"
              label="ประเภทเงินได้"
              required
              error={errors.incomeTypeMode}
              hint="แยกตามประเภททีมใช้ทีมของผู้รับ ณ วันสร้างรอบจ่าย"
            >
              <Select
                id="wht-policy-income"
                value={form.incomeTypeMode}
                onChange={(event) => set('incomeTypeMode', event.target.value as WhtIncomeTypeMode)}
              >
                {WHT_INCOME_TYPE_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {WHT_INCOME_TYPE_MODE_LABEL[mode]}
                  </option>
                ))}
              </Select>
            </Field>

            {form.incomeTypeMode === 'by_team_side' && (
              <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
                <Field
                  id="wht-policy-inhouse"
                  label="ประเภทเงินได้ของทีม Inhouse"
                  required
                  error={errors.inhouseIncomeCategory}
                >
                  <Select
                    id="wht-policy-inhouse"
                    value={form.inhouseIncomeCategory}
                    onChange={(event) => set('inhouseIncomeCategory', event.target.value as WhtIncomeCategory)}
                  >
                    {WHT_TEAM_SIDE_INCOME_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {WHT_INCOME_CATEGORY_LABEL[category]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  id="wht-policy-outsource"
                  label="ประเภทเงินได้ของทีม Outsource"
                  required
                  error={errors.outsourceIncomeCategory}
                >
                  <Select
                    id="wht-policy-outsource"
                    value={form.outsourceIncomeCategory}
                    onChange={(event) => set('outsourceIncomeCategory', event.target.value as WhtIncomeCategory)}
                  >
                    {WHT_TEAM_SIDE_INCOME_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {WHT_INCOME_CATEGORY_LABEL[category]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <p className="text-[11px] text-slate-500 sm:col-span-2">
                  ตั้งตามคำแนะนำของสำนักงานบัญชี — 40(1)/40(2) หักตามอัตราต่อคนและยื่น ภ.ง.ด.1 · 40(8) หักตามกติกาภาษีของผู้รับ
                  และยื่น ภ.ง.ด.3/53
                </p>
              </div>
            )}

            <div>
              <label className="flex items-start gap-2 text-xs font-medium text-slate-700">
                <input
                  id="wht-policy-zero-rate"
                  type="checkbox"
                  checked={form.issueZeroRate402Certificate}
                  onChange={(event) => set('issueZeroRate402Certificate', event.target.checked)}
                  className="focus-ring mt-0.5 h-4 w-4 rounded border-slate-300"
                />
                {ISSUE_ZERO_RATE_40_2_LABEL}
              </label>
              <p className="mt-1.5 text-[11px] text-slate-500">
                ผู้รับเงินได้ 40(1)/40(2) ที่อัตราหัก 0% จะได้หนังสือรับรองยอดภาษี 0 (เงินได้ = ยอดที่จ่ายในฐาน) เพื่อใช้ยื่น ภ.ง.ด.90/91
                และนับในสรุป ภ.ง.ด.1 · ไม่เกี่ยวกับเงินได้ 40(8) ที่ต่ำกว่าเกณฑ์ขั้นต่ำ (ยังไม่ออกหนังสือรับรอง)
              </p>
            </div>

            {(form.incomeTypeMode === 'all_40_2' ||
              (form.incomeTypeMode === 'by_team_side' &&
                (usesPerPayeeWhtRate(form.inhouseIncomeCategory) ||
                  usesPerPayeeWhtRate(form.outsourceIncomeCategory)))) && (
              <InlineAlert tone="warning" title="ผู้รับเงิน 40(1)/40(2) ต้องมีอัตราหักก่อนสร้างรอบจ่าย">
                กรอก &quot;อัตราหัก 40(1)/40(2)&quot; ในข้อมูลผู้รับเงินทุกคนที่เข้าข่าย — ถ้าขาด ระบบจะไม่ให้สร้างรอบจ่ายและแสดงรายชื่อ
              </InlineAlert>
            )}

            <Field
              id="wht-policy-filing"
              label="วิธียื่น ภ.ง.ด."
              required
              error={errors.filingMethod}
              hint="ใช้คิดวันกำหนดยื่นและการแจ้งเตือน (ไม่เลื่อนตามวันหยุดราชการ)"
            >
              <Select
                id="wht-policy-filing"
                value={form.filingMethod}
                onChange={(event) => set('filingMethod', event.target.value as WhtFilingMethod)}
              >
                {WHT_FILING_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {WHT_FILING_METHOD_LABEL[method]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field id="wht-policy-reason" label="เหตุผล" required error={errors.reason}>
              <Textarea
                id="wht-policy-reason"
                value={form.reason}
                onChange={(event) => set('reason', event.target.value)}
                placeholder="เช่น สำนักงานบัญชียืนยันประเภทเงินได้ตามสัญญาจ้าง"
              />
            </Field>
          </div>
        )}
      </Modal>
    </Card>
  )
}
