import type { NextRequest } from 'next/server'
import { apiFailure, apiSuccess } from '@/lib/api/envelope'
import { authErrorMessage } from '@/lib/auth/errors'
import { enqueueScheduledJobs, reclaimStaleJobs, runDueJobs } from '@/lib/jobs/engine'
import { runSweeperJobs } from '@/lib/jobs/registry'
import type { JobRunSummaryDto } from '@/lib/jobs/types'

/** handler บางตัวประกอบไฟล์ PDF/Excel — บังคับ runtime ไม่ให้ตกไป Edge */
export const runtime = 'nodejs'

/**
 * รอบเดียวของงานเบื้องหลังกินเวลาได้ถึง 5 นาที (ประกอบชุดบัญชี/ไฟล์โอน) — ค่า default 10 วินาที
 * ของ Vercel สั้นเกินไปแล้วงานจะถูกตัดกลางคัน (job ค้าง `running`)
 */
export const maxDuration = 300

/**
 * `GET /api/cron/jobs` — ตัวรันงานเบื้องหลังของระบบ (`91` §17 · DEC-001 Vercel Cron / QStash)
 *
 * หนึ่งรอบทำ 4 อย่างตามลำดับ:
 *  ① กู้งานที่ค้างสถานะ `running` จากรอบที่ถูกตัดกลางคัน (`reclaimStaleJobs()` — ทำก่อนเสมอ
 *     เพื่อให้งานที่ตันได้กลับเข้าบันได retry ในรอบเดียวกัน)
 *  ② ตั้งคิวงานตามตารางเวลาของช่องเวลานี้ (`enqueueScheduledJobs()` — คีย์กันซ้ำต่อช่องเวลา
 *     ⇒ cron ยิงซ้ำ/retry ไม่เกิดงานซ้อน)
 *  ③ หยิบงานที่ถึงคิวมาทำ (`runDueJobs()` — claim ด้วย conditional update, retry/backoff,
 *     ครบเพดานเข้า dead letter รอ Superadmin)
 *  ④ เรียกตัวกวาดคิวที่ดูแลสถานะของตัวเอง (`fuel_distance_retry` — D10)
 *
 * **ไม่มี session**: ผู้เรียกคือ Vercel Cron/QStash ⇒ ยืนยันตัวด้วย `CRON_SECRET` ผ่าน
 * `Authorization: Bearer ...` (Vercel ใส่ให้เองเมื่อกำหนดตัวแปรนี้) · ไม่ตั้งค่า = อนุญาตเฉพาะ
 * นอก production เพื่อให้ทดสอบบนเครื่องได้ ส่วน production ปฏิเสธเสมอ (ไม่เปิดช่องยิงงานฟรี)
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!isCronAuthorized(request)) {
    return apiFailure({ code: 'UNAUTHENTICATED', ...authErrorMessage('UNAUTHENTICATED') }, 401)
  }

  const now = new Date()
  const reclaimed = await reclaimStaleJobs(now)
  const scheduled = await enqueueScheduledJobs(now)
  const tally = await runDueJobs({ now })
  const sweepers = await runSweeperJobs({ now })

  const summary: JobRunSummaryDto = {
    enqueued: scheduled.enqueued,
    duplicated: scheduled.duplicated,
    ...tally,
  }
  return apiSuccess({ ...summary, reclaimed, sweepers, ranAt: now.toISOString() })
}

function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (secret === undefined || secret === '') return process.env.NODE_ENV !== 'production'
  return request.headers.get('authorization') === `Bearer ${secret}`
}
