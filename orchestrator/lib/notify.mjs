// แจ้งเตือนมือถือผ่าน ntfy (JSON publishing) — fire-and-forget
import { config } from '../config.mjs';

function dashUrl() {
  const n = config.notify;
  if (n.dashboardUrl) return n.dashboardUrl;
  if (n.apiBase && n.token) return `${n.apiBase}/?token=${encodeURIComponent(n.token)}`;
  if (n.apiBase) return n.apiBase;
  return '';
}

// opts: { title, message, tags:[], priority, view:bool, approve:queueId }
// ntfy JSON publishing ต้องใช้ priority เป็นตัวเลข 1-5 (string จะถูกมองข้าม → ตกเป็น 3 ไม่มีเสียง)
const PRIO = { min: 1, low: 2, default: 3, high: 4, urgent: 5, max: 5 };

export function notify(opts = {}) {
  const n = config.notify;
  if (!n.topic) return;                 // ยังไม่ตั้งค่า = ปิด
  const url = dashUrl();
  const body = {
    topic: n.topic,
    title: opts.title || 'RTB',
    message: opts.message || '',
    priority: typeof opts.priority === 'number' ? opts.priority : (PRIO[opts.priority] || 3),
    tags: opts.tags || [],
  };
  const canHttp = n.apiBase && n.token;
  const httpAction = (label, payload) => ({
    action: 'http', label: String(label).slice(0, 24), url: `${n.apiBase}/api/approve`, method: 'POST',
    headers: { 'x-dash-token': n.token, 'content-type': 'application/json' },
    body: JSON.stringify(payload), clear: true,
  });
  const actions = [];  // ntfy จำกัด 3 ปุ่ม
  // ปุ่มตัวเลือก (decision) มาก่อน
  if (opts.options && opts.options.length && opts.queueId && canHttp) {
    for (const opt of opts.options.slice(0, 3)) actions.push(httpAction(opt, { queueId: opts.queueId, answer: opt, action: 'approve' }));
  }
  // ปุ่ม Approve (merge)
  if (opts.approve && canHttp && actions.length < 3) actions.push(httpAction('✓ Approve', { queueId: opts.approve, action: 'approve' }));
  // ปุ่มเปิด dashboard เติมถ้ายังมีที่
  if (url && actions.length < 3) actions.push({ action: 'view', label: 'เปิด Dashboard', url });
  if (url) body.click = url;
  if (actions.length) body.actions = actions;

  fetch(n.server, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    .catch(() => {});
}
