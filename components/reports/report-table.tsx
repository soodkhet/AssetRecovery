'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { TBody, Table, TableState, Td, Th, THead, Tr } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { formatCellText, type ReportColumn, type ReportRow } from '@/lib/reports/payload'
import {
  VIRTUAL_OVERSCAN,
  VIRTUAL_ROW_HEIGHT,
  VIRTUAL_VIEWPORT_HEIGHT,
  shouldVirtualize,
  visibleRowWindow,
} from '@/lib/reports/table-window'

/**
 * ตารางกลางของทุกรายงาน (`96` §11)
 *
 * - **virtual scroll เมื่อเกิน 100 แถว** (`96` §11 "ตารางทุกตัวมี pagination หรือ virtual scroll
 *   ถ้า row > 100") — เรนเดอร์เฉพาะหน้าต่างที่มองเห็น + แถวกันชนหัว/ท้าย ⇒ 20,000 แถวก็ไม่หน่วง
 *   ทำเองด้วย `scrollTop` ไม่เพิ่ม dependency (แนวเดียวกับที่ 4.6 เขียน zip เอง)
 * - **ไม่ตัดข้อมูลทิ้ง**: ทุกแถวยังอยู่ใน DOM tree เชิงตรรกะและอยู่ในไฟล์ export ครบ (`96` §13)
 * - loading / empty / error ครบตาม `04` §9 ผ่าน `<TableState>` ตัวกลาง
 */

const NUMERIC_TYPES = new Set(['money', 'number', 'percent'])

export function isNumericColumn(column: ReportColumn): boolean {
  return NUMERIC_TYPES.has(column.type)
}

function cellClass(column: ReportColumn): string | undefined {
  switch (column.tone) {
    case 'warning':
      return 'text-amber-700'
    case 'danger':
      return 'text-red-600'
    default:
      return undefined
  }
}

function DataRow({
  row,
  columns,
  isTotal = false,
}: {
  row: ReportRow
  columns: readonly ReportColumn[]
  isTotal?: boolean
}) {
  return (
    <Tr className={cn(isTotal && 'bg-slate-50 font-semibold')}>
      {columns.map((column) => (
        <Td key={column.key} numeric={isNumericColumn(column)} className={cellClass(column)}>
          {formatCellText(row[column.key] ?? null, column.type)}
        </Td>
      ))}
    </Tr>
  )
}

export function ReportTable({
  columns,
  rows,
  totalRow = null,
  loading = false,
  error = null,
  onRetry,
  emptyDescription = 'ไม่มีข้อมูลในช่วงเวลาที่เลือก — ลองเปลี่ยนช่วงเวลาแล้วดูใหม่',
}: {
  columns: readonly ReportColumn[]
  rows: readonly ReportRow[]
  totalRow?: ReportRow | null
  loading?: boolean
  error?: { title: string; message: string } | null
  onRetry?: React.ReactNode
  emptyDescription?: string
}) {
  const [scrollTop, setScrollTop] = useState(0)
  const viewportRef = useRef<HTMLDivElement | null>(null)

  const virtual = shouldVirtualize(rows.length)
  const onScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop)
  }, [])

  const window = useMemo(
    () =>
      visibleRowWindow({
        rowCount: rows.length,
        scrollTop,
        viewportHeight: VIRTUAL_VIEWPORT_HEIGHT,
        rowHeight: VIRTUAL_ROW_HEIGHT,
        overscan: VIRTUAL_OVERSCAN,
      }),
    [rows.length, scrollTop],
  )

  const hasData = !loading && error === null && rows.length > 0
  const body = virtual ? rows.slice(window.start, window.end) : rows

  const table = (
    <Table className={virtual ? 'border-0' : undefined}>
      <THead>
        <Tr>
          {columns.map((column) => (
            <Th key={column.key} numeric={isNumericColumn(column)}>
              {column.header}
            </Th>
          ))}
        </Tr>
      </THead>

      <TableState
        colSpan={columns.length}
        loading={loading}
        error={error}
        isEmpty={rows.length === 0}
        emptyTitle="ยังไม่มีข้อมูล"
        emptyDescription={emptyDescription}
        {...(onRetry === undefined ? {} : { onRetry })}
      />

      {hasData && (
        <TBody>
          {virtual && window.start > 0 && (
            <tr aria-hidden="true">
              <td colSpan={columns.length} style={{ height: window.start * VIRTUAL_ROW_HEIGHT, padding: 0 }} />
            </tr>
          )}
          {body.map((row, index) => (
            <DataRow key={`${window.start + index}`} row={row} columns={columns} />
          ))}
          {virtual && window.end < rows.length && (
            <tr aria-hidden="true">
              <td colSpan={columns.length} style={{ height: (rows.length - window.end) * VIRTUAL_ROW_HEIGHT, padding: 0 }} />
            </tr>
          )}
          {totalRow !== null && <DataRow row={totalRow} columns={columns} isTotal />}
        </TBody>
      )}
    </Table>
  )

  if (!virtual) return table

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div
        ref={viewportRef}
        onScroll={onScroll}
        style={{ maxHeight: VIRTUAL_VIEWPORT_HEIGHT }}
        className="overflow-y-auto"
        role="region"
        aria-label={`ตารางรายงาน ${rows.length} แถว`}
      >
        {table}
      </div>
      <p className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
        แสดง {rows.length.toLocaleString('th-TH')} แถว — เลื่อนดูได้ทั้งหมด และไฟล์ที่ส่งออกมีครบทุกแถว
      </p>
    </div>
  )
}
