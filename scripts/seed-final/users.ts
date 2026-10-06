import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { RoleGroup } from '@/lib/generated/prisma/enums'
import { ORG_ID, as, forgetSessions, meta, rawDb } from './context'
import { stored } from './files'
import { ids, thaiId } from './state'

/**
 * ผู้ใช้ของ Final Test (FINAL-coverage C.3 · U123)
 * - persona 14 คนเดิมมีอยู่แล้วบน dev — seed แค่ผูกทีม/บริษัทใหม่ (reset ปลดสังกัด) ผ่าน `updateUser`
 * - บัญชีใหม่ 4 ตัว (U123) สร้างผ่าน `createUser` (service เดียวกับหน้าจัดการผู้ใช้) เฉพาะเมื่อสั่ง `--create-auth-users`
 *   รหัสผ่านสุ่มเขียนลง `uat/personas.json` (ไฟล์ gitignore) — **ไม่พิมพ์ออกจอ**
 * - `--bootstrap-personas` (เครื่องเท่านั้น): สร้าง persona ทั้ง 18 คนด้วยบัญชี Auth **จำลอง** (ฐานทดสอบว่าง)
 */

export type TeamKey = 'TEAM_A' | 'TEAM_B' | 'TEAM_C'
export type CompanyKey = 'CO1' | 'CO2'

export interface PersonaSpec {
  username: string
  fullName: string
  phone: string
  role: string
  roleGroup: RoleGroup
  team?: TeamKey
  company?: CompanyKey
  isNew?: boolean
  finalStatus?: 'suspended' | 'deleted'
}

export const PERSONAS: readonly PersonaSpec[] = [
  { username: 'uat.admin', fullName: 'สมใจ ธุรการดี', phone: '0810000001', role: 'ธุรการ', roleGroup: 'system' },
  { username: 'uat.approver', fullName: 'วิภา ตรวจเคส', phone: '0810000002', role: 'เจ้าหน้าที่อนุมัติเคส', roleGroup: 'system' },
  { username: 'uat.finance', fullName: 'กมล การเงิน', phone: '0810000003', role: 'การเงิน', roleGroup: 'system' },
  { username: 'uat.account', fullName: 'ปรีดา บัญชีงาม', phone: '0810000004', role: 'บัญชี', roleGroup: 'system' },
  { username: 'uat.exec', fullName: 'อำนาจ บริหารกิจ', phone: '0810000005', role: 'บริหาร', roleGroup: 'system' },
  { username: 'uat.mgr.in', fullName: 'ชัยวัฒน์ จัดการทีม', phone: '0810000006', role: 'ผู้จัดการทีมติดตามทรัพย์', roleGroup: 'inhouse', team: 'TEAM_A' },
  { username: 'uat.sup.in', fullName: 'สุริยา หัวหน้าเอ', phone: '0810000007', role: 'หัวหน้าทีมติดตามทรัพย์', roleGroup: 'inhouse', team: 'TEAM_A' },
  { username: 'uat.agent.in1', fullName: 'อนันต์ ตามทรัพย์', phone: '0810000008', role: 'พนักงานติดตามทรัพย์', roleGroup: 'inhouse', team: 'TEAM_A' },
  { username: 'uat.agent.in2', fullName: 'บุญมี ภาคสนาม', phone: '0810000009', role: 'พนักงานติดตามทรัพย์', roleGroup: 'inhouse', team: 'TEAM_A' },
  { username: 'uat.mgr.out', fullName: 'ธนา เอาท์ซอร์ส', phone: '0810000010', role: 'ผู้จัดการทีมติดตามทรัพย์', roleGroup: 'outsource', team: 'TEAM_C' },
  { username: 'uat.agent.out1', fullName: 'ประเสริฐ รับเหมา', phone: '0810000011', role: 'พนักงานติดตามทรัพย์', roleGroup: 'outsource', team: 'TEAM_C' },
  { username: 'uat.co1.mgr', fullName: 'มาลี ลิสซิ่ง', phone: '0810000012', role: 'ผู้จัดการ', roleGroup: 'finance_company', company: 'CO1' },
  { username: 'uat.co1.sup', fullName: 'นิพนธ์ ลิสซิ่ง', phone: '0810000013', role: 'หัวหน้า', roleGroup: 'finance_company', company: 'CO1' },
  { username: 'uat.co2.admin', fullName: 'ศิริ แคปปิตอล', phone: '0810000014', role: 'แอดมิน', roleGroup: 'finance_company', company: 'CO2' },
  // U123 — บัญชีตัวอย่าง (จดลบก่อน go-live)
  { username: 'uat.agent.out2', fullName: 'สมพร นิติรับเหมา', phone: '0810000015', role: 'พนักงานติดตามทรัพย์', roleGroup: 'outsource', team: 'TEAM_C', isNew: true },
  { username: 'uat.sup.out', fullName: 'วีระ หัวหน้าซี', phone: '0810000016', role: 'หัวหน้าทีมติดตามทรัพย์', roleGroup: 'outsource', team: 'TEAM_C', isNew: true },
  { username: 'uat.temp1', fullName: 'ชั่วคราว หนึ่ง', phone: '0810000017', role: 'พนักงานติดตามทรัพย์', roleGroup: 'inhouse', team: 'TEAM_B', isNew: true, finalStatus: 'suspended' },
  { username: 'uat.temp2', fullName: 'ชั่วคราว สอง', phone: '0810000018', role: 'ธุรการ', roleGroup: 'system', isNew: true, finalStatus: 'deleted' },
]

