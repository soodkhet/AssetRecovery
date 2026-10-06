'use client'

import { useCallback, useEffect, useState } from 'react'
import { AddressFields } from '@/components/address/address-fields'
import { Can } from '@/components/auth/permission-provider'
import { ReasonConfirmModal } from '@/components/settings/reason-confirm-modal'
import { SettingHelp } from '@/components/settings/setting-help'
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
import { EMPTY_ADDRESS, addressFromDto, type AddressValue } from '@/lib/address/address-value'
import { callApi, jsonRequest } from '@/lib/api/types'
import { toFieldErrors } from '@/lib/api/validation'
import { branchCodeFromForm, branchKindOf, formatBranch, isHeadOfficeBranch, type BranchKind } from '@/lib/format/branch'
import { fmtDate } from '@/lib/format/datetime'
import { fmtPercent, fmtSatangSymbol } from '@/lib/format/money'
import type { WhtCondition } from '@/lib/generated/prisma/enums'
import {
  nameTitleChoiceOf,
  nameTitleFromForm,
  PAYEE_NAME_TITLE_OPTIONS,
  PAYEE_REQUIRED_ADDRESS_FIELDS,
  WHT_CONDITION_LABEL,
  selectableWhtConditions,
  whtConditionHint,
  type PayeeNameTitleChoice,
} from '@/lib/payees/payee'
import { payeeCreateSchema, payeeUpdateSchema } from '@/lib/payees/schemas'
import type { PayeeDto } from '@/lib/payees/types'
import { payeeConditionHelp, payeeTaxProfileHelp, payeeWht402Help, pctFromInput } from '@/lib/settings/help'
import type { TaxProfileDto } from '@/lib/settings/types'

/**
 * แท็บ "ผู้รับเงิน (Payee Profile)" — ไฟล์ 18 §8 (mockup `settings.html` `renderSettingsPayee`)
 *
 * 3 กติกาที่หน้าจอนี้ต้องสื่อให้ชัด:
 * 1. **แก้ธนาคาร/ภาษีของรายที่ยืนยันแล้ว = ต้องยืนยันใหม่** (`18` §9) — เตือนก่อนบันทึกเสมอ
 * 2. **ชื่อบัญชีไม่ตรงชื่อผู้รับเงิน = เตือน ไม่บล็อก** (`18` §11 `BANK_ACCOUNT_NAME_MISMATCH`)
 * 3. **อัตรา WHT มาจาก Tax Profile ที่ผูก** — ไม่ผูก = ตกไปใช้อัตราของแผนค่าตอบแทนพร้อมคำเตือน (`18` §6.3)
 *
 * ปุ่มทั้งหมดห่อด้วย `<Can>` เป็นแค่ UX — API ตรวจ `manage:manage_payee_profile` ซ้ำเสมอ (DEC-002)
 */

const MANAGE_PAYEE_PROFILE = 'manage_payee_profile'

type StatusFilter = 'all' | 'verified' | 'unverified'

const STATUS_FILTER_LABEL: Readonly<Record<StatusFilter, string>> = {
  all: 'สถานะ: ทั้งหมด',
  verified: 'สถานะ: ยืนยันแล้ว',
  unverified: 'สถานะ: รอยืนยัน',
}

const PAYEE_TYPE_LABEL: Readonly<Record<'individual' | 'corporate', string>> = {
  individual: 'บุคคลธรรมดา',
  corporate: 'นิติบุคคล',
}

/** ฟิลด์ที่แก้แล้ว payee ที่ยืนยันแล้วต้องยืนยันใหม่ (`18` §9) — ใช้เตือนล่วงหน้าในฟอร์ม */
const RESET_LABELS = 'ประเภท / Tax ID / คำนำหน้า / ที่อยู่ / สาขา / เงื่อนไขการหัก / กติกาภาษี / ข้อมูลธนาคาร'

interface Candidate {
  id: string
  fullName: string
  teamName: string | null
  roleName: string
}

