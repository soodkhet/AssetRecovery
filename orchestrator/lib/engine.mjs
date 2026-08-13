// Engine — orchestration loop: next → run claude → verify → commit/merge หรือ park รอคน
import { randomUUID } from 'node:crypto';
import { config } from '../config.mjs';
import { parseProgress, pickNextTask } from './progress.mjs';
import { buildTaskPrompt, buildResumePrompt, buildRepairPrompt, buildHandoffPrompt, buildReviewPrompt, buildFinalTestPrompt } from './prompt.mjs';
import { getCheckpoint, setCheckpoint, phaseReviewed, markFinalStage, finalStageDone } from './checkpoint.mjs';
import { runClaude, buildArgs } from './claude.mjs';
import { runVerify, verifyFailureSummary } from './verify.mjs';
import * as git from './git.mjs';
import { park, listQueue, getQueue, updateQueue, appendRun, writeSessionLog } from './queue.mjs';
import { saveRateLimits, getPlanLimits, refreshPlanLimits } from './usage.mjs';
import { notify } from './notify.mjs';
import { acquireLock, releaseLock } from './lock.mjs';

function notifyEvent(kind, info = {}) {
  const t = info.task;
  const label = t && t.id ? `Phase ${t.id}` : 'AssetRecovery';
  switch (kind) {
    case 'merged': notify({ title: `✅ ${label} เสร็จ + merged`, message: info.head || (t && t.title) || '', tags: ['white_check_mark'], priority: 'high' }); break;
    case 'decision': notify({ title: `🤔 ต้องตัดสินใจ · ${label}`, message: info.question || '', tags: ['question'], priority: 'urgent', view: true, queueId: info.queueId, options: info.options }); break;
    case 'merge': notify({ title: `🟡 รอ approve merge · ${label}`, message: info.question || '', tags: ['hourglass'], priority: 'urgent', approve: info.queueId }); break;
    case 'verify_failed': notify({ title: `❌ verify แดง · ${label}`, message: info.question || '', tags: ['x'], priority: 'high', view: true }); break;
    case 'error': notify({ title: `⚠️ ติดปัญหา · ${label}`, message: info.question || '', tags: ['warning'], priority: 'high', view: true }); break;
    case 'waiting-limit': notify({ title: '⏸️ รอโควตา AI reset', message: `${info.label || ''}${info.pct != null ? ' ' + info.pct + '%' : ''} — จะทำต่อเองหลัง reset`, tags: ['hourglass_flowing_sand'], priority: 'low' }); break;
    case 'limit': notify({ title: `🛑 หยุด — โควตาใกล้เต็ม · ${label}`, message: info.question || '', tags: ['battery'], priority: 'urgent', view: true, queueId: info.queueId, options: info.options }); break;
    default: break;
  }
}

function notifyFromResult(r) {
  if (!r) return;
  if (r.merged && r.task) notifyEvent('merged', { task: r.task });
  else if (r.parked) { const rec = r.parked; notifyEvent(rec.type, { task: { id: rec.taskId, title: rec.title }, question: rec.question, queueId: rec.id, options: rec.options }); }
  else if (r.waiting) notifyEvent('waiting-limit', { label: r.waiting.label, pct: r.waiting.pct });
}

// คืน limit ที่บล็อกอยู่ (≥ threshold) หรือ null
function limitBlocked() {
  const pl = getPlanLimits();
  if (!pl || !pl.ok || !pl.limits) return null;
  for (const l of pl.limits) {
    const thr = l.key === 'session' ? config.limitPause.fiveHour : config.limitPause.weekly;
    if (l.pct >= thr) return l;
  }
  return null;
}

// โมเดลตามบทบาท: role 'code' | 'review' — ถ้าไม่ตั้ง ใช้ที่เลือกใน dropdown
// ส่ง task มาด้วย → task UI หน้าบ้าน (config.uiTaskPrefixes) ใช้ config.uiModel (Fable 5) เสมอ
export function modelFor(role, task) {
  if (role === 'code' && task && config.uiModel) {
    const id = String(task.id || '');
    if (config.uiTaskPrefixes.some((pfx) => id === pfx || id.startsWith(pfx))) return config.uiModel;
  }
  return config.roleModels?.[role] || state.selectedModel || '';
}

// Phase นี้เสร็จครบทุก task แล้วหรือยัง (ใช้ตัดสินว่าจะรีวิวจบเฟส)
function phaseCompleted(progress, phaseKey) {
  const p = progress.phases.find((x) => x.key === phaseKey);
  return !!p && p.total > 0 && p.done === p.total;
}

// context window ของโมเดลที่ใช้จริงตอนนี้ (liveModel ระหว่างรัน → selectedModel → ค่า default)
export function activeContextWindow() {
  const find = (v) => config.models.find((m) => m.value && v && String(v).includes(m.value.replace('claude-', '')));
  const m = (state.liveModel && find(state.liveModel)) || config.models.find((x) => x.value === state.selectedModel);
  return (m && m.ctx) || config.contextWindow;
}

// handoff target = 80% ของ window ที่ใช้จริง
export function activeHandoffTarget() {
  return process.env.RTB_HANDOFF_CTX ? Number(process.env.RTB_HANDOFF_CTX) : Math.round(activeContextWindow() * 0.8);
}

// เลือกตัวเลือกที่ agent แนะนำ: ตัวที่มี "(แนะนำ)" → ไม่มีก็เอาตัวแรก → ไม่มีตัวเลือกเลยก็ให้ใช้ดุลยพินิจ
function pickRecommended(options) {
  const list = Array.isArray(options) ? options.filter(Boolean) : [];
  if (!list.length) return 'เลือกแนวทางที่สอดคล้องกับเอกสาร/กติกาโปรเจกต์มากที่สุด แล้วทำต่อให้จบ (ห้ามลด scope)';
  return list.find((o) => /แนะนำ/.test(o)) || list[0];
}

