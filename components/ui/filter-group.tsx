import { cn } from '@/components/ui/cn'

/**
 * ตัวเลือกแบบ segmented (ปุ่มกลุ่มบนพื้น `bg-slate-100`) — ใช้เป็นตัวกรองสถานะ/มิติ/ช่วงเวลาของทุกหน้า
 * คลาสยึด `04` §8.1 · ปุ่มที่เลือกอยู่ยกขึ้นเป็นพื้นขาว + เงา ส่วนที่เหลือเป็นข้อความเทา
 *
 * ⚠️ เดิมโค้ดชุดนี้ถูกก็อปซ้ำ 7 จุดในหน้าการเงิน (พบตอนรีวิว Phase 3) — เพิ่มตัวเลือกใหม่ให้แก้ที่นี่
 *    ที่เดียว ห้ามประกอบ markup เองในหน้าจอ
 *
 * `aria-pressed` บอก screen reader ว่าปุ่มไหนถูกเลือกอยู่ (ไม่ใช่แค่สีที่ต่างกัน)
 */
export function FilterGroup<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={cn('flex gap-1 rounded-lg bg-slate-100 p-1', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cn(
            'focus-ring rounded-md px-3 py-1 text-xs font-semibold transition-colors',
            value === option.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
