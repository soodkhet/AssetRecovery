/* global self */
/**
 * Service Worker ของ Field Tracker (`41` §15)
 *
 * หน้าที่เดียว = รับ Web Push แล้วเด้งการแจ้งเตือน + พาไปหน้าที่เกี่ยวข้องเมื่อผู้ใช้กด
 * **ไม่ทำ offline cache ของข้อมูล/หน้า** โดยตั้งใจ — ข้อมูลภาคสนาม (สถานะเคส/รายการเบิก) ต้องสดเสมอ
 * การแคชหน้าไว้เสี่ยงให้พนักงานเห็นสถานะเก่าแล้วทำงานผิด (`41` §11)
 * ข้อยกเว้นเดียว: หน้า `offline.html` (ไฟล์ static ไม่มีข้อมูล) — แสดงเมื่อเปิดหน้าใหม่ตอนไม่มีเน็ต
 * แทนหน้า error ของเบราว์เซอร์ (preship PS-039) · request อื่นทุกตัวไปเครือข่ายตรงตามเดิม
 *
 * payload ที่ฝั่ง server ส่งมา = `{ title, body, linkPath, eventCode }` (`lib/notifications/push.ts`)
 */

const OFFLINE_CACHE = 'offline-v1'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  // ให้ SW ตัวใหม่มีผลทันที ไม่ต้องรอปิดทุกแท็บ
  self.skipWaiting()
  event.waitUntil(caches.open(OFFLINE_CACHE).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' }))))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== OFFLINE_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

// เฉพาะการเปิดหน้า (navigate) ที่เครือข่ายล้ม ⇒ หน้า offline · ไม่แคชผลลัพธ์ใด ๆ
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)))
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {}
  }

  const title = payload.title || 'AssetRecovery'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/app-icon.svg',
      tag: payload.eventCode || 'field-notification',
      data: { linkPath: payload.linkPath || '/field' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const linkPath = (event.notification.data && event.notification.data.linkPath) || '/field'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // มีแท็บแอปเปิดอยู่แล้ว = โฟกัสแท็บนั้นแล้วพาไปหน้าปลายทาง (ไม่เปิดแท็บซ้ำ)
      for (const client of clientList) {
        if (client.url.includes('/field') && 'focus' in client) {
          client.navigate(linkPath)
          return client.focus()
        }
      }
      return self.clients.openWindow(linkPath)
    }),
  )
})
