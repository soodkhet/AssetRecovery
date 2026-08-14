'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, InlineAlert, TBody, THead, Table, TableState, Td, Th, Tr } from '@/components/ui'
import { callApi } from '@/lib/api/types'
import type { PeriodLockPolicyRow } from '@/lib/settings/period-lock'

/**
 * แท็บ "การล็อกรอบและ Adjustment" (`13` §6.11) — **read-only**
 *
 * `13` §7 บังคับว่าแท็บนี้ต้องมี **policy banner สีเหลืองด้านบนเสมอ** (ข้อความมาจาก API ไม่ใช่พิมพ์ซ้ำ
 * ในหน้าจอ เพื่อให้ทุกที่พูดข้อความเดียวกัน)
 *
 * นโยบายเป็นกติกาตายตัวขององค์กร (`02` ไม่มีตารางเก็บ) ⇒ ไม่มีปุ่มแก้ · การ "ปลดล็อกรอบ" เป็น action
 * ของไฟล์ 30 บนหน้างวดบัญชี (Phase 4.1) ไม่ใช่การแก้ policy ที่นี่
 */

interface PeriodLockPayload {
  policy: readonly PeriodLockPolicyRow[]
  banner: string
}

const DIRECT_EDIT_CLASS: Readonly<Record<PeriodLockPolicyRow['directEdit'], string>> = {
  free: 'text-slate-600',
  limited: 'text-amber-700',
  blocked: 'font-semibold text-red-600',
}

const ADJUSTMENT_CLASS: Readonly<Record<PeriodLockPolicyRow['adjustmentRequired'], string>> = {
  no: 'bg-slate-100 text-slate-500',
  sometimes: 'bg-amber-100 text-amber-800',
  always: 'bg-rose-100 text-rose-700',
}

export function PeriodLockTab() {
  const [payload, setPayload] = useState<PeriodLockPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  /** ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** (กฎ `react-hooks/set-state-in-effect`) */
  const fetchPolicy = useCallback(async () => callApi<PeriodLockPayload>('/api/settings/period-lock-policy'), [])

  const reload = useCallback(async () => {
    const result = await fetchPolicy()
    if (result.error !== undefined) {
      setError({ title: result.error.title, message: result.error.message })
      setLoading(false)
      return
    }
    setPayload(result.data ?? null)
    setError(null)
    setLoading(false)
  }, [fetchPolicy])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchPolicy()
      if (cancelled) return
      if (result.error !== undefined) {
        setError({ title: result.error.title, message: result.error.message })
        setLoading(false)
        return
      }
      setPayload(result.data ?? null)
      setError(null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchPolicy])

  const rows = payload?.policy ?? []

  return (
    <Card>
      <div className="mb-4">
        <h2 className="text-sm font-bold text-slate-900">การล็อกรอบและ Adjustment</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          นโยบายตายตัวขององค์กรที่ไฟล์ 20 (Adjustment) และ 30 (ปิดงวด) บังคับใช้ — ไม่ใช่ค่าที่ตั้งได้รายรอบ (ไฟล์ 13 §6.11)
        </p>
      </div>

      {/* banner เหลืองต้องแสดง**เสมอ** ตาม `13` §7 — แม้ตอนโหลดยังไม่เสร็จก็ใช้ข้อความสเปคเป็นค่าตั้งต้น */}
      <InlineAlert tone="warning" title="Policy">
        {payload?.banner ?? 'เมื่อรอบบัญชีถูกรับรองส่งมอบแล้ว ห้ามแก้ source record โดยตรง'} — ต้องสร้าง Adjustment
        ผ่าน workflow แทนเท่านั้น
      </InlineAlert>

      <div className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th>สถานะรอบบัญชี</Th>
              <Th>การแก้ไขเคสเดิม</Th>
              <Th>ต้องใช้ Adjustment</Th>
              <Th>ผู้อนุมัติปลดล็อก</Th>
            </Tr>
          </THead>
          {/* `TableState` เรนเดอร์ `<tbody>` ของตัวเอง — วางเป็นพี่น้องกับ `TBody` */}
          <TableState
            colSpan={4}
            loading={loading}
            error={error}
            isEmpty={rows.length === 0}
            emptyTitle="ไม่พบนโยบายล็อกรอบ"
            emptyDescription="นโยบายเป็นค่าตายตัวของระบบ — ถ้าว่างแปลว่าเรียก API ไม่สำเร็จ"
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
              rows.map((row) => (
                <Tr key={row.status}>
                  <Td>
                    <div className="font-semibold text-slate-900">{row.statusLabel}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-slate-400">{row.status}</div>
                  </Td>
                  <Td>
                    <span className={`text-xs ${DIRECT_EDIT_CLASS[row.directEdit]}`}>{row.directEditLabel}</span>
                  </Td>
                  <Td>
                    <Badge className={ADJUSTMENT_CLASS[row.adjustmentRequired]}>{row.adjustmentLabel}</Badge>
                  </Td>
                  <Td>
                    <span className="text-xs text-slate-600">{row.unlockApprovers.join(' + ')}</span>
                  </Td>
                </Tr>
              ))}
          </TBody>
        </Table>
      </div>

      <p className="mt-3 text-[11px] text-slate-400">
        การปลดล็อกรอบที่ปิดแล้วทำที่หน้างวดบัญชี (ไฟล์ 30) พร้อมบันทึก audit log และเหตุผลทุกครั้ง —
        รอบที่ <span className="font-mono">locked</span> ทุก write จะถูกปฏิเสธด้วย{' '}
        <span className="font-mono">PERIOD_LOCKED_DIRECT_EDIT</span>
      </p>
    </Card>
  )
}
