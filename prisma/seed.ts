import { prisma } from '@/lib/prisma'
import { CapabilityAccessLevel, RoleGroup, WhtFilingForm } from '@/lib/generated/prisma/enums'
import { CAPABILITIES } from '@/lib/roles/capability-catalog'
import { DEFAULT_ROLE_CAPABILITIES } from '@/lib/roles/default-matrix'

/**
 * Seed master data ตาม `02` §12 — **idempotent** (upsert ทุกจุด) รันซ้ำได้ไม่พัง
 *
 * ลำดับบังคับ: organization → seed user (ต้องมีก่อนเพราะทุกตารางใช้ `created_by`) → roles →
 * VAT → tax profiles → finance policy → capabilities → role_capabilities
 *
 * ⚠️ Immutable (`02` §13): role ที่ `isSeed = true` ห้ามลบ/เปลี่ยน `name`/`roleGroup`
 * ⚠️ รายการ capability อยู่ที่ `lib/roles/capability-catalog.ts` และค่าเริ่มต้นของ matrix อยู่ที่
 *    `lib/roles/default-matrix.ts` (pure ทั้งคู่ — มีเทสต์ยามความสอดคล้องกับ `25`/`13` §6.10)
 * ⚠️ Superadmin ไม่มี record ใน `role_capabilities` โดยนิยาม enforce ที่ middleware (DEC-009)
 */

/** organization เดียวของระบบ (`02` §12) */
const ORG_ID = '00000000-0000-0000-0000-000000000001'
/** ผู้ใช้ระบบตั้งต้น — เจ้าของ `created_by` ของ master data ที่ seed ลงไป (ผูก Supabase Auth จริงใน Phase 1.3) */
const SEED_USER_ID = '00000000-0000-0000-0000-000000000002'
const SEED_USER_EMAIL = 'superadmin@assetrecovery.local'

/** 15 seed roles (`07` §5 · `02` §12) — system 6 + inhouse 3 + outsource 3 + finance_company 3 */
const SEED_ROLES: ReadonlyArray<{ name: string; roleGroup: RoleGroup; isEditable: boolean }> = [
  { name: 'Superadmin', roleGroup: RoleGroup.system, isEditable: false },
  { name: 'เจ้าหน้าที่อนุมัติเคส', roleGroup: RoleGroup.system, isEditable: false },
  { name: 'บริหาร', roleGroup: RoleGroup.system, isEditable: false },
  { name: 'การเงิน', roleGroup: RoleGroup.system, isEditable: false },
  { name: 'บัญชี', roleGroup: RoleGroup.system, isEditable: false },
  { name: 'ธุรการ', roleGroup: RoleGroup.system, isEditable: true },
  { name: 'ผู้จัดการทีมติดตามทรัพย์', roleGroup: RoleGroup.inhouse, isEditable: false },
  { name: 'หัวหน้าทีมติดตามทรัพย์', roleGroup: RoleGroup.inhouse, isEditable: false },
  { name: 'พนักงานติดตามทรัพย์', roleGroup: RoleGroup.inhouse, isEditable: false },
  { name: 'ผู้จัดการทีมติดตามทรัพย์', roleGroup: RoleGroup.outsource, isEditable: false },
  { name: 'หัวหน้าทีมติดตามทรัพย์', roleGroup: RoleGroup.outsource, isEditable: false },
  { name: 'พนักงานติดตามทรัพย์', roleGroup: RoleGroup.outsource, isEditable: false },
  { name: 'ผู้จัดการ', roleGroup: RoleGroup.finance_company, isEditable: false },
  { name: 'หัวหน้า', roleGroup: RoleGroup.finance_company, isEditable: false },
  { name: 'แอดมิน', roleGroup: RoleGroup.finance_company, isEditable: false },
]

