import type { CompensationApprovalDto } from '@/lib/compensation/approval-types'

/**
 * เหตุผลตีกลับใต้สถานะของรายการเบิก — ใช้ร่วมคิวการเงินและคิวผู้จัดการ (mytester F-02)
 * · ยังตีกลับอยู่ = เหตุผลปัจจุบัน · ส่งใหม่แล้ว = เหตุผลครั้งก่อน + คำชี้แจงตอนส่งใหม่ (ผู้อนุมัติเห็นว่าแก้อะไรไป)
 */
export function RejectReasonNotes({
  item,
}: {
  item: Pick<CompensationApprovalDto, 'rejectReason' | 'previousRejectReason' | 'resubmitNote'>
}) {
  if (item.rejectReason !== null) {
    return <p className="mt-1 max-w-[200px] text-[10px] text-orange-700">เหตุผล: {item.rejectReason}</p>
  }
  if (item.previousRejectReason === null) return null
  return (
    <div className="mt-1 max-w-[200px] space-y-0.5 text-[10px]">
      <p className="text-orange-700">ตีกลับครั้งก่อน: {item.previousRejectReason}</p>
      {item.resubmitNote !== null && item.resubmitNote.trim() !== '' && (
        <p className="text-slate-600">คำชี้แจงตอนส่งใหม่: {item.resubmitNote}</p>
      )}
    </div>
  )
}
