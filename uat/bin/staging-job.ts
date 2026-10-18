/**
 * รันงานเบื้องหลังกับฐานที่ DATABASE_URL ชี้ — ใช้แทน cron บน staging (Vercel Preview ไม่มี cron
 * และ `/api/dev/trigger-job` ปิดตัวเองเพราะ NODE_ENV=production ทุก environment บน Vercel)
 *   ผู้ใช้รันผ่าน `uat/bin/staging-prep.sh job …` / `job-allowance <YYYY-MM-DD>` เท่านั้น (เขียนฐาน staging)
 * สร้างแถว `jobs` จริงผ่าน `enqueueJob` (มี audit · ตามรอยใน Job Log ได้) แล้วรันด้วยตัวรันงานกลาง — แบบเดียวกับ dev trigger
 * บน production ระบบทำเองตามรอบเวลา — สคริปต์นี้จำลองเฉพาะ staging
 *
 *   staging-job.ts <YYYY-MM-DD>                                  = daily_field_allowance วันนั้น (รูปเดิม)
 *   staging-job.ts daily_field_allowance <YYYY-MM-DD>
 *   staging-job.ts advance_overdue [asOf=YYYY-MM-DD]             จำลองวันนี้ = asOf (วันนี้ ถึง +31 วัน)
 *   staging-job.ts reassign_timeout | wht_filing_reminder | fuel_distance_retry | payout_completion_repair | wht_summary
 */
const ORG_ID = '00000000-0000-0000-0000-000000000001'

/** งานที่สั่งจากสคริปต์นี้ได้ — งานตามรอบเวลาที่ไม่ต้องมี payload จากผู้ใช้ (ไม่รวม export/ไฟล์ธนาคาร/รายงาน · ไม่รวม device_tac_sync ที่เรียกบริการภายนอก · ไม่รวม purge) */
const ALLOWED = [
  'daily_field_allowance',
  'advance_overdue',
  'reassign_timeout',
  'wht_filing_reminder',
  'fuel_distance_retry',
  'payout_completion_repair',
  'wht_summary',
] as const
type AllowedJob = (typeof ALLOWED)[number]

function isAllowed(value: string): value is AllowedJob {
  return (ALLOWED as readonly string[]).includes(value)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  // รูปเดิม: staging-job.ts <YYYY-MM-DD>
  if (args[0] !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(args[0])) args.unshift('daily_field_allowance')
  const jobType = args[0] ?? ''
  if (!isAllowed(jobType)) throw new Error(`ชนิดงานต้องเป็นหนึ่งใน: ${ALLOWED.join(' · ')} (ได้ "${jobType}")`)
  if (process.env['PGOPTIONS'] === undefined) process.env['PGOPTIONS'] = '-c TimeZone=UTC'

  const { DEV_TRIGGER_PAYLOAD_FLAG, parseSettleDate, parseSimulatedAsOf, jobTypeLabel } = await import('@/lib/jobs/job-types')
  const now = new Date()
  const payload: Record<string, unknown> = { [DEV_TRIGGER_PAYLOAD_FLAG]: true }
  let suffix = ''
  let reason = `สั่งงาน "${jobTypeLabel(jobType)}" ด้วยมือบน staging (แทน cron ที่ Preview ไม่มี)`
  let idempotencyKey = `staging-manual-${jobType}-${now.toISOString().slice(0, 19)}`

  if (jobType === 'daily_field_allowance') {
    const date = args[1]
    if (date === undefined || parseSettleDate(date, now) === null) throw new Error('ใส่วันที่ YYYY-MM-DD ที่ไม่เกินวันนี้ (เวลาไทย)')
    payload['date'] = date
    idempotencyKey = `staging-manual-allowance-${date}` // คีย์เดิม — วันเดียวกันรันซ้ำได้ job เดิม
    reason = `สรุปวันลงพื้นที่ ${date} ด้วยมือบน staging (แทน cron ที่ Preview ไม่มี)`
  }
  for (const arg of args.slice(1)) {
    const match = /^asOf=(\d{4}-\d{2}-\d{2})$/.exec(arg)
    if (match === null) {
      if (jobType === 'daily_field_allowance' && arg === args[1]) continue
      throw new Error(`อาร์กิวเมนต์ไม่รู้จัก: ${arg}`)
    }
    if (jobType !== 'advance_overdue') throw new Error('asOf ใช้ได้กับ advance_overdue เท่านั้น')
    const asOf = match[1] as string
    if (parseSimulatedAsOf(asOf, now) === null) throw new Error('asOf ต้องอยู่ช่วงวันนี้ ถึง +31 วัน (เวลาไทย)')
    payload['asOf'] = asOf
    suffix = ` asOf=${asOf}`
    reason += ` [จำลองวันที่ ${asOf}]`
    idempotencyKey += `-asOf-${asOf}`
  }

  const { prisma } = await import('@/lib/prisma')
  try {
    const superadmin = await prisma.user.findFirst({ where: { organizationId: ORG_ID, username: 'superadmin', deletedAt: null }, select: { id: true } })
    const { enqueueJob } = await import('@/lib/jobs/enqueue')
    const { runJobById } = await import('@/lib/jobs/engine')
    const { job, duplicate } = await enqueueJob({
      organizationId: ORG_ID,
      jobType,
      idempotencyKey,
      payload,
      createdBy: superadmin?.id ?? null,
      actorRole: 'Superadmin',
      reason,
    })
    const outcome = duplicate && job.status !== 'pending' ? `เคยรันแล้ว (${job.status})` : await runJobById(job.id)
    const after = await prisma.job.findUnique({ where: { id: job.id }, select: { status: true, result: true, errorMessage: true } })
    console.log(`[job] ${jobType}${suffix} ${String(payload['date'] ?? '')}: ${String(outcome)} · id=${job.id} ·`, JSON.stringify(after))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error('[job] ล้มเหลว:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