// ตรวจว่า session ล้มเพราะชน limit (จากข้อความของ Claude Code)
function isLimitHit(res) {
  const t = `${res?.result || ''}\n${res?.raw || ''}`;
  return /usage limit reached|rate limit|limit reached|limit will reset|reached your .* limit/i.test(t);
}

// เก็บ rate_limits ล่าสุด (ถ้า response ส่งมา) ทั้งใน state และไฟล์
function noteUsage(res) {
  if (res?.rateLimits) { state.rateLimits = res.rateLimits; state.rateLimitsAt = new Date().toISOString(); saveRateLimits(res.rateLimits); }
}

// สถานะที่แชร์กับ server (in-memory)
export const state = {
  running: false,
  auto: config.autoNext,
  phase: 'idle', // idle | planning | running | verifying | merging | parked | done
  currentTask: null,
  liveLog: '',
  lastError: null,
  rateLimits: null,
  rateLimitsAt: null,
  liveContext: 0,   // context ของ session ที่กำลังรัน (live)
  liveTurns: 0,
  liveModel: null,  // โมเดลที่ session ปัจจุบันใช้ (จาก stream)
  selectedModel: config.model || '', // โมเดลที่จะใช้กับงานถัดไป ('' = ค่าเริ่มต้น)
  waitingLimit: null, // { label, pct, resetAt } เมื่อพักรอ limit reset
  resumeAfterReset: false, // true = พักเพราะ limit และจะทำต่อเองเมื่อโควตากลับมา
  handoffRound: 0,  // รอบการถ่ายงาน (session ต่อเนื่องของ task เดียว)
};

// callback อัปเดต context/โมเดลสดระหว่างรัน
const onProg = (p) => { state.liveContext = p.peakContext; state.liveTurns = p.turn; if (p.model) state.liveModel = p.model; };

function setPhase(p, task) {
  state.phase = p;
  if (task !== undefined) state.currentTask = task;
}

export function getState() {
  const progress = parseProgress();
  const next = pickNextTask(progress);
  return {
    engine: { running: state.running, auto: state.auto, phase: state.phase, currentTask: state.currentTask, lastError: state.lastError, autoMerge: config.autoMerge, liveContext: state.liveContext, liveTurns: state.liveTurns, liveModel: state.liveModel, selectedModel: state.selectedModel, waitingLimit: state.waitingLimit, resumeAfterReset: state.resumeAfterReset, handoffRound: state.handoffRound },
    progress,
    next,
    queue: listQueue('pending'),
  };
}


// กู้ไฟล์ค้างจาก session ที่ถูกตัดกลางคัน — commit เป็น WIP แล้วทำงานต่อ (ไม่ต้องรอคนกด)
// คืน { ok:true, head } ถ้ากู้ได้ · { ok:false, reason } ถ้าต้องให้คนดู (merge ค้าง/conflict)
function recoverDirtyTree(label) {
  if (!config.autoCommitDirty) return { ok: false, reason: 'ปิด auto-commit ไว้ (RTB_AUTO_COMMIT_DIRTY=false)' };
  if (git.mergeInProgress()) return { ok: false, reason: 'มี merge ค้างอยู่ — ต้องให้คนแก้ conflict ก่อน' };
  const unmerged = git.unmergedPaths();
  if (unmerged.length) return { ok: false, reason: `มีไฟล์ conflict ยังไม่แก้ (${unmerged.slice(0, 3).join(', ')}) — ต้องให้คนดู` };
  const files = git.dirtyFiles();
  if (!files.length) return { ok: true, head: git.headHash(), files: [] };
  try {
    const head = git.commitAllWip(`wip(auto): กู้ไฟล์ค้างจาก session ที่ถูกตัด — ${label}`);
    return { ok: true, head, files };
  } catch (e) {
    return { ok: false, reason: `commit ไม่สำเร็จ: ${e.message}` };
  }
}

// รัน task ถัดไป 1 ก้อน คืนสรุปผล (+ ยิงแจ้งเตือนตามผลลัพธ์)
export async function runOne(opts) {
  if (opts && opts.dryRun) return runOneCore(opts);
  const lk = acquireLock();
  if (!lk.ok) return { skipped: `มี orchestrator อื่นรันอยู่ (pid ${lk.pid})` };
  try {
    const r = await runOneCore(opts);
    try { notifyFromResult(r); } catch { /* ignore */ }
    return r;
  } finally { releaseLock(); }
}

