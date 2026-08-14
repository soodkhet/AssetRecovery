'use client'

import { useEffect, useState, type ReactNode } from 'react'
import {
  Badge,
  Button,
  Modal,
  TBody,
  THead,
  Table,
  TableState,
  Td,
  Th,
  Tr,
} from '@/components/ui'
import { callApi } from '@/lib/api/types'
import { fmtDate, fmtDateTime } from '@/lib/format/datetime'

/**
 * ประวัติเวอร์ชันของเทมเพลต (ใช้ร่วมทั้งแผนค่าตอบแทน `11` §14 และเทมเพลตค่าบริการ `12` §9)
 *
 * เวอร์ชันเก่าเป็น **ประวัติอ่านอย่างเดียว** — แก้ไม่ได้ทุกกรณี เพราะเป็นตัวอ้างอิงของ snapshot
 * ที่ลงไว้ใน `expenses`/`cases` แล้ว (`92` §7.1) · วันที่แสดงเป็น พ.ศ. ผ่าน utils กลาง (Rule 01)
 */

export interface VersionRow {
  id: string
  version: number
  isCurrent: boolean
  updatedAt: string
  /** ช่วงวันที่มีผล (เฉพาะแผนค่าตอบแทนที่มี `effective_from`/`effective_to`) */
  effectiveFrom?: string
  effectiveTo?: string | null
  /** สรุปค่าสำคัญของเวอร์ชันนั้นแบบสั้น */
  summary: ReactNode
}

interface VersionHistoryModalProps<T> {
  open: boolean
  onClose: () => void
  title: string
  /** endpoint `GET .../:id/versions` */
  url: string | null
  toRow: (item: T) => VersionRow
}

export function VersionHistoryModal<T>({ open, onClose, title, url, toRow }: VersionHistoryModalProps<T>) {
  const [rows, setRows] = useState<VersionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ตั้ง state **หลัง** await เท่านั้น (กฎ `react-hooks/set-state-in-effect`)
  useEffect(() => {
    if (!open || url === null) return
    let cancelled = false
    void (async () => {
      const result = await callApi<T[]>(url)
      if (cancelled) return
      if (result.error !== undefined) {
        setError(result.error.message)
        setLoading(false)
        return
      }
      setRows((result.data ?? []).map(toRow))
      setError(null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [open, url, toRow])

  const hasEffectiveRange = rows.some((row) => row.effectiveFrom !== undefined)

  return (
    <Modal open={open} onClose={onClose} title={title} description="เวอร์ชันเก่าเก็บไว้เป็นประวัติ แก้ไขไม่ได้" size="lg">
      <Table>
        <THead>
          <Tr>
            <Th>เวอร์ชัน</Th>
            {hasEffectiveRange && <Th>ช่วงที่มีผล</Th>}
            <Th>ค่าที่ตั้งไว้</Th>
            <Th>แก้ไขล่าสุด</Th>
          </Tr>
        </THead>

        <TableState
          colSpan={hasEffectiveRange ? 4 : 3}
          loading={loading}
          error={error === null ? null : { message: error }}
          isEmpty={rows.length === 0}
          emptyTitle="ยังไม่มีประวัติเวอร์ชัน"
        />

        {!loading && error === null && rows.length > 0 && (
          <TBody>
            {rows.map((row) => (
              <Tr key={row.id}>
                <Td>
                  <span className="font-mono text-xs font-bold text-slate-900">v{row.version}</span>
                  {row.isCurrent && <Badge className="ml-2 bg-emerald-50 text-emerald-700">ปัจจุบัน</Badge>}
                </Td>
                {hasEffectiveRange && (
                  <Td>
                    <span className="text-xs text-slate-600">
                      {fmtDate(row.effectiveFrom)} – {row.effectiveTo == null ? 'ปัจจุบัน' : fmtDate(row.effectiveTo)}
                    </span>
                  </Td>
                )}
                <Td>
                  <span className="text-xs text-slate-600">{row.summary}</span>
                </Td>
                <Td>
                  <span className="text-xs text-slate-500">{fmtDateTime(row.updatedAt)}</span>
                </Td>
              </Tr>
            ))}
          </TBody>
        )}
      </Table>

      <div className="mt-4 text-right">
        <Button variant="secondary" onClick={onClose}>
          ปิด
        </Button>
      </div>
    </Modal>
  )
}
