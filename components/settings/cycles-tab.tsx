'use client'

import { SettingHelp } from '@/components/settings/setting-help'
import { cycleDueHelp, intFromInput } from '@/lib/settings/help'
import { useCallback, useEffect, useState } from 'react'
import { Can } from '@/components/auth/permission-provider'
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
import {
  CYCLE_SCOPE_KINDS_BY_TYPE,
  CYCLE_SCOPE_LABEL,
  MAX_CUTOFF_DAY,
  MIN_CUTOFF_DAY,
  describeCutoffRule,
  describeCycleScope,
} from '@/lib/settings/cycles'
import type { FinanceCompanyDto } from '@/lib/finance-companies/types'
import { cycleCreateSchema } from '@/lib/settings/schemas'
import type { CycleDto } from '@/lib/settings/types'

/**
 * แท็บ "รอบบิล/รอบจ่าย" (`13` §6.1) — รอบ AR (วางบิลลูกค้า) และ AP (จ่ายเงินทีม)
 *
 * รูปร่างของฟิลด์ต้องเข้าคู่กับ CHECK ระดับ DB (`cycles_cutoff_shape` / `cycles_due_rule_shape`)
 * ⇒ ฟอร์ม **ซ่อนช่องที่ไม่เกี่ยวกับชนิดที่เลือกจริง** ไม่ใช่แค่ disable (ค่าค้างทำให้ API ปฏิเสธ)
 *
 * `dueRule` เป็น label ที่ระบบประกอบให้เอง (A5) — ผู้ใช้พิมพ์เองไม่ได้ เพื่อไม่ให้ label ขัดกับค่าจริง
 *
 * มติ PO U133: "ใช้กับ" เป็นขอบเขตจริง — รอบบิล = ทุกบริษัท/เลือกรายบริษัท · รอบจ่าย = ทุกทีม/In-house/Outsource
 * ห้ามซ้อนกับรอบชนิดเดียวกัน (API ตอบ `CYCLE_SCOPE_OVERLAP`) · ตอนสร้างรอบวางบิล/รอบจ่ายระบบเลือกรอบที่ตรงให้
 */

// มติ PO U146 — ตัดชนิดข้อความอิสระ: กติกาต้องคำนวณวันตัดรอบได้ (หน้าสร้างรอบวางบิล/รอบจ่ายเสนอวันตัดให้)
type CutoffRuleType = 'fixed_dates' | 'month_end'
type DueRuleType = 'net_days' | 'day_of_next_month' | 'month_end'
type ScopeKind = 'all_companies' | 'selected_companies' | 'all_teams' | 'inhouse' | 'outsource'

interface FormState {
  name: string
  type: 'AR' | 'AP'
  cutoffRuleType: CutoffRuleType
  cutoffDates: number[]
  dueRuleType: DueRuleType
  dueRuleValue: string
  scopeKind: ScopeKind
  companyIds: string[]
  reason: string
}

const EMPTY_FORM: FormState = {
  name: '',
  type: 'AR',
  cutoffRuleType: 'fixed_dates',
  cutoffDates: [],
  dueRuleType: 'net_days',
  dueRuleValue: '30',
  scopeKind: 'all_companies',
  companyIds: [],
  reason: '',
}

const CUTOFF_RULE_LABEL: Readonly<Record<CutoffRuleType, string>> = {
  fixed_dates: 'วันที่คงที่ทุกเดือน',
  month_end: 'ทุกสิ้นเดือน',
}

const DUE_RULE_LABEL: Readonly<Record<DueRuleType, string>> = {
  net_days: 'Net X วัน นับจากวันตัดรอบ',
  day_of_next_month: 'วันที่ X ของเดือนถัดไป',
  month_end: 'สิ้นเดือน',
}