export const SUPERADMIN = 'admin'

/** ข้อมูลรับเงินของผู้ใช้ภาคสนาม (ฟิลด์เดียวกับฟอร์ม Payee) — ใช้ทั้งตอนสร้างผู้ใช้ใหม่ (U131) และตอนผูกหลัง reset */
export function payeeFieldsFor(username: string, fullName: string): Record<string, unknown> | null {
  const address = { detail: '10 ม.1', postalCode: '12000', province: 'ปทุมธานี', district: 'เมืองปทุมธานี', subdistrict: 'บางปรอก' }
  // BUG-SF1 แก้แล้ว (U131) แต่คง Tax Profile รายคนเท่ากับค่าช่อง ⇒ ยอดภาษีตาม golden เดิม
  const rows: Record<string, { payeeType: 'individual' | 'corporate'; taxProfile: string; nationalId: string; account: string; wht402Pct: number | null; idDoc: boolean }> = {
    'uat.agent.in1': { payeeType: 'individual', taxProfile: 'TP-1', nationalId: thaiId('110000000001'), account: '1110001111', wht402Pct: 5, idDoc: true },
    'uat.agent.in2': { payeeType: 'individual', taxProfile: 'TP-1', nationalId: thaiId('110000000002'), account: '1110002222', wht402Pct: 0, idDoc: false },
    'uat.agent.out1': { payeeType: 'individual', taxProfile: 'TP-3', nationalId: thaiId('110000000003'), account: '1110003333', wht402Pct: null, idDoc: false },
    'uat.agent.out2': { payeeType: 'corporate', taxProfile: 'TP-2', nationalId: thaiId('010556900201'), account: '1110004444', wht402Pct: null, idDoc: true },
  }
  const row = rows[username]
  if (row === undefined) return null
  return {
    payeeType: row.payeeType, taxProfileId: ids.taxProfiles[row.taxProfile], nationalId: row.nationalId,
    bankName: 'ธนาคารกสิกรไทย', accountName: fullName, accountNumber: row.account,
    // U150 — ไฟล์อัปโหลดที่ server ตรวจแล้ว (path ใต้ prefix ขององค์กร)
    idDocumentUrl: row.idDoc ? `payees/${ORG_ID}/id-documents/seed-final-${username.replaceAll('.', '-')}.pdf` : null,
    wht402Pct: row.wht402Pct, nameTitle: row.payeeType === 'corporate' ? 'บริษัท' : 'นาย', address,
    ...(row.payeeType === 'corporate' ? { branchCode: '00000' } : {}), whtCondition: 'withhold',
  }
}


async function roleIdOf(name: string, roleGroup: RoleGroup): Promise<string> {
  const role = await rawDb().role.findFirst({ where: { organizationId: ORG_ID, name, roleGroup }, select: { id: true } })
  if (role === null) throw new Error(`ไม่พบ role ${name}/${roleGroup} — รัน pnpm db:seed ก่อน`)
  return role.id
}

/**
 * Superadmin ที่ใช้เป็นผู้ตั้งค่า (username `admin` ของ dev alias)
 * bootstrap บนเครื่อง: ถ้ายังไม่มี ผูก uid จำลองให้ผู้ใช้ seed (`superadmin@assetrecovery.local`) แล้วตั้ง username `admin`
 * — **เขียนตรง** (master data ที่ไม่มี service: บัญชีแรกของระบบสร้างโดย prisma seed)
 */
export async function ensureSuperadmin(bootstrap: boolean): Promise<void> {
  const db = rawDb()
  const existing = await db.user.findFirst({
    where: { organizationId: ORG_ID, username: SUPERADMIN, deletedAt: null, supabaseUid: { not: null } },
  })
  if (existing !== null) return
  if (!bootstrap) throw new Error('ไม่พบผู้ใช้ admin (Superadmin) ที่มีบัญชี Auth — รัน pnpm auth:dev-admin ก่อน')
  const seedUser = await db.user.findFirst({
    where: { organizationId: ORG_ID, role: { name: 'Superadmin', roleGroup: 'system' }, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  })
  if (seedUser === null) throw new Error('ไม่พบผู้ใช้ Superadmin จาก prisma seed — รัน pnpm db:seed ก่อน')
  await db.user.update({
    where: { id: seedUser.id },
    data: { username: SUPERADMIN, supabaseUid: seedUser.supabaseUid ?? '5eed0000-0000-4000-8000-000000000001' },
  })
}

function personasFile(): string {
  return process.env['SEED_FINAL_PERSONAS_FILE'] ?? 'uat/personas.json'
}

/** รหัสผ่านสุ่ม — เขียนลงไฟล์ personas (gitignore) เท่านั้น */
function rememberPassword(spec: PersonaSpec, password: string): void {
  const file = personasFile()
  const data: Record<string, unknown> = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>) : {}
  data[spec.username] = {
    role: spec.role,
    roleGroup: spec.roleGroup,
    scope: spec.team ?? spec.company ?? null,
    password,
    note: 'U123 บัญชีตัวอย่าง Final Test — ลบก่อน go-live',
  }
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 })
}

