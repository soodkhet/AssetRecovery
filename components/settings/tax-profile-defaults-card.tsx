'use client'

import { useCallback, useEffect, useState } from 'react'
import { Can } from '@/components/auth/permission-provider'
import { SettingHelp } from '@/components/settings/setting-help'
import { MANAGE_TAX_PROFILES, WHT_FILING_FORM_LABEL } from '@/components/settings/shared'
import {
  Button,
  Card,
  Field,
  InlineAlert,
  Modal,
  Select,
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
import { fmtDateTime } from '@/lib/format/datetime'
import { taxProfileDefaultsHelp } from '@/lib/settings/help'
import { taxProfileDefaultsCreateSchema } from '@/lib/settings/schemas'
import {
  TAX_PROFILE_DEFAULT_SLOTS,
  TAX_PROFILE_DEFAULT_SLOT_LABEL,
  emptyTaxProfileDefaults,
  type TaxProfileDefaultSlot,
  type TaxProfileDefaults,
} from '@/lib/settings/tax-profile-defaults'
import type { TaxProfileDefaultsOverviewDto, TaxProfileDto } from '@/lib/settings/types'

/**
 * กล่อง "Tax Profile ค่าเริ่มต้นตามประเภทผู้รับ" ในแท็บกติกาภาษี (มติ PO 06/10/2569 U121 · `13` §6.4.3)
 *
 * 4 ช่อง (Inhouse/Outsource × บุคคลธรรมดา/นิติบุคคล) ผูก Tax Profile ที่ใช้งานอยู่ — ว่างได้ · บันทึก = เพิ่มชุดใหม่
 * (insert-only) พร้อมเหตุผล · แก้ได้เฉพาะ `manage_tax_profiles` (ล็อก Superadmin) — server ตรวจซ้ำเสมอ
 */

type FormState = TaxProfileDefaults<string> & { reason: string }

const EMPTY_FORM: FormState = { ...emptyTaxProfileDefaults<string>(), reason: '' }

export function TaxProfileDefaultsCard() {
  const { showToast } = useToast()
  const [overview, setOverview] = useState<TaxProfileDefaultsOverviewDto | null>(null)
  const [profiles, setProfiles] = useState<readonly TaxProfileDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  /** ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** (กฎ `react-hooks/set-state-in-effect`) */
  const fetchAll = useCallback(
    async () =>
      Promise.all([
        callApi<TaxProfileDefaultsOverviewDto>('/api/settings/tax-profile-defaults'),
        callApi<TaxProfileDto[]>('/api/settings/tax-profiles?status=active'),
      ]),
    [],
  )

  const apply = useCallback(
    (results: Awaited<ReturnType<typeof fetchAll>>) => {
      const [defaultsResult, profilesResult] = results
      const failed = defaultsResult.error ?? profilesResult.error
      if (failed !== undefined) {
        setError({ title: failed.title, message: failed.message })
      } else {
        setOverview(defaultsResult.data ?? null)
        setProfiles(profilesResult.data ?? [])
        setError(null)
      }
      setLoading(false)
    },
    [],
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const results = await fetchAll()
      if (!cancelled) apply(results)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchAll, apply])

  async function reload(): Promise<void> {
    apply(await fetchAll())
  }

  function openForm(): void {
    const current = overview?.current ?? null
    const next: FormState = { ...EMPTY_FORM }
    for (const slot of TAX_PROFILE_DEFAULT_SLOTS) next[slot] = current?.slots[slot]?.taxProfileId ?? null
    setForm(next)
    setErrors({})
    setFormOpen(true)
  }

  function setSlot(slot: TaxProfileDefaultSlot, value: string): void {
    setForm((currentForm) => ({ ...currentForm, [slot]: value === '' ? null : value }))
  }

  const helpSlots = (() => {
    const byId = new Map(profiles.map((profile) => [profile.id, profile]))
    const slots = emptyTaxProfileDefaults<{
      name: string
      profile: { whtPct: number; whtBasis: TaxProfileDto['whtBasis']; whtMinThresholdSatang: number }
    }>()
    for (const slot of TAX_PROFILE_DEFAULT_SLOTS) {
      const id = formOpen ? form[slot] : (overview?.current?.slots[slot]?.taxProfileId ?? null)
      const profile = id === null ? undefined : byId.get(id)
      slots[slot] =
        profile === undefined
          ? null
          : {
              name: profile.name,
              profile: {
                whtPct: profile.whtPct,
                whtBasis: profile.whtBasis,
                whtMinThresholdSatang: profile.whtMinThresholdSatang,
              },
            }
    }
    return slots
  })()

  async function save(): Promise<void> {
    const parsed = taxProfileDefaultsCreateSchema.safeParse({ ...form, reason: form.reason.trim() })
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error))
      return
    }
    setErrors({})
    setSaving(true)
    try {
      const result = await callApi('/api/settings/tax-profile-defaults', jsonRequest('POST', parsed.data))
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({ tone: 'success', title: 'บันทึกค่าเริ่มต้นตามประเภทผู้รับแล้ว' })
      setFormOpen(false)
      await reload()
    } finally {
      setSaving(false)
    }
  }

  const current = overview?.current ?? null

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Tax Profile ค่าเริ่มต้นตามประเภทผู้รับ</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            ใช้กับผู้รับที่ยังไม่ได้ผูก Tax Profile รายคน — การผูกรายคนในข้อมูลผู้รับเงินชนะค่าเริ่มต้นเสมอ
          </p>
        </div>
        <Can action="manage" resource={MANAGE_TAX_PROFILES}>
          <Button onClick={openForm} disabled={loading || error !== null}>
            ตั้งค่าใหม่
          </Button>
        </Can>
      </div>

      <SettingHelp help={taxProfileDefaultsHelp(helpSlots)} />

      <div className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th>ประเภทผู้รับ</Th>
              <Th>Tax Profile</Th>
              <Th className="text-right">อัตรา WHT</Th>
              <Th>แบบนำส่ง</Th>
            </Tr>
          </THead>
          <TableState
            colSpan={4}
            loading={loading}
            error={error}
            isEmpty={false}
            emptyTitle="ยังไม่ได้ตั้งค่าเริ่มต้น"
            emptyDescription="ผู้รับที่ไม่ได้ผูก Tax Profile จะใช้อัตราจากแผนค่าตอบแทนพร้อมคำเตือน"
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
              TAX_PROFILE_DEFAULT_SLOTS.map((slot) => {
                const chosen = current?.slots[slot] ?? null
                return (
                  <Tr key={slot}>
                    <Td>
                      <span className="font-semibold text-slate-900">{TAX_PROFILE_DEFAULT_SLOT_LABEL[slot]}</span>
                    </Td>
                    <Td>
                      {chosen === null ? (
                        <span className="text-xs text-slate-400">ไม่ตั้ง</span>
                      ) : (
                        <span className="text-xs text-slate-700">{chosen.name}</span>
                      )}
                    </Td>
                    <Td numeric>
                      {chosen === null ? '-' : <span className="font-semibold text-rose-700">{chosen.whtPct}%</span>}
                    </Td>
                    <Td>
                      <span className="text-xs text-slate-600">
                        {chosen === null ? '-' : WHT_FILING_FORM_LABEL[chosen.filingForm]}
                      </span>
                    </Td>
                  </Tr>
                )
              })}
          </TBody>
        </Table>
      </div>

      {!loading && error === null && (
        <p className="mt-2 text-[11px] text-slate-500">
          {current === null
            ? 'ยังไม่เคยตั้งค่า — ว่างทั้ง 4 ช่อง'
            : `บันทึกล่าสุด ${fmtDateTime(current.createdAt)} โดย ${current.createdByName} · เหตุผล: ${current.reason}`}
        </p>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        size="lg"
        title="ตั้ง Tax Profile ค่าเริ่มต้นตามประเภทผู้รับ"
        description="มีผลทันทีกับคิวอนุมัติและรอบจ่ายที่สร้างหลังบันทึก — รอบจ่ายเดิมไม่คิดใหม่"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              บันทึกค่าเริ่มต้น
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {TAX_PROFILE_DEFAULT_SLOTS.map((slot) => (
              <Field key={slot} id={`tax-default-${slot}`} label={TAX_PROFILE_DEFAULT_SLOT_LABEL[slot]} error={errors[slot]}>
                <Select
                  id={`tax-default-${slot}`}
                  value={form[slot] ?? ''}
                  onChange={(event) => setSlot(slot, event.target.value)}
                >
                  <option value="">— ไม่ตั้ง —</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name} ({profile.whtPct}%)
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>

          <SettingHelp defaultOpen help={taxProfileDefaultsHelp(helpSlots)} />

          <Field id="tax-default-reason" label="เหตุผล" required error={errors.reason}>
            <Textarea
              maxLength={500}
              id="tax-default-reason"
              value={form.reason}
              onChange={(event) => setForm((currentForm) => ({ ...currentForm, reason: event.target.value }))}
              placeholder="เช่น ตั้งค่าเริ่มต้นตามที่สำนักงานบัญชีแนะนำ"
            />
          </Field>

          <InlineAlert tone="info" title="นิติบุคคลยื่น ภ.ง.ด.53 เสมอ">
            แบบนำส่งเลือกตามชนิดผู้รับจริง · เงินได้ 40(1)/40(2) ยังใช้อัตราต่อคนในข้อมูลผู้รับเงินเหมือนเดิม
          </InlineAlert>
        </div>
      </Modal>
    </Card>
  )
}
