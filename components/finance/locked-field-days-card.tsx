'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePermission } from '@/components/auth/permission-provider'
import {
  Button,
  Card,
  Field,
  InlineAlert,
  Modal,
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
import { CREATE_ADJUSTMENT } from '@/lib/adjustments/adjustment'
import { callApi, jsonRequest } from '@/lib/api/types'
import { toFieldErrors } from '@/lib/api/validation'
import type { BackdatedFieldDayResult, LockedFieldDayDto } from '@/lib/field/backdated-field-day'
import { backdatedFieldDaySchema } from '@/lib/field/backdated-schemas'
import { fmtDate, nowDate } from '@/lib/format/datetime'
import { fmtCount, fmtSatangSymbol } from '@/lib/format/money'

/**
 * การ์ด "วันลงพื้นที่ในงวดที่ปิดแล้ว" ในแท็บปรับปรุง (มติ PO 05/10/2569 U50) — ปลายทางของแจ้งเตือน
 * `field_allowance.period_locked` · ปุ่ม "สร้างรายการเบิกย้อนหลัง" (การเงิน) → ยืนยัน + เหตุผล →
 * รายการลงวันที่วันนี้ในงวดที่เปิดอยู่ แล้วเข้าสายอนุมัติปกติ · ยอดมาจาก server (ไม่คำนวณบนจอ — Rule 01)
 * ⚠️ ปุ่มซ่อนเมื่อไม่มีสิทธิ์เป็นแค่ UX — API ตรวจเอง (DEC-002) · ไม่มีรายการเลย = ไม่แสดงการ์ด
 */
export function LockedFieldDaysCard() {
  const { can } = usePermission()
  const canCreate = can('manage', CREATE_ADJUSTMENT)
  const { showToast } = useToast()
  const [items, setItems] = useState<LockedFieldDayDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  const [target, setTarget] = useState<LockedFieldDayDto | null>(null)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)

  const fetchItems = useCallback(async () => callApi<LockedFieldDayDto[]>('/api/adjustments/field-days'), [])
  const apply = useCallback((result: Awaited<ReturnType<typeof fetchItems>>) => {
    if (result.error !== undefined) setError({ title: result.error.title, message: result.error.message })
    else {
      setItems(result.data ?? [])
      setError(null)
    }
    setLoading(false)
  }, [])
  const reload = useCallback(async () => apply(await fetchItems()), [apply, fetchItems])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchItems()
      if (!cancelled) apply(result)
    })()
    return () => {
      cancelled = true
    }
  }, [apply, fetchItems])

  async function submit(): Promise<void> {
    if (target === null) return
    const payload = { agentId: target.agentId, fieldDate: target.fieldDate, reason: reason.trim() }
    const parsed = backdatedFieldDaySchema.safeParse(payload)
    if (!parsed.success) {
      setReasonError(toFieldErrors(parsed.error).reason)
      return
    }
    setReasonError(undefined)
    setSaving(true)
    try {
      const result = await callApi<BackdatedFieldDayResult>(
        '/api/adjustments/field-days/backdated',
        jsonRequest('POST', payload),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({
        tone: 'success',
        title: result.data?.created === false ? 'วันนี้ถูกสร้างรายการไปแล้ว' : 'สร้างรายการเบิกย้อนหลังแล้ว',
        description: `ลงวันที่ ${fmtDate(result.data?.expenseDate ?? null)} · ส่งเข้าคิวอนุมัติตามปกติ`,
      })
      setTarget(null)
      await reload()
    } finally {
      setSaving(false)
    }
  }

  if (!loading && error === null && items.length === 0) return null

  return (
    <Card>
      <div className="mb-3">
        <h2 className="text-base font-semibold text-slate-900">วันลงพื้นที่ในงวดที่ปิดแล้ว (ค่าน้ำมันเหมา/เบี้ยเลี้ยงรายวัน)</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          ระบบไม่ลงรายการเข้างวดที่ปิดแล้ว — สร้างรายการเบิกย้อนหลังลงวันที่ในงวดที่เปิดอยู่ (อ้างวันลงพื้นที่เดิม) แล้วส่งเข้าสายอนุมัติปกติ
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <Table>
          <THead>
            <Tr>
              <Th>วันลงพื้นที่</Th>
              <Th>พนักงาน</Th>
              <Th className="text-right">จำนวนเคส</Th>
              <Th className="text-right">ค่าน้ำมัน</Th>
              <Th className="text-right">เบี้ยเลี้ยง</Th>
              <Th className="text-right">รวม</Th>
              {canCreate && <Th className="text-right">จัดการ</Th>}
            </Tr>
          </THead>
          <TableState
            colSpan={canCreate ? 7 : 6}
            loading={loading}
            error={error}
            isEmpty={items.length === 0}
            emptyTitle="ไม่มีวันลงพื้นที่ค้าง"
            onRetry={
              <Button variant="secondary" onClick={() => void reload()}>
                ลองใหม่
              </Button>
            }
          />
          <TBody>
            {!loading &&
              error === null &&
              items.map((item) => (
                <Tr key={`${item.agentId}-${item.fieldDate}`}>
                  <Td className="font-mono text-xs">{fmtDate(item.fieldDate)}</Td>
                  <Td className="text-xs">{item.agentName}</Td>
                  <Td numeric>{fmtCount(item.caseCount)}</Td>
                  <Td numeric>{fmtSatangSymbol(item.fuelSatang)}</Td>
                  <Td numeric>{fmtSatangSymbol(item.allowanceSatang)}</Td>
                  <Td numeric className="font-semibold">
                    {fmtSatangSymbol(item.totalSatang)}
                  </Td>
                  {canCreate && (
                    <Td className="text-right">
                      <Button
                        size="sm"
                        onClick={() => {
                          setTarget(item)
                          setReason('')
                          setReasonError(undefined)
                        }}
                      >
                        สร้างรายการเบิกย้อนหลัง
                      </Button>
                    </Td>
                  )}
                </Tr>
              ))}
          </TBody>
        </Table>
      </div>

      <Modal
        open={target !== null}
        onClose={() => setTarget(null)}
        title="สร้างรายการเบิกย้อนหลัง"
        description={
          target === null
            ? undefined
            : `${target.agentName} · วันลงพื้นที่ ${fmtDate(target.fieldDate)} · รวม ${fmtSatangSymbol(target.totalSatang)}`
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setTarget(null)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={() => void submit()} loading={saving}>
              ยืนยันสร้างรายการ
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <InlineAlert tone="info" title={`รายการจะลงวันที่ ${nowDate()} (งวดที่เปิดอยู่)`}>
            ยอดคำนวณตามแผนค่าตอบแทนของวันลงพื้นที่เดิม · งวดที่ปิดแล้วไม่ถูกแก้ · รายการเข้าคิวอนุมัติตามปกติ
          </InlineAlert>
          <Field id="backdated-reason" label="เหตุผล" required error={reasonError}>
            <Textarea
              id="backdated-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="เช่น ค่าน้ำมัน/เบี้ยเลี้ยงของวันที่งวดปิดก่อนคำนวณ"
            />
          </Field>
        </div>
      </Modal>
    </Card>
  )
}
