/* global self */
/**
 * Service Worker ของ Field Tracker (`41` §15)
 *
 * หน้าที่เดียว = รับ Web Push แล้วเด้งการแจ้งเตือน + พาไปหน้าที่เกี่ยวข้องเมื่อผู้ใช้กด
 * **ไม่ทำ offline cache** โดยตั้งใจ — ข้อมูลภาคสนาม (สถานะเคส/รายการเบิก) ต้องสดเสมอ
 * การแคชหน้าไว้เสี่ยงให้พนักงานเห็นสถานะเก่าแล้วทำงานผิด (`41` §11)
 *
 * payload ที่ฝั่ง server ส่งมา = `{ title, body, linkPath, eventCode }` (`lib/notifications/push.ts`)
 */

self.addEventListener('install', () => {
  // ให้ SW ตัวใหม่มีผลทันที ไม่ต้องรอปิดทุกแท็บ
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
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
      icon: '/icons/app-icon.svg',
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
