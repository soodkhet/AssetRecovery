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
import { backdatedFuelExpenseSchema } from '@/lib/field/backdated-schemas'
import type { BackdatedFuelExpenseResult, LockedFuelExpenseDto } from '@/lib/field/fuel-distance-job'
import { fmtDate, nowDate } from '@/lib/format/datetime'
import { fmtSatangSymbol } from '@/lib/format/money'

/**
 * การ์ด "ค่าน้ำมันตามระยะทางที่ลงงวดที่ปิดแล้วไม่ได้" ในแท็บปรับปรุง (มติ PO U135 — ทางเดียวกับ U50 `<LockedFieldDaysCard>`)
 * ปลายทางของแจ้งเตือน `field_allowance.period_locked` (ค่าน้ำมัน `PER_KM`) · ปุ่ม "สร้างรายการเบิกย้อนหลัง" (การเงิน)
 * → ยืนยัน + เหตุผล → ลงวันที่วันนี้ในงวดที่เปิดอยู่ (อ้างวันปิดงานเดิม) แล้วเข้าสายอนุมัติปกติ
 * ยอดมาจาก server (job คำนวณเก็บไว้ — ไม่คำนวณบนจอ Rule 01) · ปุ่มซ่อนเมื่อไม่มีสิทธิ์เป็นแค่ UX (DEC-002)
 * ไม่มีรายการเลย = ไม่แสดงการ์ด
 */
export function LockedFuelExpensesCard() {
  const { can } = usePermission()
  const canCreate = can('manage', CREATE_ADJUSTMENT)
  const { showToast } = useToast()
  const [items, setItems] = useState<LockedFuelExpenseDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  const [target, setTarget] = useState<LockedFuelExpenseDto | null>(null)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)

  const fetchItems = useCallback(async () => callApi<LockedFuelExpenseDto[]>('/api/adjustments/fuel-expenses'), [])
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
    const payload = { jobId: target.jobId, reason: reason.trim() }
    const parsed = backdatedFuelExpenseSchema.safeParse(payload)
    if (!parsed.success) {
      setReasonError(toFieldErrors(parsed.error).reason)
      return
    }
    setReasonError(undefined)
    setSaving(true)
    try {
      const result = await callApi<BackdatedFuelExpenseResult>(
        '/api/adjustments/fuel-expenses/backdated',
        jsonRequest('POST', payload),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({
        tone: 'success',
        title: result.data?.created === false ? 'เคสนี้มีรายการค่าน้ำมันแล้ว' : 'สร้างรายการเบิกย้อนหลังแล้ว',
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
        <h2 className="text-base font-semibold text-slate-900">ค่าน้ำมันตามระยะทางที่ลงงวดที่ปิดแล้วไม่ได้</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          ระยะทางคำนวณได้หลังงวดของวันปิดงานปิดแล้ว — สร้างรายการเบิกย้อนหลังลงวันที่ในงวดที่เปิดอยู่ (อ้างวันปิดงานเดิม) แล้วส่งเข้าสายอนุมัติปกติ
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <Table>
          <THead>
            <Tr>
              <Th>วันปิดงาน</Th>
              <Th>เลขที่สัญญา</Th>
              <Th>พนักงาน</Th>
              <Th className="text-right">ระยะทาง (กม.)</Th>
              <Th className="text-right">ค่าน้ำมัน</Th>
              {canCreate && <Th className="text-right">จัดการ</Th>}
            </Tr>
          </THead>
          <TableState
            colSpan={canCreate ? 6 : 5}
            loading={loading}
            error={error}
            isEmpty={items.length === 0}
            emptyTitle="ไม่มีค่าน้ำมันค้าง"
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
                <Tr key={item.jobId}>
                  <Td className="font-mono text-xs">{fmtDate(item.workDate)}</Td>
                  <Td className="font-mono text-xs">{item.caseRef}</Td>
                  <Td className="text-xs">{item.agentName}</Td>
                  <Td numeric>{item.distanceKm}</Td>
                  <Td numeric className="font-semibold">
                    {fmtSatangSymbol(item.grossSatang)}
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
            : `${target.caseRef} · ${target.agentName} · ปิดงาน ${fmtDate(target.workDate)} · ค่าน้ำมัน ${fmtSatangSymbol(target.grossSatang)}`
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
            ยอดคำนวณตามแผนค่าตอบแทนของการปิดงานครั้งแรก · งวดที่ปิดแล้วไม่ถูกแก้ · รายการเข้าคิวอนุมัติตามปกติ
          </InlineAlert>
          <Field id="backdated-fuel-reason" label="เหตุผล" required error={reasonError}>
            <Textarea
              id="backdated-fuel-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="เช่น ระยะทางคำนวณได้หลังงวดปิด"
            />
          </Field>
        </div>
      </Modal>
    </Card>
  )
}
