import { EVENTS, EventCode, render } from '../catalogue';
import { retryDelayMs } from '../mailer';
import { reminderReached } from '../scheduler';

const DAY = 24 * 60 * 60 * 1000;
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('notification templates', () => {
  it('every event has Arabic, English and Urdu text with the same placeholders', () => {
    for (const [code, def] of Object.entries(EVENTS)) {
      for (const lang of ['ar', 'en', 'ur'] as const) {
        expect(def.title[lang].trim().length).toBeGreaterThan(0);
        expect([code, lang, placeholders(def.title[lang])]).toEqual([code, lang, placeholders(def.title.en)]);
      }
    }
  });

  it('renders in the recipient\'s language', () => {
    expect(render('task.assigned', 'en', { title: 'Strategic plan' }).title).toBe('A task was assigned to you: Strategic plan');
    expect(render('task.assigned', 'ur', { title: 'Strategic plan' }).title).toContain('آپ کو ایک کام');
    expect(render('extension.rejected', 'ar', { title: 'x', reason: 'late' })).toEqual({ title: 'رُفض طلب التمديد: x', reason: 'late' });
    expect(render('task.deadline_reminder' as EventCode, 'en', { title: 'x' }).title).toBe('Reminder: x is due on ');
  });
});

describe('scheduler timing', () => {
  it('picks the reminder threshold just reached, so a late start sends one reminder, not three', () => {
    expect(reminderReached(6 * DAY, [5, 2, 1])).toBeNull();
    expect(reminderReached(4.5 * DAY, [5, 2, 1])).toBe(5);
    expect(reminderReached(0.5 * DAY, [5, 2, 1])).toBe(1);
    expect(reminderReached(0.5 * DAY, [])).toBeNull();
  });

  it('email retries wait 1, 4, then 16 minutes', () => {
    expect([1, 2, 3].map(retryDelayMs)).toEqual([60_000, 240_000, 960_000]);
  });
});
