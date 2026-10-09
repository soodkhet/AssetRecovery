/**
 * รัน job รายวัน `daily_field_allowance` กับฐานที่ DATABASE_URL ชี้ — ใช้แทน cron บน staging (Vercel Preview ไม่มี cron
 * และ `/api/dev/trigger-job` ปิดตัวเองเพราะ NODE_ENV=production ทุก environment บน Vercel)
 *   ผู้ใช้รันผ่าน `uat/bin/staging-prep.sh job-allowance <YYYY-MM-DD>` เท่านั้น (เขียนฐาน staging)
 * สร้างแถว `jobs` จริงผ่าน `enqueueJob` (มี audit · ตามรอยใน Job Log ได้) แล้วรันด้วยตัวรันงานกลาง — แบบเดียวกับ dev trigger
 * บน production ระบบทำเองทุกคืน — สคริปต์นี้จำลองเฉพาะ staging
 */
const ORG_ID = '00000000-0000-0000-0000-000000000001'

async function main(): Promise<void> {
  const date = process.argv[2]
  if (date === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('ใส่วันที่ YYYY-MM-DD')
  if (process.env['PGOPTIONS'] === undefined) process.env['PGOPTIONS'] = '-c TimeZone=UTC'
  const { prisma } = await import('@/lib/prisma')
  try {
    const superadmin = await prisma.user.findFirst({ where: { organizationId: ORG_ID, username: 'superadmin', deletedAt: null }, select: { id: true } })
    const { enqueueJob } = await import('@/lib/jobs/enqueue')
    const { runJobById } = await import('@/lib/jobs/engine')
    const { DEV_TRIGGER_PAYLOAD_FLAG } = await import('@/lib/jobs/job-types')
    const { job, duplicate } = await enqueueJob({
      organizationId: ORG_ID,
      jobType: 'daily_field_allowance',
      idempotencyKey: `staging-manual-allowance-${date}`,
      payload: { date, [DEV_TRIGGER_PAYLOAD_FLAG]: true },
      createdBy: superadmin?.id ?? null,
      actorRole: 'Superadmin',
      reason: `สรุปวันลงพื้นที่ ${date} ด้วยมือบน staging (แทน cron ที่ Preview ไม่มี)`,
    })
    const outcome = duplicate && job.status !== 'pending' ? `เคยรันแล้ว (${job.status})` : await runJobById(job.id)
    const after = await prisma.job.findUnique({ where: { id: job.id }, select: { status: true, result: true, errorMessage: true } })
    console.log(`[job] daily_field_allowance ${date}: ${outcome} ·`, JSON.stringify(after))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error('[job] ล้มเหลว:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
