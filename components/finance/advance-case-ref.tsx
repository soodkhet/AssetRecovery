import { cn } from '@/components/ui/cn'

/**
 * mytester DO-07 — บรรทัด "เคส <เลขสัญญา>" ใต้วัตถุประสงค์ของเงินทดรองที่อ้างอิงเคส (ไม่อ้างอิง = ไม่แสดง)
 * ใช้ร่วมกันทั้งการ์ดมือถือ (Field Tracker) · ตารางเงินทดรอง/คิวอนุมัติของการเงิน
 */
export function AdvanceCaseRef({ caseRef, className }: { caseRef: string | null; className?: string }) {
  if (caseRef === null) return null
  return (
    <p className={cn('text-[11px] text-slate-500', className)}>
      เคส <span className="font-mono">{caseRef}</span>
    </p>
  )
}
