import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * กันถดถอย มติผู้ใช้ 15/10/2569 (ต่อจาก SV5-J1-01) — ฟอร์มใน `<Modal>` ที่ร่างค้างข้ามการปิด ต้องใช้กติกาเดียว:
 * 1) ปุ่มยกเลิก/ปิดใน footer = `<ModalCancelButton>` (ถามเมื่อมีร่างแบบเดียวกับ Esc/X/Back) — ห้าม `<Button>ยกเลิก</Button>` เขียนเอง
 * 2) "ทิ้งข้อมูล" ล้างร่างจริง: ส่ง `onDiscard` · หรือ `onClose` ของ modal ล้างร่างทุกครั้งที่ปิด (`CLOSE_RESETS_DRAFT`)
 * 3) component ที่ค้าง mount (`if (!open) return null`) ล้างข้อผิดเมื่อปิดด้วย `useClearOnClose`
 * "ร่างค้าง" = modal ส่ง `onDiscard` หรืออยู่ใน component ที่ค้าง mount (ระดับบนสุดของ component มี
 * `if (!open) return null` / `if (record === null) return null`) และมีช่องกรอก — ยกเว้น `NO_DRAFT_CARRYOVER` (มีเหตุผลกำกับ)
 *
 * ข้อจำกัด (ตรวจด้วยคนตอนรีวิว):
 * - modal ระดับหน้า/แท็บที่เก็บร่างใน state ของหน้า (`<Modal open={formOpen}>` ไม่มี early return) สแกนเจอเฉพาะเมื่อส่ง `onDiscard`
 *   — ตัวที่ยังไม่ส่งแต่ร่างค้าง (opener ไม่รีเซ็ตฟอร์ม) ตรวจไม่เจอ
 * - allowlist เป็นรายไฟล์ — ไฟล์ที่มีหลาย modal ถ้าอยู่ใน allowlist จะข้ามทุก modal ในไฟล์นั้น
 * - นับปุ่มยกเลิกเขียนเองเฉพาะข้อความ JSX ตรง ๆ (`<Button>ยกเลิก</Button>`) — `{'ยกเลิก'}`/ตัวแปร/`cancelLabel` ไม่นับ
 * - `useClearOnClose` ตรวจระดับไฟล์ (มีการเรียกที่ไหนก็ได้ในไฟล์)
 */
const ROOT = join(__dirname, '..', '..')
const FORM_TAGS = new Set(['Input', 'MoneyInput', 'Select', 'Textarea', 'StagedFileInput', 'FileDropzone', 'input', 'select', 'textarea'])
const CANCEL_TEXTS = new Set(['ยกเลิก', 'ปิด'])

const PARENT_KEY = 'ผู้เรียกใส่ key `<x>-${id ?? \'none\'}` ⇒ remount ทุกครั้งที่เปิด/ปิด ร่างไม่ค้าง'

