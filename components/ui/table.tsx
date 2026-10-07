import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react'
import { cn } from '@/components/ui/cn'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { TableScroll } from '@/components/ui/table-scroll'

/**
 * ตารางมาตรฐาน — คลาสตาม `04` §8.1
 * container `border border-slate-200 rounded-lg overflow-hidden bg-white` · header `bg-slate-50 text-xs text-slate-600`
 * · row hover `hover:bg-slate-50` · divider `divide-y divide-slate-100` · เซลล์ตัวเลข/เงินชิดขวา
 */

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-lg border border-slate-200 bg-white', className)}>
      {/* ตารางกว้างกว่ากรอบ ⇒ เงาที่ขอบบอกว่ายังมีคอลัมน์ให้เลื่อนดู (preship R4-001) — เงา overlay ทับหัวตารางด้วย (R5-003) */}
      <TableScroll>
        <table className="w-full text-sm">{children}</table>
      </TableScroll>
    </div>
  )
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">{children}</thead>
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>
}

export function Tr({
  children,
  className,
  interactive = false,
  ...rest
}: {
  children: ReactNode
  className?: string
  /** แถวที่กดได้ — เพิ่ม hover ตาม mockup */
  interactive?: boolean
} & React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn(interactive && 'cursor-pointer hover:bg-slate-50', className)} {...rest}>
      {children}
    </tr>
  )
}

export interface CellProps {
  /** ตัวเลข/เงิน = ชิดขวา ไม่ตัดบรรทัด (`04` §8.1) */
  numeric?: boolean
}

export function Th({
  children,
  numeric = false,
  className,
  ...rest
}: CellProps & ThHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
  return (
    <th
      scope="col"
      className={cn('px-4 py-2.5 font-semibold', numeric ? 'text-right whitespace-nowrap' : 'text-left', className)}
      {...rest}
    >
      {children}
    </th>
  )
}

export function Td({
  children,
  numeric = false,
  className,
  ...rest
}: CellProps & TdHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
  return (
    <td className={cn('px-4 py-3 text-slate-700', numeric && 'text-right font-mono whitespace-nowrap', className)} {...rest}>
      {children}
    </td>
  )
}

/**
 * แถวสถานะของตาราง — loading / error / empty ครบตาม `04` §9
 * ใช้แทน `<TBody>` ทั้งก้อนเมื่อยังไม่มีข้อมูลจะแสดง
 */
export function TableState({
  colSpan,
  loading = false,
  error,
  isEmpty = false,
  emptyTitle,
  emptyDescription,
  onRetry,
}: {
  colSpan: number
  loading?: boolean
  error?: { title?: string; message?: ReactNode; code?: string } | null
  isEmpty?: boolean
  emptyTitle?: string
  emptyDescription?: ReactNode
  /** ฟังก์ชันโหลดใหม่ (แสดงปุ่ม "ลองใหม่" มาตรฐาน) หรือปุ่มที่สร้างเอง — preship PS-028 */
  onRetry?: ReactNode | (() => void)
}) {
  if (!loading && !error && !isEmpty) return null

  return (
    <tbody>
      <tr>
        <td colSpan={colSpan} className="p-0">
          {loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState
              title={error.title}
              message={error.message}
              code={error.code}
              {...(typeof onRetry === 'function' ? { onRetry } : { action: onRetry })}
            />
          ) : (
            <EmptyState title={emptyTitle} description={emptyDescription} />
          )}
        </td>
      </tr>
    </tbody>
  )
}
