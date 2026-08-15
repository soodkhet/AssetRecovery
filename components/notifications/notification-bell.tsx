'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/components/ui/cn'
import { IconBell, IconClose } from '@/components/notifications/notification-icons'
import { callApi, jsonRequest } from '@/lib/api/types'
import { notificationHref, unreadBadgeText } from '@/lib/field/push-client'
import { notificationDisplay } from '@/lib/notifications/events'
import type { NotificationDto, NotificationListDto } from '@/lib/notifications/queries'
import { fmtDateTime } from '@/lib/format/datetime'

/**
 * กระดิ่งแจ้งเตือนบน header (`90` §6.3/§14 · `06` §8 · mockup `notifications.html`)
 * ใช้ร่วมกันทั้ง App Shell (หลังบ้าน) และ Field Tracker — **ตัวเดียวในระบบ ห้ามทำใหม่**
 *
 * - เปิด dropdown **ไม่** มาร์คว่าอ่านอัตโนมัติ (E11) — มาร์คตอนกดรายการ หรือกด "อ่านทั้งหมด"
 * - รายการที่มี `linkPath` ภายในแอปเท่านั้นที่พาไปหน้าอื่นได้ (กัน open redirect — `notificationHref()`)
 * - ยิง `GET /api/notifications` ตัวเดียวกันทุก role (ของผู้เรียกเองเสมอ) — ฝั่ง Field ยังมี
 *   `/api/field/notifications` ตามสเปค `45` §6.3 อยู่ แต่ UI ใช้เส้นกลางเส้นเดียวเพื่อไม่ให้ตรรกะแตกสองทาง
 */

const DROPDOWN_LIMIT = 10

export function NotificationBell({
  /** ลิงก์ "ดูทั้งหมด" ท้าย dropdown — ไม่ส่ง = ไม่แสดง (Field Tracker ไม่มีหน้ารายการเต็มของตัวเอง) */
  allHref,
}: {
  allHref?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<NotificationListDto>({ items: [], unreadCount: 0, totalCount: 0 })
  // Rule 05 — ต้องแยก "กำลังโหลด" / "ว่างจริง" / "โหลดไม่สำเร็จ" ออกจากกัน
  // (ก่อนหน้านี้ทั้งสามกรณีขึ้นข้อความ "ยังไม่มีการแจ้งเตือน" เหมือนกันหมด = ปิดบังปัญหา)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    const response = await callApi<NotificationListDto>(`/api/notifications?limit=${DROPDOWN_LIMIT}`)
    if (response.data !== undefined) {
      setData(response.data)
      setFailed(false)
    } else {
      setFailed(true)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void (async () => {
      await load()
    })()
    // เปิดแอปค้างไว้ทั้งวันได้ ⇒ รีเฟรชเบา ๆ ทุก 2 นาที (ไม่ใช่ช่องทางเดียว จึงไม่ต้องถี่กว่านี้)
    const timer = setInterval(() => void load(), 120_000)
    return () => clearInterval(timer)
  }, [load])

  async function markOneRead(id: string): Promise<void> {
    await callApi(`/api/notifications/${id}/read`, jsonRequest('PATCH', {}))
    await load()
  }

  async function markAllRead(): Promise<void> {
    await callApi('/api/notifications/read-all', jsonRequest('PATCH', {}))
    await load()
  }

  function openItem(item: NotificationDto): void {
    void markOneRead(item.id)
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
        <IconBell className="h-5 w-5" />
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
              <span className="text-xs font-bold text-slate-700">แจ้งเตือนล่าสุด</span>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-400">{data.unreadCount} ยังไม่อ่าน</span>
                {data.unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void markAllRead()}
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
              {loading ? (
                <p className="px-3 py-6 text-center text-xs text-slate-400">กำลังโหลด...</p>
              ) : failed ? (
                <div className="px-3 py-6 text-center">
                  <p className="text-xs text-rose-600">โหลดการแจ้งเตือนไม่สำเร็จ</p>
                  <button
                    type="button"
                    onClick={() => void load()}
                    className="focus-ring mt-1 rounded px-2 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50"
                  >
                    ลองใหม่
                  </button>
                </div>
              ) : data.items.length === 0 ? (
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
                        <span className="mt-0.5 block text-[10px] text-slate-400">
                          {notificationDisplay(item.eventCode).module} · {fmtDateTime(item.createdAt)}
                        </span>
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>

            {allHref !== undefined && (
              <Link
                href={allHref}
                onClick={() => setOpen(false)}
                className="focus-ring block border-t border-slate-100 px-4 py-2 text-center text-[11px] font-semibold text-blue-600 hover:bg-blue-50"
              >
                ดูทั้งหมด
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  )
}
