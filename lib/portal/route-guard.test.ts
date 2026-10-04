import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { ESLint } from 'eslint'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { PORTAL_ENDPOINTS } from '@/lib/portal/contract'

/**
 * ยาม namespace `/api/portal/*` (`97` §11/§17 · Rule 03 · มติ PO 05/10/2569 U6/O43 D6) — สแกนไฟล์ route **จริง**
 *  1. ทุก `route.ts` export method ได้แค่ `GET` (+ ค่าตั้ง segment ของ Next เช่น `runtime`)
 *  2. ทุก route เรียก `withPortal()`/`requirePortalAccess()` (ยามหมวด + บริษัท + สถานะผู้ใช้)
 *  3. route ↔ `lib/portal/contract.ts` ตรงกัน — เทียบกับ contract ไม่ hardcode รายการ (route ที่ P4/P5 เพิ่มทีหลังผ่านเอง)
 *  4. กฎ ESLint ของ `app/api/portal/**` จับการ export method อื่นได้จริง
 */

const ROOT = process.cwd()
const PORTAL_DIR = path.join(ROOT, 'app', 'api', 'portal')

/** ค่าตั้ง route segment ที่ Next อนุญาตให้ export คู่กับ handler */
const SEGMENT_CONFIG_EXPORTS = new Set(['runtime', 'dynamic', 'revalidate', 'fetchCache', 'preferredRegion', 'maxDuration', 'dynamicParams'])

function routeFiles(dir: string): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }
  return entries.flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return routeFiles(full)
    return /^route\.(ts|tsx|js|mjs)$/.test(name) ? [full] : []
  })
}

/** `app/api/portal/handover-lots/[id]/download/route.ts` → `/api/portal/handover-lots/:id/download` */
function apiPathOf(file: string): string {
  const relative = path.relative(path.join(ROOT, 'app'), path.dirname(file)).split(path.sep)
  const segments = relative
    .filter((segment) => !/^\(.*\)$/.test(segment)) // route group ไม่อยู่ใน URL
    .map((segment) => segment.replace(/^\[(\.\.\.)?(\w+)\]$/, ':$2'))
  return `/${segments.join('/')}`
}

function exportedNames(source: string, fileName: string): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const names: string[] = []
  const isExported = (node: ts.Node): boolean =>
    ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  for (const statement of sf.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (statement.exportClause === undefined) names.push('*')
      else if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) names.push(element.name.text)
      } else names.push('*')
    } else if (ts.isExportAssignment(statement)) {
      names.push('default')
    } else if (isExported(statement)) {
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          names.push(ts.isIdentifier(declaration.name) ? declaration.name.text : '<pattern>')
        }
      } else if (
        (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
        statement.name !== undefined
      ) {
        names.push(statement.name.text)
      } else if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
        // type ไม่มีผลตอน runtime
      } else {
        names.push('<unknown>')
      }
    }
  }
  return names
}

const files = routeFiles(PORTAL_DIR)
const contractPaths = new Set(PORTAL_ENDPOINTS.map((endpoint) => endpoint.path))

/**
 * path ใน contract ที่ fixer คู่ขนานเป็นเจ้าของและ **ยังไม่ merge** ตอน P6 commit (P4: dashboard/cases/company-profile/assets ·
 * P5: billing-batches/tax-invoices/reports) — ยอมให้ยังไม่มีไฟล์ได้ชั่วคราว · เมื่อ P4/P5 merge ครบให้ลบรายการนี้ทิ้ง
 * (test "รายการค้าง" ด้านล่างจะบอกว่าตัวไหนมีไฟล์แล้ว) แล้วทิศ contract → route จะบังคับครบ 13 ตัวเอง
 */
const PENDING_PARALLEL_ROUTES: ReadonlySet<string> = new Set([
  '/api/portal/dashboard',
  '/api/portal/cases',
  '/api/portal/cases/:id',
  '/api/portal/company-profile',
  '/api/portal/assets/:id/photos/:index',
  '/api/portal/billing-batches',
  '/api/portal/tax-invoices',
  '/api/portal/tax-invoices/:id/download',
  '/api/portal/reports/revenue-summary',
  '/api/portal/reports/ar-aging',
])

describe('namespace /api/portal — GET เท่านั้น', () => {
  it('มีไฟล์ route ของพอร์ทัลให้สแกน', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files.map((file) => [path.relative(ROOT, file), file]))('%s export แค่ GET (+ ค่าตั้ง segment)', (_label, file) => {
    const names = exportedNames(readFileSync(file, 'utf8'), file)
    expect(names).toContain('GET')
    const offending = names.filter((name) => name !== 'GET' && !SEGMENT_CONFIG_EXPORTS.has(name))
    expect(offending).toEqual([])
  })

  it.each(files.map((file) => [path.relative(ROOT, file), file]))('%s ผ่านยามพอร์ทัล', (_label, file) => {
    const source = readFileSync(file, 'utf8')
    expect(/\b(withPortal|requirePortalAccess)\s*(<[^>]*>)?\s*\(/.test(source)).toBe(true)
    // ห้ามใช้ยามของระบบภายในแทน (ผู้ใช้บริษัทไม่มี capability ภายใน — D2)
    expect(/\b(withEndpoint|withApiPermission|requirePermission)\s*\(/.test(source)).toBe(false)
  })
})

describe('route ↔ lib/portal/contract.ts', () => {
  it('ทุก route ที่มีอยู่ต้องอยู่ใน contract (route นอก contract = fail)', () => {
    const outside = files.map(apiPathOf).filter((apiPath) => !contractPaths.has(apiPath))
    expect(outside).toEqual([])
  })

  it('ทุก path ใน contract มีไฟล์ route จริง (ยกเว้นรายการค้างของ fixer คู่ขนาน)', () => {
    const existing = new Set(files.map(apiPathOf))
    const missing = [...contractPaths].filter((apiPath) => !existing.has(apiPath) && !PENDING_PARALLEL_ROUTES.has(apiPath))
    expect(missing).toEqual([])
  })

  it('รายการค้างต้องเป็น path ใน contract เท่านั้น', () => {
    expect([...PENDING_PARALLEL_ROUTES].filter((apiPath) => !contractPaths.has(apiPath))).toEqual([])
  })

  it.todo('เปิดเมื่อ P4/P5 merge: ลบ PENDING_PARALLEL_ROUTES ⇒ contract → route บังคับครบ 13 endpoint')
})

describe('กฎ ESLint ของ app/api/portal/**', () => {
  const eslint = new ESLint({ cwd: ROOT })
  const filePath = path.join(ROOT, 'app', 'api', 'portal', '__lint_probe__', 'route.ts')

  async function restrictedMessages(code: string): Promise<string[]> {
    const [result] = await eslint.lintText(code, { filePath })
    return (result?.messages ?? []).filter((m) => m.ruleId === 'no-restricted-syntax').map((m) => m.message)
  }

  it.each([
    ['export async function POST() {}', 'function'],
    ['export const PATCH = async () => new Response()', 'const'],
    ['const handler = async () => new Response()\nexport { handler as DELETE }', 'specifier'],
    ["export * from './other'", 'export *'],
  ])('จับ %s (%s)', async (code) => {
    expect((await restrictedMessages(code)).length).toBeGreaterThan(0)
  }, 30_000)

  it('ไม่ทัก GET + runtime', async () => {
    expect(await restrictedMessages("export const runtime = 'nodejs'\nexport const GET = async () => new Response()")).toEqual([])
  }, 30_000)
})
