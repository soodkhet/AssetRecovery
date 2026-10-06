import { cn } from '@/components/ui/cn'
import type { SettingHelpContent } from '@/lib/settings/help/types'

/**
 * กล่องคำอธิบายค่าตั้ง (มติ PO 06/10/2569 U108) — พับ/กางได้ด้วย `<details>` (ไม่ต้องมี state · ใช้คีย์บอร์ดได้)
 *
 * แสดง 4 ส่วนตามมติ: คืออะไร · ผลของแต่ละตัวเลือก · ตัวอย่างตัวเลข · ใครแก้ได้/มีผลเมื่อไร
 * ตัวอย่างตัวเลขมาจาก `lib/settings/help/*` (เรียกสูตรจริง) — ผู้เรียกส่งค่าที่กำลังเลือกในฟอร์มเข้าไป
 * ⇒ กล่องอัปเดตสดทุกครั้งที่ฟอร์ม re-render · ข้อความทั้งหมดอยู่ใน `lib/settings/help` (ห้ามเขียนข้อความลอยในหน้า)
 */
export function SettingHelp({
  help,
  defaultOpen = false,
  className,
}: {
  help: SettingHelpContent
  defaultOpen?: boolean
  className?: string
}) {
  const examples = help.examples ?? []
  return (
    <details
      open={defaultOpen}
      className={cn('group rounded-lg border border-slate-200 bg-slate-50/70 text-xs text-slate-600', className)}
    >
      <summary className="focus-ring flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 font-semibold text-slate-700 hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-400 font-serif text-[10px] italic text-slate-500"
        >
          i
        </span>
        <span className="flex-1">{help.title}</span>
        <span aria-hidden="true" className="text-slate-400 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>

      <div className="space-y-3 border-t border-slate-200 px-3 py-3">
        <p className="leading-relaxed">{help.what}</p>

        {help.options !== undefined && help.options.length > 0 && (
          <ul className="space-y-1">
            {help.options.map((option) => (
              <li key={option.label} className="flex gap-1.5">
                <span className="text-slate-400">•</span>
                <span>
                  <span className="font-semibold text-slate-700">{option.label}</span> — {option.effect}
                </span>
              </li>
            ))}
          </ul>
        )}

        {help.table !== undefined && (
          <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  {help.table.headers.map((header, index) => (
                    <th key={header} className={cn('px-2 py-1.5 font-semibold', index === 0 ? 'text-left' : 'text-right')}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {help.table.rows.map((row) => (
                  <tr key={row[0]} className="border-t border-slate-100">
                    {row.map((cell, index) => (
                      <td
                        key={`${row[0]}-${index}`}
                        className={cn('px-2 py-1.5', index === 0 ? 'text-left text-slate-700' : 'text-right font-mono text-slate-900')}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {examples.map((example) => (
          <div key={example.title} className="rounded-md border border-emerald-100 bg-white p-2.5">
            <div className="mb-1 font-semibold text-emerald-800">ตัวอย่าง: {example.title}</div>
            {example.lines.length > 0 && (
              <dl className="space-y-0.5">
                {example.lines.map((each) => (
                  <div key={each.label} className="flex flex-wrap justify-between gap-x-3">
                    <dt className="text-slate-500">{each.label}</dt>
                    <dd className={cn('text-right font-mono', each.strong === true ? 'font-bold text-slate-900' : 'text-slate-700')}>
                      {each.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {example.note !== undefined && <p className="mt-1 text-[11px] text-slate-500">{example.note}</p>}
          </div>
        ))}

        <dl className="grid grid-cols-1 gap-2 border-t border-slate-200 pt-2 sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-slate-700">ใครแก้ได้</dt>
            <dd className="mt-0.5">{help.who}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-700">มีผลเมื่อไร</dt>
            <dd className="mt-0.5">{help.when}</dd>
          </div>
        </dl>
      </div>
    </details>
  )
}
