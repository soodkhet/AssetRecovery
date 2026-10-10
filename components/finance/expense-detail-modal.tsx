'use client'

import type { ReactNode } from 'react'
import { StoredFileButton } from '@/components/uploads/stored-file-button'
import { Button, InlineAlert, Modal, RefText } from '@/components/ui'
import type { CompensationApprovalDto } from '@/lib/compensation/approval-types'
import { EXPENSE_STATUS_LABEL, EXPENSE_TYPE_LABEL } from '@/lib/field/expense-ui'
import { googleMapsRouteUrl } from '@/lib/field/field-ui'
import { fmtDate, fmtDateTime } from '@/lib/format/datetime'
import { fmtSatangSymbol } from '@/lib/format/money'

/**
 * รายละเอียดรายการเบิกก่อนอนุมัติ (มติ PO 07/10/2569 U152) — กดแถวในคิวอนุมัติแล้วเห็นสิ่งที่ผู้เบิกกรอกไว้:
 * หมายเหตุ · คำชี้แจงตอนส่งใหม่ · ใบเสร็จ (signed URL ที่ server ออกตามสิทธิ์/scope) · ผู้พักร่วม · ผู้บันทึกแทน (U153)
 *
 * ข้อมูลทั้งหมดมาจาก DTO ของคิวอนุมัติ (scope/สิทธิ์เดิม) — ไม่มี endpoint ใหม่ · ใบเสร็จแสดงเฉพาะไฟล์ที่ server
 * ตรวจแล้ว (path เก่าที่พิมพ์เอง = ป้ายเตือน "ไม่ผ่านการตรวจ" — U143)
 */
export function ExpenseDetailModal({ item, onClose }: { item: CompensationApprovalDto | null; onClose: () => void }) {
  if (item === null) return null
  return (
    <Modal
      open
      onClose={onClose}
      title="รายละเอียดรายการเบิก"
      description={`${EXPENSE_TYPE_LABEL[item.expenseType]} · ${item.payeeName}`}
      footer={
        <Button variant="secondary" onClick={onClose}>
          ปิด
        </Button>
      }
    >
      <dl className="space-y-3 text-sm">
        <Row label="วันที่เกิดรายการ">{fmtDate(item.expenseDate)}</Row>
        <Row label="อ้างอิงเคส">{item.caseRef === null ? '— ไม่ผูกเคส' : <RefText>{item.caseRef}</RefText>}</Row>
        <Row label="ยอดเบิก">
          <span className="font-semibold">{fmtSatangSymbol(item.grossSatang)}</span>
          <span className="block text-[11px] text-slate-500">{item.basisText}</span>
        </Row>
        {/* staging E-044 — ค่าน้ำมันตามกิโลเมตร: เปิดเส้นทางจุดเริ่ม → จุดเช็คอินบนแผนที่ก่อนอนุมัติ */}
        {item.fuelRoute !== undefined && item.fuelRoute.length > 0 && (
          <Row label="เส้นทางวันนั้น">
            <span className="block text-[11px] text-slate-600">
              {item.fuelRoute.map((point) => point.label).join(' → ')}
            </span>
            {googleMapsRouteUrl(item.fuelRoute) !== null ? (
              <a
                href={googleMapsRouteUrl(item.fuelRoute) ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-emerald-700 underline"
              >
                เปิดเส้นทางใน Google Maps
              </a>
            ) : (
              <span className="text-[11px] text-slate-400">มีจุดเดียว — ดูเส้นทางไม่ได้</span>
            )}
          </Row>
        )}
        <Row label="สถานะ">{EXPENSE_STATUS_LABEL[item.status]}</Row>
        {item.recordedByName !== null && <Row label="บันทึกแทนโดย">{item.recordedByName}</Row>}
        {item.sharedWithName !== null && <Row label="ผู้พักร่วม">{item.sharedWithName}</Row>}
        <Row label="หมายเหตุของผู้เบิก">
          <Text value={item.note} />
        </Row>
        <Row label="คำชี้แจงตอนส่งใหม่">
          <Text value={item.resubmitNote} />
        </Row>
        <Row label="ใบเสร็จ">
          {item.receiptFilePath !== null ? (
            <StoredFileButton path={item.receiptFilePath} label="เปิดดูใบเสร็จ" title="ใบเสร็จที่แนบ" />
          ) : item.substituteReceipt !== null ? (
            <span>
              ใช้ใบรับรองแทนใบเสร็จ <RefText>{item.substituteReceipt.receiptNumber}</RefText>
            </span>
          ) : (
            <span className="text-slate-400">ไม่มีไฟล์แนบ</span>
          )}
        </Row>
        {item.receiptUnverified && (
          <InlineAlert tone="warning">
            ใบเสร็จเดิมของรายการนี้เป็นลิงก์ที่พิมพ์เอง ไม่ผ่านการตรวจไฟล์ — ระบบถือว่าไม่มีใบเสร็จ ให้ผู้เบิกแนบไฟล์ใหม่
          </InlineAlert>
        )}
        {item.rejectReason !== null && (
          <Row label="เหตุผลที่ตีกลับล่าสุด">
            <span className="text-orange-700">{item.rejectReason}</span>
          </Row>
        )}
        <Row label="บันทึกเมื่อ">{fmtDateTime(item.createdAt)}</Row>
      </dl>
    </Modal>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="text-slate-800">{children}</dd>
    </div>
  )
}

function Text({ value }: { value: string | null }) {
  if (value === null || value.trim() === '') return <span className="text-slate-400">—</span>
  return <span className="whitespace-pre-wrap">{value}</span>
}
