'use client'

import { Button, Modal, RefText } from '@/components/ui'
import { fmtDateTime, nowDate } from '@/lib/format/datetime'
import type { HandoverType } from '@/lib/generated/prisma/enums'
import { HANDOVER_DOC_TITLE, handoverDocRow } from '@/lib/warehouse/handover-doc'
import type { AssetListItemDto } from '@/lib/warehouse/types'
import { HANDOVER_TYPE_LABEL } from '@/lib/warehouse/warehouse-ui'

/**
 * **ตัวอย่าง**ใบส่งมอบก่อนบันทึกการนัด (`44` §8.4 modal `preview-delivery-doc`)
 *
 * ⚠️ ฉบับจริงคือ PDF จาก `GET /api/handover-lots/:id/pdf` ซึ่งออกได้**หลัง**ล็อตเกิดเท่านั้น
 *    (เลข `LOT-`/`DLV-` เดินจาก sequence ระดับ DB ตอนสร้าง — ห้ามเดาเลขล่วงหน้า `44` §6.2/§10)
 *    ที่นี่จึงเป็นร่างสำหรับ "ตรวจรายการก่อนกดบันทึก" และพิมพ์ผ่าน `window.print()` (`.print-area`)
 *
 * คอลัมน์/ลำดับยึด `buildHandoverDoc()` ตัวเดียวกับ PDF+Excel เพื่อไม่ให้ร่างกับฉบับจริงพูดคนละเรื่อง
 */
export function HandoverNotePreview({
  open,
  onClose,
  companyName,
  type,
  scheduledAt,
  contactPerson,
  deliveryAddr,
  note,
  assets,
}: {
  open: boolean
  onClose: () => void
  companyName: string
  type: HandoverType
  /** ISO UTC จากฟอร์ม — แสดงเป็น พ.ศ. ผ่าน `fmtDateTime` */
  scheduledAt: string | null
  contactPerson: string | null
  deliveryAddr: string | null
  note: string | null
  assets: readonly AssetListItemDto[]
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={`ตัวอย่าง${HANDOVER_DOC_TITLE}`}
      description="ร่างสำหรับตรวจรายการก่อนบันทึก — เลขที่ใบส่งมอบออกอัตโนมัติเมื่อบันทึกการนัด"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            ปิด
          </Button>
          <Button variant="secondary" onClick={() => window.print()}>
            พิมพ์ร่าง
          </Button>
        </>
      }
    >
      <div className="print-area rounded-xl border-2 border-slate-200 bg-white p-6 text-sm">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-extrabold text-slate-900">{HANDOVER_DOC_TITLE}</div>
            <div className="mt-1 text-xs text-slate-400">{HANDOVER_TYPE_LABEL[type]}</div>
          </div>
          <div className="text-right text-xs">
            <div className="font-mono font-bold text-slate-700">เลขที่: (ออกอัตโนมัติเมื่อบันทึก)</div>
            <div className="mt-1 text-slate-400">วันที่พิมพ์ร่าง: {nowDate()}</div>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 text-xs sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 font-bold text-slate-500 uppercase">ผู้รับมอบ</div>
            <div className="font-bold text-slate-800">{companyName}</div>
            {deliveryAddr !== null && <div className="mt-1 text-slate-500">{deliveryAddr}</div>}
            {contactPerson !== null && <div className="mt-1 text-slate-500">ผู้ประสานงาน: {contactPerson}</div>}
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 font-bold text-slate-500 uppercase">นัดหมาย</div>
            <div className="text-slate-700">
              {type === 'finance_pickup' ? 'วันนัดรับ' : 'กำหนดจัดส่ง'}: {fmtDateTime(scheduledAt)}
            </div>
            <div className="mt-1 text-slate-500">จำนวน {assets.length} เครื่อง</div>
            {note !== null && <div className="mt-1 text-slate-500">หมายเหตุ: {note}</div>}
          </div>
        </div>

        <table className="mb-6 w-full border border-slate-200 text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">เลขสัญญา</th>
              <th className="px-3 py-2 text-left">ชื่อลูกหนี้</th>
              <th className="px-3 py-2 text-left">อุปกรณ์</th>
              <th className="px-3 py-2 text-left">IMEI / Serial</th>
              <th className="px-3 py-2 text-left">สภาพ</th>
            </tr>
          </thead>
          <tbody>
            {/* แถวชุดเดียวกับ PDF (`handoverDocRow`) — รายละเอียดสภาพ/ค่าที่ตรวจจริง/สี-ความจุไม่ตรงต้องเห็นตั้งแต่ร่าง (mytester WH-06) */}
            {assets.map((asset, index) => {
              const row = handoverDocRow(asset, index)
              return (
                <tr key={asset.id} className="border-b border-slate-100 align-top">
                  <td className="px-3 py-2">{row.no}</td>
                  <td className="px-3 py-2">
                    <RefText>{row.caseRef}</RefText>
                  </td>
                  <td className="px-3 py-2">{row.debtorName}</td>
                  <td className="px-3 py-2">
                    {row.deviceDesc}
                    {row.colorCapacityMismatch !== null && (
                      <div className="mt-0.5 text-[11px] text-slate-500">{row.colorCapacityMismatch}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-mono">{row.identifier}</span>
                    {row.identifierActual !== null && (
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        ตรวจจริง: <span className="font-mono">{row.identifierActual}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.condition}
                    {row.conditionNote !== null && row.conditionNote.trim() !== '' && (
                      <div className="mt-0.5 text-[11px] text-slate-500">{row.conditionNote}</div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="grid grid-cols-1 gap-8 text-xs sm:grid-cols-2">
          <div className="border-t border-slate-300 pt-4 text-center text-slate-400">
            <div>ลายมือชื่อผู้ส่งมอบ</div>
            <div className="mt-6 text-slate-500">............................................</div>
            <div className="mt-1">วันที่ ..............................................</div>
          </div>
          <div className="border-t border-slate-300 pt-4 text-center text-slate-400">
            <div>ลายมือชื่อผู้รับมอบ</div>
            <div className="mt-6 text-slate-500">............................................</div>
            <div className="mt-1">วันที่ ..............................................</div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
