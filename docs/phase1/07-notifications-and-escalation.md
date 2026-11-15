# 07 · Notification & Escalation Rules — Phase 1

[← Index](README.md)

Everything in this document is **configuration** (`SLA_POLICIES`, `NOTIFICATION_RULES`, `WORK_CALENDAR`). The values shown are proposed defaults for the first installation.

## 1. Deadline (SLA) types

Every operational role has deadlines (decision 4). Durations are in **business days** per the work calendar (weekends and public holidays excluded).

| Timer kind | Responsible | Starts when | Stops when | Default duration | Reminders before due | Escalation (notification) after breach |
|---|---|---|---|---|---|---|
| `manager_assignment` | DM | Assignment published to department | Task assigned to an executor | 2 days | 1 day | QC immediately |
| `implementation` | Current owner | Task assigned | Task completed | **Set by QC per assignment** | 5, 2, 1 days | **Automatic task escalation to DM** (see §3) at threshold. **Paused** while a clarification is open (D1) and while evidence waits for review (D5) |
| `clarification_response` | QC | Clarification opened / follow-up | Answered by QC, or by DM for an employee's request (D4) | 3 days | 1 day | Compliance Oversight group |
| `extension_decision` | QC | Extension requested | Approved / rejected | 2 days | 1 day | Compliance Oversight group |
| `review` | QC | Link submitted | Accepted / rejected (with feedback) — one deadline (D5) | 5 days | 2, 1 days | Compliance Oversight group |
| `posting` | DSO | Link accepted | Marked posted | 5 days | 2, 1 days | QC + Compliance Oversight group |

Notes:

- **Original vs current deadline.** The implementation timer uses `current_due_at`; it changes only by an approved extension or a consultant correction with reason. `original_due_at` is shown alongside it everywhere.
- **Pausing.** The implementation timer pauses while a clarification is open (D1) and while the task's evidence waits for review (D5); when it resumes, the deadline moves later by the paused working time, rounded to the nearest whole working day. After a rejection there is no separate rework timer: the same implementation timer resumes. All timers also pause when the cycle is closed or the item is withdrawn.
- **Overdue consultant and officer work never moves automatically**; it notifies (decision 4).
- *Compliance Oversight* is a configurable **group** (e.g. the transformation office director). Recipients for each rule can be roles, groups, or contextual people (owner, requester, original assignee, department manager).

## 2. Manual escalation

| Item | Rule |
|---|---|
| Who | Qiyas Consultant |
| When | Any time while the task is open (not completed / cancelled) |
| Input | Mandatory reason |
| Effect | `current_owner` := department manager; `original_assignee` unchanged; escalation record `kind = manual`; ownership history entry |
| Notified | DM (always, cannot be muted), previous owner, QC (confirmation) |
| If the DM already owns it | Allowed; recorded as an escalation and sent to the DM himself |

## 3. Automatic escalation

| Item | Rule |
|---|---|
| Trigger | `implementation` timer breached **plus** configurable threshold `escalation_after_business_days` (default **0** = at the deadline). Never fires while the timer is paused. |
| Condition | Task not yet *submitted* / *completed* / *cancelled*, and owner is not the DM |
| Effect | Same as manual: ownership to DM, original assignee preserved, record `kind = automatic` with the rule that fired |
| Notified | DM (cannot be muted), previous owner, QC |
| Owner already DM | Escalation recorded and sent to **the DM himself** (D2). Ownership unchanged. Visible to QC on dashboards. |
| Repeat | At most one automatic escalation per deadline. A new deadline (approved extension) re-arms it. |
| Repeat reminders | While a DM-owned task stays overdue, the DM receives a reminder every configurable period (default 3 business days). No ownership change. |

All escalation records are immutable and shown on the task timeline and on dashboards.

## 4. Event catalogue

✱ = cannot be muted by the recipient.

| Event code | Trigger | Recipients | Channels |
|---|---|---|---|
| `assignment.published` | QC publishes assignment | DM ✱ | in-app, email |
| `task.assigned` | DM assigns / reassigns | New owner ✱, previous owner | in-app, email |
| `task.escalated` | Manual or automatic escalation of an employee's task | DM ✱, previous owner, QC | in-app, email |
| `task.escalated_to_self` | DM-owned task passed its deadline (D2) | DM ✱ | in-app, email |
| `task.overdue_reminder` | DM-owned task still overdue | DM ✱ | in-app, email |
| `task.deadline_reminder` | Reminder offsets reached | Current owner | in-app, email |
| `task.overdue` | Deadline passed | Current owner ✱, DM | in-app, email |
| `task.returned_for_rework` | Link rejected | DM ✱, executor who submitted | in-app, email |
| `task.deadline_paused` / `task.deadline_resumed` | Clarification or review pause starts / ends | Current owner | in-app |
| `task.completed` | All requirements covered | DM, original assignee, QC | in-app |
| `task.cancelled` | QC cancels | Current owner, DM | in-app, email |
| `clarification.requested` | Owner asks | QC ✱; DM when an employee asked (D4) | in-app, email |
| `clarification.answered` | QC or DM answers | Requester ✱; QC is informed when the DM answered | in-app, email |
| `clarification.overdue` | Response timer breached | QC ✱, Compliance Oversight | in-app, email |
| `extension.asked` | Employee asks manager for more time (D7) | DM ✱ | in-app, email |
| `extension.ask_declined` | DM declines the employee's ask | Employee ✱ | in-app, email |
| `extension.requested` | DM raises formal request | QC ✱ | in-app, email |
| `extension.approved` | QC approves | DM ✱, current owner | in-app, email |
| `extension.rejected` | QC rejects | DM ✱ (with reason) | in-app, email |
| `extension.decision_overdue` | Decision timer breached | QC ✱, Compliance Oversight | in-app, email |
| `evidence.submitted` | Links submitted | QC | in-app (daily digest by email) |
| `evidence.review_overdue` | Review timer breached | QC ✱, Compliance Oversight | in-app, email |
| `evidence.accepted` | QC accepts | Executor, DM | in-app |
| `evidence.rejected` | QC rejects | DM ✱, executor (with comment) | in-app, email |
| `evidence.quarantined` | Virus found | Uploader ✱, ADM | in-app, email |
| `submission.ready` | Link accepted | DSO | in-app (daily digest by email) |
| `submission.overdue` | Posting timer breached | DSO ✱, QC, Compliance Oversight | in-app, email |
| `submission.posted_changed` | Posted link revoked or superseded | DSO ✱, QC | in-app, email |
| `cycle.opened` / `cycle.closing_soon` / `cycle.closed` | Cycle lifecycle | All active users / QC, DSO, EXE | in-app, email |

## 5. Delivery rules

| Rule | |
|---|---|
| N-1 | In-app notifications appear within 60 seconds; email via queue with up to 3 retries and back-off; failures land in a dead-letter list visible to ADM. |
| N-2 | Each user receives notifications in their preferred language (Arabic, English, Urdu). Templates exist per language; missing template falls back to Arabic. |
| N-3 | When one person would receive more than 10 notifications of the same event within 15 minutes, they are batched into one digest. |
| N-4 | Users can mute non-✱ events per channel. |
| N-5 | Every notification links directly to the item (task, link, clarification, extension). |
| N-6 | The scheduler evaluates timers at least every 5 minutes and is idempotent (no duplicate reminders after a restart). |
