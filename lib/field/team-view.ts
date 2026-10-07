import type { FieldCaseListItemDto, FieldCaseTeamViewDto } from '@/lib/field/types'

/**
 * ข้อมูลที่เพื่อนร่วมทีมเห็นได้ (preship R3-005 · PDPA — ใช้ชั่วคราวรอมติ PO)
 *
 * `41` §3/§11/§13 ให้พนักงานดูเคสของเพื่อนร่วมทีมแบบ read-only **เฉพาะมุมมองทีมของหน้าจัดวันที่**
 * ซึ่งใช้ประกอบการวางแผนที่พัก/เส้นทาง (§7.3/§7.4 banner ม่วง) — ต้องการแค่ชื่อลูกหนี้ + พื้นที่ + วัน + ชื่อพนักงาน
 * จึงเปิดเผยน้อยที่สุด: **ห้าม** ส่งเลขบัตร/พาสปอร์ต · เบอร์โทร · LINE/Facebook · ที่อยู่ละเอียด · ผู้ติดต่อ ·
 * เอกสาร · หลักฐาน · IMEI/serial · มูลหนี้ · ค่าคอมมิชชั่น/ค่าตอบแทน ของเคสที่ไม่ได้มอบให้ผู้เรียก
 *
 * ทั้งสองฟังก์ชันเป็น pure — ผูกกับ allowlist (ไม่ใช่ denylist) เพื่อให้ field ใหม่ที่เพิ่มใน DTO ภายหลัง
 * ไม่หลุดไปถึงเพื่อนร่วมทีมโดยไม่ตั้งใจ
 */

/** รายละเอียดเคสแบบมุมมองทีม (`GET /api/field/cases/:id` เมื่อผู้เรียกไม่ใช่ผู้รับผิดชอบ) */
export function toTeamViewCaseDetail(item: FieldCaseListItemDto): FieldCaseTeamViewDto {
  return {
    access: 'team',
    caseId: item.caseId,
    assignmentId: item.assignmentId,
    caseRef: item.caseRef,
    trackingRound: item.trackingRound,
    status: item.status,
    group: item.group,
    agentId: item.agentId,
    agentName: item.agentName,
    debtorName: item.debtorName,
    province: item.province,
    district: item.district,
    scheduleDate: item.scheduleDate,
    scheduleOrder: item.scheduleOrder,
  }
}

/**
 * การ์ดในรายการมุมมองทีม (`GET /api/field/cases?view=team`) ของเคสที่ **ไม่ใช่ของผู้เรียก** —
 * คง shape `FieldCaseListItemDto` (หน้าจอใช้ type เดียว) แต่ล้างค่าที่ไม่ได้อยู่ใน allowlist ด้านบน
 * (ทรัพย์/มูลหนี้/ค่าตอบแทน/สถานะเบิก/draft/เช็คอิน/ประวัติโอน) · เคสของผู้เรียกเองคืนเหมือนเดิม
 */
export function toTeamViewListItem(item: FieldCaseListItemDto, viewerId: string): FieldCaseListItemDto {
  if (item.agentId === viewerId) return item
  const base = toTeamViewCaseDetail(item)
  return {
    caseId: base.caseId,
    assignmentId: base.assignmentId,
    caseRef: base.caseRef,
    trackingRound: base.trackingRound,
    status: base.status,
    group: base.group,
    agentId: base.agentId,
    agentName: base.agentName,
    debtorName: base.debtorName,
    province: base.province,
    district: base.district,
    scheduleDate: base.scheduleDate,
    scheduleOrder: base.scheduleOrder,
    assetDescription: null,
    assetCapacity: null,
    assetColor: null,
    debtAmountSatang: null,
    assignedAt: item.assignedAt,
    acceptedAt: item.acceptedAt,
    closedAt: null,
    resubmittedAt: null,
    outcome: null,
    hasDraft: false,
    hasPendingReassignment: false,
    checkinCount: 0,
    commissionSatang: null,
    noSuccessFeeSatang: null,
    reassignedAway: null,
    expenseStatuses: [],
  }
}