interface FormState {
  userId: string
  payeeType: 'individual' | 'corporate'
  taxProfileId: string
  nationalId: string
  bankName: string
  accountName: string
  accountNumber: string
  idDocumentUrl: string
  /** อัตราหัก 40(2) ต่อคน (มติ PO 05/10/2569 UAT U7) — ว่าง = ยังไม่กรอก */
  wht402Pct: string
  /** คำนำหน้า (บุคคลธรรมดา — มติ PO U94 ข้อ 1) */
  nameTitleChoice: PayeeNameTitleChoice
  nameTitleOther: string
  /** ที่อยู่ผู้ถูกหักภาษี — บังคับครบก่อนยืนยัน */
  address: AddressValue
  /** สำนักงานใหญ่/สาขา (นิติบุคคล) */
  branchKind: BranchKind
  branchNumber: string
  whtCondition: WhtCondition
  reason: string
}

const EMPTY_FORM: FormState = {
  userId: '',
  payeeType: 'individual',
  taxProfileId: '',
  nationalId: '',
  bankName: '',
  accountName: '',
  accountNumber: '',
  idDocumentUrl: '',
  wht402Pct: '',
  nameTitleChoice: '',
  nameTitleOther: '',
  address: EMPTY_ADDRESS,
  branchKind: 'head_office',
  branchNumber: '',
  whtCondition: 'withhold',
  reason: '',
}

function toForm(payee: PayeeDto): FormState {
  return {
    userId: payee.userId,
    payeeType: payee.payeeType,
    taxProfileId: payee.taxProfileId ?? '',
    nationalId: payee.nationalId ?? '',
    bankName: payee.bankName ?? '',
    accountName: payee.accountName ?? '',
    accountNumber: payee.accountNumber ?? '',
    idDocumentUrl: payee.idDocumentUrl ?? '',
    wht402Pct: payee.wht402Pct === null ? '' : String(payee.wht402Pct),
    nameTitleChoice: nameTitleChoiceOf(payee.nameTitle),
    nameTitleOther: nameTitleChoiceOf(payee.nameTitle) === 'other' ? (payee.nameTitle ?? '') : '',
    address: addressFromDto(payee.address),
    branchKind: branchKindOf(payee.branchCode),
    branchNumber: isHeadOfficeBranch(payee.branchCode) ? '' : payee.branchCode,
    whtCondition: payee.whtCondition,
    reason: '',
  }
}

/** error ของช่องที่อยู่จาก Zod (`address.postalCode` …) → คีย์ของ `AddressFields` */
function addressErrors(errors: Record<string, string>): Partial<Record<keyof AddressValue, string>> {
  return {
    detail: errors['address.detail'],
    postalCode: errors['address.postalCode'],
    province: errors['address.province'],
    district: errors['address.district'],
    subdistrict: errors['address.subdistrict'],
  }
}