/** สีป้ายประเภทรอบผ่าน mapper กลาง — ไม่ใส่คลาสสีเอง (preship R2-037) */
/** ประเภทรอบเป็นหมวดหมู่ ไม่ใช่สถานะ ⇒ ใช้ป้ายกลาง ไม่ยืมสีสถานะ (preship R3-041) */
const TYPE_LABEL: Readonly<Record<'AR' | 'AP', string>> = {
  AR: 'AR — วางบิลลูกค้า',
  AP: 'AP — จ่ายเงินทีม',
}

const CUTOFF_DAYS = Array.from({ length: MAX_CUTOFF_DAY - MIN_CUTOFF_DAY + 1 }, (_, index) => MIN_CUTOFF_DAY + index)

type TypeFilter = 'all' | 'AR' | 'AP'

export function CyclesTab() {
  const { showToast } = useToast()
  const [items, setItems] = useState<readonly CycleDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  const [status, setStatus] = useState<StatusFilter>('active')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CycleDto | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const [companies, setCompanies] = useState<readonly FinanceCompanyDto[]>([])

  const [deleteTarget, setDeleteTarget] = useState<CycleDto | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleting, setDeleting] = useState(false)

  /** ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** (กฎ `react-hooks/set-state-in-effect`) */
  const fetchItems = useCallback(async () => {
    const params = new URLSearchParams({ status })
    if (typeFilter !== 'all') params.set('type', typeFilter)
    return callApi<CycleDto[]>(`/api/settings/cycles?${params.toString()}`)
  }, [status, typeFilter])

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

  // รายชื่อบริษัทสำหรับรอบบิลแบบเลือกรายบริษัท (โหลดเมื่อเปิดฟอร์ม)
  useEffect(() => {
    if (!formOpen) return
    let cancelled = false
    void (async () => {
      const result = await callApi<FinanceCompanyDto[]>('/api/finance-companies?status=all')
      if (!cancelled) setCompanies(result.data ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [formOpen])

  function openForm(target: CycleDto | null): void {
    setEditing(target)
    setForm(
      target === null
        ? EMPTY_FORM
        : {
            name: target.name,
            type: target.type,
            cutoffRuleType: target.cutoffRuleType,
            cutoffDates: [...target.cutoffDates],
            dueRuleType: target.dueRuleType,
            dueRuleValue: target.dueRuleValue === null ? '' : String(target.dueRuleValue),
            scopeKind: target.scopeKind,
            companyIds: target.companies.map((company) => company.id),
            reason: '',
          },
    )
    setErrors({})
    setFormOpen(true)
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function toggleCompany(companyId: string): void {
    setForm((current) => ({
      ...current,
      companyIds: current.companyIds.includes(companyId)
        ? current.companyIds.filter((value) => value !== companyId)
        : [...current.companyIds, companyId],
    }))
  }

  function toggleCutoffDay(day: number): void {
    setForm((current) => ({
      ...current,
      cutoffDates: current.cutoffDates.includes(day)
        ? current.cutoffDates.filter((value) => value !== day)
        : [...current.cutoffDates, day].sort((a, b) => a - b),
    }))
  }

  async function save(): Promise<void> {
    // ส่งเฉพาะค่าที่เข้าคู่กับชนิดที่เลือก — ค่าของอีกโหมดต้องเป็น []/null จริง ไม่ใช่ค่าค้าง
    const parsed = cycleCreateSchema.safeParse({
      name: form.name.trim(),
      type: form.type,
      cutoffRuleType: form.cutoffRuleType,
      cutoffDates: form.cutoffRuleType === 'fixed_dates' ? form.cutoffDates : [],
      dueRuleType: form.dueRuleType,
      dueRuleValue: form.dueRuleType === 'month_end' || form.dueRuleValue.trim() === '' ? null : Number(form.dueRuleValue),
      scopeKind: form.scopeKind,
      companyIds: form.scopeKind === 'selected_companies' ? form.companyIds : [],
      reason: form.reason.trim(),
    })
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error))
      return
    }

    setErrors({})
    setSaving(true)
    try {
      const result = await callApi<CycleDto>(
        editing === null ? '/api/settings/cycles' : `/api/settings/cycles/${editing.id}`,
        jsonRequest(editing === null ? 'POST' : 'PATCH', parsed.data),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({
        tone: 'success',
        title: editing === null ? 'สร้างรอบแล้ว' : 'บันทึกรอบแล้ว',
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
        `/api/settings/cycles/${deleteTarget.id}`,
        jsonRequest('DELETE', { reason: deleteReason.trim() }),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({ tone: 'success', title: 'ปิดใช้งานรอบแล้ว', description: deleteTarget.name })
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
          <h2 className="text-sm font-bold text-slate-900">รอบบิล / รอบจ่าย (Cycles)</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            รอบ AR = วางบิลบริษัทไฟแนนซ์ · รอบ AP = จ่ายค่าตอบแทนทีม — ใช้กำหนดวันตัดรอบและวันครบกำหนดชำระ
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-40">
            <Select
              aria-label="กรองตามชนิดรอบ"
              value={typeFilter}
              onChange={(event) => {
                setLoading(true)
                setTypeFilter(event.target.value as TypeFilter)
              }}
            >
              <option value="all">ชนิด: ทั้งหมด</option>
              <option value="AR">AR — วางบิล</option>
              <option value="AP">AP — จ่ายเงิน</option>
            </Select>
          </div>
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
            <Button onClick={() => openForm(null)}>+ สร้างรอบ</Button>
          </Can>
        </div>
      </div>

      <SettingHelp className="mb-3" help={cycleDueHelp({ dueRuleType: 'net_days', dueRuleValue: 30, cutoffDay: 31 })} />

      <Table>
        <THead>
          <Tr>
            <Th>ชื่อรอบ</Th>
            <Th>ชนิด</Th>
            <Th>วันตัดรอบ</Th>
            <Th>กำหนดชำระ</Th>
            <Th>ใช้กับ</Th>
            <Th className="text-right">สถานะ / จัดการ</Th>
          </Tr>
        </THead>
        {/* `TableState` เรนเดอร์ `<tbody>` ของตัวเอง — วางเป็นพี่น้องกับ `TBody` */}
        <TableState
          colSpan={6}
          loading={loading}
          error={error}
          isEmpty={items.length === 0}
          emptyTitle="ยังไม่มีรอบบิล/รอบจ่าย"
          emptyDescription="สร้างรอบแรกเพื่อให้ระบบรู้ว่าต้องตัดยอดวางบิลและจ่ายเงินวันไหน"
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
                  <Badge>{TYPE_LABEL[item.type]}</Badge>
                </Td>
                <Td>
                  <span className="text-xs text-slate-600">{describeCutoffRule(item)}</span>
                </Td>
                <Td>
                  <span className="text-xs text-slate-600">{item.dueRule}</span>
                </Td>
                <Td>
                  <span className="text-xs text-slate-700">
                    {describeCycleScope(
                      item.scopeKind,
                      item.companies.map((company) => company.name),
                    )}
                  </span>
                  {item.legacyScopeNote !== null && (
                    <div className="mt-0.5 text-[10px] text-slate-400">ข้อความเดิม: {item.legacyScopeNote}</div>
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

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        size="lg"
        title={editing === null ? 'สร้างรอบบิล/รอบจ่าย' : `แก้ไขรอบ — ${editing.name}`}
        description="ข้อความกำหนดชำระที่แสดงในระบบประกอบมาจากเงื่อนไขที่เลือก — พิมพ์เองไม่ได้เพื่อกันข้อความขัดกับค่าจริง"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              {editing === null ? 'สร้างรอบ' : 'บันทึกการแก้ไข'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="cycle-name" label="ชื่อรอบ" required error={errors.name}>
              <Input
                id="cycle-name"
                value={form.name}
                onChange={(event) => set('name', event.target.value)}
                placeholder='เช่น "รอบวางบิลกลางเดือน"'
              />
            </Field>
            <Field id="cycle-type" label="ชนิดรอบ" required error={errors.type}>
              <Select
                id="cycle-type"
                value={form.type}
                onChange={(event) => {
                  const type = event.target.value as 'AR' | 'AP'
                  // เปลี่ยนชนิด = ขอบเขตต้องเปลี่ยนตาม (รอบบิลใช้กับบริษัท · รอบจ่ายใช้กับฝั่งทีม)
                  setForm((current) => ({
                    ...current,
                    type,
                    scopeKind: CYCLE_SCOPE_KINDS_BY_TYPE[type][0] ?? current.scopeKind,
                    companyIds: [],
                  }))
                }}
              >
                <option value="AR">AR — วางบิลบริษัทไฟแนนซ์</option>
                <option value="AP">AP — จ่ายค่าตอบแทนทีม</option>
              </Select>
            </Field>
          </div>

          <Field id="cycle-cutoff-type" label="กติกาวันตัดรอบ" required error={errors.cutoffRuleType}>
            <Select
              id="cycle-cutoff-type"
              value={form.cutoffRuleType}
              onChange={(event) => set('cutoffRuleType', event.target.value as CutoffRuleType)}
            >
              {(Object.keys(CUTOFF_RULE_LABEL) as CutoffRuleType[]).map((value) => (
                <option key={value} value={value}>
                  {CUTOFF_RULE_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>

          {/* ซ่อนจริงตามชนิดที่เลือก — ค่าของอีกโหมดถูกส่งเป็น []/'' เสมอตอนบันทึก */}
          {form.cutoffRuleType === 'fixed_dates' && (
            <Field id="cycle-cutoff-dates" label="วันที่ตัดรอบ (เลือกได้หลายวัน)" required error={errors.cutoffDates}>
              <div id="cycle-cutoff-dates" className="flex flex-wrap gap-1.5">
                {CUTOFF_DAYS.map((day) => {
                  const selected = form.cutoffDates.includes(day)
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleCutoffDay(day)}
                      className={
                        selected
                          ? 'focus-ring h-8 w-8 rounded-md bg-slate-900 font-mono text-xs font-semibold text-white'
                          : 'focus-ring h-8 w-8 rounded-md border border-slate-200 bg-white font-mono text-xs text-slate-600 hover:border-slate-400'
                      }
                    >
                      {day}
                    </button>
                  )
                })}
              </div>
            </Field>
          )}

          {editing?.legacyCutoffText !== null && editing?.legacyCutoffText !== undefined && (
            <p className="text-[11px] text-slate-500">กติกาเดิมที่พิมพ์ไว้: “{editing.legacyCutoffText}” (แปลงเป็นวันที่ตัดรอบด้านบนแล้ว)</p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="cycle-due-type" label="เงื่อนไขกำหนดชำระ" required error={errors.dueRuleType}>
              <Select
                id="cycle-due-type"
                value={form.dueRuleType}
                onChange={(event) => set('dueRuleType', event.target.value as DueRuleType)}
              >
                {(Object.keys(DUE_RULE_LABEL) as DueRuleType[]).map((value) => (
                  <option key={value} value={value}>
                    {DUE_RULE_LABEL[value]}
                  </option>
                ))}
              </Select>
            </Field>

            {form.dueRuleType !== 'month_end' && (
              <Field
                id="cycle-due-value"
                label={form.dueRuleType === 'net_days' ? 'จำนวนวัน (Net)' : 'วันที่ของเดือนถัดไป'}
                required
                error={errors.dueRuleValue}
              >
                <Input
                  id="cycle-due-value"
                  numeric
                  inputMode="numeric"
                  value={form.dueRuleValue}
                  onChange={(event) => set('dueRuleValue', event.target.value.replace(/\D/g, ''))}
                  placeholder={form.dueRuleType === 'net_days' ? '30' : '15'}
                />
              </Field>
            )}
          </div>

          <SettingHelp
            help={cycleDueHelp({
              dueRuleType: form.dueRuleType,
              dueRuleValue: intFromInput(form.dueRuleValue),
              cutoffDay: form.cutoffRuleType === 'fixed_dates' ? (form.cutoffDates[0] ?? null) : null,
            })}
          />

          <Field
            id="cycle-scope"
            label="ใช้กับ (ขอบเขต)"
            required
            error={errors.scopeKind}
            hint={
              form.type === 'AR'
                ? 'ตอนสร้างรอบวางบิล ระบบเลือกรอบที่ใช้กับบริษัทนั้นให้อัตโนมัติ — 1 บริษัทอยู่ได้รอบบิลเดียว'
                : 'ตอนสร้างรอบจ่าย ระบบเลือกรอบที่ใช้กับฝั่งทีมนั้นให้อัตโนมัติ — 1 ฝั่งทีมอยู่ได้รอบจ่ายเดียว'
            }
          >
            <Select
              id="cycle-scope"
              value={form.scopeKind}
              onChange={(event) => set('scopeKind', event.target.value as ScopeKind)}
            >
              {CYCLE_SCOPE_KINDS_BY_TYPE[form.type].map((value) => (
                <option key={value} value={value}>
                  {CYCLE_SCOPE_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>

          {form.type === 'AR' && form.scopeKind === 'selected_companies' && (
            <Field id="cycle-companies" label="บริษัทที่ใช้รอบนี้" required error={errors.companyIds}>
              <div
                id="cycle-companies"
                className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2"
              >
                {companies.length === 0 && <p className="text-xs text-slate-400">กำลังโหลดรายชื่อบริษัท…</p>}
                {companies.map((company) => (
                  <label key={company.id} className="flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.companyIds.includes(company.id)}
                      onChange={() => toggleCompany(company.id)}
                    />
                    {company.name}
                    {company.status === 'suspended' && <span className="text-[10px] text-red-600">(ระงับ)</span>}
                  </label>
                ))}
              </div>
            </Field>
          )}

          {editing?.legacyScopeNote !== null && editing?.legacyScopeNote !== undefined && (
            <InlineAlert tone="info" title="ข้อความขอบเขตเดิม">
              “{editing.legacyScopeNote}” — ข้อความนี้ไม่มีผลกับการเลือกรอบ ตรวจว่าขอบเขตด้านบนตรงกับที่ตั้งใจ
            </InlineAlert>
          )}

          <Field id="cycle-reason" label="เหตุผล" required error={errors.reason}>
            <Textarea
              id="cycle-reason"
              value={form.reason}
              onChange={(event) => set('reason', event.target.value)}
              placeholder="เช่น ปรับรอบวางบิลตามข้อตกลงใหม่กับบริษัทไฟแนนซ์"
            />
          </Field>

          <InlineAlert tone="warning" title="การแก้รอบมีผลกับงวดที่ยังไม่ปิด">
            งวดที่ปิดไปแล้วจะไม่ถูกคำนวณย้อนหลัง — เอกสารเก่ายังอ้างค่าเดิมที่ snapshot ไว้เสมอ
          </InlineAlert>
        </div>
      </Modal>

      <ReasonConfirmModal
        open={deleteTarget !== null}
        title={`ปิดใช้งานรอบ "${deleteTarget?.name ?? ''}"`}
        description="ปิดใช้งานเป็น soft delete — เอกสารและงวดเก่ายังอ้างชื่อรอบนี้ได้ตามปกติ"
        confirmLabel="ยืนยันปิดใช้งาน"
        loading={deleting}
        reason={deleteReason}
        onReasonChange={setDeleteReason}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
        placeholder="เช่น เลิกใช้รอบนี้ตั้งแต่งวด 10/2569"
      />
    </Card>
  )
}
