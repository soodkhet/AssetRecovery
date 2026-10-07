import { TrackingTab } from '@/components/field/tracking-tab'
import { pickUuid } from '@/components/ui/url-state'

/** แท็บ "กำลังติดตาม" (`41` §7.5) — จัดกลุ่มตามวัน + สลับลำดับ + ปุ่ม 3 สถานะ · `?case=` เปิดรายละเอียดเคส (ลิงก์แจ้งเตือน) */
export default async function FieldTrackingPage({ searchParams }: { searchParams: Promise<{ case?: string }> }) {
  const params = await searchParams
  return <TrackingTab initialDetailCaseId={pickUuid(params.case)} />
}