async function runOneCore({ dryRun = false, force = false } = {}) {
  if (state.running) return { skipped: 'already-running' };
  const progress = parseProgress();
  const task = pickNextTask(progress);
  if (!task) { setPhase('done', null); return { done: 'no-more-tasks' }; }
  if (task.locked && progress.phases.find((p) => p.key === task.phase)?.locked) {
    // pickNextTask จัดการ lock แล้ว แต่กันไว้อีกชั้น
  }

  const runId = randomUUID().slice(0, 8);
  const branch = `${config.branchPrefix}${task.id}`;
  globalThis.__rtbHandoffTarget = activeHandoffTarget();  // ให้ prompt บอกเป้า context ตรงกับโมเดลที่ใช้
  const prompt = buildTaskPrompt(task);

  if (dryRun) {
    const args = buildArgs(prompt, { model: modelFor('code', task) });
    return { dryRun: true, task, branch, argv: [config.claudeBin, ...args.map((a) => (a === prompt ? '<PROMPT>' : a))], prompt };
  }

  // pre-flight: โควตาใกล้เต็ม → หยุด + ถามผู้ใช้ (ไม่ปล่อย task ค้างครึ่ง) เว้นแต่สั่ง force
  if (!force) {
    try { await refreshPlanLimits(); } catch { /* ignore */ }
    const blk = limitBlocked();
    if (blk) {
      // default: หยุดพัก + **ทำต่อเองอัตโนมัติหลังโควตารีเซ็ต** (ไม่ต้องกดอะไร)
      state.waitingLimit = { label: blk.label, pct: blk.pct, resetAt: blk.resetAt || null };
      state.resumeAfterReset = true;
      // มีการ์ด limit ค้างอยู่แล้ว → ไม่ต้องสร้างซ้ำ
      const existing = listQueue('pending').find((q) => q.type === 'limit');
      if (existing) { setPhase('waiting-limit', task); return { waiting: state.waitingLimit, parkedCard: existing.id }; }
      appendRun({ runId, taskId: task.id, event: 'limit-stop', limit: blk.label, pct: blk.pct });
      const rec = park({
        type: 'limit', taskId: task.id, phase: task.phase, title: task.title,
        question: `โควตา AI ใกล้เต็ม — ${blk.label} ใช้ไป ${blk.pct}%${blk.resetAt ? ` · รีเซ็ต ${blk.resetAt}` : ''}\nพักไว้ก่อน แล้ว **จะทำต่อเองอัตโนมัติหลังรีเซ็ต** (ไม่ต้องกดอะไร) — หรือจะแทรกคำสั่งด้านล่าง`,
        options: ['ทำต่อเลยไม่ต้องรอ', 'หยุดไว้ก่อน (ไม่ต้องทำต่อเอง)'],
        resetAt: blk.resetAt || null, pct: blk.pct, limitLabel: blk.label, runId,
      });
      notifyEvent('limit', { task, question: `${blk.label} ${blk.pct}% — พักไว้ จะทำต่อเองหลังรีเซ็ต`, queueId: rec.id, options: rec.options });
      setPhase('waiting-limit', task);
      return { waiting: state.waitingLimit, parkedCard: rec.id };
    }
  }
  state.waitingLimit = null;

  state.running = true;
  state.lastError = null;
  setPhase('planning', task);
  appendRun({ runId, taskId: task.id, event: 'start', branch });

  try {
    // 1) เตรียม branch
    git.clearStaleLocks();
    if (!git.isClean()) {
      const rec0 = recoverDirtyTree(`Phase ${task.id}`);
      if (!rec0.ok) {
        state.running = false;
        const rec = park({ type: 'error', taskId: task.id, phase: task.phase, title: task.title, question: `working tree ไม่สะอาด และกู้อัตโนมัติไม่ได้ — ${rec0.reason}`, runId });
        appendRun({ runId, taskId: task.id, event: 'blocked-dirty', reason: rec0.reason });
        setPhase('parked', task);
        return { parked: rec };
      }
      if (rec0.files.length) {
        appendRun({ runId, taskId: task.id, event: 'auto-wip-commit', head: rec0.head, count: rec0.files.length });
        notify({ title: `🧹 กู้ไฟล์ค้างอัตโนมัติ · Phase ${task.id}`, message: `commit ${rec0.files.length} ไฟล์เป็น WIP (${rec0.head}) แล้วทำงานต่อ`, tags: ['broom'], priority: 'low' });
      }
    }
    git.checkoutBranch(branch, { create: true, from: config.baseBranch });
    const baseHead = git.headHash();

    // 2) รัน claude session
    setPhase('running', task);
    state.liveLog = '';
    state.liveContext = 0;
    state.liveTurns = 0;
    let res = await runClaude(prompt, { onData: (d) => { state.liveLog = (state.liveLog + d).slice(-8000); }, onProgress: onProg, model: modelFor('code', task) });
    writeSessionLog(runId, res.raw || '');
    noteUsage(res);
    appendRun({ runId, taskId: task.id, event: 'claude-done', cost: res.cost, turns: res.turns, tokensIn: res.tokensIn, tokensOut: res.tokensOut, peakContext: res.peakContext, sessionId: res.sessionId, isError: res.isError });

    // ลูปเดินงานต่อเนื่อง: handoff (context ยาว) + auto-answer (ตอบคำถามเองในโหมด Auto)
    let hround = 0, around = 0;
    const streamOpt = { onData: (d) => { state.liveLog = (state.liveLog + d).slice(-8000); }, onProgress: onProg, model: modelFor('code', task) };
    for (;;) {
      if (res.handoff && !res.needsDecision && hround < config.maxHandoffs) {
        hround++;
        state.handoffRound = hround;
        appendRun({ runId, taskId: task.id, event: 'handoff', round: hround, note: (res.handoffText || '').slice(0, 200) });
        state.liveLog = ''; state.liveContext = 0; state.liveTurns = 0;
        res = await runClaude(buildHandoffPrompt(task, res.handoffText, hround), streamOpt);
        writeSessionLog(`${runId}-h${hround}`, res.raw || '');
        noteUsage(res);
        appendRun({ runId, taskId: task.id, event: 'claude-done', cost: res.cost, turns: res.turns, peakContext: res.peakContext, sessionId: res.sessionId, handoffRound: hround });
        continue;
      }
      // โหมด Auto: เจอคำถาม → เลือกตัวที่ agent แนะนำเองแล้วทำต่อ (ไม่หยุดถาม)
      if (res.needsDecision && state.auto && config.autoAnswer && around < config.maxAutoAnswers) {
        around++;
        const answer = pickRecommended(res.options);
        appendRun({ runId, taskId: task.id, event: 'auto-answer', round: around, question: (res.decisionText || '').slice(0, 150), answer: answer.slice(0, 120) });
        notify({ title: `🤖 ตอบเองอัตโนมัติ · Phase ${task.id}`, message: `ถาม: ${(res.decisionText || '').slice(0, 120)}\nตอบ: ${answer}`, tags: ['robot'], priority: 'low' });
        state.liveLog = ''; state.liveContext = 0; state.liveTurns = 0;
        res = await runClaude(buildResumePrompt(task, answer), { ...streamOpt, resumeSessionId: res.sessionId });
        writeSessionLog(`${runId}-a${around}`, res.raw || '');
        noteUsage(res);
        appendRun({ runId, taskId: task.id, event: 'claude-done', cost: res.cost, turns: res.turns, peakContext: res.peakContext, sessionId: res.sessionId, autoAnswerRound: around });
        continue;
      }
      break;
    }
    state.handoffRound = 0;
    if (res.handoff) { // ครบเพดานแล้วยัง handoff = งานใหญ่ผิดปกติ
      state.running = false;
      const rec = park({ type: 'error', taskId: task.id, phase: task.phase, title: task.title, question: `ถ่ายงานเกิน ${config.maxHandoffs} รอบแล้วยังไม่จบ — งานอาจใหญ่เกิน ควรซอย task ใน PROGRESS.md`, sessionId: res.sessionId, branch, runId });
      setPhase('parked', task);
      return { parked: rec };
    }

    // ชน limit กลางรัน → พักไว้ auto-resume (ไม่ park เป็น error)
    if (!res.ok && isLimitHit(res)) {
      state.running = false;
      try { await refreshPlanLimits(); } catch { /* ignore */ }
      const blk2 = limitBlocked() || { label: 'limit', pct: null, resetAt: null };
      state.waitingLimit = { label: blk2.label, pct: blk2.pct, resetAt: blk2.resetAt || null };
      state.resumeAfterReset = true;   // ชนกลางทางก็ทำต่อเองหลังรีเซ็ต
      setPhase('waiting-limit', task);
      appendRun({ runId, taskId: task.id, event: 'limit-hit-midrun' });
      notify({ title: '⏸️ ชนโควตากลางงาน', message: `Phase ${task.id} — จะทำต่อเองหลังรีเซ็ต (อาจมีไฟล์ค้างต้องเก็บกวาด)`, tags: ['warning'], priority: 'high' });
      return { waiting: state.waitingLimit, task };
    }

    // 3) agent ขอให้คนตัดสินใจ
    if (res.needsDecision) {
      state.running = false;
      const rec = park({ type: 'decision', taskId: task.id, phase: task.phase, title: task.title, question: res.decisionText || '(ไม่มีรายละเอียด)', options: res.options || null, sessionId: res.sessionId, branch, runId, cost: res.cost });
      setPhase('parked', task);
      return { parked: rec };
    }
    if (res.error || res.isError) {
      state.running = false;
      const rec = park({ type: 'error', taskId: task.id, phase: task.phase, title: task.title, question: `session ล้มเหลว: ${res.error || 'is_error'}`, sessionId: res.sessionId, branch, runId });
      setPhase('parked', task);
      return { parked: rec };
    }

    // 4) verify (+ auto-repair)
    setPhase('verifying', task);
    let verify = await runVerify();
    appendRun({ runId, taskId: task.id, event: 'verify', ok: verify.ok, results: verify.results.map((r) => ({ name: r.name, ok: r.ok })) });

    let attempts = 0;
    while (!verify.ok && attempts < config.autoRepairAttempts) {
      attempts++;
      setPhase('running', task);
      const repair = buildRepairPrompt(task, verifyFailureSummary(verify));
      res = await runClaude(repair, { resumeSessionId: res.sessionId, onData: (d) => { state.liveLog = (state.liveLog + d).slice(-8000); }, onProgress: onProg, model: modelFor('code', task) });
      noteUsage(res);
      appendRun({ runId, taskId: task.id, event: 'repair', attempt: attempts, needsDecision: res.needsDecision });
      if (res.needsDecision) {
        state.running = false;
        const rec = park({ type: 'decision', taskId: task.id, phase: task.phase, title: task.title, question: res.decisionText, options: res.options || null, sessionId: res.sessionId, branch, runId });
        setPhase('parked', task);
        return { parked: rec };
      }
      setPhase('verifying', task);
      verify = await runVerify();
    }

    if (!verify.ok) {
      state.running = false;
      const rec = park({ type: 'verify_failed', taskId: task.id, phase: task.phase, title: task.title, question: 'verify ไม่ผ่านหลัง auto-repair — ต้องคนดู', detail: verifyFailureSummary(verify), sessionId: res.sessionId, branch, runId });
      setPhase('parked', task);
      return { parked: rec };
    }

    // 5) ถ้าไม่มี commit ใหม่ = agent น่าจะหยุดถาม/รอ plan approval (ไม่ว่าจะใส่ [[NEEDS_DECISION]] หรือไม่)
    //    → เอาข้อความสุดท้ายของ agent มาทำการ์ด decision ให้ตอบต่อได้เสมอ (กันคำถามหายในกล่อง log)
    const commits = git.commitCountSince(config.baseBranch);
    if (commits === 0) {
      state.running = false;
      // agent บอก TASK_DONE ทั้งที่ไม่มี commit = งานนี้เสร็จไปแล้วรอบก่อน (กลไกกันทำซ้ำ) → ไม่ต้องถาม
      if (res.done) {
        git.checkoutBranch(config.baseBranch);
        git.deleteBranch(branch);
        setPhase('idle', null);
        appendRun({ runId, taskId: task.id, event: 'already-done', sessionId: res.sessionId });
        notify({ title: `✅ Phase ${task.id} เสร็จอยู่แล้ว`, message: 'ไม่มีอะไรต้องทำเพิ่ม — ข้ามไปงานถัดไป', tags: ['white_check_mark'], priority: 'low' });
        return { alreadyDone: true, task };
      }
      const q = (res.result || '').trim().slice(-700) || 'agent จบโดยไม่มี commit และไม่มีคำถามชัดเจน — พิมพ์คำสั่งให้ทำต่อ หรือกดข้าม';
      const rec = park({ type: 'decision', taskId: task.id, phase: task.phase, title: task.title, question: q, options: res.options || null, sessionId: res.sessionId, branch, runId });
      setPhase('parked', task);
      return { parked: rec };
    }

    // 6) merge หรือ รอ approve
    if (config.autoMerge) {
      setPhase('merging', task);
      const merged = git.mergeBranch(branch, config.baseBranch);
      git.deleteBranch(branch);
      appendRun({ runId, taskId: task.id, event: 'merged', head: merged, cost: res.cost });
      state.running = false;
      setPhase('idle', null);
      return { merged, task, cost: res.cost };
    } else {
      state.running = false;
      const rec = park({ type: 'merge', taskId: task.id, phase: task.phase, title: task.title, question: `งานเสร็จ verify ผ่าน (${commits} commit บน ${branch}) — กด Approve เพื่อ merge เข้า ${config.baseBranch}`, branch, runId, cost: res.cost });
      setPhase('parked', task);
      return { parked: rec };
    }
  } catch (e) {
    state.running = false;
    state.lastError = e.message;
    appendRun({ runId, taskId: task.id, event: 'exception', message: e.message });
    setPhase('idle', null);
    return { error: e.message };
  }
}

