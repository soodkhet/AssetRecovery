// อ่าน transcript ของ Claude Code session จาก ~/.claude/projects/**/<id>.jsonl มาจัดรูป
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROJECTS = join(homedir(), '.claude', 'projects');
const clip = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n) + '…' : s; };

export function findSessionFile(id) {
  if (!/^[0-9a-fA-F-]{8,}$/.test(id)) return null;           // กัน path injection (uuid เท่านั้น)
  if (!existsSync(PROJECTS)) return null;
  try {
    const out = execFileSync('find', [PROJECTS, '-maxdepth', '3', '-name', `${id}.jsonl`], { encoding: 'utf8', timeout: 10000 }).trim();
    return out.split('\n').filter(Boolean)[0] || null;
  } catch { return null; }
}

export function readSession(id) {
  const file = findSessionFile(id);
  if (!file) return { ok: false, error: 'ไม่พบไฟล์ transcript (session อาจถูกลบ หรืออยู่คนละเครื่อง)' };
  let lines;
  try { lines = readFileSync(file, 'utf8').split('\n').filter(Boolean); }
  catch (e) { return { ok: false, error: e.message }; }

  const msgs = [];
  for (const line of lines) {
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    const m = ev.message || ev;
    const role = m.role || ev.type;
    if (role !== 'user' && role !== 'assistant') continue;
    const content = m.content;
    const blocks = [];
    if (typeof content === 'string') {
      if (content.trim()) blocks.push({ kind: 'text', text: clip(content, 4000) });
    } else if (Array.isArray(content)) {
      for (const c of content) {
        if (c.type === 'text' && c.text) blocks.push({ kind: 'text', text: clip(c.text, 4000) });
        else if (c.type === 'tool_use') blocks.push({ kind: 'tool_use', name: c.name, input: clip(JSON.stringify(c.input || {}), 400) });
        else if (c.type === 'tool_result') {
          let t = c.content;
          if (Array.isArray(t)) t = t.map((x) => (typeof x === 'string' ? x : x.text || '')).join('\n');
          blocks.push({ kind: 'tool_result', text: clip(t, 1200), error: !!c.is_error });
        }
      }
    }
    if (blocks.length) msgs.push({ role, blocks });
  }
  return { ok: true, file, total: msgs.length, messages: msgs.slice(-500) };
}