export interface UserSyncOptions {
  /** สร้าง persona ที่ยังไม่มี (Auth จำลอง — เครื่องเท่านั้น) */
  bootstrap: boolean
  /** สร้างบัญชีใหม่ 4 ตัวของ U123 (Auth จริงเมื่อ realAuth) */
  createNew: boolean
  realAuth: boolean
}

/**
 * สร้าง/ผูกสังกัดผู้ใช้ทั้งหมดตาม {@link PERSONAS} — เรียกหลังมีทีม/บริษัทแล้ว
 * @returns ชื่อ persona ที่ยังขาด (ไม่ได้สั่งสร้าง) — สคริปต์จะหยุดถ้าขาดคนที่ scenario ใช้
 */
export async function syncUsers(
  options: UserSyncOptions,
  teams: Record<TeamKey, string>,
  companies: Record<CompanyKey, string>,
): Promise<string[]> {
  const { createUser, getUser, updateUser, setUserStatus, deleteUser } = await import('@/lib/users/queries')
  const admin = await as(SUPERADMIN)
  const db = rawDb()
  const missing: string[] = []
  for (const spec of PERSONAS) {
    const roleId = await roleIdOf(spec.role, spec.roleGroup)
    const values = {
      roleId,
      username: spec.username,
      email: `${spec.username}@uat.test`,
      fullName: spec.fullName,
      phone: spec.phone,
      employeeCode: null,
      teamId: spec.team === undefined ? null : teams[spec.team],
      companyId: spec.company === undefined ? null : companies[spec.company],
    }
    const existing = await db.user.findFirst({
      where: { organizationId: ORG_ID, username: spec.username },
      select: { id: true, deletedAt: true, email: true, phone: true, fullName: true },
    })
    if (existing === null) {
      const allowed = options.bootstrap || (spec.isNew === true && options.createNew)
      if (!allowed) {
        missing.push(spec.username)
        continue
      }
      const password = `Fin-${randomBytes(9).toString('base64url')}`
      // U131 — ผู้ใช้ภาคสนามสร้างพร้อมข้อมูลรับเงินในฟอร์มเดียว (ติ๊กยืนยัน)
      const fields = payeeFieldsFor(spec.username, spec.fullName)
      if (fields !== null && typeof fields['idDocumentUrl'] === 'string') await stored(fields['idDocumentUrl'])
      const { userPaymentSchema } = await import('@/lib/payees/schemas')
      const payment = fields === null ? undefined : userPaymentSchema.parse({ fields, verify: true, reason: `ข้อมูลรับเงิน ${spec.username} (Final Test seed)` })
      await createUser({ actor: admin, meta, reason: null }, values, password, payment)
      if (options.realAuth) rememberPassword(spec, password)
      console.log(`[users] สร้าง ${spec.username}${options.realAuth ? ' (Auth จริง — รหัสอยู่ใน personas.json)' : ' (Auth จำลอง)'}`)
    } else if (existing.deletedAt === null) {
      // คงชื่อ/อีเมล/เบอร์เดิมของ persona (อาจต่างจากชุดนี้บน dev) — เปลี่ยนแค่สังกัด
      const current = await getUser(admin, existing.id)
      await updateUser({ actor: admin, meta }, current, {
        ...values,
        email: current.email,
        phone: current.phone,
        fullName: current.fullName,
      })
    }
  }
  forgetSessions()

  // สถานะปลายทาง U123 — ระงับ temp1 / ลบ temp2
  for (const spec of PERSONAS.filter((row) => row.finalStatus !== undefined)) {
    const row = await db.user.findFirst({ where: { organizationId: ORG_ID, username: spec.username }, select: { id: true, status: true, deletedAt: true } })
    if (row === null || row.deletedAt !== null) continue
    const current = await getUser(admin, row.id)
    if (spec.finalStatus === 'suspended' && row.status !== 'suspended') {
      await setUserStatus({ actor: admin, meta, reason: 'บัญชีทดสอบสถานะระงับ (Final Test U123)' }, current, 'suspended')
    }
    if (spec.finalStatus === 'deleted') {
      await deleteUser({ actor: admin, meta, reason: 'บัญชีทดสอบสถานะลบ (Final Test U123)' }, current)
    }
  }
  return missing
}