// ปุ่ม "เทสงาน/รีวิว" — รัน session รีวิวโค้ดล่าสุดเทียบเอกสาร แล้วแก้ให้ (report อยู่ใน transcript)
// kind: 'review' (รีวิว diff ตั้งแต่ checkpoint) | 'final' (ทดสอบทั้งระบบ)
export async function runReview(opts = {}) {
  const lk = acquireLock();
  if (!lk.ok) return { skipped: `มี orchestrator อื่นรันอยู่ (pid ${lk.pid})` };
  try { return await runReviewCore(opts); }
  finally { releaseLock(); }
}
async function runReviewCore({ kind = 'review', phase = null, stage = null } = {}) {
  if (state.running) return { skipped: 'already-running' };
  git.clearStaleLocks();
  const isFinal = kind === 'final';
  if (!git.isClean()) {
    const rec0 = recoverDirtyTree(isFinal ? 'Final test' : 'รีวิวโค้ด');
    if (!rec0.ok) {
      const rec = park({ type: 'error', taskId: kind, phase: '-', title: isFinal ? 'Final test' : 'รีวิวโค้ด', question: `working tree ไม่สะอาด และกู้อัตโนมัติไม่ได้ — ${rec0.reason}` });
      notifyEvent('error', { task: { id: kind }, question: rec.question, queueId: rec.id });
      return { parked: rec };
    }
    if (rec0.files.length) notify({ title: '🧹 กู้ไฟล์ค้างอัตโนมัติ', message: `commit ${rec0.files.length} ไฟล์เป็น WIP (${rec0.head})`, tags: ['broom'], priority: 'low' });
  }
  const runId = randomUUID().slice(0, 8);
  const branch = `auto/${isFinal ? 'final' + (stage ? stage : '') : 'review'}-${Date.now().toString(36)}`;
  const task = { id: isFinal ? 'final-test' : 'review', phase: phase || '-', title: isFinal ? `Final test${stage ? ' ด่าน ' + stage + '/4' : ' ทั้งระบบ'}` : `รีวิวโค้ด${phase ? ` Phase ${phase}` : ''}` };
  state.running = true; state.lastError = null;
  setPhase('running', task);
  state.liveLog = ''; state.liveContext = 0; state.liveTurns = 0;
  appendRun({ runId, taskId: 'review', event: 'start', branch });
  const opt = { onData: (d) => { state.liveLog = (state.liveLog + d).slice(-8000); }, onProgress: onProg, model: modelFor('review') };
  try {
    git.checkoutBranch(branch, { create: true, from: config.baseBranch });
    const since = isFinal ? null : getCheckpoint().lastReviewed;   // รีวิวต่อจาก commit ที่เคยตรวจแล้ว
    const headBefore = git.headHash();
    globalThis.__rtbHandoffTarget = activeHandoffTarget();
    let res = await runClaude(isFinal ? buildFinalTestPrompt(stage) : buildReviewPrompt({ since, phase }), opt);
    writeSessionLog(runId, res.raw || ''); noteUsage(res);
    appendRun({ runId, taskId: 'review', event: 'claude-done', cost: res.cost, turns: res.turns, peakContext: res.peakContext, tokensOut: res.tokensOut, sessionId: res.sessionId });
    let hround = 0;
    while (res.handoff && !res.needsDecision && hround < config.maxHandoffs) {
      hround++; state.handoffRound = hround;
      appendRun({ runId, taskId: 'review', event: 'handoff', round: hround, note: (res.handoffText || '').slice(0, 200) });
      state.liveLog = ''; state.liveContext = 0; state.liveTurns = 0;
      res = await runClaude(buildHandoffPrompt(task, res.handoffText, hround), opt);
      writeSessionLog(`${runId}-h${hround}`, res.raw || ''); noteUsage(res);
      appendRun({ runId, taskId: 'review', event: 'claude-done', peakContext: res.peakContext, sessionId: res.sessionId, handoffRound: hround });
    }
    state.handoffRound = 0;
    if (res.needsDecision) {
      state.running = false;
      const rec = park({ type: 'decision', taskId: 'review', phase: '-', title: task.title, question: res.decisionText || '', options: res.options || null, sessionId: res.sessionId, branch, runId, reviewKind: kind, reviewStage: stage });
      notifyEvent('decision', { task: { id: 'review', title: task.title }, question: rec.question, queueId: rec.id, options: rec.options });
      setPhase('parked', task); return { parked: rec };
    }
    const commits = git.commitCountSince(config.baseBranch);
    if (commits === 0) {
      git.checkoutBranch(config.baseBranch); git.deleteBranch(branch);
      setCheckpoint(git.headHash(), kind, phase);   // ผ่านสะอาด = ตรวจถึง HEAD แล้ว
      if (isFinal && stage) markFinalStage(stage);
      state.running = false; setPhase('idle', null);
      appendRun({ runId, taskId: kind, event: 'review-clean', sessionId: res.sessionId });
      notify({ title: isFinal ? '🧪 Final test ผ่านทุกด้าน' : '🔍 รีวิวเสร็จ — ไม่มีจุดต้องแก้', message: (res.result || '').replace(/\n+/g, ' ').slice(-280), tags: ['mag'], priority: 'high' });
      return { reviewClean: true, sessionId: res.sessionId, runId };
    }
    setPhase('verifying', task);
    const verify = await runVerify();
    if (!verify.ok) {
      state.running = false;
      const rec = park({ type: 'verify_failed', taskId: 'review', phase: '-', title: task.title, question: 'รีวิวแก้แล้วแต่ verify ไม่ผ่าน', detail: verifyFailureSummary(verify), sessionId: res.sessionId, branch, runId, reviewKind: kind, reviewStage: stage });
      notifyEvent('verify_failed', { task: { id: 'review', title: task.title }, question: rec.question, queueId: rec.id });
      setPhase('parked', task); return { parked: rec };
    }
    if (config.autoMerge) {
      const merged = git.mergeBranch(branch, config.baseBranch); git.deleteBranch(branch);
      setCheckpoint(merged || headBefore, kind, phase);   // จำไว้ว่าตรวจถึงตรงนี้แล้ว
      if (isFinal && stage) markFinalStage(stage);
      state.running = false; setPhase('idle', null);
      appendRun({ runId, taskId: kind, event: 'merged', head: merged });
      notify({ title: isFinal ? '🧪 Final test + แก้เสร็จ merged' : '🔧 รีวิว+แก้เสร็จ merged', message: (res.result || '').replace(/\n+/g, ' ').slice(-220), tags: ['wrench'], priority: 'high' });
      return { merged, task, review: true };
    }
    state.running = false;
    const rec = park({ type: 'merge', taskId: 'review', phase: '-', title: task.title, question: `รีวิวแก้เสร็จ (${commits} commit) — กด Approve เพื่อ merge`, branch, runId, reviewKind: kind, reviewStage: stage });
    notifyEvent('merge', { task: { id: 'review', title: task.title }, question: rec.question, queueId: rec.id });
    setPhase('parked', task); return { parked: rec };
  } catch (e) {
    state.running = false; state.lastError = e.message; setPhase('idle', null);
    appendRun({ runId, taskId: 'review', event: 'exception', message: e.message });
    return { error: e.message };
  }
}