/** ค้าง mount แต่ร่าง/ข้อผิดไม่ข้ามการปิด — ไม่อยู่ในกติกานี้ (ใช้ปุ่มยกเลิกปกติได้) */
const NO_DRAFT_CARRYOVER: Readonly<Record<string, string>> = {
  'components/accounting/cost-center-bulk-map-modal.tsx': 'expenses-tab ใส่ key ตาม bulkOpen',
  'components/accounting/exception-form-modal.tsx': 'exceptions-tab ใส่ key create-/edit-<id>',
  'components/accounting/answer-question-modal.tsx': PARENT_KEY,
  'components/accounting/cancel-wht-modal.tsx': PARENT_KEY,
  'components/accounting/cost-center-map-modal.tsx': PARENT_KEY,
  'components/accounting/credit-note-modal.tsx': PARENT_KEY,
  'components/accounting/exception-action-modal.tsx': PARENT_KEY,
  'components/accounting/issue-tax-invoice-modal.tsx': PARENT_KEY,
  'components/accounting/manual-match-modal.tsx': PARENT_KEY,
  'components/accounting/mark-wht-filed-modal.tsx': PARENT_KEY,
  'components/accounting/mark-wht-supplementary-filed-modal.tsx': PARENT_KEY,
  'components/accounting/receive-customer-wht-modal.tsx': PARENT_KEY,
  'components/accounting/resolve-unmatched-modal.tsx': PARENT_KEY,
  'components/accounting/suspense-modal.tsx': PARENT_KEY,
  'components/finance/adjustment-review-modal.tsx': PARENT_KEY,
  'components/finance/cancel-payout-modal.tsx': PARENT_KEY,
  'components/finance/advance-review-modal.tsx': 'close() ล้างร่างทุกทางปิด (ยกเลิก/Esc/X/ทิ้งข้อมูล) — ร่างไม่ค้าง',
  'components/finance/locked-field-days-card.tsx': 'ปุ่มเปิดรีเซ็ตเหตุผล/ข้อผิดทุกครั้ง',
  'components/finance/locked-fuel-expenses-card.tsx': 'ปุ่มเปิดรีเซ็ตเหตุผล/ข้อผิดทุกครั้ง',
  'components/settings/organization-profile-tab.tsx': 'ปุ่มเปิดสร้างฟอร์มใหม่จากข้อมูลจริงทุกครั้ง (ฟอร์ม/รูป/ลบรูป)',
}

/** `onClose` ของ modal ล้างร่าง+ข้อผิดทุกครั้งที่ปิด (รวม "ทิ้งข้อมูล") — ไม่ต้องส่ง `onDiscard`/`useClearOnClose` */
const CLOSE_RESETS_DRAFT = new Set(['components/finance/adjustment-form-modal.tsx', 'components/finance/payment-file-modal.tsx'])

/** ไม่มี state ข้อผิดจากการกดส่ง (ข้อผิดคำนวณจากค่าที่กรอก/แจ้งด้วย toast) — ไม่ต้อง `useClearOnClose` */
const NO_SUBMIT_ERROR_STATE: Readonly<Record<string, string>> = {
  'components/finance/advance-return-modals.tsx': 'ข้อผิดยอดคำนวณจากช่องที่กรอก · ข้อผิด API แจ้งด้วย toast',
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') sourceFiles(path, out)
    } else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) {
      out.push(path)
    }
  }
  return out
}

function tagName(node: ts.JsxOpeningLikeElement): string {
  return node.tagName.getText()
}

function hasAttr(element: ts.JsxOpeningLikeElement, name: string): boolean {
  return element.attributes.properties.some((property) => ts.isJsxAttribute(property) && property.name.getText() === name)
}

