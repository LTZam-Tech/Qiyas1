// Local dummy API for the Qiyas frontend. No database, no real auth.
// Any email/password logs in. Role comes from the email:
//   admin@... -> admin, dean@... -> dean, consultant@... -> consultant, anything else -> employee
// Run: node mock-api/server.mjs   (listens on 8082, where Vite proxies /api)
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.MOCK_PORT || 8082);

// ---------- dummy data ----------
const perspectives = [
  { id: 'p1', code: '1', name_ar: 'القيادة والحوكمة', name_en: 'Leadership & Governance', completion: 78 },
  { id: 'p2', code: '2', name_ar: 'التعليم والتعلم', name_en: 'Teaching & Learning', completion: 64 },
  { id: 'p3', code: '3', name_ar: 'البحث العلمي', name_en: 'Scientific Research', completion: 52 },
  { id: 'p4', code: '4', name_ar: 'التحول الرقمي', name_en: 'Digital Transformation', completion: 41 },
];

const axes = [
  { id: 'a1', code: '1.1', perspective_id: 'p1', name_ar: 'التخطيط الاستراتيجي', name_en: 'Strategic Planning' },
  { id: 'a2', code: '1.2', perspective_id: 'p1', name_ar: 'إدارة المخاطر', name_en: 'Risk Management' },
  { id: 'a3', code: '2.1', perspective_id: 'p2', name_ar: 'البرامج الأكاديمية', name_en: 'Academic Programs' },
  { id: 'a4', code: '2.2', perspective_id: 'p2', name_ar: 'تقييم الطلاب', name_en: 'Student Assessment' },
  { id: 'a5', code: '3.1', perspective_id: 'p3', name_ar: 'الإنتاج البحثي', name_en: 'Research Output' },
  { id: 'a6', code: '4.1', perspective_id: 'p4', name_ar: 'البنية التحتية الرقمية', name_en: 'Digital Infrastructure' },
  { id: 'a7', code: '4.2', perspective_id: 'p4', name_ar: 'الأمن السيبراني', name_en: 'Cybersecurity' },
];

const standards = [
  { id: 's1', code: '1.1.1', axis_id: 'a1', name_ar: 'وجود خطة استراتيجية معتمدة', name_en: 'Approved strategic plan in place' },
  { id: 's2', code: '1.1.2', axis_id: 'a1', name_ar: 'مؤشرات أداء رئيسية مرتبطة بالخطة', name_en: 'KPIs linked to the plan' },
  { id: 's3', code: '1.2.1', axis_id: 'a2', name_ar: 'سجل المخاطر المؤسسية', name_en: 'Institutional risk register' },
  { id: 's4', code: '2.1.1', axis_id: 'a3', name_ar: 'توصيف البرامج والمقررات', name_en: 'Program and course specifications' },
  { id: 's5', code: '2.1.2', axis_id: 'a3', name_ar: 'مراجعة دورية للبرامج', name_en: 'Periodic program review' },
  { id: 's6', code: '2.2.1', axis_id: 'a4', name_ar: 'سياسة التقييم العادل', name_en: 'Fair assessment policy' },
  { id: 's7', code: '3.1.1', axis_id: 'a5', name_ar: 'خطة البحث العلمي', name_en: 'Research plan' },
  { id: 's8', code: '4.1.1', axis_id: 'a6', name_ar: 'استمرارية الخدمات الرقمية', name_en: 'Digital service continuity' },
  { id: 's9', code: '4.2.1', axis_id: 'a7', name_ar: 'سياسة أمن المعلومات', name_en: 'Information security policy' },
  { id: 's10', code: '4.2.2', axis_id: 'a7', name_ar: 'التوعية بالأمن السيبراني', name_en: 'Cybersecurity awareness' },
].map((s) => ({ ...s, title: s.name_ar }));

const users = [
  { id: 'u1', email: 'admin@university.edu', role: 'admin', full_name: 'مدير النظام', full_name_en: 'System Admin' },
  { id: 'u2', email: 'dean@university.edu', role: 'dean', full_name: 'د. خالد العنزي', full_name_en: 'Dr. Khalid Alanazi' },
  { id: 'u3', email: 'consultant@qiyas.sa', role: 'consultant', full_name: 'سارة الشمري', full_name_en: 'Sarah Alshammari' },
  { id: 'u4', email: 'employee@test.com', role: 'employee', full_name: 'محمد الرويلي', full_name_en: 'Mohammed Alruwaili' },
  { id: 'u5', email: 'noura@university.edu', role: 'employee', full_name: 'نورة الحربي', full_name_en: 'Noura Alharbi' },
];