// แก้ item ที่ park ไว้ (+ ยิงแจ้งเตือนตามผลลัพธ์)
export async function resolveQueueItem(queueId, opts) {
  const lk = acquireLock();
  if (!lk.ok) return { error: `มี orchestrator อื่นรันอยู่ (pid ${lk.pid})` };
  try {
    const r = await resolveCore(queueId, opts);
    try { notifyFromResult(r); } catch { /* ignore */ }
    return r;
  } finally { releaseLock(); }
}

// (decision → resume, merge → merge, verify_failed → resume+verify, error → dismiss/retry)
async function resolveCore(queueId, { answer, action = 'approve' } = {}) {
  const rec = getQueue(queueId);
  if (!rec || rec.status !== 'pending') return { error: 'ไม่พบรายการ หรือถูกจัดการไปแล้ว' };
  const progress = parseProgress();
  const task = { id: rec.taskId, phase: rec.phase, title: rec.title };

  if (action === 'dismiss') {
    updateQueue(queueId, { status: 'resolved', resolvedAt: new Date().toISOString(), resolution: 'dismissed' });
    return { dismissed: true };
  }

  // error type (เช่น working tree ไม่สะอาด / ไม่มี commit) = แก้ที่สภาพแวดล้อม ไม่ใช่ resume claude
  // Approve = เคลียร์รายการแล้วลองรัน task ใหม่ (จะ re-check ว่า tree สะอาดหรือยัง) แบบไม่ block
  // การ์ดโควตาใกล้เต็ม — ผู้ใช้เลือกเอง
  if (rec.type === 'limit') {
    const a = String(answer || '').trim();
    updateQueue(queueId, { status: 'resolved', resolvedAt: new Date().toISOString(), resolution: a || 'wait' });
    if (/หยุดไว้|stop|ไม่ต้องทำต่อ/i.test(a)) {        // หยุดสนิท ไม่ทำต่อเอง
      state.resumeAfterReset = false; state.waitingLimit = null; state.auto = false;
      setPhase('idle', null);
      return { stopped: true };
    }
    if (/ทำต่อ|force|ต่อเลย|ไม่ต้องรอ/i.test(a)) {     // ฝืนทำต่อทันที ไม่รอรีเซ็ต
      state.resumeAfterReset = false; state.waitingLimit = null;
      setPhase('idle', null);
      runOne({ force: true }).catch(() => {});
      return { forcedRun: true };
    }
    // กด Approve เฉย ๆ / ไม่ระบุ = คงพฤติกรรม default (รอรีเซ็ตแล้วทำต่อเอง)
    state.resumeAfterReset = true;
    state.waitingLimit = { label: rec.limitLabel || 'limit', pct: rec.pct ?? null, resetAt: rec.resetAt || null };
    setPhase('waiting-limit', { id: rec.taskId, title: rec.title });
    return { waitingReset: true, waiting: state.waitingLimit };
  }

  if (rec.type === 'error') {
    updateQueue(queueId, { status: 'resolved', resolvedAt: new Date().toISOString(), resolution: 'retry' });
    if (!state.running) runOne().catch(() => {});
    return { retried: true };
  }

  if (rec.type === 'merge') {
    git.clearStaleLocks();
    const merged = git.mergeBranch(rec.branch, config.baseBranch);
    git.deleteBranch(rec.branch);
    updateQueue(queueId, { status: 'resolved', resolvedAt: new Date().toISOString(), resolution: 'merged', head: merged });
    if (rec.reviewKind === 'final' && rec.reviewStage) markFinalStage(rec.reviewStage);   // ด่านนี้ผ่านแล้ว
    appendRun({ runId: rec.runId, taskId: rec.taskId, event: 'merged-approved', head: merged });
    setPhase('idle', null);
    return { merged, task };
  }

  // decision / verify_failed → resume session ด้วยคำตอบ แล้ววน verify+merge
  if (state.running) return { error: 'orchestrator กำลังทำงานอื่นอยู่' };
  state.running = true;
  setPhase('running', task);
  updateQueue(queueId, { status: 'processing', answer: answer || null }); // เอาออกจากคิวทันที ปุ่มจะหาย
  try {
    git.checkoutBranch(rec.branch, { create: !git.branchExists(rec.branch), from: config.baseBranch });
    const prompt = rec.type === 'verify_failed'
      ? buildRepairPrompt(task, `${rec.detail || ''}\n\nคำแนะนำจากผู้ใช้: ${answer || '(ให้แก้ตามดุลยพินิจ)'}`)
      : buildResumePrompt(task, answer || '(ดำเนินการตามค่าเริ่มต้นที่เหมาะสม)');
    const res = await runClaude(prompt, { resumeSessionId: rec.sessionId, onData: (d) => { state.liveLog = (state.liveLog + d).slice(-8000); }, onProgress: onProg, model: modelFor('code', task) });
    writeSessionLog(rec.runId + '-resume', res.raw || '');
    noteUsage(res);
    if (res.needsDecision) {
      state.running = false;
      updateQueue(queueId, { status: 'resolved', resolution: 'reasked' });
      const rec2 = park({ type: 'decision', taskId: task.id, phase: task.phase, title: task.title, question: res.decisionText, options: res.options || null, sessionId: res.sessionId, branch: rec.branch, runId: rec.runId });
      setPhase('parked', task);
      return { parked: rec2 };
    }
    const verify = await runVerify();
    if (!verify.ok) {
      state.running = false;
      updateQueue(queueId, { status: 'resolved', resolution: 'resumed-verify-failed' });
      const rec2 = park({ type: 'verify_failed', taskId: task.id, phase: task.phase, title: task.title, question: 'ยัง verify ไม่ผ่าน', detail: verifyFailureSummary(verify), sessionId: res.sessionId, branch: rec.branch, runId: rec.runId });
      setPhase('parked', task);
      return { parked: rec2 };
    }
    // ยังไม่มี commit ใหม่ = agent ยังไม่เสร็จ (หยุดถามต่อ) → park decision ให้ตอบต่อ ไม่ merge ของว่าง
    const commitsR = git.commitCountSince(config.baseBranch);
    if (commitsR === 0 && !res.done) {
      state.running = false;
      updateQueue(queueId, { status: 'resolved', resolution: 'reasked' });
      const recQ = park({ type: 'decision', taskId: task.id, phase: task.phase, title: task.title, question: (res.result || '').trim().slice(-700) || 'agent ถามต่อ — พิมพ์คำตอบเพื่อทำต่อ หรือกดข้าม', options: res.options || null, sessionId: res.sessionId, branch: rec.branch, runId: rec.runId });
      setPhase('parked', task);
      return { parked: recQ };
    }
    updateQueue(queueId, { status: 'resolved', resolvedAt: new Date().toISOString(), resolution: 'resolved-and-verified' });
    if (rec.reviewKind === 'final' && rec.reviewStage) markFinalStage(rec.reviewStage);   // ด่านนี้ผ่านแล้ว
    if (config.autoMerge) {
      const merged = git.mergeBranch(rec.branch, config.baseBranch);
      git.deleteBranch(rec.branch);
      state.running = false;
      setPhase('idle', null);
      return { merged, task };
    }
    state.running = false;
    const rec3 = park({ type: 'merge', taskId: task.id, phase: task.phase, title: task.title, question: `แก้เสร็จ verify ผ่าน — กด Approve เพื่อ merge`, branch: rec.branch, runId: rec.runId });
    setPhase('parked', task);
    return { parked: rec3 };
  } catch (e) {
    state.running = false;
    state.lastError = e.message;
    setPhase('idle', null);
    return { error: e.message };
  }
}

