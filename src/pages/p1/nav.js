// Phase 1 navigation, built from the signed-in person's roles and permissions (docs/phase1/02).

const item = (key, label, labelEn, labelUr, iconKey, visible) => ({ key, label, labelEn, labelUr, iconKey, isGroup: false, visible });
const group = (key, label, labelEn, labelUr, children) => ({ key, label, labelEn, labelUr, isGroup: true, children });

export const NAV = [
  item('home', 'الرئيسية', 'Home', 'ہوم', 'dashboard', () => true),
  group('group-work', 'العمل', 'Work', 'کام کاج', [
    item('tasks', 'المهام', 'Tasks', 'کام', 'tasks', (s) => s.can('task.view')),
    item('inbox', 'الطلبات الواردة', 'Inbox', 'موصول درخواستیں', 'inbox', (s) => s.hasRole('QC') || s.hasRole('DM')),
    item('review', 'مراجعة الأدلة', 'Evidence review', 'ثبوت کا جائزہ', 'shield', (s) => s.can('review.decide')),
  ]),
  group('group-compliance', 'الامتثال', 'Compliance', 'تعمیل', [
    item('cycles', 'دورات القياس', 'Measurement cycles', 'پیمائشی ادوار', 'calendar', (s) => s.can('cycle.manage')),
    item('catalogue', 'المعايير والجاهزية', 'Standards & readiness', 'معیارات اور تیاری', 'catalog', (s) => s.can('framework.view')),
    item('submission', 'الرفع على منصة الهيئة', 'DGA submission', 'DGA پر جمع کرانا', 'upload', (s) => s.can('submission.view_queue')),
    item('bank', 'بنك الأدلة', 'Evidence bank', 'ثبوت کا بینک', 'archive', (s) => s.can('bank.search_history')),
    item('library', 'مكتبة الأنظمة والأدلة', 'Regulations library', 'قوانین کی لائبریری', 'bookmarkIcon', (s) => s.can('library.view')),
    item('reports', 'التقارير', 'Reports', 'رپورٹس', 'chart', (s) => s.can('report.generate') || s.hasRole('ADM')),
  ]),
  group('group-system', 'النظام', 'System', 'سسٹم', [
    item('admin', 'الإدارة', 'Administration', 'انتظامیہ', 'settings', (s) => s.can('admin.users')),
    item('error-logs', 'سجل الأخطاء', 'Error log', 'غلطیوں کا ریکارڈ', 'alertCircle', (s) => s.can('admin.settings')),
  ]),
];

/** Pages reachable without a menu entry. */
export const HIDDEN_PAGES = {
  task: { key: 'task', label: 'تفاصيل المهمة', labelEn: 'Task', labelUr: 'کام کی تفصیل', parent: 'tasks' },
};

export function navFor(session) {
  return NAV.map((n) => (n.isGroup ? { ...n, children: n.children.filter((c) => c.visible(session)) } : n))
    .filter((n) => (n.isGroup ? n.children.length > 0 : n.visible(session)));
}

export function allowedKeys(nav) {
  const keys = new Set(nav.flatMap((n) => (n.isGroup ? n.children.map((c) => c.key) : [n.key])));
  if (keys.has('tasks')) keys.add('task');
  return keys;
}

export function findEntry(nav, key) {
  for (const n of nav) {
    if (n.key === key) return { item: n, group: null };
    const c = n.children?.find((x) => x.key === key);
    if (c) return { item: c, group: n };
  }
  if (HIDDEN_PAGES[key]) {
    const parent = findEntry(nav, HIDDEN_PAGES[key].parent);
    return { item: HIDDEN_PAGES[key], group: parent.group };
  }
  return { item: nav[0], group: null };
}