const departments = [
  { id: 'd1', name_ar: 'التحول الرقمي', name_en: 'Digital Transformation' },
  { id: 'd2', name_ar: 'تقنية المعلومات', name_en: 'Information Technology' },
  { id: 'd3', name_ar: 'الشؤون الأكاديمية', name_en: 'Academic Affairs' },
];
const units = [
  { id: 'un1', department_id: 'd1', name_ar: 'وحدة الحوكمة الرقمية', name_en: 'Digital Governance Unit' },
  { id: 'un2', department_id: 'd2', name_ar: 'وحدة البنية التحتية', name_en: 'Infrastructure Unit' },
  { id: 'un3', department_id: 'd3', name_ar: 'وحدة الجودة', name_en: 'Quality Unit' },
];

const stdById = (id) => standards.find((s) => s.id === id);
const userById = (id) => users.find((u) => u.id === id);
const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const makeTask = (n, standardId, assigneeId, status, priority, dueIn) => {
  const s = stdById(standardId);
  const u = userById(assigneeId);
  return {
    id: `t${n}`,
    code: `TSK-${String(n).padStart(3, '0')}`,
    title: `رفع شاهد ${s.code}`,
    standard_id: s.id,
    standard_name: s.name_ar,
    standard_name_ar: s.name_ar,
    standard_name_en: s.name_en,
    requirement_title: s.name_ar,
    req_ar: s.name_ar,
    req_en: s.name_en,
    assigned_to: u.id,
    assigned_to_name: u.full_name,
    assignee_ar: u.full_name,
    assignee_en: u.full_name_en,
    status,
    priority,
    evidence_type: 'file',
    due_date: daysFromNow(dueIn),
    due: daysFromNow(dueIn),
  };
};

let taskSeq = 0;
const tasks = [
  makeTask(++taskSeq, 's1', 'u4', 'active', 'high', 5),
  makeTask(++taskSeq, 's2', 'u5', 'submitted', 'medium', 2),
  makeTask(++taskSeq, 's3', 'u4', 'revision', 'critical', -1),
  makeTask(++taskSeq, 's4', 'u5', 'approved', 'low', 10),
  makeTask(++taskSeq, 's6', 'u4', 'under_review', 'high', 3),
  makeTask(++taskSeq, 's8', 'u5', 'active', 'medium', 14),
  makeTask(++taskSeq, 's9', 'u4', 'submitted', 'critical', 1),
  makeTask(++taskSeq, 's10', 'u5', 'approved', 'medium', 20),
];

const axisOf = (s) => axes.find((a) => a.id === s.axis_id);
const perspOf = (s) => perspectives.find((p) => p.id === axisOf(s).perspective_id);
const makeFile = (standardId, name, status, uploaderId, daysAgo) => {
  const s = stdById(standardId);
  const a = axisOf(s);
  const p = perspOf(s);
  return {
    file_id: randomUUID(),
    submission_id: randomUUID(),
    original_filename: name,
    status,
    standard_code: s.code,
    standard_title: s.name_ar,
    standard_title_en: s.name_en,
    axis_title: a.name_ar,
    axis_title_en: a.name_en,
    domain_title: p.name_ar,
    domain_title_en: p.name_en,
    uploaded_by_name: userById(uploaderId).full_name,
    uploaded_by_name_en: userById(uploaderId).full_name_en,
    uploaded_at: new Date(Date.now() - daysAgo * 86400000).toISOString(),
  };
};
const files = [
  makeFile('s1', 'strategic-plan-2026.pdf', 'approved', 'u4', 12),
  makeFile('s1', 'board-approval.pdf', 'approved', 'u2', 11),
  makeFile('s2', 'kpi-dashboard.xlsx', 'partial', 'u5', 6),
  makeFile('s3', 'risk-register.xlsx', 'non', 'u4', 4),
  makeFile('s4', 'program-specs.docx', 'approved', 'u5', 20),
  makeFile('s6', 'assessment-policy.pdf', 'partial', 'u4', 3),
  makeFile('s9', 'infosec-policy.pdf', 'approved', 'u2', 9),
  makeFile('s10', 'awareness-campaign.png', 'non', 'u5', 1),
];

const notifications = [
  { id: 'n1', type: 'task_assigned', title: 'تم إسناد مهمة جديدة: رفع شاهد 1.1.1', title_en: 'New task assigned: upload evidence for 1.1.1', title_ur: 'نیا کام تفویض کیا گیا: 1.1.1 کا ثبوت اپ لوڈ کریں', body: '', is_read: false, created_at: new Date(Date.now() - 3600e3).toISOString() },
  { id: 'n2', type: 'review_completed', title: 'تم اعتماد شاهد المعيار 2.1.1', title_en: 'Evidence for standard 2.1.1 was approved', title_ur: 'معیار 2.1.1 کا ثبوت منظور ہو گیا', body: '', is_read: false, created_at: new Date(Date.now() - 86400e3).toISOString() },
  { id: 'n3', type: 'sla_warning', title: 'اقترب موعد تسليم المعيار 4.2.1', title_en: 'Standard 4.2.1 is due soon', title_ur: 'معیار 4.2.1 کی آخری تاریخ قریب ہے', body: '', is_read: true, created_at: new Date(Date.now() - 2 * 86400e3).toISOString() },
];

