'use client'

import { useCallback, useEffect, useState } from 'react'
import { Can } from '@/components/auth/permission-provider'
import { ReasonConfirmModal } from '@/components/settings/reason-confirm-modal'
import {
  ACCOUNT_TYPE_LABEL,
  ACTIVE_BADGE_GROUP,
  BANK_ACCOUNT_USAGE_OPTION,
  MANAGE_SETTINGS,
  STATUS_FILTER_LABEL,
  type StatusFilter,
} from '@/components/settings/shared'
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
import type { BankAccountUsage } from '@/lib/generated/prisma/enums'
import { DEFAULT_AUTO_MATCH_TOLERANCE_DAYS, MAX_AUTO_MATCH_TOLERANCE_DAYS } from '@/lib/settings/bank-account'
import { bankAccountCreateSchema } from '@/lib/settings/schemas'
import type { BankAccountDto } from '@/lib/settings/types'

/**
 * แท็บ "บัญชีธนาคารบริษัท" (`13` §6.3)
 *
 * `usage` เป็นตัวกำหนดว่าบัญชีนี้ใช้ **รับ** หรือ **จ่าย** ได้ (`is_payout_account` เลิกใช้แล้ว) —
 * บัญชีที่มีรายการผูกอยู่ปิดไม่ได้ (`BANK_ACCOUNT_IN_USE`) · เลขบัญชีเต็มแสดงเฉพาะในฟอร์มแก้ไข
 * ส่วนตารางแสดงแบบปิดบัง (`90` §6.2)
 */

type AccountType = 'savings' | 'current'
type UsageFilter = 'all' | BankAccountUsage

interface FormState {
  bankName: string
  accountName: string
  accountNumber: string
  accountType: AccountType
  usage: BankAccountUsage
  statementFormat: string
  paymentFileFormat: string
  autoMatchToleranceDays: string
  isPrimary: boolean
  reason: string
}

const EMPTY_FORM: FormState = {
  bankName: '',
  accountName: '',
  accountNumber: '',
  accountType: 'current',
  usage: 'both',
  statementFormat: '',
  paymentFileFormat: '',
  autoMatchToleranceDays: String(DEFAULT_AUTO_MATCH_TOLERANCE_DAYS),
  isPrimary: false,
  reason: '',
}

const USAGE_BADGE: Readonly<Record<BankAccountUsage, string>> = {
  receive: 'bg-blue-100 text-blue-700',
  pay: 'bg-purple-100 text-purple-700',
  both: 'bg-slate-100 text-slate-700',
}

