/**
 * ให้ browser ดาวน์โหลดข้อความเป็นไฟล์ (ใช้กับไฟล์ตัวอย่างของจุดนำเข้า) — **ฝั่ง client เท่านั้น**
 * ข้อความที่ขึ้นต้นด้วย BOM (`﻿`) จะถูกเขียนเป็นไบต์ `EF BB BF` เพราะ `Blob` เข้ารหัส UTF-8 เสมอ
 */
export function downloadTextFile(fileName: string, text: string, mimeType = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