const dashboard = () => {
  const full = files.filter((f) => f.status === 'approved').length;
  const partial = files.filter((f) => f.status === 'partial').length;
  return {
    kpis: { totalStandards: standards.length, fullCompliance: full, partialCompliance: partial, nonCompliance: Math.max(standards.length - full - partial, 0) },
    perspectives: perspectives.map((p) => ({ id: p.id, name: p.name_ar, nameEn: p.name_en, completion: p.completion })),
    activities: [
      { id: 'ac1', type: 'approve', user_ar: 'سارة الشمري', user_en: 'Sarah Alshammari', action_ar: 'اعتمدت شاهد', action_en: 'approved evidence', standard: '2.1.1', time_ar: 'منذ ساعة', time_en: '1 hour ago' },
      { id: 'ac2', type: 'revision', user_ar: 'د. خالد العنزي', user_en: 'Dr. Khalid Alanazi', action_ar: 'طلب تعديل', action_en: 'requested revision', standard: '1.2.1', time_ar: 'منذ 3 ساعات', time_en: '3 hours ago' },
      { id: 'ac3', type: 'submit', user_ar: 'محمد الرويلي', user_en: 'Mohammed Alruwaili', action_ar: 'رفع شاهد', action_en: 'uploaded evidence', standard: '4.2.1', time_ar: 'أمس', time_en: 'yesterday' },
      { id: 'ac4', type: 'reject', user_ar: 'سارة الشمري', user_en: 'Sarah Alshammari', action_ar: 'رفضت شاهد', action_en: 'rejected evidence', standard: '4.2.2', time_ar: 'منذ يومين', time_en: '2 days ago' },
    ],
    alerts: [
      { ar: 'مهمة المعيار 1.2.1 متأخرة', en: 'The task for standard 1.2.1 is overdue', ur: 'معیار 1.2.1 کا کام تاخیر کا شکار ہے' },
      { ar: 'موعد تسليم المعيار 4.2.1 غداً', en: 'Standard 4.2.1 is due tomorrow', ur: 'معیار 4.2.1 کی آخری تاریخ کل ہے' },
    ],
  };
};

// ---------- auth (fake) ----------
const roleFromEmail = (email = '') => {
  const local = String(email).toLowerCase().split('@')[0];
  if (local.includes('admin')) return 'admin';
  if (local.includes('dean')) return 'dean';
  if (local.includes('consult')) return 'consultant';
  return 'employee';
};
const userForEmail = (email) => {
  const known = users.find((u) => u.email.toLowerCase() === String(email).toLowerCase());
  const base = known || { id: 'u-' + Buffer.from(String(email)).toString('hex').slice(0, 8), email, role: roleFromEmail(email), full_name: String(email).split('@')[0], full_name_en: String(email).split('@')[0] };
  return { ...base, roles: [base.role] };
};
const tokenFor = (user) => 'mock.' + Buffer.from(JSON.stringify({ email: user.email })).toString('base64url');
const userFromReq = (req) => {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer mock.')) return null;
  try {
    return userForEmail(JSON.parse(Buffer.from(h.slice(12), 'base64url').toString()).email);
  } catch {
    return null;
  }
};