async function main() {
  // ── 1. Organization ────────────────────────────────────────
  const org = await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: {},
    create: {
      id: ORG_ID,
      name: 'AssetRecovery Co., Ltd.',
      // 🔶 กรอก Tax ID จริงก่อน go-live (`02` §12)
      taxId: '0000000000000',
      address: '(รอกรอกที่อยู่จริงก่อน go-live)',
      vatRegistered: true,
      taxInvoicePrefix: 'INV',
    },
  })

  // ── 2. Superadmin role + user ─────────────────────────────
  // ต้องมีก่อน master data อื่นเพราะทุกตารางบังคับ `created_by`
  const superadminRole = await prisma.role.upsert({
    where: {
      organizationId_name_roleGroup: {
        organizationId: org.id,
        name: 'Superadmin',
        roleGroup: RoleGroup.system,
      },
    },
    update: { isSeed: true, isEditable: false },
    create: { organizationId: org.id, name: 'Superadmin', roleGroup: RoleGroup.system, isSeed: true, isEditable: false },
  })

  await prisma.user.upsert({
    where: { id: SEED_USER_ID },
    update: {},
    create: {
      id: SEED_USER_ID,
      organizationId: org.id,
      roleId: superadminRole.id,
      email: SEED_USER_EMAIL,
      fullName: 'ผู้ดูแลระบบ (seed)',
      // `supabaseUid` ผูกตอน Phase 1.3 — login จริงต้องมี Supabase Auth user ก่อน
    },
  })

  // ── 3. Roles ที่เหลือ (รวมเป็น 15) ────────────────────────
  for (const role of SEED_ROLES) {
    await prisma.role.upsert({
      where: {
        organizationId_name_roleGroup: {
          organizationId: org.id,
          name: role.name,
          roleGroup: role.roleGroup,
        },
      },
      update: { isSeed: true, isEditable: role.isEditable },
      create: {
        organizationId: org.id,
        name: role.name,
        roleGroup: role.roleGroup,
        isSeed: true,
        isEditable: role.isEditable,
      },
    })
  }

  // ── 4. VAT Rate History (7% — ห้าม hardcode ในโค้ด ต้องอ่านจากตารางนี้เสมอ) ──
  const vatExisting = await prisma.vatRateHistory.findFirst({
    where: { organizationId: org.id, effectiveFrom: new Date('2025-10-01T00:00:00Z') },
  })
  if (!vatExisting) {
    await prisma.vatRateHistory.create({
      data: {
        organizationId: org.id,
        ratePct: 7.0,
        effectiveFrom: new Date('2025-10-01T00:00:00Z'),
        note: 'อัตรา VAT 7% ต่ออายุ (ระบุวันหมดอายุเมื่อรู้)',
        createdBy: SEED_USER_ID,
      },
    })
  }

  // ── 5. Tax Profiles ตั้งต้น 2 แบบ (`02` §12) ──────────────
  const taxProfiles = [
    { name: 'Outsource Standard 3%', whtPct: 3.0, filingForm: WhtFilingForm.PND3 },
    { name: 'Juristic Entity 3%', whtPct: 3.0, filingForm: WhtFilingForm.PND53 },
  ]
  for (const profile of taxProfiles) {
    await prisma.taxProfile.upsert({
      where: { organizationId_name: { organizationId: org.id, name: profile.name } },
      update: {},
      create: {
        organizationId: org.id,
        name: profile.name,
        whtPct: profile.whtPct,
        filingForm: profile.filingForm,
        createdBy: SEED_USER_ID,
      },
    })
  }

  // ── 6. Finance Policy Settings (1 record/org — DEC-006/D1) ──
  await prisma.financePolicySettings.upsert({
    where: { organizationId: org.id },
    update: {},
    create: {
      organizationId: org.id,
      // NULL = ไม่จำกัดเพดาน Advance (ปรับได้ที่เมนูตั้งค่า `13` §6.2)
      advanceMaxAmountPerRequestSatang: null,
      requirePayeeIdDocument: false,
      arAgingBuckets: [30, 60, 90],
    },
  })

  // ── 7. Capabilities ───────────────────────────────────────
  for (const capability of CAPABILITIES) {
    await prisma.capability.upsert({
      where: { code: capability.code },
      update: {
        label: capability.label,
        module: capability.module,
        functionalGroup: capability.functionalGroup,
        description: capability.description ?? null,
      },
      create: {
        code: capability.code,
        label: capability.label,
        module: capability.module,
        functionalGroup: capability.functionalGroup,
        description: capability.description ?? null,
      },
    })
  }

  // ── 8. Role ↔ Capability (Functional Permission Matrix `25` §7 · `13` §6.10) ──
  // ค่าเริ่มต้นเท่านั้น — Superadmin ปรับได้ทีหลังผ่าน `PATCH /api/roles/:id/permissions`
  // (ยกเว้นรายการที่ล็อกไว้ตาม `25` §16.1) · upsert = รันซ้ำได้และไม่ทับค่าที่ยังไม่มีการแก้
  const roleIdCache = new Map<string, string>()
  for (const assignment of DEFAULT_ROLE_CAPABILITIES) {
    const roleKey = `${assignment.role.roleGroup}::${assignment.role.name}`
    let roleId = roleIdCache.get(roleKey)
    if (roleId === undefined) {
      const role = await prisma.role.findUnique({
        where: {
          organizationId_name_roleGroup: {
            organizationId: org.id,
            name: assignment.role.name,
            roleGroup: assignment.role.roleGroup,
          },
        },
        select: { id: true },
      })
      if (!role) throw new Error(`[seed] ไม่พบ seed role สำหรับ matrix: ${roleKey}`)
      roleId = role.id
      roleIdCache.set(roleKey, roleId)
    }

    const capability = await prisma.capability.findUnique({
      where: { code: assignment.capabilityCode },
      select: { id: true },
    })
    if (!capability) throw new Error(`[seed] ไม่พบ capability: ${assignment.capabilityCode}`)

    await prisma.roleCapability.upsert({
      where: { roleId_capabilityId: { roleId, capabilityId: capability.id } },
      update: { accessLevel: assignment.level },
      create: { roleId, capabilityId: capability.id, accessLevel: assignment.level },
    })
  }

  const [roleCount, matrixCount, capabilityCount, roleCapabilityCount] = await Promise.all([
    prisma.role.count({ where: { organizationId: org.id, isSeed: true } }),
    prisma.capability.count({ where: { NOT: { functionalGroup: null } } }),
    prisma.capability.count(),
    prisma.roleCapability.count(),
  ])

  console.log(
    `[seed] เสร็จ — organization 1 · roles ${roleCount} (ต้อง 15) · capabilities ${capabilityCount} ` +
      `(ใน Functional Matrix ${matrixCount} ต้อง 37) · role_capabilities ${roleCapabilityCount} ` +
      `(ต้อง ${DEFAULT_ROLE_CAPABILITIES.length}) · VAT 7% · tax profiles 2 · finance policy 1`,
  )
  console.log(`[seed] access level ที่ใช้ได้: ${Object.values(CapabilityAccessLevel).join(' / ')} (ไม่มี record = ไม่มีสิทธิ์ — DEC-009)`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error: unknown) => {
    console.error('[seed] ล้มเหลว:', error)
    await prisma.$disconnect()
    process.exit(1)
  })
