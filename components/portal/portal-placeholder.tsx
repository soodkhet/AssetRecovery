import { Card, EmptyState, PageHeader } from '@/components/ui'

/**
 * หน้าที่ยังไม่ถึงคิวทำของพอร์ทัล (เคส/วางบิล/ใบกำกับ/ส่งมอบ — ก้อน Portal-P8–P10 จะมาแทน)
 * มี guard หมวดที่ `page.tsx` แล้ว · ไม่มีข้อมูลตัวอย่าง
 */
export function PortalPlaceholder({ title }: { title: string }) {
  return (
    <div>
      <PageHeader title={title} />
      <Card padded={false}>
        <EmptyState title="กำลังจัดทำ" description="หน้านี้จะเปิดให้ใช้งานเร็ว ๆ นี้" />
      </Card>
    </div>
  )
}