// ---------- http plumbing ----------
const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
};
const ok = (res, data, headers) => send(res, 200, { success: true, data }, headers);
const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
const json = (buf) => {
  try {
    return JSON.parse(buf.toString() || '{}');
  } catch {
    return {};
  }
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname.replace(/^\/api\/v1/, '').replace(/\/$/, '') || '/';
  const method = req.method;
  console.log(method, url.pathname + url.search);

  if (path === '/health') return send(res, 200, { status: 'ok', mock: true });

  // Auth endpoints that don't need a token
  if (method === 'POST' && path === '/auth/login') {
    const { email } = json(await readBody(req));
    if (!email) return send(res, 400, { success: false, message: 'Email is required' });
    const user = userForEmail(email);
    return ok(res, { accessToken: tokenFor(user), user }, { 'Set-Cookie': `csrfToken=mock-csrf; Path=/; SameSite=Lax` });
  }
  if (method === 'POST' && path === '/auth/logout') return ok(res, {});

  const me = userFromReq(req);
  if (!me) return send(res, 401, { success: false, message: 'Not logged in (mock)' });

  if (method === 'GET' && path === '/auth/me') return ok(res, { user: me });
  if (method === 'GET' && path === '/dashboard/summary') return ok(res, dashboard());
  if (method === 'GET' && path === '/perspectives') return ok(res, { perspectives });
  if (method === 'GET' && path === '/axes') {
    const pid = url.searchParams.get('perspectiveId');
    return ok(res, { axes: pid ? axes.filter((a) => a.perspective_id === pid) : axes });
  }
  if (method === 'GET' && path === '/standards') {
    const aid = url.searchParams.get('axisId');
    return ok(res, { standards: aid ? standards.filter((s) => s.axis_id === aid) : standards });
  }
  let m;
  if (method === 'GET' && (m = path.match(/^\/standards\/([^/]+)$/))) return ok(res, { standard: stdById(m[1]) || null });
  if (method === 'GET' && path === '/users') return ok(res, { users });
  if (method === 'GET' && (m = path.match(/^\/users\/([^/]+)$/))) return ok(res, { user: userById(m[1]) || null });
  if (method === 'GET' && path === '/departments') return ok(res, { departments });
  if (method === 'GET' && path === '/units') return ok(res, { units });

  // Tasks (in-memory, so create/edit/delete work until the server restarts)
  if (method === 'GET' && path === '/tasks') {
    const status = url.searchParams.get('status');
    return ok(res, { tasks: status ? tasks.filter((t) => t.status === status) : tasks });
  }
  if (method === 'POST' && path === '/tasks') {
    const b = json(await readBody(req));
    const s = stdById(b.standardId) || standards[0];
    const u = userById(b.assignedTo) || users[3];
    const t = { ...makeTask(++taskSeq, s.id, u.id, 'active', b.priority || 'medium', 7), title: b.title || `رفع شاهد ${s.code}`, due_date: b.dueDate || daysFromNow(7), due: b.dueDate || daysFromNow(7), evidence_type: b.evidenceType || 'file' };
    tasks.unshift(t);
    return send(res, 201, { success: true, data: { task: t } });
  }
  if ((m = path.match(/^\/tasks\/([^/]+)$/))) {
    const idx = tasks.findIndex((t) => t.id === m[1]);
    if (idx < 0) return send(res, 404, { success: false, message: 'Task not found' });
    if (method === 'GET') return ok(res, { task: tasks[idx] });
    if (method === 'PUT' || method === 'PATCH') {
      tasks[idx] = { ...tasks[idx], ...json(await readBody(req)) };
      return ok(res, { task: tasks[idx] });
    }
    if (method === 'DELETE') {
      tasks.splice(idx, 1);
      return ok(res, {});
    }
  }

  // Evidence
  if (method === 'GET' && path === '/submissions/files') return ok(res, { files });
  if (method === 'POST' && path === '/submissions') {
    const raw = (await readBody(req)).toString('latin1');
    const stdId = (raw.match(/name="standardId"\r\n\r\n([^\r]*)/) || [])[1];
    const names = [...raw.matchAll(/filename="([^"]*)"/g)].map((x) => Buffer.from(x[1], 'latin1').toString('utf8'));
    const s = stdById(stdId) || standards[0];
    names.forEach((n) => files.unshift(makeFile(s.id, n, 'non', users.find((u) => u.email === me.email)?.id || 'u4', 0)));
    return send(res, 201, { success: true, data: { uploaded: names.length } });
  }
  if (method === 'GET' && (m = path.match(/^\/submissions\/([^/]+)\/files\/([^/]+)\/download$/))) {
    const f = files.find((x) => x.file_id === m[2]);
    const text = encodeURIComponent(`Dummy file: ${f?.original_filename || 'unknown'} (Qiyas mock API)`);
    return ok(res, { downloadUrl: `data:text/plain;charset=utf-8,${text}` });
  }

  // Notifications
  if (method === 'GET' && path === '/notifications') return ok(res, { notifications });
  if (method === 'POST' && (m = path.match(/^\/notifications\/([^/]+)\/mark-read$/))) {
    const n = notifications.find((x) => x.id === m[1]);
    if (n) n.is_read = true;
    return ok(res, {});
  }
  if (method === 'POST' && path === '/notifications/mark-all-read') {
    notifications.forEach((n) => (n.is_read = true));
    return ok(res, {});
  }

  return send(res, 404, { success: false, message: `Mock API has no route for ${method} ${path}` });
});

server.listen(PORT, '127.0.0.1', () => console.log(`Qiyas mock API on http://127.0.0.1:${PORT}/api/v1 (any login works)`));
