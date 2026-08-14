'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { IconAlert, IconClose } from '@/components/field/field-icons'
import { cn } from '@/components/ui/cn'
import { apiPath } from '@/lib/api/contract'
import { callApi, jsonRequest } from '@/lib/api/types'
import { notificationHref, unreadBadgeText } from '@/lib/field/push-client'
import type { NotificationDto, NotificationListDto } from '@/lib/notifications/queries'
import { fmtDateTime } from '@/lib/format/datetime'

/**
 * กระดิ่งแจ้งเตือนในแอป (`41` §15 — **fallback หลัก** ที่ใช้เสมอไม่ว่าจะได้ push หรือไม่)
 *
 * - เปิด dropdown **ไม่** มาร์คว่าอ่านอัตโนมัติ (E11) — มาร์คตอนกดรายการ หรือกด "อ่านทั้งหมด"
 * - รายการที่มี `linkPath` ภายในแอปเท่านั้นที่พาไปหน้าอื่นได้ (กัน open redirect — `notificationHref()`)
 */
export function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<NotificationListDto>({ items: [], unreadCount: 0 })

  const load = useCallback(async () => {
    const response = await callApi<NotificationListDto>(apiPath('field.notificationList'))
    if (response.data !== undefined) setData(response.data)
  }, [])

  useEffect(() => {
    void (async () => {
      await load()
    })()
    // เปิดแอปค้างไว้ทั้งวันได้ ⇒ รีเฟรชเบา ๆ ทุก 2 นาที (ไม่ใช่ช่องทางเดียว จึงไม่ต้องถี่กว่านี้)
    const timer = setInterval(() => void load(), 120_000)
    return () => clearInterval(timer)
  }, [load])

  async function markRead(ids?: string[]): Promise<void> {
    await callApi(apiPath('field.notificationRead'), jsonRequest('POST', ids === undefined ? {} : { ids }))
    await load()
  }

  function openItem(item: NotificationDto): void {
    void markRead([item.id])
    const href = notificationHref(item.linkPath)
    if (href !== null) {
      setOpen(false)
      router.push(href)
    }
  }

  const badge = unreadBadgeText(data.unreadCount)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={`การแจ้งเตือน${badge === null ? '' : ` (ยังไม่อ่าน ${badge})`}`}
        aria-expanded={open}
        className="focus-ring relative rounded-lg p-2 text-slate-700 hover:bg-slate-100"
      >
        <IconAlert className="h-5 w-5" />
        {badge !== null && (
          <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 z-50 mt-1 w-[min(88vw,340px)] rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <span className="text-xs font-bold text-slate-700">การแจ้งเตือน</span>
              <div className="flex items-center gap-1">
                {data.unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void markRead()}
                    className="focus-ring rounded px-2 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50"
                  >
                    อ่านทั้งหมด
                  </button>
                )}
                <button
                  type="button"
                  aria-label="ปิด"
                  onClick={() => setOpen(false)}
                  className="focus-ring rounded p-1 text-slate-400 hover:bg-slate-100"
                >
                  <IconClose className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {data.items.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-slate-400">ยังไม่มีการแจ้งเตือน</p>
              ) : (
                data.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openItem(item)}
                    className={cn(
                      'focus-ring block w-full border-b border-slate-50 px-3 py-2.5 text-left last:border-b-0 hover:bg-slate-50',
                      item.readAt === null && 'bg-blue-50/50',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {item.readAt === null && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-bold text-slate-800">{item.title}</span>
                        {item.body !== null && (
                          <span className="mt-0.5 block text-[11px] text-slate-500">{item.body}</span>
                        )}
                        <span className="mt-0.5 block text-[10px] text-slate-400">{fmtDateTime(item.createdAt)}</span>
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
