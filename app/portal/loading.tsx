import { LoadingState } from '@/components/ui/states'

/**
 * แสดงระหว่างรอหน้าถัดไปจาก server (เมนู/แท็บ/ลิงก์) — เดิมหน้าเก่าค้างนิ่งจนผู้ใช้กดซ้ำหรือคิดว่าแอปค้าง
 * (preship PS-011) · layout/เมนูยังอยู่ เปลี่ยนเฉพาะเนื้อหา
 */
export default function Loading() {
  return <LoadingState message="กำลังเปิดหน้า..." className="py-16" />
}