function footerExpression(element: ts.JsxOpeningLikeElement): ts.Node | undefined {
  const footer = element.attributes.properties.find(
    (property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === 'footer',
  )
  return footer?.initializer
}

function walk(node: ts.Node | undefined, visit: (node: ts.Node) => void): void {
  if (node === undefined) return
  visit(node)
  node.forEachChild((child) => walk(child, visit))
}

/** `<Button ...>ยกเลิก</Button>` ที่เขียนเอง (ไม่นับ `<ModalCancelButton>`) */
function handwrittenCancelButtons(node: ts.Node | undefined): number {
  let count = 0
  walk(node, (child) => {
    if (!ts.isJsxElement(child) || tagName(child.openingElement) !== 'Button') return
    const text = child.children.map((part) => (ts.isJsxText(part) ? part.text : '')).join('').trim()
    if (CANCEL_TEXTS.has(text)) count += 1
  })
  return count
}

function containsTag(node: ts.Node | undefined, tags: ReadonlySet<string>): boolean {
  let found = false
  walk(node, (child) => {
    if ((ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) && tags.has(tagName(child))) found = true
  })
  return found
}

/** statement นี้คือ `if (...) return null` (ไม่มี else) ไหม */
function isEarlyReturnNull(statement: ts.Statement): boolean {
  if (!ts.isIfStatement(statement) || statement.elseStatement !== undefined) return false
  const then = statement.thenStatement
  const body = ts.isBlock(then) && then.statements.length === 1 ? then.statements[0] : then
  return body !== undefined && ts.isReturnStatement(body) && body.expression?.kind === ts.SyntaxKind.NullKeyword
}

/**
 * component (ฟังก์ชันชื่อขึ้นต้นตัวใหญ่) ที่ห่อ `<Modal>` นี้ ค้าง mount แล้ว return null ตอนปิด —
 * มี `if (!open) return null` / `if (record === null) return null` ระดับบนสุดของ body (ไม่นับใน helper/callback ข้างใน)
 */
function returnsNullWhenClosed(modal: ts.Node): boolean {
  let current: ts.Node | undefined = modal.parent
  while (current !== undefined) {
    if (ts.isFunctionDeclaration(current) || ts.isFunctionExpression(current) || ts.isArrowFunction(current)) {
      const name = ts.isFunctionDeclaration(current)
        ? current.name?.text
        : ts.isVariableDeclaration(current.parent) && ts.isIdentifier(current.parent.name)
          ? current.parent.name.text
          : undefined
      if (name !== undefined && /^[A-Z]/.test(name)) {
        const body = current.body
        return body !== undefined && ts.isBlock(body) && body.statements.some(isEarlyReturnNull)
      }
    }
    current = current.parent
  }
  return false
}

interface DraftModal {
  file: string
  line: number
  hasDiscard: boolean
  hasCancelButton: boolean
  handwrittenCancel: number
  keptMounted: boolean
  clearsOnClose: boolean
}

/**
 * ตรวจ staging SV5-A11Y-K-01 — ทุก `<Modal>` ที่มีช่องกรอก: Esc/X ถามเมื่อมีร่างอยู่แล้ว (modal ตรวจช่องที่แก้เอง)
 * ⇒ ปุ่มยกเลิก/ปิดใน footer ต้องใช้กติกาเดียวกัน (`<ModalCancelButton>`) ไม่ว่าร่างจะค้างข้ามการปิดหรือไม่
 */
/** ปุ่มยกเลิกเขียนเองที่ถามยืนยันทิ้งร่างด้วยกติกาของตัวเองอยู่แล้ว (มีเหตุผลกำกับ) */
const OWN_CANCEL_GUARD: Readonly<Record<string, string>> = {
  'components/cases/case-form-modal.tsx': 'requestCancel() ถามทิ้งร่างเองเมื่อฟอร์ม/ไฟล์ที่เลือกไว้เปลี่ยน (isCaseFormDirty)',
}

function formModalsWithHandwrittenCancel(): string[] {
  const offenders: string[] = []
  for (const path of [...sourceFiles(join(ROOT, 'components')), ...sourceFiles(join(ROOT, 'app'))]) {
    const file = relative(ROOT, path)
    if (file === 'components/ui/modal.tsx') continue
    const text = readFileSync(path, 'utf8')
    if (!text.includes('<Modal') || OWN_CANCEL_GUARD[file] !== undefined) continue
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    walk(source, (node) => {
      if (!ts.isJsxElement(node) || tagName(node.openingElement) !== 'Modal') return
      const footer = footerExpression(node.openingElement)
      if (!containsTag(node, FORM_TAGS) && !containsTag(footer, FORM_TAGS)) return
      if (handwrittenCancelButtons(footer) === 0) return
      offenders.push(`${file}:${source.getLineAndCharacterOfPosition(node.openingElement.getStart()).line + 1}`)
    })
  }
  return offenders
}

function draftModals(): DraftModal[] {
  const result: DraftModal[] = []
  for (const path of [...sourceFiles(join(ROOT, 'components')), ...sourceFiles(join(ROOT, 'app'))]) {
    const file = relative(ROOT, path)
    if (file === 'components/ui/modal.tsx') continue
    const text = readFileSync(path, 'utf8')
    if (!text.includes('<Modal')) continue
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    walk(source, (node) => {
      if (!ts.isJsxElement(node) || tagName(node.openingElement) !== 'Modal') return
      const opening = node.openingElement
      const footer = footerExpression(opening)
      const hasForm = containsTag(node, FORM_TAGS) || containsTag(footer, FORM_TAGS)
      const hasDiscard = hasAttr(opening, 'onDiscard')
      const keptMounted = returnsNullWhenClosed(node)
      if (NO_DRAFT_CARRYOVER[file] !== undefined) return
      if (!hasDiscard && !(keptMounted && hasForm)) return
      result.push({
        file,
        line: source.getLineAndCharacterOfPosition(opening.getStart()).line + 1,
        hasDiscard,
        hasCancelButton: containsTag(footer, new Set(['ModalCancelButton'])),
        handwrittenCancel: handwrittenCancelButtons(footer),
        keptMounted,
        clearsOnClose: text.includes('useClearOnClose('),
      })
    })
  }
  return result
}

describe('ฟอร์มใน modal ที่ร่างค้างข้ามการปิด — ยกเลิกถาม/ทิ้งล้าง (มติผู้ใช้ 15/10/2569)', () => {
  const modals = draftModals()

  it('สแกนเจอฟอร์มที่เก็บร่างครบชุด (กันสแกนว่างแล้วผ่านเงียบ)', () => {
    const files = new Set(modals.map((modal) => modal.file))
    for (const expected of [
      'components/finance/settle-advance-modal.tsx',
      'components/finance/create-billing-modal.tsx',
      'components/finance/create-payout-modal.tsx',
      'components/finance/adjustment-form-modal.tsx',
      'components/finance/payment-file-modal.tsx',
      'components/accounting/question-form-modal.tsx',
      'components/accounting/import-statement-modal.tsx',
      'components/accounting/export-pack-modal.tsx',
      'components/roles/roles-manager.tsx',
      'components/settings/holidays-tab.tsx',
      'components/settings/device-catalog-lists.tsx',
    ]) {
      expect(files, expected).toContain(expected)
    }
  })

  it('ปุ่มยกเลิก/ปิดใน footer = <ModalCancelButton> ไม่ใช่ <Button> เขียนเอง', () => {
    const offenders = modals
      .filter((modal) => !modal.hasCancelButton || modal.handwrittenCancel > 0)
      .map((modal) => `${modal.file}:${modal.line}`)
    expect(offenders).toEqual([])
  })

  it('"ทิ้งข้อมูล" ล้างร่างจริง — ส่ง onDiscard หรือ onClose ล้างร่างทุกครั้งที่ปิด', () => {
    const offenders = modals
      .filter((modal) => !modal.hasDiscard && !CLOSE_RESETS_DRAFT.has(modal.file))
      .map((modal) => `${modal.file}:${modal.line}`)
    expect(offenders).toEqual([])
  })

  it('component ที่ค้าง mount ล้างข้อผิดเมื่อปิดด้วย useClearOnClose', () => {
    const offenders = modals
      .filter(
        (modal) =>
          modal.keptMounted &&
          !modal.clearsOnClose &&
          !CLOSE_RESETS_DRAFT.has(modal.file) &&
          NO_SUBMIT_ERROR_STATE[modal.file] === undefined,
      )
      .map((modal) => `${modal.file}:${modal.line}`)
    expect(offenders).toEqual([])
  })
})

describe('ทุกฟอร์มใน modal — ปุ่มยกเลิก/ปิดถามเมื่อมีร่างเหมือน Esc/X (ตรวจ staging SV5-A11Y-K-01)', () => {
  it('ไม่มี <Button>ยกเลิก/ปิด</Button> เขียนเองใน footer ของ modal ที่มีช่องกรอก', () => {
    expect(formModalsWithHandwrittenCancel()).toEqual([])
  })
})
