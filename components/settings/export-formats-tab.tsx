'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, InlineAlert, TBody, THead, Table, TableState, Td, Th, Tr } from '@/components/ui'
import { callApi } from '@/lib/api/types'
import type { ExportFormatSpec } from '@/lib/settings/catalogs'

/**
 * แท็บ "รูปแบบไฟล์ส่งบัญชี" (`13` §6.9) — **read-only ทั้งแท็บ**
 *
 * ชุดไฟล์ Accounting Pack 01–08 ต้องครบเสมอและเรียงเลขไม่ขาด (`37` §6.1) ⇒ ผู้ใช้เพิ่ม/ลบไม่ได้
 * endpoint มีแต่ `GET` · ตัวสร้างไฟล์จริง + SHA-256 + versioning อยู่ Phase 4.6
 */

export function ExportFormatsTab() {
  const [items, setItems] = useState<readonly ExportFormatSpec[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  /** ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** (กฎ `react-hooks/set-state-in-effect`) */
  const fetchItems = useCallback(async () => callApi<ExportFormatSpec[]>('/api/settings/export-formats'), [])

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

  return (
    <Card>
      <div className="mb-4">
        <h2 className="text-sm font-bold text-slate-900">รูปแบบไฟล์ส่งสำนักงานบัญชี (Accounting Pack)</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          ชุดไฟล์มาตรฐานที่ระบบสร้างส่งสำนักงานบัญชีทุกเดือน — ระบบเตรียมข้อมูลให้เท่านั้น ไม่ลงบัญชีแทน (ไฟล์ 13 §6.9)
        </p>
      </div>

      <InlineAlert tone="info" title="แท็บนี้ดูอย่างเดียว">
        ชุดไฟล์ 01–08 ต้องครบทุกไฟล์และเรียงเลขไม่ขาด (ไฟล์ 37 §6.1) — เพิ่ม/ลบไฟล์ในชุดไม่ได้
      </InlineAlert>

      <div className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th>ไฟล์</Th>
              <Th>รูปแบบ</Th>
              <Th>เนื้อหา / คอลัมน์หลัก</Th>
              <Th className="text-right">สเปคต้นทาง</Th>
            </Tr>
          </THead>
          {/* `TableState` เรนเดอร์ `<tbody>` ของตัวเอง — วางเป็นพี่น้องกับ `TBody` */}
          <TableState
            colSpan={4}
            loading={loading}
            error={error}
            isEmpty={items.length === 0}
            emptyTitle="ไม่พบรายการไฟล์ส่งบัญชี"
            emptyDescription="ระบบควรมีรายการตายตัวเสมอ — ถ้าว่างแปลว่าเรียก API ไม่สำเร็จ"
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
                <Tr key={item.fileName}>
                  <Td>
                    <span className="font-mono text-xs font-semibold text-slate-900">{item.fileName}</span>
                  </Td>
                  <Td>
                    <Badge className="bg-slate-100 text-slate-600">{item.format}</Badge>
                  </Td>
                  <Td>
                    <span className="text-xs text-slate-600">{item.content}</span>
                  </Td>
                  <Td className="text-right">
                    <Badge className="bg-slate-100 text-slate-600">ไฟล์ {item.sourceFile}</Badge>
                  </Td>
                </Tr>
              ))}
          </TBody>
        </Table>
      </div>
    </Card>
  )
}
