'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, InlineAlert, TBody, THead, Table, TableState, Td, Th, Tr } from '@/components/ui'
import { callApi } from '@/lib/api/types'
import type { InternalDocumentTemplate } from '@/lib/settings/catalogs'

/**
 * แท็บ "รูปแบบเอกสารภายใน" (`13` §6.7) — **read-only ทั้งแท็บ**
 *
 * รายการนี้เป็น "เอกสารที่ระบบรู้จัก" ไม่ใช่ค่าที่ผู้ใช้เพิ่ม/ลบได้ (ไม่มีตารางใน `02`) — endpoint
 * มีแต่ `GET` ⇒ หน้าจอ **ไม่มีปุ่มเพิ่ม/แก้ไข/ลบ** เลย · รูปแบบ PDF จริงกำหนดที่ไฟล์ 28 (Phase 3.5)
 */

export function InternalDocumentsTab() {
  const [items, setItems] = useState<readonly InternalDocumentTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  /** ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** (กฎ `react-hooks/set-state-in-effect`) */
  const fetchItems = useCallback(
    async () => callApi<InternalDocumentTemplate[]>('/api/settings/document-templates'),
    [],
  )

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
        <h2 className="text-sm font-bold text-slate-900">รูปแบบเอกสารภายใน (Internal Document Templates)</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          เอกสารที่ระบบสร้างให้อัตโนมัติในแต่ละขั้นของงาน — ใช้ภายในบริษัท ไม่ใช่เอกสารภาษีทางการ (ไฟล์ 13 §6.7)
        </p>
      </div>

      <InlineAlert tone="info" title="แท็บนี้ดูอย่างเดียว">
        รายการเอกสารเป็นค่าตายตัวของระบบ เพิ่ม/ลบไม่ได้ — รูปแบบหน้าตา PDF จริงกำหนดที่สเปคไฟล์ 28
      </InlineAlert>

      <div className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th>เอกสาร</Th>
              <Th>ใช้เมื่อ</Th>
              <Th>รหัสอ้างอิง</Th>
              <Th className="text-right">สเปคต้นทาง</Th>
            </Tr>
          </THead>
          {/* `TableState` เรนเดอร์ `<tbody>` ของตัวเอง — วางเป็นพี่น้องกับ `TBody` */}
          <TableState
            colSpan={4}
            loading={loading}
            error={error}
            isEmpty={items.length === 0}
            emptyTitle="ไม่พบรายการเอกสารภายใน"
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
                <Tr key={item.code}>
                  <Td>
                    <span className="font-semibold text-slate-900">{item.name}</span>
                  </Td>
                  <Td>
                    <span className="text-xs text-slate-600">{item.usage}</span>
                  </Td>
                  <Td>
                    <span className="font-mono text-[10px] text-slate-400">{item.code}</span>
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
