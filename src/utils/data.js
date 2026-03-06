import { C } from './theme.js';

export const PERSPECTIVES = [
  { id: 1, code: "P1", name: "الحوكمة والاستراتيجية", nameEn: "Governance & Strategy", axes: 3, standards: 12, completion: 78 },
  { id: 2, code: "P2", name: "البنية المؤسسية", nameEn: "Enterprise Architecture", axes: 2, standards: 8, completion: 45 },
  { id: 3, code: "P3", name: "إدارة البيانات", nameEn: "Data Management", axes: 3, standards: 11, completion: 32 },
  { id: 4, code: "P4", name: "البنية التحتية", nameEn: "Infrastructure", axes: 2, standards: 9, completion: 85 },
  { id: 5, code: "P5", name: "الأمن السيبراني", nameEn: "Cybersecurity", axes: 2, standards: 8, completion: 91 },
  { id: 6, code: "P6", name: "الخدمات الرقمية", nameEn: "Digital Services", axes: 3, standards: 12, completion: 55 },
  { id: 7, code: "P7", name: "تجربة المستفيد", nameEn: "Customer Experience", axes: 2, standards: 8, completion: 40 },
  { id: 8, code: "P8", name: "الابتكار", nameEn: "Innovation", axes: 2, standards: 10, completion: 18 },
  { id: 9, code: "P9", name: "استمرارية الأعمال", nameEn: "Business Continuity", axes: 2, standards: 9, completion: 60 },
  { id: 10, code: "P10", name: "الموارد البشرية الرقمية", nameEn: "Digital HR", axes: 2, standards: 8, completion: 72 },
];

export const STANDARDS_SAMPLE = [
  { code: "5.10.1", title: "استخدام أنظمة الموارد الحكومية", titleEn: "Government ERP Systems", status: "partial", reqCount: 6, approved: 3, perspId: 4 },
  { code: "5.10.2", title: "الأنظمة الرقمية لإدارة المشاريع", titleEn: "Project Portfolio Management (PPM)", status: "partial", reqCount: 7, approved: 3, perspId: 4 },
  { code: "5.10.3", title: "نظم إدارة الوثائق والأرشفة الرقمية", titleEn: "DMS / EDRMS", status: "non", reqCount: 14, approved: 0, perspId: 4 },
  { code: "5.10.4", title: "نظم إدارة العلاقة مع المستفيدين", titleEn: "CRM & Contact Center", status: "partial", reqCount: 11, approved: 5, perspId: 6 },
  { code: "5.13.5", title: "حوكمة المنصات الحكومية الرقمية", titleEn: "Raqmi Platform Registration", status: "non", reqCount: 8, approved: 0, perspId: 6 },
  { code: "5.14.3", title: "التكامل في إدارة جودة الخدمات", titleEn: "Service Quality Integration", status: "partial", reqCount: 8, approved: 4, perspId: 6 },
  { code: "5.3.1", title: "تأسيس وحدة البنية المؤسسية", titleEn: "EA Unit Establishment", status: "partial", reqCount: 6, approved: 3, perspId: 2 },
  { code: "5.22.2", title: "تطبيق منهجيات الابتكار", titleEn: "Innovation Methodologies", status: "non", reqCount: 5, approved: 0, perspId: 8 },
  { code: "5.23.1", title: "تطوير الحلول الابتكارية", titleEn: "Innovation Solutions Development", status: "non", reqCount: 4, approved: 0, perspId: 8 },
  { code: "5.9.1", title: "إنشاء نظام استمرارية الأعمال", titleEn: "BCM System Establishment", status: "partial", reqCount: 4, approved: 2, perspId: 9 },
  { code: "5.20.1", title: "استراتيجية الاستفادة من البيانات", titleEn: "Data Strategy & KPIs", status: "partial", reqCount: 7, approved: 3, perspId: 3 },
  { code: "5.6.1", title: "خطة بناء الكفاءات الرقمية", titleEn: "Digital Competency Plan", status: "partial", reqCount: 5, approved: 3, perspId: 10 },
];

export const RECENT_ACTIVITIES = [
  { id: 1, action: "رفع شاهد", user: "أحمد الشمري", standard: "5.10.1", time: "منذ 12 دقيقة", type: "upload" },
  { id: 2, action: "اعتماد شاهد", user: "سارة القحطاني", standard: "5.14.3", time: "منذ 45 دقيقة", type: "approve" },
  { id: 3, action: "طلب مراجعة", user: "خالد المطيري", standard: "5.10.3", time: "منذ ساعتين", type: "revision" },
  { id: 4, action: "رفض شاهد", user: "نورة العتيبي", standard: "5.22.2", time: "منذ 3 ساعات", type: "reject" },
  { id: 5, action: "رفع شاهد", user: "محمد الدوسري", standard: "5.9.1", time: "منذ 5 ساعات", type: "upload" },
];

