// Git helpers — จัดการ branch/commit + workaround git lock (กติกา PROGRESS ข้อ 7)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { REPO_ROOT } from '../config.mjs';

const SEP = ''; // unit separator สำหรับ parse git log

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', ...opts }).trim();
}

function collectLocks(dir, out) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) collectLocks(p, out);
    else if (e.name.endsWith('.lock')) out.push(p);
  }
}

// ย้าย lock files ที่ค้าง (พบบนสภาพแวดล้อมคลาวด์) ไป _to_delete/git-locks
export function clearStaleLocks() {
  const gitdir = resolve(REPO_ROOT, '.git');
  const dest = resolve(REPO_ROOT, '_to_delete', 'git-locks');
  const locks = [join(gitdir, 'index.lock'), join(gitdir, 'HEAD.lock'), join(gitdir, 'packed-refs.lock')];
  collectLocks(join(gitdir, 'refs', 'heads'), locks); // รวม lock ของ branch ที่มี / เช่น auto/review-x.lock
  const moved = [];
  for (const l of locks) {
    if (existsSync(l)) {
      mkdirSync(dest, { recursive: true });
      try { renameSync(l, join(dest, `${Date.now()}-${l.split('/').pop()}`)); moved.push(l); } catch { /* ignore */ }
    }
  }
  return moved;
}

// ไฟล์ที่ merge ยังไม่จบ (UU/AA/DD ฯลฯ) — เคสนี้ห้าม auto-commit เด็ดขาด ต้องให้คนดู
export function unmergedPaths() {
  try {
    const out = git(['status', '--porcelain']);
    if (!out) return [];
    return out.split('\n')
      .filter((l) => /^(U.|.U|AA|DD)/.test(l))
      .map((l) => l.slice(3));
  } catch { return []; }
}

export function mergeInProgress() {
  return existsSync(resolve(REPO_ROOT, '.git', 'MERGE_HEAD'));
}

// commit ไฟล์ค้างทั้งหมด (ยกเว้นโฟลเดอร์ orchestrator) — ใช้กู้ session ที่ถูกตัดกลางคัน
export function commitAllWip(message) {
  clearStaleLocks();
  git(['add', '-A', '--', '.', ':(exclude)orchestrator']);
  git(['commit', '-m', message]);
  return headHash();
}

export function dirtyFiles() {
  try {
    const out = git(['status', '--porcelain', '--', '.', ':(exclude)orchestrator']);
    return out ? out.split('\n').filter(Boolean) : [];
  } catch { return []; }
}

export function currentBranch() {
  try { return git(['rev-parse', '--abbrev-ref', 'HEAD']); } catch { return null; }
}

export function branchExists(name) {
  try { git(['rev-parse', '--verify', '--quiet', `refs/heads/${name}`]); return true; } catch { return false; }
}

export function isClean() {
  // ไม่นับไฟล์ในโฟลเดอร์ orchestrator เอง (ไม่งั้น tooling ของตัวเองจะบล็อกตัวเองตลอด)
  try { return git(['status', '--porcelain', '--', '.', ':(exclude)orchestrator']) === ''; } catch { return false; }
}

export function checkoutBranch(name, { create = false, from } = {}) {
  clearStaleLocks();
  if (!name || name.includes('undefined')) throw new Error(`ชื่อ branch ไม่ถูกต้อง: ${name}`);
  if (create && !branchExists(name)) {
    git(['checkout', '-b', name, ...(from ? [from] : [])]);
  } else {
    git(['checkout', name]);
    // ถ้า branch เดิมตามหลัง base อยู่ → รีเซ็ตให้ตรง base ก่อน (กัน agent ทำงานบนโค้ดเก่า)
    if (from) {
      try {
        const behind = Number(git(['rev-list', '--count', `${name}..${from}`]));
        if (behind > 0) {
          const ahead = Number(git(['rev-list', '--count', `${from}..${name}`]));
          if (ahead === 0) git(['reset', '--hard', from]);   // ไม่มีงานเฉพาะของ branch → รีเซ็ตปลอดภัย
          else git(['merge', '--no-edit', from]);            // มีงานค้าง → รวม base เข้ามาแทน
        }
      } catch { /* ปล่อยผ่าน ใช้ branch ตามเดิม */ }
    }
  }
  return currentBranch();
}

export function headHash() {
  try { return git(['rev-parse', '--short', 'HEAD']); } catch { return null; }
}

export function mergeBranch(branch, base) {
  clearStaleLocks();
  git(['checkout', base]);
  try {
    git(['merge', '--no-ff', '-m', `merge ${branch} → ${base} (auto-orchestrator)`, branch]);
  } catch (e) {
    // conflict → ยกเลิก merge คืนสภาพ tree ให้สะอาด (ไม่ทิ้ง UU ไว้บล็อกงานถัดไป)
    try { git(['merge', '--abort']); } catch { /* ignore */ }
    throw new Error(`merge conflict ${branch} → ${base} (คืนสภาพแล้ว ต้องคนดู): ${e.message.split('\n')[0]}`);
  }
  return headHash();
}

export function deleteBranch(name) {
  try { git(['branch', '-D', name]); } catch { /* ignore */ }
}

export function recentCommits(n = 8) {
  try {
    const raw = git(['log', `-${n}`, `--pretty=format:%h${SEP}%s${SEP}%cI${SEP}%an`]);
    if (!raw) return [];
    return raw.split('\n').map((l) => {
      const [hash, subject, date, author] = l.split(SEP);
      return { hash, subject, date, author };
    });
  } catch { return []; }
}

export function commitCountSince(ref) {
  try { return Number(git(['rev-list', '--count', `${ref}..HEAD`])); } catch { return 0; }
}