export function PayeeTab() {
  const { showToast } = useToast()
  const [items, setItems] = useState<readonly PayeeDto[]>([])
  const [taxProfiles, setTaxProfiles] = useState<readonly TaxProfileDto[]>([])
  const [candidates, setCandidates] = useState<readonly Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  const [status, setStatus] = useState<StatusFilter>('all')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PayeeDto | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  /** รายชื่อผู้ใช้ของ dropdown ยังโหลดไม่เสร็จ — ห้ามกดบันทึกระหว่างนี้ (UAT BUG-017) */
  const [candidatesLoading, setCandidatesLoading] = useState(false)

  /** มติ PO U105 — ค่าตั้ง "อนุญาตเงื่อนไข (2)/(3)" ที่มีผลวันนี้ (ปิด = เลือกได้เฉพาะ (1)) · server ตรวจซ้ำเสมอ */
  const [allowGrossUp, setAllowGrossUp] = useState(false)

  const [verifyTarget, setVerifyTarget] = useState<PayeeDto | null>(null)
  const [verifyReason, setVerifyReason] = useState('')
  const [verifying, setVerifying] = useState(false)

  const fetchItems = useCallback(async () => callApi<PayeeDto[]>(`/api/payees?status=${status}`), [status])

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

  // กติกาภาษีเปิดฟอร์มถึงต้องใช้ แต่โหลดครั้งเดียวพอ (ชุดเล็ก ไม่เปลี่ยนบ่อย)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await callApi<TaxProfileDto[]>('/api/settings/tax-profiles?status=active')
      if (!cancelled && result.data !== undefined) setTaxProfiles(result.data)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function openForm(target: PayeeDto | null): Promise<void> {
    setEditing(target)
    setForm(target === null ? EMPTY_FORM : toForm(target))
    setErrors({})
    setFormOpen(true)
    void (async () => {
      const policy = await callApi<{ allowGrossUpConditions: boolean }>('/api/payees/wht-condition-policy')
      setAllowGrossUp(policy.data?.allowGrossUpConditions ?? false)
    })()
    if (target === null) {
      setCandidatesLoading(true)
      const result = await callApi<Candidate[]>('/api/payees/candidates')
      setCandidates(result.data ?? [])
      if (result.error) setErrors({ userId: `โหลดรายชื่อผู้ใช้ไม่สำเร็จ — ${result.error.message}` })
      setCandidatesLoading(false)
    }
  }

  async function save(): Promise<void> {
    const values = {
      payeeType: form.payeeType,
      taxProfileId: form.taxProfileId,
      nationalId: form.nationalId,
      bankName: form.bankName,
      accountName: form.accountName,
      accountNumber: form.accountNumber,
      idDocumentUrl: form.idDocumentUrl,
      wht402Pct: form.wht402Pct.trim() === '' ? null : Number(form.wht402Pct),
      nameTitle: form.payeeType === 'individual' ? nameTitleFromForm(form.nameTitleChoice, form.nameTitleOther) : '',
      address: form.address,
      branchCode: form.payeeType === 'corporate' ? branchCodeFromForm(form.branchKind, form.branchNumber) : '00000',
      whtCondition: form.whtCondition,
      reason: form.reason.trim(),
    }
    const parsed =
      editing === null
        ? payeeCreateSchema.safeParse({ ...values, userId: form.userId })
        : payeeUpdateSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error))
      return
    }

    setErrors({})
    setSaving(true)
    try {
      const result = await callApi<PayeeDto>(
        editing === null ? '/api/payees' : `/api/payees/${editing.id}`,
        jsonRequest(editing === null ? 'POST' : 'PATCH', parsed.data),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      // `18` §11 — ชื่อบัญชีไม่ตรงเป็น warning ที่ต้องแสดง ไม่ใช่กลืนหาย
      if (result.warning !== undefined) {
        showToast({ tone: 'warning', title: result.warning.title, description: result.warning.message })
      } else {
        showToast({
          tone: 'success',
          title: editing === null ? 'เพิ่มผู้รับเงินแล้ว' : 'บันทึกข้อมูลผู้รับเงินแล้ว',
          description: result.data?.name ?? '',
        })
      }
      if (editing !== null && editing.isVerified && result.data?.isVerified === false) {
        showToast({
          tone: 'warning',
          title: 'สถานะกลับเป็น "รอยืนยัน"',
          description: 'แก้ข้อมูลธนาคาร/ภาษีแล้วต้องให้การเงินยืนยันใหม่ก่อนเข้ารอบจ่ายเงิน',
        })
      }
      setFormOpen(false)
      await reload()
    } finally {
      setSaving(false)
    }
  }

  async function confirmVerify(): Promise<void> {
    if (verifyTarget === null) return
    setVerifying(true)
    try {
      const result = await callApi<PayeeDto>(
        `/api/payees/${verifyTarget.id}/verify`,
        jsonRequest('PATCH', { reason: verifyReason.trim() }),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({ tone: 'success', title: 'ยืนยันผู้รับเงินแล้ว', description: verifyTarget.name })
      if (result.warning !== undefined) {
        showToast({ tone: 'warning', title: result.warning.title, description: result.warning.message })
      }
      setVerifyTarget(null)
      setVerifyReason('')
      await reload()
    } finally {
      setVerifying(false)
    }
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  /** U108 — ค่าของ Tax Profile ที่เลือกอยู่ในฟอร์ม (ตัวอย่างคำนวณสด) */
  const selectedProfileDto = taxProfiles.find((profile) => profile.id === form.taxProfileId)
  const selectedTaxProfile =
    selectedProfileDto === undefined
      ? undefined
      : {
          whtPct: selectedProfileDto.whtPct,
          whtBasis: selectedProfileDto.whtBasis,
          whtMinThresholdSatang: selectedProfileDto.whtMinThresholdSatang,
        }

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">ผู้รับเงิน (Payee Profile)</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            ข้อมูลบัญชี/ภาษีของผู้ที่บริษัทจ่ายค่าตอบแทนให้ — <span className="font-semibold">รายที่ยังไม่ยืนยันรวมเข้ารอบจ่ายเงินไม่ได้</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-44">
            <Select
              aria-label="กรองตามสถานะการยืนยัน"
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
          <Can action="manage" resource={MANAGE_PAYEE_PROFILE}>
            <Button onClick={() => void openForm(null)}>+ เพิ่ม Payee</Button>
          </Can>
        </div>
      </div>

      <Table>
        <THead>
          <Tr>
            <Th>ผู้รับเงิน</Th>
            <Th>ประเภท</Th>
            <Th>Tax ID</Th>
            <Th>บัญชีธนาคาร</Th>
            <Th>อัตรา WHT</Th>
            <Th className="text-right">สถานะ / จัดการ</Th>
          </Tr>
        </THead>
        <TableState
          colSpan={6}
          loading={loading}
          error={error}
          isEmpty={items.length === 0}
          emptyTitle="ยังไม่มีข้อมูลผู้รับเงิน"
          emptyDescription="ระบบสร้างข้อมูลผู้รับเงินให้พนักงานอัตโนมัติเมื่อปิดงานเคสแรก — หรือกด “เพิ่ม Payee” เพื่อสร้างเอง"
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
                  <span className="font-semibold text-slate-800">{item.name}</span>
                  <div className="text-[10px] text-slate-500">{item.teamName ?? item.roleName}</div>
                  {item.advanceReturnOutstandingSatang > 0 && (
                    <div className="text-[10px] font-semibold text-amber-700">
                      ยอดคืนเงินทดรองค้าง {fmtSatangSymbol(item.advanceReturnOutstandingSatang)}
                    </div>
                  )}
                </Td>
                <Td>
                  <span className="text-xs text-slate-600">{PAYEE_TYPE_LABEL[item.payeeType]}</span>
                </Td>
                <Td>
                  <span className="font-mono text-xs">{item.nationalId ?? '—'}</span>
                  {item.payeeType === 'corporate' && (
                    <div className="text-[10px] text-slate-500">{formatBranch(item.branchCode)}</div>
                  )}
                  {item.addressLine === null ? (
                    <div className="text-[10px] font-semibold text-amber-600">ยังไม่กรอกที่อยู่</div>
                  ) : (
                    <div className="max-w-[220px] truncate text-[10px] text-slate-500" title={item.addressLine}>
                      {item.addressLine}
                    </div>
                  )}
                </Td>
                <Td>
                  <span className="text-xs text-slate-600">{item.bankName ?? '—'}</span>
                  <div className="font-mono text-[10px] text-slate-500">
                    {item.accountNumber ?? item.accountNumberMasked ?? '—'}
                  </div>
                  {!item.bankAccountNameMatches && (
                    <div className="text-[10px] font-semibold text-amber-600">ชื่อบัญชีไม่ตรงกับชื่อผู้รับเงิน</div>
                  )}
                </Td>
                <Td>
                  {item.whtPct === null ? (
                    <span className="text-[10px] font-semibold text-amber-600">ยังไม่ผูก Tax Profile</span>
                  ) : (
                    <>
                      <span className="text-xs font-semibold text-slate-800">{fmtPercent(item.whtPct)}</span>
                      <div className="text-[10px] text-slate-500">{item.taxProfileName}</div>
                    </>
                  )}
                </Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <StatusBadge
                      group={item.isVerified ? 'success' : 'pending'}
                      label={item.isVerified ? 'ยืนยันแล้ว' : 'รอยืนยัน'}
                    />
                    <Can action="manage" resource={MANAGE_PAYEE_PROFILE}>
                      <Button variant="secondary" onClick={() => void openForm(item)}>
                        แก้ไข
                      </Button>
                      {!item.isVerified && (
                        <Button
                          onClick={() => {
                            setVerifyTarget(item)
                            setVerifyReason('')
                          }}
                          disabled={item.missingForVerification.length > 0}
                          title={
                            item.missingForVerification.length > 0
                              ? 'กรอกข้อมูลภาษี ที่อยู่ และบัญชีธนาคารให้ครบก่อนยืนยัน'
                              : undefined
                          }
                        >
                          ยืนยัน
                        </Button>
                      )}
                    </Can>
                  </div>
                  {item.isVerified && item.verifiedAt !== null && (
                    <div className="mt-1 text-[10px] text-slate-500">
                      ยืนยันโดย {item.verifiedByName ?? '—'} · {fmtDate(item.verifiedAt)}
                    </div>
                  )}
                </Td>
              </Tr>
            ))}
        </TBody>
      </Table>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing === null ? 'เพิ่มผู้รับเงิน' : `แก้ไขผู้รับเงิน — ${editing.name}`}
        description="ชื่อผู้รับเงินมาจากชื่อผู้ใช้ในระบบ (ต้องตรงกับหน้าสมุดบัญชี) — แก้ชื่อที่หน้าจัดการผู้ใช้"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button
              onClick={() => void save()}
              loading={saving}
              disabled={editing === null && candidatesLoading}
            >
              {editing === null ? 'เพิ่มผู้รับเงิน' : 'บันทึกการแก้ไข'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {editing !== null && editing.isVerified && (
            <InlineAlert tone="warning" title="แก้แล้วต้องยืนยันใหม่">
              รายนี้ยืนยันแล้ว — แก้ {RESET_LABELS} จะกลับเป็น “รอยืนยัน” อัตโนมัติ และเข้ารอบจ่ายเงินไม่ได้จนกว่าการเงินจะยืนยันใหม่
            </InlineAlert>
          )}

          {editing === null ? (
            <Field id="payee-user" label="ผู้ใช้เจ้าของข้อมูล" required error={errors.userId}>
              <Select
                id="payee-user"
                value={form.userId}
                disabled={candidatesLoading}
                onChange={(event) => set('userId', event.target.value)}
              >
                <option value="">{candidatesLoading ? 'กำลังโหลดรายชื่อผู้ใช้…' : '— เลือกผู้ใช้ —'}</option>
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.fullName} · {candidate.teamName ?? candidate.roleName}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field id="payee-name" label="ชื่อผู้รับเงิน (ตามหน้าสมุดบัญชี)">
              <Input id="payee-name" value={editing.name} readOnly disabled />
            </Field>
          )}

          <Field id="payee-type" label="ประเภทผู้รับเงิน" required error={errors.payeeType}>
            <Select
              id="payee-type"
              value={form.payeeType}
              onChange={(event) => set('payeeType', event.target.value as FormState['payeeType'])}
            >
              {(Object.keys(PAYEE_TYPE_LABEL) as (keyof typeof PAYEE_TYPE_LABEL)[]).map((value) => (
                <option key={value} value={value}>
                  {PAYEE_TYPE_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>

          {form.payeeType === 'individual' ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                id="payee-name-title"
                label="คำนำหน้าชื่อ"
                hint="พิมพ์บนหนังสือรับรองการหักภาษี ณ ที่จ่าย"
                error={errors.nameTitle}
              >
                <Select
                  id="payee-name-title"
                  value={form.nameTitleChoice}
                  onChange={(event) => set('nameTitleChoice', event.target.value as PayeeNameTitleChoice)}
                >
                  <option value="">— ไม่ระบุ —</option>
                  {PAYEE_NAME_TITLE_OPTIONS.map((title) => (
                    <option key={title} value={title}>
                      {title}
                    </option>
                  ))}
                  <option value="other">อื่น ๆ (ระบุ)</option>
                </Select>
              </Field>
              {form.nameTitleChoice === 'other' && (
                <Field id="payee-name-title-other" label="ระบุคำนำหน้า" required error={errors.nameTitle}>
                  <Input
                    id="payee-name-title-other"
                    value={form.nameTitleOther}
                    onChange={(event) => set('nameTitleOther', event.target.value)}
                    placeholder="เช่น ดร."
                  />
                </Field>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                id="payee-branch-kind"
                label="สำนักงานใหญ่ / สาขา"
                required
                hint="พิมพ์บนหนังสือรับรองการหักภาษี ณ ที่จ่ายต่อจากเลขประจำตัวผู้เสียภาษี"
              >
                <Select
                  id="payee-branch-kind"
                  value={form.branchKind}
                  onChange={(event) => set('branchKind', event.target.value as BranchKind)}
                >
                  <option value="head_office">สำนักงานใหญ่</option>
                  <option value="branch">สาขาที่</option>
                </Select>
              </Field>
              {form.branchKind === 'branch' && (
                <Field id="payee-branch-no" label="เลขที่สาขา (5 หลัก)" required error={errors.branchCode}>
                  <Input
                    id="payee-branch-no"
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
          )}

          <Field
            id="payee-national-id"
            label="เลขบัตรประชาชน / เลขทะเบียนนิติบุคคล (13 หลัก)"
            error={errors.nationalId}
          >
            <Input
              id="payee-national-id"
              value={form.nationalId}
              onChange={(event) => set('nationalId', event.target.value)}
              className="font-mono"
              inputMode="numeric"
              placeholder="1234567890123"
            />
          </Field>

          <Field id="payee-tax-profile" label="กติกาภาษี (Tax Profile)" error={errors.taxProfileId}>
            <Select
              id="payee-tax-profile"
              value={form.taxProfileId}
              onChange={(event) => set('taxProfileId', event.target.value)}
            >
              <option value="">— ยังไม่ผูก (ใช้ค่าเริ่มต้นตามประเภทผู้รับ ถ้าไม่มีใช้อัตราจากแผนชั่วคราว) —</option>
              {taxProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name} · {fmtPercent(profile.whtPct)}
                </option>
              ))}
            </Select>
          </Field>
          <SettingHelp help={payeeTaxProfileHelp(selectedTaxProfile ?? null)} />

          <Field
            id="payee-wht-40-2"
            label="อัตราหัก 40(1)/40(2) (%)"
            error={errors.wht402Pct}
            hint="ใช้เมื่อค่าตั้งภาษีจัดผู้รับเป็นเงินได้ 40(1) หรือ 40(2) เท่านั้น — กรอกอัตราที่สำนักงานบัญชีคำนวณให้ (0.00 ได้) · เว้นว่าง = ยังไม่กรอก"
          >
            <Input
              id="payee-wht-40-2"
              numeric
              inputMode="decimal"
              value={form.wht402Pct}
              onChange={(event) => set('wht402Pct', event.target.value)}
              placeholder="เช่น 2.50"
            />
          </Field>
          <SettingHelp help={payeeWht402Help(pctFromInput(form.wht402Pct))} />

          <div className="rounded-lg border border-slate-200 p-3">
            <AddressFields
              label="ที่อยู่ผู้ถูกหักภาษี (พิมพ์บนหนังสือรับรองการหักภาษี ณ ที่จ่าย — ต้องครบก่อนยืนยัน)"
              value={form.address}
              onChange={(next) => set('address', next)}
              requiredFields={PAYEE_REQUIRED_ADDRESS_FIELDS}
              errors={addressErrors(errors)}
            />
          </div>

          <Field
            id="payee-wht-condition"
            label="เงื่อนไขการหักภาษี ณ ที่จ่าย"
            error={errors.whtCondition}
            hint={whtConditionHint(form.whtCondition, allowGrossUp)}
          >
            <Select
              id="payee-wht-condition"
              value={form.whtCondition}
              onChange={(event) => set('whtCondition', event.target.value as WhtCondition)}
            >
              {selectableWhtConditions(allowGrossUp, editing?.whtCondition ?? null).map((condition) => (
                <option key={condition} value={condition}>
                  {WHT_CONDITION_LABEL[condition]}
                </option>
              ))}
            </Select>
          </Field>
          <SettingHelp
            help={payeeConditionHelp({
              condition: form.whtCondition,
              allowGrossUp,
              whtPct: selectedTaxProfile?.whtPct ?? null,
            })}
          />

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="mb-3 text-xs font-semibold text-slate-700">ข้อมูลบัญชีธนาคาร</p>
            <div className="space-y-3">
              <Field id="payee-bank" label="ธนาคาร" error={errors.bankName}>
                <Input
                  id="payee-bank"
                  value={form.bankName}
                  onChange={(event) => set('bankName', event.target.value)}
                  placeholder="ธนาคารกสิกรไทย"
                />
              </Field>
              <Field id="payee-account-name" label="ชื่อบัญชี" error={errors.accountName}>
                <Input
                  id="payee-account-name"
                  value={form.accountName}
                  onChange={(event) => set('accountName', event.target.value)}
                />
              </Field>
              <Field id="payee-account-number" label="เลขบัญชี" error={errors.accountNumber}>
                <Input
                  id="payee-account-number"
                  value={form.accountNumber}
                  onChange={(event) => set('accountNumber', event.target.value)}
                  className="font-mono"
                  inputMode="numeric"
                />
              </Field>
            </div>
          </div>

          <Field
            id="payee-id-document"
            label="ลิงก์เอกสารยืนยันตัวตน"
            hint="บังคับเมื่อองค์กรเปิด “ต้องแนบเอกสารยืนยันตัวตนก่อนยืนยัน Payee”"
            error={errors.idDocumentUrl}
          >
            <Input
              id="payee-id-document"
              value={form.idDocumentUrl}
              onChange={(event) => set('idDocumentUrl', event.target.value)}
              placeholder="https://…"
            />
          </Field>

          <Field
            id="payee-reason"
            label="เหตุผลการแก้ไข"
            required
            hint="ข้อมูลธนาคาร/ภาษีกระทบเงินที่โอนจริง — ต้องบันทึกเหตุผลลง Audit Log เสมอ"
            error={errors.reason}
          >
            <Textarea
              id="payee-reason"
              rows={2}
              value={form.reason}
              onChange={(event) => set('reason', event.target.value)}
            />
          </Field>
        </div>
      </Modal>

      <ReasonConfirmModal
        open={verifyTarget !== null}
        onClose={() => setVerifyTarget(null)}
        title={`ยืนยันผู้รับเงิน — ${verifyTarget?.name ?? ''}`}
        description={
          verifyTarget === null
            ? ''
            : `ตรวจแล้วว่าเลขบัญชี ${verifyTarget.accountNumber ?? verifyTarget.accountNumberMasked ?? '—'} และข้อมูลภาษีถูกต้อง — ยืนยันแล้วจึงรวมเข้ารอบจ่ายเงินได้`
        }
        confirmLabel="ยืนยันผู้รับเงิน"
        reason={verifyReason}
        onReasonChange={setVerifyReason}
        loading={verifying}
        onConfirm={() => void confirmVerify()}
      />
    </Card>
  )
}