// วนทำต่อเนื่องจนกว่าจะ park หรือหมดงาน (ใช้โดย server เมื่อเปิด auto)
export async function runLoop() {
  const results = [];
  let lastDoneId = null;   // กันวนซ้ำ: task เดิมขึ้น "เสร็จอยู่แล้ว" สองรอบติด = PROGRESS ไม่ได้อัปเดต
  while (state.auto) {
    const r = await runOne();
    results.push(r);
    if (r.alreadyDone && r.task) {
      if (lastDoneId === r.task.id) {
        const rec = park({ type: 'error', taskId: r.task.id, phase: r.task.phase, title: r.task.title, question: `Phase ${r.task.id} ขึ้น "เสร็จอยู่แล้ว" ซ้ำ 2 รอบ — PROGRESS.md ยังชี้งานนี้อยู่ ต้องแก้ 🎯 งานถัดไป ให้เลื่อนไป task ถัดไป` });
        notifyEvent('error', { task: r.task, question: rec.question, queueId: rec.id });
        setPhase('parked', r.task);
        break;
      }
      lastDoneId = r.task.id;
      continue;
    }
    lastDoneId = null;
    if (r.parked || r.done || r.error || r.skipped || r.waiting) break;

    // จบ Phase → รีวิวอัตโนมัติก่อนไปเฟสถัดไป
    if (r.merged && r.task && config.autoReview.onPhaseEnd) {
      const ph = r.task.phase;
      const only = config.autoReview.onlyPhases;
      const wanted = !only.length || only.includes(ph);
      if (wanted && ph && !phaseReviewed(ph) && phaseCompleted(parseProgress(), ph)) {
        appendRun({ taskId: ph, event: 'auto-review-phase' });
        notify({ title: `🔍 จบ Phase ${ph} — เริ่มรีวิวอัตโนมัติ`, message: '', tags: ['mag'], priority: 'low' });
        const rv = await runReviewCore({ kind: 'review', phase: ph });
        results.push(rv);
        if (rv.parked || rv.error || rv.skipped) break;
      }
    }

    if (!config.autoMerge) break; // ถ้าไม่ auto-merge ต้องรอ approve แต่ละก้อน
  }
  return results;
}

