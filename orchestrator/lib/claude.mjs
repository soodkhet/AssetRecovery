// Wrapper รัน Claude Code แบบ headless — stream-json เพื่อดู output เรียลไทม์บน dashboard
import { spawn } from 'node:child_process';
import { config, REPO_ROOT } from '../config.mjs';

function permissionArgs() {
  if (config.permission === 'bypass') return ['--dangerously-skip-permissions'];
  return ['--permission-mode', config.permission];
}

export function buildArgs(prompt, { resumeSessionId, model } = {}) {
  // stream-json ต้องใช้คู่กับ --verbose ใน print mode (ไม่งั้น CLI จะ error)
  const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose'];
  const m = model || config.model;
  if (m) args.push('--model', m);
  if (resumeSessionId) args.push('--resume', resumeSessionId);
  args.push(...permissionArgs());
  return args;
}

function summarizeInput(input) {
  if (!input || typeof input !== 'object') return '';
  const k = input.file_path || input.path || input.command || input.pattern || input.prompt || '';
  return String(k).slice(0, 80);
}

// รัน 1 session; คืน { ok, result, sessionId, isError, cost, turns, raw, needsDecision, done, decisionText }
export function runClaude(prompt, { resumeSessionId, onData, onProgress, model } = {}) {
  const args = buildArgs(prompt, { resumeSessionId, model });
  let turnCount = 0;
  let modelName = null;
  return new Promise((resolvePromise) => {
    let buf = '';            // buffer บรรทัดที่ยังไม่ครบ
    let raw = '';            // เก็บดิบทั้งหมดลง log
    let sessionId = null;
    let finalResult = null;  // event type 'result'
    let assistantText = '';  // สะสมข้อความ assistant (ใช้ตรวจ sentinel เผื่อ result ว่าง)
    let rateLimits = null;   // best-effort: subscription rate_limits ถ้า response ส่งมา
    let peakContext = 0;     // context สูงสุดที่ session นี้ใช้ (input+cache tokens ต่อ turn)
    let settled = false;
    const env = config.claudeConfigDir ? { ...process.env, CLAUDE_CONFIG_DIR: config.claudeConfigDir } : process.env;
    const child = spawn(config.claudeBin, args, { cwd: REPO_ROOT, env });

    const timer = setTimeout(() => {
      if (!settled) { child.kill('SIGKILL'); finish({ ok: false, error: 'timeout', raw }); }
    }, config.claudeTimeoutMs);

    function finish(extra) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(extra);
    }

    function handleLine(line) {
      if (!line.trim()) return;
      raw += line + '\n';
      let ev;
      try { ev = JSON.parse(line); } catch { if (onData) onData(line + '\n'); return; }
      if (ev.session_id) sessionId = ev.session_id;
      const rl = ev.rate_limits || ev.usage?.rate_limits || ev.message?.usage?.rate_limits;
      if (rl) rateLimits = rl;

      if (ev.type === 'system' && ev.subtype === 'init') {
        if (onData) onData(`[init] session ${String(ev.session_id || '').slice(0, 8)} · tools ${ev.tools?.length || 0}\n`);
      } else if (ev.type === 'assistant') {
        if (ev.message?.model) modelName = ev.message.model;
        const mu = ev.message?.usage;
        if (mu) {
          const ctx = (mu.input_tokens || 0) + (mu.cache_read_input_tokens || 0) + (mu.cache_creation_input_tokens || 0);
          if (ctx > peakContext) peakContext = ctx;
          turnCount++;
          if (onProgress) onProgress({ peakContext, turn: turnCount, model: modelName });
        }
        for (const c of ev.message?.content || []) {
          if (c.type === 'text' && c.text) { assistantText += c.text; if (onData) onData(c.text); }
          else if (c.type === 'tool_use') { if (onData) onData(`\n🔧 ${c.name} ${summarizeInput(c.input)}\n`); }
        }
      } else if (ev.type === 'result') {
        finalResult = ev;
      }
    }

    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); handleLine(line); }
    });
    child.stderr.on('data', (d) => { raw += d; if (onData) onData(String(d)); });
    child.on('error', (e) => finish({ ok: false, error: `spawn: ${e.message}`, raw }));

    child.on('close', () => {
      if (buf.trim()) handleLine(buf);
      const resultText = finalResult?.result ?? assistantText ?? '';
      const out = {
        ok: !!finalResult && finalResult.is_error !== true,
        result: resultText,
        sessionId: finalResult?.session_id ?? sessionId,
        isError: finalResult?.is_error === true,
        cost: finalResult?.total_cost_usd ?? null,
        turns: finalResult?.num_turns ?? null,
        rateLimits,
        raw,
      };
      const fu = finalResult?.usage || {};
      out.tokensIn = (fu.input_tokens || 0) + (fu.cache_read_input_tokens || 0) + (fu.cache_creation_input_tokens || 0) || null;
      out.tokensOut = fu.output_tokens || null;
      out.peakContext = peakContext || out.tokensIn || null;
      out.model = modelName;
      const hay = `${resultText}\n${assistantText}`;
      out.needsDecision = hay.includes(config.needsDecision);
      out.done = hay.includes(config.taskDone);
      out.handoff = hay.includes(config.handoff);
      if (out.handoff) {
        const hi = hay.indexOf(config.handoff);
        out.handoffText = hay.slice(hi + config.handoff.length).split('\n')[0].trim();
      }
      if (out.needsDecision) {
        const i = hay.indexOf(config.needsDecision);
        out.decisionText = hay.slice(i + config.needsDecision.length).split('\n')[0].trim();
        const oi = hay.indexOf(config.options);
        if (oi >= 0) {
          out.options = hay.slice(oi + config.options.length).split('\n')[0].split('|').map((s) => s.trim()).filter(Boolean).slice(0, 4);
        }
      }
      finish(out);
    });
  });
}
