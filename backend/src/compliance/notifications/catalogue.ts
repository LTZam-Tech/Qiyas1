/**
 * Notification event catalogue and message templates in Arabic, English and
 * Urdu (docs/phase1/07-notifications-and-escalation.md §4, BR-NTF-04).
 *
 * Placeholders: {title} task / evidence title, {date} a deadline, {reason} a reason.
 */

export type Language = 'ar' | 'en' | 'ur';
type Text = Record<Language, string>;

export interface EventDefinition {
  /** in-app always; email when true */
  email: boolean;
  title: Text;
}

export const EVENTS = {
  'assignment.published': { email: true, title: { ar: 'إسناد جديد لإدارتكم: {title}', en: 'New assignment for your department: {title}', ur: 'آپ کے شعبے کے لیے نیا کام: {title}' } },
  'task.assigned': { email: true, title: { ar: 'أُسندت إليك مهمة: {title}', en: 'A task was assigned to you: {title}', ur: 'آپ کو ایک کام تفویض کیا گیا: {title}' } },
  'task.reassigned_away': { email: false, title: { ar: 'نُقلت المهمة إلى شخص آخر: {title}', en: 'The task was moved to someone else: {title}', ur: 'کام کسی اور کو منتقل کر دیا گیا: {title}' } },
  'task.escalated': { email: true, title: { ar: 'صُعّدت إليك مهمة: {title}', en: 'A task was escalated to you: {title}', ur: 'ایک کام آپ کو بڑھا دیا گیا: {title}' } },
  'task.escalated_from_you': { email: true, title: { ar: 'صُعّدت مهمتك إلى مديرك: {title}', en: 'Your task was escalated to your manager: {title}', ur: 'آپ کا کام آپ کے مینیجر کو بڑھا دیا گیا: {title}' } },
  'task.escalated_to_self': { email: true, title: { ar: 'تجاوزت مهمتك الموعد النهائي: {title}', en: 'Your task passed its deadline: {title}', ur: 'آپ کا کام آخری تاریخ سے گزر گیا: {title}' } },
  'task.deadline_reminder': { email: true, title: { ar: 'تذكير: موعد تسليم {title} في {date}', en: 'Reminder: {title} is due on {date}', ur: 'یاد دہانی: {title} کی آخری تاریخ {date} ہے' } },
  'task.overdue': { email: true, title: { ar: 'تأخرت المهمة: {title}', en: 'Task overdue: {title}', ur: 'کام تاخیر کا شکار ہے: {title}' } },
  'task.overdue_reminder': { email: true, title: { ar: 'ما زالت المهمة متأخرة: {title}', en: 'Still overdue: {title}', ur: 'کام ابھی تک تاخیر کا شکار ہے: {title}' } },
  'task.manager_action_overdue': { email: true, title: { ar: 'لم تُسند المهمة داخل الإدارة بعد: {title}', en: 'Not yet assigned inside the department: {title}', ur: 'شعبے میں ابھی تک تفویض نہیں ہوا: {title}' } },
  'task.returned_for_rework': { email: true, title: { ar: 'أُعيدت المهمة للتعديل: {title}', en: 'Returned for rework: {title}', ur: 'ترمیم کے لیے واپس: {title}' } },
  'task.completed': { email: false, title: { ar: 'اكتملت المهمة: {title}', en: 'Task completed: {title}', ur: 'کام مکمل ہو گیا: {title}' } },
  'task.cancelled': { email: true, title: { ar: 'أُلغيت المهمة: {title}', en: 'Task cancelled: {title}', ur: 'کام منسوخ کر دیا گیا: {title}' } },
  'clarification.requested': { email: true, title: { ar: 'طلب توضيح جديد: {title}', en: 'New clarification request: {title}', ur: 'وضاحت کی نئی درخواست: {title}' } },
  'clarification.answered': { email: true, title: { ar: 'تمت الإجابة على طلب التوضيح: {title}', en: 'Your clarification was answered: {title}', ur: 'آپ کی وضاحت کا جواب دے دیا گیا: {title}' } },
  'clarification.answered_by_manager': { email: false, title: { ar: 'أجاب مدير الإدارة على طلب توضيح: {title}', en: 'A department manager answered a clarification: {title}', ur: 'شعبے کے مینیجر نے وضاحت کا جواب دیا: {title}' } },
  'clarification.reminder': { email: true, title: { ar: 'تذكير: طلب توضيح بانتظار الرد: {title}', en: 'Reminder: a clarification is waiting for an answer: {title}', ur: 'یاد دہانی: ایک وضاحت جواب کی منتظر ہے: {title}' } },
  'clarification.overdue': { email: true, title: { ar: 'تأخر الرد على طلب توضيح: {title}', en: 'Clarification answer overdue: {title}', ur: 'وضاحت کا جواب تاخیر کا شکار ہے: {title}' } },
  'extension.asked': { email: true, title: { ar: 'طلب موظف وقتًا إضافيًا: {title}', en: 'An employee asked for more time: {title}', ur: 'ایک ملازم نے مزید وقت مانگا: {title}' } },
  'extension.ask_declined': { email: true, title: { ar: 'رُفض طلبك للوقت الإضافي: {title}', en: 'Your request for more time was declined: {title}', ur: 'مزید وقت کی آپ کی درخواست مسترد ہو گئی: {title}' } },
  'extension.requested': { email: true, title: { ar: 'طلب تمديد بانتظار قرارك: {title}', en: 'Extension request awaiting your decision: {title}', ur: 'توسیع کی درخواست آپ کے فیصلے کی منتظر ہے: {title}' } },
  'extension.approved': { email: true, title: { ar: 'اعتُمد التمديد حتى {date}: {title}', en: 'Extension approved until {date}: {title}', ur: '{date} تک توسیع منظور: {title}' } },
  'extension.rejected': { email: true, title: { ar: 'رُفض طلب التمديد: {title}', en: 'Extension rejected: {title}', ur: 'توسیع کی درخواست مسترد: {title}' } },
  'extension.decision_overdue': { email: true, title: { ar: 'تأخر القرار في طلب تمديد: {title}', en: 'Extension decision overdue: {title}', ur: 'توسیع کا فیصلہ تاخیر کا شکار ہے: {title}' } },
  'evidence.submitted': { email: false, title: { ar: 'أدلة جديدة بانتظار المراجعة: {title}', en: 'New evidence waiting for review: {title}', ur: 'نیا ثبوت جائزے کا منتظر ہے: {title}' } },
  'evidence.review_reminder': { email: true, title: { ar: 'تذكير: مراجعة مستحقة في {date}: {title}', en: 'Reminder: review due on {date}: {title}', ur: 'یاد دہانی: جائزے کی آخری تاریخ {date}: {title}' } },
  'evidence.review_overdue': { email: true, title: { ar: 'تأخرت مراجعة الدليل: {title}', en: 'Evidence review overdue: {title}', ur: 'ثبوت کا جائزہ تاخیر کا شکار ہے: {title}' } },
  'evidence.accepted': { email: false, title: { ar: 'قُبل الدليل: {title}', en: 'Evidence accepted: {title}', ur: 'ثبوت منظور ہو گیا: {title}' } },
  'evidence.rejected': { email: true, title: { ar: 'رُفض الدليل: {title}', en: 'Evidence rejected: {title}', ur: 'ثبوت مسترد ہو گیا: {title}' } },
  'evidence.quarantined': { email: true, title: { ar: 'حُجز ملف بسبب فحص الفيروسات: {title}', en: 'A file was quarantined by the virus scan: {title}', ur: 'وائرس اسکین نے ایک فائل روک دی: {title}' } },
  'submission.ready': { email: false, title: { ar: 'دليل مقبول جاهز للرفع على منصة الهيئة: {title}', en: 'Accepted evidence ready to post to DGA: {title}', ur: 'منظور شدہ ثبوت DGA پر پوسٹ کرنے کے لیے تیار: {title}' } },
  'submission.reminder': { email: true, title: { ar: 'تذكير: رفع الدليل مستحق في {date}: {title}', en: 'Reminder: posting due on {date}: {title}', ur: 'یاد دہانی: پوسٹ کرنے کی آخری تاریخ {date}: {title}' } },
  'submission.overdue': { email: true, title: { ar: 'تأخر رفع الدليل على منصة الهيئة: {title}', en: 'Posting to DGA overdue: {title}', ur: 'DGA پر پوسٹ کرنا تاخیر کا شکار ہے: {title}' } },
  'submission.posted_changed': { email: true, title: { ar: 'تغيّر دليل مرفوع على منصة الهيئة ويحتاج إعادة رفع: {title}', en: 'Posted evidence changed and needs re-posting: {title}', ur: 'پوسٹ شدہ ثبوت بدل گیا، دوبارہ پوسٹ کرنا ہو گا: {title}' } },
  'cycle.opened': { email: true, title: { ar: 'بدأت دورة القياس: {title}', en: 'Measurement cycle opened: {title}', ur: 'پیمائش کا دور شروع ہو گیا: {title}' } },
  'cycle.closed': { email: true, title: { ar: 'أُغلقت دورة القياس: {title}', en: 'Measurement cycle closed: {title}', ur: 'پیمائش کا دور بند ہو گیا: {title}' } },
} as const satisfies Record<string, EventDefinition>;

export type EventCode = keyof typeof EVENTS;

export interface Rendered {
  title: string;
  reason?: string;
}

/** Fills a template in the recipient's language; unknown placeholders are left empty. */
export function render(code: EventCode, language: Language, payload: Record<string, unknown>): Rendered {
  const tpl = EVENTS[code].title[language] ?? EVENTS[code].title.ar;
  const title = tpl.replace(/\{(\w+)\}/g, (_, k: string) => (payload[k] == null ? '' : String(payload[k])));
  return payload.reason ? { title, reason: String(payload.reason) } : { title };
}
