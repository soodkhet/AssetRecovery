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
 * ปุ่มหลัก = แม่แบบ .xlsx (ตั้งเซลล์เป็นข้อความไว้แล้ว) · ลิงก์รอง "หรือ CSV" (มติผู้ใช้ 04/10/2569)
 */
export function ImportTemplateHelp({
  columns,
  onDownload,
  onDownloadCsv,
  downloading = false,
  disabled = false,
  note,
}: {
  columns: readonly ImportTemplateColumnDoc[]
  /** ดาวน์โหลดแม่แบบ .xlsx (ปุ่มหลัก) */
  onDownload: () => void
  /** ดาวน์โหลดแม่แบบ .csv (ลิงก์รอง) */
  onDownloadCsv: () => void
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
        <div className="flex items-center gap-2">
          <Button variant="secondary" loading={downloading} disabled={disabled} onClick={onDownload}>
            ดาวน์โหลดไฟล์ตัวอย่าง (.xlsx)
          </Button>
          <button
            type="button"
            disabled={disabled}
            onClick={onDownloadCsv}
            className="focus-ring rounded text-xs text-slate-500 underline hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            หรือ CSV
          </button>
        </div>
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
          แนะนำไฟล์ .xlsx — ทุกช่องตั้งเป็น “ข้อความ” ไว้แล้ว เลข 0 นำหน้าของเบอร์โทรและ IMEI 15 หลักจึงไม่เพี้ยน
          (ถ้าคัดลอกมาวาง ให้วางแบบ “ค่าเท่านั้น”) · ถ้าใช้ CSV แล้วแก้ใน Excel ให้ตั้งรูปแบบเซลล์ของคอลัมน์ตัวเลขยาว
          เป็น “ข้อความ” ก่อนพิมพ์ แล้วบันทึกเป็น “CSV UTF-8” · แถวที่มีเลขยกกำลัง (เช่น 3.5E+14) ระบบจะไม่รับ
        </p>
      </details>
    </div>
  )
}
