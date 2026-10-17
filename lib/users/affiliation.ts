/**
 * ข้อความคอลัมน์ "สังกัด" ในหน้าผู้ใช้งาน (mytester6 T-006) — **pure**
 * · พนักงานภาคสนาม = ทีมที่สังกัด (`users.team_id`)
 * · หัวหน้าทีม = ทีมที่เป็นหัวหน้า (`teams.supervisor_id` — หัวหน้า 1 คนดูแลได้ทีมเดียวตาม `09`)
 * · ผู้จัดการ = ทีมที่ดูแล (`team_managers` — หลายทีมได้)
 * · ผู้ใช้บริษัทไฟแนนซ์ = ชื่อบริษัท · ไม่มีสังกัด = "—"
 */
export function userAffiliationText(user: {
  teamName: string | null
  supervisedTeamNames: readonly string[]
  managedTeamNames: readonly string[]
  companyName: string | null
}): string {
  if (user.teamName !== null) return user.teamName
  if (user.supervisedTeamNames.length > 0) return `หัวหน้าทีม ${user.supervisedTeamNames.join(', ')}`
  if (user.managedTeamNames.length > 0) return `ดูแล ${user.managedTeamNames.join(', ')}`
  return user.companyName ?? '—'
}
