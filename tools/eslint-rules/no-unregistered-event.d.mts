import type { Rule } from 'eslint'

/** ชนิดของกฎ ESLint ที่เขียนเป็น `.mjs` (ตัว lint เองรัน JS ล้วน — ไฟล์นี้มีไว้ให้ `tsc` และเทสต์เห็นชนิด) */
declare const rule: Rule.RuleModule
export default rule