// รัน Final test ทุกด่านเรียงกัน (ข้ามด่านที่ผ่านแล้ว) — หยุดถ้าเจอปัญหา/ชนโควตา
export async function runFinalAll() {
  const lk = acquireLock();
  if (!lk.ok) return { skipped: `มี orchestrator อื่นรันอยู่ (pid ${lk.pid})` };
  const out = [];
  try {
    for (const st of config.finalTestStages) {
      if (finalStageDone(st.key)) { out.push({ stage: st.key, skipped: 'ผ่านแล้ว' }); continue; }
      notify({ title: `🧪 Final test ด่าน ${st.key}/4 — ${st.label}`, message: 'เริ่มทดสอบ', tags: ['test_tube'], priority: 'low' });
      const r = await runReviewCore({ kind: 'final', stage: st.key });
      out.push({ stage: st.key, ...r });
      if (r.parked || r.error || r.skipped || r.waiting) break;   // มีปัญหา/รอโควตา → หยุดไว้ก่อน
    }
    const left = config.finalTestStages.filter((s) => !finalStageDone(s.key));
    if (!left.length) notify({ title: '🎉 Final test ครบทั้ง 4 ด่าน', message: 'ระบบผ่านการทดสอบทั้งหมดแล้ว', tags: ['tada'], priority: 'high' });
    return { stages: out };
  } finally { releaseLock(); }
}