export function BankAccountsTab() {
  const { showToast } = useToast()
  const [items, setItems] = useState<readonly BankAccountDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  const [status, setStatus] = useState<StatusFilter>('active')
  const [usageFilter, setUsageFilter] = useState<UsageFilter>('all')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<BankAccountDto | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<BankAccountDto | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleting, setDeleting] = useState(false)

  /** ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** (กฎ `react-hooks/set-state-in-effect`) */
  const fetchItems = useCallback(async () => {
    const params = new URLSearchParams({ status })
    if (usageFilter !== 'all') params.set('usage', usageFilter)
    return callApi<BankAccountDto[]>(`/api/settings/bank-accounts?${params.toString()}`)
  }, [status, usageFilter])

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

  function openForm(target: BankAccountDto | null): void {
    setEditing(target)
    setForm(
      target === null
        ? EMPTY_FORM
        : {
            bankName: target.bankName,
            accountName: target.accountName,
            accountNumber: target.accountNumber,
            accountType: target.accountType as AccountType,
            usage: target.usage,
            statementFormat: target.statementFormat ?? '',
            paymentFileFormat: target.paymentFileFormat ?? '',
            autoMatchToleranceDays: String(target.autoMatchToleranceDays),
            isPrimary: target.isPrimary,
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
    const parsed = bankAccountCreateSchema.safeParse({
      bankName: form.bankName.trim(),
      accountName: form.accountName.trim(),
      accountNumber: form.accountNumber.trim(),
      accountType: form.accountType,
      usage: form.usage,
      statementFormat: form.statementFormat.trim(),
      paymentFileFormat: form.paymentFileFormat.trim(),
      autoMatchToleranceDays: form.autoMatchToleranceDays.trim() === '' ? 0 : Number(form.autoMatchToleranceDays),
      isPrimary: form.isPrimary,
      reason: form.reason.trim(),
    })
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error))
      return
    }

    setErrors({})
    setSaving(true)
    try {
      const result = await callApi<BankAccountDto>(
        editing === null ? '/api/settings/bank-accounts' : `/api/settings/bank-accounts/${editing.id}`,
        jsonRequest(editing === null ? 'POST' : 'PATCH', parsed.data),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({
        tone: 'success',
        title: editing === null ? 'เพิ่มบัญชีธนาคารแล้ว' : 'บันทึกบัญชีธนาคารแล้ว',
        description: `${form.bankName.trim()} · ${result.data?.accountNumberMasked ?? ''}`,
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
        `/api/settings/bank-accounts/${deleteTarget.id}`,
        jsonRequest('DELETE', { reason: deleteReason.trim() }),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({ tone: 'success', title: 'ปิดใช้งานบัญชีแล้ว', description: deleteTarget.accountNumberMasked })
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
          <h2 className="text-sm font-bold text-slate-900">บัญชีธนาคารบริษัท</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            บัญชีที่ใช้รับเงินจากบริษัทไฟแนนซ์และจ่ายค่าตอบแทนทีม — ใช้จับคู่รายการเดินบัญชี (ไฟล์ 13 §6.3 · 35)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-44">
            <Select
              aria-label="กรองตามการใช้งาน"
              value={usageFilter}
              onChange={(event) => {
                setLoading(true)
                setUsageFilter(event.target.value as UsageFilter)
              }}
            >
              <option value="all">การใช้งาน: ทั้งหมด</option>
              {(Object.keys(BANK_ACCOUNT_USAGE_OPTION) as BankAccountUsage[]).map((value) => (
                <option key={value} value={value}>
                  {BANK_ACCOUNT_USAGE_OPTION[value]}
                </option>
              ))}
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
            <Button onClick={() => openForm(null)}>+ เพิ่มบัญชี</Button>
          </Can>
        </div>
      </div>

      <Table>
        <THead>
          <Tr>
            <Th>ธนาคาร / ชื่อบัญชี</Th>
            <Th>เลขบัญชี</Th>
            <Th>ประเภท</Th>
            <Th>การใช้งาน</Th>
            <Th>จับคู่อัตโนมัติ</Th>
            <Th className="text-right">สถานะ / จัดการ</Th>
          </Tr>
        </THead>
        {/* `TableState` เรนเดอร์ `<tbody>` ของตัวเอง — วางเป็นพี่น้องกับ `TBody` */}
        <TableState
          colSpan={6}
          loading={loading}
          error={error}
          isEmpty={items.length === 0}
          emptyTitle="ยังไม่มีบัญชีธนาคาร"
          emptyDescription="เพิ่มบัญชีแรกเพื่อใช้รับเงินวางบิลและตัดจ่ายค่าตอบแทน"
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
                  <div className="font-semibold text-slate-900">{item.bankName}</div>
                  <div className="mt-0.5 text-[10px] text-slate-500">{item.accountName}</div>
                </Td>
                <Td>
                  <span className="font-mono text-xs text-slate-700">{item.accountNumberMasked}</span>
                  {item.isPrimary && <Badge className="ml-2 bg-amber-100 text-amber-800">บัญชีหลัก</Badge>}
                </Td>
                <Td>
                  <span className="text-xs text-slate-600">
                    {ACCOUNT_TYPE_LABEL[item.accountType as AccountType] ?? item.accountType}
                  </span>
                </Td>
                <Td>
                  <Badge className={USAGE_BADGE[item.usage]}>{BANK_ACCOUNT_USAGE_OPTION[item.usage]}</Badge>
                </Td>
                <Td>
                  <span className="font-mono text-xs text-slate-600">±{item.autoMatchToleranceDays} วัน</span>
                  <div className="mt-0.5 text-[10px] text-slate-400">แก้ไขล่าสุด {fmtDate(item.updatedAt)}</div>
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
        title={editing === null ? 'เพิ่มบัญชีธนาคารบริษัท' : `แก้ไขบัญชี — ${editing.bankName}`}
        description="การใช้งาน (รับ/จ่าย/ทั้งสอง) เป็นตัวกำหนดว่าบัญชีนี้จะถูกเลือกได้ในรอบจ่ายและการรับชำระ"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              {editing === null ? 'เพิ่มบัญชี' : 'บันทึกการแก้ไข'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="bank-account-bank" label="ธนาคาร" required error={errors.bankName}>
              <Input
                id="bank-account-bank"
                value={form.bankName}
                onChange={(event) => set('bankName', event.target.value)}
                placeholder='เช่น "ธนาคารกสิกรไทย"'
              />
            </Field>
            <Field id="bank-account-name" label="ชื่อบัญชี" required error={errors.accountName}>
              <Input
                id="bank-account-name"
                value={form.accountName}
                onChange={(event) => set('accountName', event.target.value)}
                placeholder="ชื่อบัญชีตามหน้าสมุด"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="bank-account-number" label="เลขที่บัญชี" required error={errors.accountNumber}>
              <Input
                id="bank-account-number"
                className="font-mono"
                value={form.accountNumber}
                onChange={(event) => set('accountNumber', event.target.value)}
                placeholder="123-4-56789-0"
              />
            </Field>
            <Field id="bank-account-type" label="ประเภทบัญชี" required error={errors.accountType}>
              <Select
                id="bank-account-type"
                value={form.accountType}
                onChange={(event) => set('accountType', event.target.value as AccountType)}
              >
                {(Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((value) => (
                  <option key={value} value={value}>
                    {ACCOUNT_TYPE_LABEL[value]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="bank-account-usage" label="การใช้งาน" required error={errors.usage}>
              <Select
                id="bank-account-usage"
                value={form.usage}
                onChange={(event) => set('usage', event.target.value as BankAccountUsage)}
              >
                {(Object.keys(BANK_ACCOUNT_USAGE_OPTION) as BankAccountUsage[]).map((value) => (
                  <option key={value} value={value}>
                    {BANK_ACCOUNT_USAGE_OPTION[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              id="bank-account-tolerance"
              label={`ช่วงวันจับคู่อัตโนมัติ (0-${MAX_AUTO_MATCH_TOLERANCE_DAYS} วัน)`}
              required
              error={errors.autoMatchToleranceDays}
            >
              <Input
                id="bank-account-tolerance"
                numeric
                inputMode="numeric"
                value={form.autoMatchToleranceDays}
                onChange={(event) => set('autoMatchToleranceDays', event.target.value.replace(/\D/g, ''))}
                placeholder={String(DEFAULT_AUTO_MATCH_TOLERANCE_DAYS)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="bank-account-statement" label="รูปแบบไฟล์ statement" error={errors.statementFormat}>
              <Input
                id="bank-account-statement"
                value={form.statementFormat}
                onChange={(event) => set('statementFormat', event.target.value)}
                placeholder='เช่น "CSV มาตรฐาน KBank"'
              />
            </Field>
            <Field id="bank-account-payment-file" label="รูปแบบไฟล์โอนเงิน" error={errors.paymentFileFormat}>
              <Input
                id="bank-account-payment-file"
                value={form.paymentFileFormat}
                onChange={(event) => set('paymentFileFormat', event.target.value)}
                placeholder='เช่น "K-Cash Connect"'
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={form.isPrimary}
              onChange={(event) => set('isPrimary', event.target.checked)}
              className="focus-ring h-4 w-4 rounded border-slate-300"
            />
            ตั้งเป็นบัญชีหลักขององค์กร
          </label>

          <Field id="bank-account-reason" label="เหตุผล" required error={errors.reason}>
            <Textarea
              id="bank-account-reason"
              value={form.reason}
              onChange={(event) => set('reason', event.target.value)}
              placeholder="เช่น เปิดบัญชีใหม่สำหรับรับเงินวางบิลปี 2569"
            />
          </Field>

          <InlineAlert tone="warning" title="ข้อมูลบัญชีธนาคารเป็นข้อมูลอ่อนไหว">
            ทุกการเพิ่ม/แก้ไขต้องมีเหตุผลและถูกบันทึกลง Audit Log — เลขบัญชีถูกปิดบังในบันทึกและในตาราง (ไฟล์ 90 §6.2/§13)
          </InlineAlert>
        </div>
      </Modal>

      <ReasonConfirmModal
        open={deleteTarget !== null}
        title={`ปิดใช้งานบัญชี "${deleteTarget?.accountNumberMasked ?? ''}"`}
        description="บัญชีที่มีรายการรับ/จ่ายผูกอยู่ปิดไม่ได้ (BANK_ACCOUNT_IN_USE) — รายการเดินบัญชีเก่ายังอ้างบัญชีนี้ได้"
        confirmLabel="ยืนยันปิดใช้งาน"
        loading={deleting}
        reason={deleteReason}
        onReasonChange={setDeleteReason}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
        placeholder="เช่น ปิดบัญชีกับธนาคารแล้วเมื่อ 01/08/2569"
      />
    </Card>
  )
}
