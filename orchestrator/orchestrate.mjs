#!/usr/bin/env node
// CLI สำหรับสั่ง orchestrator จาก terminal
// ใช้: node orchestrator/orchestrate.mjs <status|next|run|watch|resume> [args]
import { parseProgress, pickNextTask } from './lib/progress.mjs';
import { runOne, runLoop, resolveQueueItem, state } from './lib/engine.mjs';
import { listQueue } from './lib/queue.mjs';
import { config } from './config.mjs';

const cmd = process.argv[2] || 'status';
const args = process.argv.slice(3);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? (args[i + 1] ?? true) : undefined; };

function printStatus() {
  const p = parseProgress();
  const next = pickNextTask(p);
  console.log(`\nRTB — ความคืบหน้ารวม: ${p.stats.done}/${p.stats.total} (${p.stats.percent}%)  ·  อัปเดตล่าสุด ${p.updatedAt || '-'}`);
  for (const ph of p.phases) console.log(`  Phase ${ph.key.padEnd(2)} ${String(ph.percent).padStart(3)}%  ${ph.done}/${ph.total}  ${ph.name}`);
  // id ที่ไม่ใช่เลขเฟส (HASORDER-FIX · RET-2b · SYNC-INTERVAL) เติมคำว่า "Phase" แล้วอ่านไม่รู้เรื่อง
  const label = (t) => (/^[0-9P]/.test(t.id) ? `Phase ${t.id}` : t.id);
  console.log(`\n🎯 งานถัดไป: ${next ? `${label(next)} — ${next.title}` : '(ไม่มี — งานครบแล้ว)'}`);
  const q = listQueue('pending');
  if (q.length) {
    console.log(`\n⏳ รอคนตัดสินใจ (${q.length}):`);
    for (const it of q) console.log(`  [${it.id}] (${it.type}) Phase ${it.taskId}: ${it.question}`);
  }
  console.log(`\nโหมด: autoMerge=${config.autoMerge} · permission=${config.permission}\n`);
}

if (cmd === 'status') {
  printStatus();
} else if (cmd === 'next') {
  const r = await runOne({ dryRun: true });
  if (r.done) console.log('ไม่มีงานถัดไป');
  else {
    console.log(`\n🎯 Phase ${r.task.id} — ${r.task.title}`);
    console.log(`branch: ${r.branch}`);
    console.log(`argv: ${r.argv.join(' ')}`);
    console.log(`\n--- PROMPT ---\n${r.prompt}\n`);
  }
} else if (cmd === 'run') {
  const dryRun = args.includes('--dry-run');
  const r = await runOne({ dryRun });
  console.log(JSON.stringify(r, (k, v) => (k === 'prompt' ? '<prompt omitted>' : v), 2));
} else if (cmd === 'watch') {
  state.auto = true;
  console.log('เริ่ม watch — จะทำงานทีละก้อนจนกว่าจะเจอจุดต้องตัดสินใจ (Ctrl+C หยุด)');
  const r = await runLoop();
  console.log(JSON.stringify(r, null, 2));
  printStatus();
} else if (cmd === 'resume') {
  const id = args[0];
  const answer = flag('--answer');
  if (!id) { console.error('ต้องระบุ queue id: resume <id> --answer "..."'); process.exit(1); }
  const r = await resolveQueueItem(id, { answer, action: args.includes('--dismiss') ? 'dismiss' : 'approve' });
  console.log(JSON.stringify(r, null, 2));
} else if (cmd === 'notify-test') {
  const { notify } = await import('./lib/notify.mjs');
  notify({ title: '🔔 ทดสอบแจ้งเตือน RTB', message: 'ถ้าได้ยินเสียง+เห็นบนมือถือ = ตั้งค่า ntfy สำเร็จ', tags: ['bell'], priority: 'urgent', view: true });
  console.log(config.notify.topic ? `ส่งแล้ว → topic: ${config.notify.topic}` : 'ยังไม่ได้ตั้ง RTB_NTFY_TOPIC (แจ้งเตือนปิดอยู่)');
  await new Promise((r) => setTimeout(r, 1500));
} else {
  console.error(`ไม่รู้จักคำสั่ง: ${cmd}\nใช้: status | next | run [--dry-run] | watch | resume <id> --answer "..." | notify-test`);
  process.exit(1);
}
