'use client'

import type { ReactNode } from 'react'
import { Button, StatusBadge, TBody, THead, Table, Td, Th, Tr } from '@/components/ui'
import {
  IMPORT_REQUIREMENT_BADGE_GROUP,
  IMPORT_REQUIREMENT_LABEL,
  type ImportTemplateColumnDoc,
} from '@/lib/imports/template'

/**
 * ปุ่ม "ดาวน์โหลดไฟล์ตัวอย่าง" + คำอธิบายคอลัมน์แบบพับได้ — ใช้ทุกจุดนำเข้าข้อมูลแบบตาราง
 * (มติ PO 04/10/2569 — UAT แม่แบบนำเข้าภาษาไทย) · คอลัมน์มาจาก definition ชุดเดียวกับ parser ของจุดนั้น
 */
export function ImportTemplateHelp({
  columns,
  onDownload,
  downloading = false,
  disabled = false,
  note,
}: {
  columns: readonly ImportTemplateColumnDoc[]
  onDownload: () => void
  downloading?: boolean
  disabled?: boolean
  /** ข้อความอธิบายเพิ่มใต้ปุ่ม (เช่น แม่แบบนี้ตามรูปแบบไฟล์ของบัญชีใด) */
  note?: ReactNode
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-left">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-slate-600">
          ไม่แน่ใจว่าต้องมีหัวคอลัมน์อะไรบ้าง? ดาวน์โหลดไฟล์ตัวอย่างไปกรอกต่อได้เลย
        </div>
        <Button variant="secondary" loading={downloading} disabled={disabled} onClick={onDownload}>
          ดาวน์โหลดไฟล์ตัวอย่าง
        </Button>
      </div>
      {note !== undefined && <div className="mt-2 text-[11px] text-slate-500">{note}</div>}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-semibold text-slate-700">
          ดูคำอธิบายคอลัมน์ ({columns.length} คอลัมน์)
        </summary>
        <div className="mt-2 max-h-64 overflow-y-auto">
          <Table>
            <THead>
              <Tr>
                <Th>หัวคอลัมน์</Th>
                <Th>จำเป็น</Th>
                <Th>รูปแบบ</Th>
              </Tr>
            </THead>
            <TBody>
              {columns.map((column) => (
                <Tr key={column.header}>
                  <Td className="whitespace-nowrap font-semibold text-slate-800">{column.header}</Td>
                  <Td>
                    <StatusBadge
                      group={IMPORT_REQUIREMENT_BADGE_GROUP[column.requirement]}
                      label={IMPORT_REQUIREMENT_LABEL[column.requirement]}
                    />
                  </Td>
                  <Td className="text-slate-600">{column.format}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          ถ้าแก้ไฟล์ใน Excel ให้ตั้งรูปแบบเซลล์ของคอลัมน์ตัวเลขยาว (เลขบัตร เบอร์โทร IMEI) เป็น “ข้อความ” ก่อนพิมพ์
          เพื่อไม่ให้เลข 0 นำหน้าหายหรือกลายเป็นเลขยกกำลัง แล้วบันทึกเป็น “CSV UTF-8”
        </p>
      </details>
    </div>
  )
}