// เฝ้าโหมด Auto: ว่าง + ไม่มีคิวรอคน + ไม่ได้รอ limit → หยิบงานถัดไปเอง
// (กันเคส Auto เปิดค้างแต่ไม่มี loop วิ่ง เช่นหลัง restart หรือหลังกดรันเองทีละก้อน)
export async function autoWatchdog() {
  if (!state.auto || state.running) return;
  if (state.phase === 'waiting-limit' || state.resumeAfterReset) return; // รอ limit → ให้ tryResumeFromLimit จัดการ
  if (listQueue('pending').length) return;                               // มีคำถามค้าง → ต้องให้คนตอบก่อน
  // งาน task หมดแล้ว → เดิน Final test ต่อเอง (ถ้ายังมีด่านค้าง)
  const nextTask = pickNextTask(parseProgress());
  if (!nextTask) {
    if (config.autoFinalTest && config.finalTestStages.some((s) => !finalStageDone(s.key))) {
      appendRun({ taskId: 'final-test', event: 'auto-final-start' });
      runFinalAll().catch(() => {});
    }
    return;
  }
  appendRun({ taskId: '-', event: 'auto-pickup' });
  runLoop().catch(() => {});
}

// เรียกโดย server เป็นระยะ: ถ้ากำลังรอ limit และโควตากลับมาแล้ว → เดินงานต่อเอง
export async function tryResumeFromLimit() {
  // ทำงานแม้ Auto ปิด — ขอแค่เคยพักเพราะ limit (resumeAfterReset)
  if (!state.resumeAfterReset || state.running || state.phase !== 'waiting-limit') return;
  try { await refreshPlanLimits(); } catch { return; }
  const b = limitBlocked();
  if (b) { state.waitingLimit = { label: b.label, pct: b.pct, resetAt: b.resetAt || null }; return; } // ยังไม่รีเซ็ต → อัปเดตให้สด

  // โควตากลับมาแล้ว → เคลียร์การ์ด limit ที่ค้าง แล้วเดินงานต่อเอง
  for (const it of listQueue('pending')) {
    if (it.type === 'limit') updateQueue(it.id, { status: 'resolved', resolvedAt: new Date().toISOString(), resolution: 'auto-resumed' });
  }
  state.resumeAfterReset = false;
  state.waitingLimit = null;
  setPhase('idle', null);
  appendRun({ taskId: '-', event: 'limit-auto-resume' });
  notify({ title: '▶️ โควตารีเซ็ตแล้ว — ทำงานต่ออัตโนมัติ', message: '', tags: ['arrow_forward'], priority: 'high' });
  if (state.auto) runLoop().catch(() => {});
  else runOne().catch(() => {});   // Auto ปิดอยู่ → ทำต่อ 1 ก้อน
}