export const TASKS_DATA = [
  { id: 1, code: "5.10.1", req: "تقرير شهري معتمد — Monthly Operations Report", assignee: "أحمد الشمري", due: "2025-04-15", status: "submitted", priority: "high" },
  { id: 2, code: "5.10.1", req: "لقطة Report History — 3 أشهر متتالية", assignee: "أحمد الشمري", due: "2025-04-15", status: "revision", priority: "high" },
  { id: 3, code: "5.10.3", req: "سياسة إدارة الوثائق — Document Management Policy", assignee: "فهد العنزي", due: "2025-04-20", status: "active", priority: "critical" },
  { id: 4, code: "5.10.3", req: "لقطات نظام الأرشفة — DMS Screenshots", assignee: "فهد العنزي", due: "2025-04-22", status: "active", priority: "critical" },
  { id: 5, code: "5.10.4", req: "وثيقة تكامل CRM-ITSM — Integration Document", assignee: "سارة القحطاني", due: "2025-04-18", status: "approved", priority: "medium" },
  { id: 6, code: "5.13.5", req: "تسجيل المنصات في رقمي — Raqmi Registration", assignee: "خالد المطيري", due: "2025-04-25", status: "active", priority: "critical" },
  { id: 7, code: "5.22.2", req: "وثيقق ورش Design Thinking", assignee: "نورة العتيبي", due: "2025-05-01", status: "active", priority: "high" },
  { id: 8, code: "5.9.1", req: "ميثاق لجنة BCM — BCM Charter", assignee: "محمد الدوسري", due: "2025-04-10", status: "approved", priority: "medium" },
];

export const BADGE_MAP = {
  full: { bg: C.greenLight, color: C.green, label: "التزام كلي" },
  partial: { bg: C.orangeLight, color: C.orange, label: "التزام جزئي" },
  non: { bg: C.redLight, color: C.red, label: "عدم التزام" },
  approved: { bg: C.greenLight, color: C.green, label: "معتمد" },
  submitted: { bg: "#E3F2FD", color: "#1565C0", label: "مُقدَّم" },
  revision: { bg: C.orangeLight, color: C.orange, label: "مراجعة" },
  active: { bg: C.light, color: C.primary, label: "نشط" },
  reject: { bg: C.redLight, color: C.red, label: "مرفوض" },
  critical: { bg: C.redLight, color: C.red, label: "حرج" },
  high: { bg: C.orangeLight, color: C.orange, label: "عالي" },
  medium: { bg: "#E3F2FD", color: "#1565C0", label: "متوسط" },
};

export const NAV_ITEMS = [
  { key: "dashboard", label: "لوحة القيادة", labelEn: "Dashboard", iconKey: "dashboard", isGroup: false },
  
  { 
    key: "management", 
    label: "إدارة المعايير", 
    labelEn: "Standards Management", 
    iconKey: "catalog",
    isGroup: true,
    children: [
      { key: "catalog", label: "فهرس المعايير", labelEn: "Catalog", iconKey: "catalog", isGroup: false },
      { key: "tasks", label: "إدارة المهام", labelEn: "Tasks", iconKey: "tasks", isGroup: false },
    ]
  },

  { 
    key: "evidence", 
    label: "خزنة الأدلة", 
    labelEn: "Evidence Locker", 
    iconKey: "upload",
    isGroup: true,
    children: [
      { key: "evidence", label: "رفع الأدلة", labelEn: "Upload Evidence", iconKey: "upload", isGroup: false },
      { key: "evidence-list", label: "سجل الأدلة", labelEn: "Evidence List", iconKey: "list", isGroup: false },
    ]
  },

  { 
    key: "review", 
    label: "المراجعة والاعتماد", 
    labelEn: "Review & Approval", 
    iconKey: "review",
    isGroup: true,
    children: [
      { key: "review", label: "المراجعات", labelEn: "Reviews", iconKey: "review", isGroup: false },
      { key: "approvals", label: "الاعتمادات", labelEn: "Approvals", iconKey: "check", isGroup: false },
    ]
  },

  { 
    key: "reporting", 
    label: "التقارير والتحليلات", 
    labelEn: "Reports & Analytics", 
    iconKey: "report",
    isGroup: true,
    children: [
      { key: "reports", label: "التقارير", labelEn: "Reports", iconKey: "report", isGroup: false },
      { key: "analytics", label: "التحليلات", labelEn: "Analytics", iconKey: "chart", isGroup: false },
    ]
  },
];