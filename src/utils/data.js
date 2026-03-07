import { C } from './theme.js';

export const PERSPECTIVES = [
  { id: 1, code: "D1", name: "الاستراتيجية والتخطيط", nameEn: "Strategy & Planning", axes: 3, standards: 7, completion: 65 },
  { id: 2, code: "D2", name: "المصلحة ومنافعها", nameEn: "Interest & Benefits", axes: 2, standards: 3, completion: 72 },
  { id: 3, code: "D3", name: "العمليات والتشغيل", nameEn: "Operations & Execution", axes: 2, standards: 4, completion: 58 },
  { id: 4, code: "D4", name: "إدارة المظاهر واستراتيجية الأصول", nameEn: "Aspects Management & Assets Strategy", axes: 3, standards: 5, completion: 70 },
  { id: 5, code: "D5", name: "هيئة المعلومات", nameEn: "Information Authority", axes: 2, standards: 4, completion: 55 },
  { id: 6, code: "D6", name: "الهيكلية الشاملة", nameEn: "Comprehensive Structure", axes: 2, standards: 3, completion: 68 },
  { id: 7, code: "D7", name: "الأفراد والتحليلات", nameEn: "Individuals & Analytics", axes: 2, standards: 4, completion: 62 },
  { id: 8, code: "D8", name: "مركزية الاستعداد", nameEn: "Centralized Preparedness", axes: 2, standards: 3, completion: 48 },
  { id: 9, code: "D9", name: "البيانات الحكومية", nameEn: "Government Data", axes: 1, standards: 2, completion: 75 },
  { id: 10, code: "D10", name: "البحث والتكرار", nameEn: "Research & Iteration", axes: 2, standards: 3, completion: 52 },
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
  { id: 7, code: "5.22.2", req: "وثيقة ورش Design Thinking", assignee: "نورة العتيبي", due: "2025-05-01", status: "active", priority: "high" },
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

// Axes - intermediate level between perspectives and standards
export const AXES = [
  // Perspective 1 - الاستراتيجية والتخطيط (3 axes)
  { id: 1, code: "A1.1", name: "التخطيط الاستراتيجي", nameEn: "Strategic Planning", perspId: 1 },
  { id: 2, code: "A1.2", name: "تنفيذ الاستراتيجية", nameEn: "Strategy Implementation", perspId: 1 },
  { id: 3, code: "A1.3", name: "المراجعة والتقييم", nameEn: "Review & Evaluation", perspId: 1 },
  
  // Perspective 2 - المصلحة ومنافعها (2 axes)
  { id: 4, code: "A2.1", name: "تحديد المصالح", nameEn: "Interest Identification", perspId: 2 },
  { id: 5, code: "A2.2", name: "إدارة المنافع", nameEn: "Benefits Management", perspId: 2 },
  
  // Perspective 3 - العمليات والتشغيل (2 axes)
  { id: 6, code: "A3.1", name: "العمليات التشغيلية", nameEn: "Operational Processes", perspId: 3 },
  { id: 7, code: "A3.2", name: "إدارة الأداء", nameEn: "Performance Management", perspId: 3 },
  
  // Perspective 4 - إدارة المظاهر واستراتيجية الأصول (3 axes)
  { id: 8, code: "A4.1", name: "إدارة المظاهر", nameEn: "Aspects Management", perspId: 4 },
  { id: 9, code: "A4.2", name: "استراتيجية الأصول", nameEn: "Assets Strategy", perspId: 4 },
  { id: 10, code: "A4.3", name: "التخطيط والتنفيذ", nameEn: "Planning & Execution", perspId: 4 },
  
  // Perspective 5 - هيئة المعلومات (2 axes)
  { id: 11, code: "A5.1", name: "إدارة المعلومات", nameEn: "Information Management", perspId: 5 },
  { id: 12, code: "A5.2", name: "أمن المعلومات", nameEn: "Information Security", perspId: 5 },
  
  // Perspective 6 - الهيكلية الشاملة (2 axes)
  { id: 13, code: "A6.1", name: "البنية التنظيمية", nameEn: "Organizational Structure", perspId: 6 },
  { id: 14, code: "A6.2", name: "الحوكمة والرقابة", nameEn: "Governance & Control", perspId: 6 },
  
  // Perspective 7 - الأفراد والتحليلات (2 axes)
  { id: 15, code: "A7.1", name: "إدارة الموارد البشرية", nameEn: "Human Resources Management", perspId: 7 },
  { id: 16, code: "A7.2", name: "التحليلات والتطوير", nameEn: "Analytics & Development", perspId: 7 },
  
  // Perspective 8 - مركزية الاستعداد (2 axes)
  { id: 17, code: "A8.1", name: "التخطيط للاستعداد", nameEn: "Preparedness Planning", perspId: 8 },
  { id: 18, code: "A8.2", name: "إدارة الطوارئ", nameEn: "Emergency Management", perspId: 8 },
  
  // Perspective 9 - البيانات الحكومية (1 axis)
  { id: 19, code: "A9.1", name: "إدارة البيانات", nameEn: "Data Management", perspId: 9 },
  
  // Perspective 10 - البحث والتكرار (2 axes)
  { id: 20, code: "A10.1", name: "البحث والتطوير", nameEn: "Research & Development", perspId: 10 },
  { id: 21, code: "A10.2", name: "التحسين المستمر", nameEn: "Continuous Improvement", perspId: 10 },
];

// Enhanced standards with metrics
export const STANDARDS_HIERARCHY = [
  // Perspective 1 - الاستراتيجية والاحتياجية (7 standards)
  { id: 1, code: "1.1.1", title: "وضع الخطة الاستراتيجية", titleEn: "Strategic Plan Development", axisId: 1, metrics: { total: 8, approved: 6, pending: 1, rejected: 1 } },
  { id: 2, code: "1.1.2", title: "مراجعة الأهداف الاستراتيجية", titleEn: "Strategic Objectives Review", axisId: 1, metrics: { total: 5, approved: 3, pending: 2, rejected: 0 } },
  { id: 3, code: "1.2.1", title: "تحديد الاحتياجات الأساسية", titleEn: "Basic Needs Identification", axisId: 2, metrics: { total: 6, approved: 5, pending: 0, rejected: 1 } },
  { id: 4, code: "1.2.2", title: "دراسة الفجوات", titleEn: "Gap Analysis", axisId: 2, metrics: { total: 7, approved: 4, pending: 2, rejected: 1 } },
  { id: 5, code: "1.3.1", title: "آلية التقييم الدوري", titleEn: "Periodic Evaluation Mechanism", axisId: 3, metrics: { total: 10, approved: 8, pending: 1, rejected: 1 } },
  { id: 6, code: "1.3.2", title: "تقارير المتابعة", titleEn: "Follow-up Reports", axisId: 3, metrics: { total: 6, approved: 3, pending: 2, rejected: 1 } },
  { id: 7, code: "1.3.3", title: "مؤشرات الأداء", titleEn: "Performance Indicators", axisId: 3, metrics: { total: 4, approved: 3, pending: 1, rejected: 0 } },
  
  // Perspective 2 - السياسة وتحاكمها (3 standards)
  { id: 8, code: "2.1.1", title: "إعداد السياسات العامة", titleEn: "General Policies Preparation", axisId: 4, metrics: { total: 9, approved: 7, pending: 1, rejected: 1 } },
  { id: 9, code: "2.1.2", title: "اعتماد السياسات", titleEn: "Policy Approval", axisId: 4, metrics: { total: 6, approved: 4, pending: 1, rejected: 1 } },
  { id: 10, code: "2.2.1", title: "آليات الحوكمة", titleEn: "Governance Mechanisms", axisId: 5, metrics: { total: 4, approved: 2, pending: 2, rejected: 0 } },
  
  // Perspective 3 - الفعاليات وأنشطتها (4 standards)
  { id: 11, code: "3.1.1", title: "جدولة الفعاليات", titleEn: "Events Scheduling", axisId: 6, metrics: { total: 8, approved: 5, pending: 2, rejected: 1 } },
  { id: 12, code: "3.1.2", title: "تنسيق الفعاليات", titleEn: "Events Coordination", axisId: 6, metrics: { total: 7, approved: 4, pending: 2, rejected: 1 } },
  { id: 13, code: "3.2.1", title: "تخطيط الأنشطة", titleEn: "Activities Planning", axisId: 7, metrics: { total: 5, approved: 3, pending: 1, rejected: 1 } },
  { id: 14, code: "3.2.2", title: "تقييم الأنشطة", titleEn: "Activities Evaluation", axisId: 7, metrics: { total: 6, approved: 4, pending: 1, rejected: 1 } },
  
  // Perspective 4 - إدارة المظاهر واستراتيجيتها وتنفيذها (5 standards)
  { id: 15, code: "4.1.1", title: "رصد المظاهر", titleEn: "Aspects Monitoring", axisId: 8, metrics: { total: 9, approved: 6, pending: 2, rejected: 1 } },
  { id: 16, code: "4.1.2", title: "تحليل المظاهر", titleEn: "Aspects Analysis", axisId: 8, metrics: { total: 4, approved: 3, pending: 0, rejected: 1 } },
  { id: 17, code: "4.2.1", title: "الاستراتيجية التشغيلية", titleEn: "Operational Strategy", axisId: 9, metrics: { total: 7, approved: 5, pending: 1, rejected: 1 } },
  { id: 18, code: "4.3.1", title: "خطة التنفيذ", titleEn: "Implementation Plan", axisId: 10, metrics: { total: 5, approved: 3, pending: 1, rejected: 1 } },
  { id: 19, code: "4.3.2", title: "متابعة التنفيذ", titleEn: "Implementation Follow-up", axisId: 10, metrics: { total: 6, approved: 4, pending: 1, rejected: 1 } },
  
  // Perspective 5 - هيئة المنقذات (4 standards)
  { id: 20, code: "5.1.1", title: "بروتوكولات الإنقاذ", titleEn: "Rescue Protocols", axisId: 11, metrics: { total: 8, approved: 6, pending: 1, rejected: 1 } },
  { id: 21, code: "5.1.2", title: "استجابة الطوارئ", titleEn: "Emergency Response", axisId: 11, metrics: { total: 10, approved: 7, pending: 2, rejected: 1 } },
  { id: 22, code: "5.2.1", title: "برامج التدريب", titleEn: "Training Programs", axisId: 12, metrics: { total: 5, approved: 3, pending: 1, rejected: 1 } },
  { id: 23, code: "5.2.2", title: "تأهيل المنقذين", titleEn: "Rescuers Qualification", axisId: 12, metrics: { total: 4, approved: 2, pending: 1, rejected: 1 } },
  
  // Perspective 6 - الهيكلية المتحاسمة (3 standards)
  { id: 24, code: "6.1.1", title: "الهيكل التنظيمي", titleEn: "Organizational Chart", axisId: 13, metrics: { total: 6, approved: 4, pending: 1, rejected: 1 } },
  { id: 25, code: "6.1.2", title: "تحديد المسؤوليات", titleEn: "Responsibilities Definition", axisId: 13, metrics: { total: 7, approved: 5, pending: 1, rejected: 1 } },
  { id: 26, code: "6.2.1", title: "نظام المحاسبة", titleEn: "Accountability System", axisId: 14, metrics: { total: 5, approved: 3, pending: 2, rejected: 0 } },
  
  // Perspective 7 - الأفراد وتحليلها (4 standards)
  { id: 27, code: "7.1.1", title: "التوظيف والاستقطاب", titleEn: "Recruitment", axisId: 15, metrics: { total: 8, approved: 5, pending: 2, rejected: 1 } },
  { id: 28, code: "7.1.2", title: "تقييم الأداء الوظيفي", titleEn: "Performance Appraisal", axisId: 15, metrics: { total: 6, approved: 4, pending: 1, rejected: 1 } },
  { id: 29, code: "7.2.1", title: "تحليل الكفاءات", titleEn: "Competency Analysis", axisId: 16, metrics: { total: 4, approved: 2, pending: 1, rejected: 1 } },
  { id: 30, code: "7.2.2", title: "خطط التطوير", titleEn: "Development Plans", axisId: 16, metrics: { total: 5, approved: 3, pending: 2, rejected: 0 } },
  
  // Perspective 8 - مركز استعاد (3 standards)
  { id: 31, code: "8.1.1", title: "خطة الاستعداد", titleEn: "Preparedness Plan", axisId: 17, metrics: { total: 7, approved: 4, pending: 2, rejected: 1 } },
  { id: 32, code: "8.1.2", title: "اختبارات الجاهزية", titleEn: "Readiness Tests", axisId: 17, metrics: { total: 6, approved: 3, pending: 2, rejected: 1 } },
  { id: 33, code: "8.2.1", title: "إدارة موارد المركز", titleEn: "Center Resources Management", axisId: 18, metrics: { total: 5, approved: 3, pending: 1, rejected: 1 } },
  
  // Perspective 9 - الإقامة الفقهيه (2 standards)
  { id: 34, code: "9.1.1", title: "الفتاوى والأحكام", titleEn: "Fatwas & Rulings", axisId: 19, metrics: { total: 9, approved: 7, pending: 1, rejected: 1 } },
  { id: 35, code: "9.1.2", title: "التطبيق الفقهي", titleEn: "Jurisprudence Application", axisId: 19, metrics: { total: 4, approved: 3, pending: 0, rejected: 1 } },
  
  // Perspective 10 - البيت والتكرار (3 standards)
  { id: 36, code: "10.1.1", title: "إدارة المنشآت السكنية", titleEn: "Residential Facilities Management", axisId: 20, metrics: { total: 6, approved: 4, pending: 1, rejected: 1 } },
  { id: 37, code: "10.2.1", title: "جدول الصيانة الدورية", titleEn: "Periodic Maintenance Schedule", axisId: 21, metrics: { total: 5, approved: 3, pending: 1, rejected: 1 } },
  { id: 38, code: "10.2.2", title: "تقييم التكرار", titleEn: "Repetition Evaluation", axisId: 21, metrics: { total: 4, approved: 2, pending: 2, rejected: 0 } },
];

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

  { key: "error-logs", label: "سجل الأخطاء", labelEn: "Error Logs", iconKey: "error", isGroup: false },
];