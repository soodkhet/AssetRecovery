'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Can } from '@/components/auth/permission-provider'
import { MANAGE_TAX_PROFILES } from '@/components/settings/shared'
import {
  Button,
  Card,
  Field,
  InlineAlert,
  Input,
  Modal,
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
import { fmtDate, fromInputDate, toInputDate } from '@/lib/format/datetime'
import { vatRateCreateSchema } from '@/lib/settings/schemas'
import type { VatRateDto } from '@/lib/settings/types'
import { findOverlappingPeriods, type VatRatePeriod } from '@/lib/settings/vat'

/**
 * แท็บ "อัตรา VAT" (`13` §6.5) — timeline แบบ effective-dated **ห้าม hardcode 7%** (Rule 01)
 *
 * ตรวจช่วงทับซ้อนฝั่งหน้าจอด้วย `findOverlappingPeriods()` (pure module เดียวกับที่ API ใช้) เพื่อบอก
 * ผู้ใช้ก่อนกดบันทึก — **ไม่ใช่ตัวบังคับ**: API ยังตรวจซ้ำแล้วตอบ `VAT_RATE_OVERLAP` เสมอ (DEC-002)
 *
 * ⚠️ กับดักวันที่: `dateOnlySchema` แปลง `'YYYY-MM-DD'` → `Date` ⇒ ถ้าส่ง `parsed.data` ต่อเข้า API
 * ตรง ๆ `JSON.stringify` จะได้ ISO เต็มรูปแบบซึ่งไม่ผ่าน regex ฝั่ง server — จึงส่ง **ค่าดิบจากฟอร์ม**
 * แล้วให้ API parse เอง (parse ฝั่ง FE ใช้เพื่อโชว์ error รายฟิลด์เท่านั้น)
 */

interface FormState {
  ratePct: string
  effectiveFrom: string
  effectiveTo: string
  note: string
  reason: string
}

const EMPTY_FORM: FormState = { ratePct: '', effectiveFrom: '', effectiveTo: '', note: '', reason: '' }

/** DTO (วันที่เป็น ISO string) → รูปร่างที่ pure module ของ VAT ใช้ */
function toPeriod(item: VatRateDto): VatRatePeriod {
  return {
    id: item.id,
    ratePct: item.ratePct,
    effectiveFrom: new Date(item.effectiveFrom),
    effectiveTo: item.effectiveTo === null ? null : new Date(item.effectiveTo),
  }
}

export function VatRatesTab() {
  const { showToast } = useToast()
  const [items, setItems] = useState<readonly VatRateDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<VatRateDto | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  /** ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** (กฎ `react-hooks/set-state-in-effect`) */
  const fetchItems = useCallback(async () => callApi<VatRateDto[]>('/api/settings/vat-rates'), [])

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

  /** ช่วงที่ทับกับค่าที่กำลังกรอก — เตือนสดขณะพิมพ์ ไม่บล็อกปุ่ม (API เป็นตัวตัดสิน) */
  const overlapping = useMemo(() => {
    const from = fromInputDate(form.effectiveFrom)
    if (from === null) return []
    const to = fromInputDate(form.effectiveTo)
    return findOverlappingPeriods({ effectiveFrom: from, effectiveTo: to }, items.map(toPeriod), editing?.id)
  }, [form.effectiveFrom, form.effectiveTo, items, editing])

  function openForm(target: VatRateDto | null): void {
    setEditing(target)
    setForm(
      target === null
        ? EMPTY_FORM
        : {
            ratePct: String(target.ratePct),
            effectiveFrom: toInputDate(target.effectiveFrom),
            effectiveTo: toInputDate(target.effectiveTo),
            note: target.note ?? '',
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
    // ส่ง **ค่าดิบ** (`YYYY-MM-DD`) ให้ API — parse ที่นี่ใช้เพื่อแสดง error รายฟิลด์เท่านั้น
    const payload = {
      ratePct: Number(form.ratePct),
      effectiveFrom: form.effectiveFrom,
      effectiveTo: form.effectiveTo.trim(),
      note: form.note.trim(),
      reason: form.reason.trim(),
    }
    const parsed = vatRateCreateSchema.safeParse(payload)
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error))
      return
    }

    setErrors({})
    setSaving(true)
    try {
      const result = await callApi<VatRateDto>(
        editing === null ? '/api/settings/vat-rates' : `/api/settings/vat-rates/${editing.id}`,
        jsonRequest(editing === null ? 'POST' : 'PATCH', payload),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({
        tone: 'success',
        title: editing === null ? 'เพิ่มอัตรา VAT แล้ว' : 'บันทึกอัตรา VAT แล้ว',
        description: `${payload.ratePct}% ตั้งแต่ ${fmtDate(fromInputDate(form.effectiveFrom))}`,
      })
      setFormOpen(false)
      await reload()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">อัตรา VAT (Effective-dated)</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            ระบบเลือกอัตราตามวันที่ของรายได้แต่ละรายการแล้ว snapshot ไว้ในเอกสาร — ไม่มีการ hardcode 7% ที่ใดในระบบ (ไฟล์ 13 §6.5)
          </p>
        </div>
        <Can action="manage" resource={MANAGE_TAX_PROFILES}>
          <Button onClick={() => openForm(null)}>+ เพิ่มอัตรา VAT</Button>
        </Can>
      </div>

      <InlineAlert tone="warning" title="ช่วงวันที่ต้องไม่ทับซ้อนกัน">
        ระบบตรวจก่อนบันทึกทุกครั้ง (<span className="font-mono">VAT_RATE_OVERLAP</span>) — ต้องการหยุดใช้อัตราเดิมให้{' '}
        <b>ปิดช่วง</b> ด้วยวันสิ้นสุด ไม่มีการลบอัตราออกจากประวัติ
      </InlineAlert>

      <div className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th className="text-right">อัตรา VAT</Th>
              <Th>มีผลตั้งแต่</Th>
              <Th>สิ้นสุด</Th>
              <Th>หมายเหตุ</Th>
              <Th className="text-right">สถานะ / จัดการ</Th>
            </Tr>
          </THead>
          {/* `TableState` เรนเดอร์ `<tbody>` ของตัวเอง — วางเป็นพี่น้องกับ `TBody` */}
          <TableState
            colSpan={5}
            loading={loading}
            error={error}
            isEmpty={items.length === 0}
            emptyTitle="ยังไม่มีอัตรา VAT"
            emptyDescription="ต้องมีอย่างน้อย 1 ช่วง ไม่งั้นระบบออกใบกำกับภาษีไม่ได้ (VAT_RATE_NOT_FOUND)"
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
                <Tr key={item.id} className={item.isCurrent ? 'bg-emerald-50/40' : undefined}>
                  <Td numeric>
                    <span className="text-base font-bold text-slate-900">{item.ratePct}%</span>
                  </Td>
                  <Td>
                    <span className="font-mono text-xs text-slate-700">{fmtDate(item.effectiveFrom)}</span>
                  </Td>
                  <Td>
                    <span className="font-mono text-xs text-slate-700">
                      {item.effectiveTo === null ? 'ยังใช้อยู่ (เปิดปลาย)' : fmtDate(item.effectiveTo)}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-xs text-slate-500">{item.note ?? '—'}</span>
                  </Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <StatusBadge
                        group={item.isCurrent ? 'success' : 'neutral'}
                        label={item.isCurrent ? 'ใช้งานอยู่' : 'ไม่ใช่ช่วงปัจจุบัน'}
                      />
                      <Can action="manage" resource={MANAGE_TAX_PROFILES}>
                        <Button variant="secondary" onClick={() => openForm(item)}>
                          แก้ไข
                        </Button>
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
        title={editing === null ? 'เพิ่มอัตรา VAT' : `แก้ไขอัตรา VAT — ${editing.ratePct}%`}
        description="ช่วงวันที่นับแบบรวมปลายทั้งสองด้าน — เว้นวันสิ้นสุดว่างไว้ = ใช้ต่อจนกว่าจะปิดช่วง"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              {editing === null ? 'เพิ่มอัตรา' : 'บันทึกการแก้ไข'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field id="vat-rate" label="อัตรา VAT (%)" required error={errors.ratePct}>
            <Input
              id="vat-rate"
              numeric
              inputMode="decimal"
              value={form.ratePct}
              onChange={(event) => set('ratePct', event.target.value)}
              placeholder="7.00"
            />
          </Field>

          {/* `<input type="date">` เป็นข้อยกเว้นเดียวที่ใช้ ค.ศ. (Rule 01) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="vat-from" label="วันที่เริ่มมีผล" required error={errors.effectiveFrom}>
              <Input
                id="vat-from"
                type="date"
                value={form.effectiveFrom}
                onChange={(event) => set('effectiveFrom', event.target.value)}
              />
            </Field>
            <Field
              id="vat-to"
              label="วันสิ้นสุด"
              error={errors.effectiveTo}
              hint="เว้นว่าง = ยังใช้อยู่จนกว่าจะปิดช่วง"
            >
              <Input
                id="vat-to"
                type="date"
                value={form.effectiveTo}
                onChange={(event) => set('effectiveTo', event.target.value)}
              />
            </Field>
          </div>

          {overlapping.length > 0 && (
            <InlineAlert tone="error" title="ช่วงวันที่นี้ทับกับอัตราที่มีอยู่แล้ว">
              ทับกับ{' '}
              {overlapping
                .map((period) => `${period.ratePct}% (${fmtDate(period.effectiveFrom)} เป็นต้นไป)`)
                .join(', ')}{' '}
              — ปิดช่วงเดิมด้วยวันสิ้นสุดก่อน ไม่งั้นระบบจะปฏิเสธด้วย VAT_RATE_OVERLAP
            </InlineAlert>
          )}

          <Field id="vat-note" label="หมายเหตุ" error={errors.note}>
            <Input
              id="vat-note"
              value={form.note}
              onChange={(event) => set('note', event.target.value)}
              placeholder="เช่น พระราชกฤษฎีกาขยายเวลาลดอัตราถึง 30 ก.ย. 2569"
            />
          </Field>

          <Field id="vat-reason" label="เหตุผล" required error={errors.reason}>
            <Textarea
              id="vat-reason"
              value={form.reason}
              onChange={(event) => set('reason', event.target.value)}
              placeholder="เช่น ปรับอัตราตามประกาศราชกิจจานุเบกษา"
            />
          </Field>

          <InlineAlert tone="warning" title="อัตรานี้กระทบยอดภาษีทั้งระบบ">
            เอกสารที่ออกไปแล้วยังอ้างอัตราที่ snapshot ไว้ (<span className="font-mono">vat_rate_used</span>) —
            การแก้ที่นี่ไม่คำนวณย้อนหลัง (ไฟล์ 19 §6.3)
          </InlineAlert>
        </div>
      </Modal>
    </Card>
  )
}
