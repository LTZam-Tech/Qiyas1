# 03 · End-to-End Workflows — Phase 1

[← Index](README.md)

Roles: **QC** Qiyas Consultant · **DM** Department Manager · **EMP** Employee · **DSO** DGA Submission Officer · **SYS** the system (scheduler, rules).

## W0 · The whole journey

```mermaid
flowchart LR
    subgraph Setup["Cycle setup · QC / ADM"]
        A1[Import DGA framework version] --> A2[Create measurement cycle]
        A2 --> A3[Mark applicability per requirement]
        A3 --> A4[Optionally reuse evidence from earlier banks]
    end
    subgraph Assign["Assignment · QC → DM"]
        B1[Assign requirements to a department<br/>with deadlines and instructions]
    end
    subgraph Execute["Execution · DM / EMP"]
        C1[DM assigns to an employee or self] --> C2[Executor gathers evidence]
        C2 --> C3[Upload artifacts and link to requirements]
        C3 --> C4[Submit for review]
    end
    subgraph Review["Review · QC"]
        D1{Decision per evidence link}
    end
    subgraph Post["DGA submission · DSO"]
        E1[Prepare package] --> E2[Post on DGA portal] --> E3[Mark as posted]
    end
    A4 --> B1 --> C1
    C4 --> D1
    D1 -- accepted --> E1
    D1 -- rejected with reason --> R1[Back to DM for rework] --> C1
    C2 -. clarification, deadline paused .-> Q[QC or DM answers the requester]
    Q -.-> C2
    C2 -. extension request by DM .-> X[QC approves or rejects]
    X -.-> C2
    C2 -. deadline passed or manual .-> S[Escalated: ownership to DM]
    S --> C1
```

## W1 · Cycle setup

```mermaid
sequenceDiagram
    actor ADM as Administrator
    actor QC as Qiyas Consultant
    participant SYS as Qiyas
    ADM->>SYS: Import DGA framework file (e.g. v5.0)
    SYS-->>ADM: Validation report (counts, missing translations, broken links)
    ADM->>SYS: Activate framework version
    QC->>SYS: Create cycle "Qiyas 2026 / v5.0" with dates
    SYS->>SYS: Create empty evidence bank for the cycle
    QC->>SYS: Mark requirements applicable / not applicable (reason)
    opt Previous cycle exists
        QC->>SYS: Review crosswalk old to new requirements
        QC->>SYS: Reuse selected historical artifacts as drafts
    end
    QC->>SYS: Open cycle (status active)
```

## W2 · Assignment and execution

```mermaid
sequenceDiagram
    actor QC as Qiyas Consultant
    actor DM as Department Manager
    actor EMP as Employee
    participant SYS as Qiyas
    QC->>SYS: Assign requirements R1..Rn to Department D<br/>instructions, implementation deadline, manager action deadline
    SYS->>DM: Notify new assignment
    Note over SYS: Task status awaiting assignment, owner DM
    alt DM delegates
        DM->>SYS: Assign task to EMP (or split into several tasks)
        SYS->>EMP: Notify task assigned
    else DM does it personally
        DM->>SYS: Self-assign
    end
    Note over SYS: Task status assigned
    EMP->>SYS: Start work
    Note over SYS: Task status in progress
    EMP->>SYS: Upload artifacts, add metadata, link each version to requirement(s)
    EMP->>SYS: Submit links for review
    Note over SYS: Task status submitted, each link review status submitted
    SYS->>QC: Notify review needed (review deadline starts)
```

## W3 · Clarification

```mermaid
sequenceDiagram
    actor REQ as Requester (EMP or DM, current owner)
    actor DM as Department Manager
    actor QC as Qiyas Consultant
    participant SYS as Qiyas
    REQ->>SYS: Ask for clarification on task / requirement / proof item
    SYS->>QC: Notify (response deadline starts)
    SYS->>DM: Notify when an employee asked (D4)
    Note over SYS: Task flag "clarification open". Implementation deadline PAUSED (D1)
    alt Manager answers first (employee asked)
        DM->>SYS: Answer
        SYS->>QC: Inform: manager answered (consultant may add)
    else Consultant answers
        QC->>SYS: Answer (text, attachments)
    else Response deadline passes
        SYS->>QC: Reminder, then oversight notice per rule
        QC->>SYS: Answer
    end
    SYS->>REQ: Deliver answer to the requester
    Note over SYS: Deadline resumes, moved later by the paused business time
    REQ->>SYS: Close, or ask a follow-up (pauses again)
```

## W4 · Extension request

```mermaid
sequenceDiagram
    actor EMP as Employee
    actor DM as Department Manager
    actor QC as Qiyas Consultant
    participant SYS as Qiyas
    opt Employee needs more time (D7)
        EMP->>SYS: Ask manager for more time (date + reason)
        SYS->>DM: Notify
        alt Manager agrees
            DM->>SYS: Turn into formal request (may edit date and reason)
        else Manager declines
            DM->>SYS: Decline with a note
            SYS->>EMP: Notify declined. Deadline unchanged
        end
    end
    DM->>SYS: Formal extension request: new date + business reason
    SYS->>QC: Notify (decision deadline starts)
    Note over SYS: Task flag "extension pending". Deadline unchanged
    alt Approved
        QC->>SYS: Approve (may set a different date)
        SYS->>SYS: Current deadline = approved date. Original deadline kept
        SYS->>DM: Notify approved
        SYS->>EMP: Notify new deadline (if EMP owns task)
    else Rejected
        QC->>SYS: Reject with mandatory reason
        SYS->>DM: Notify rejected + reason. Deadline unchanged
    end
```

## W5 · Escalation

```mermaid
flowchart TD
    T[Task owned by EMP] --> M{Trigger}
    M -- "QC escalates manually (reason required)" --> E
    M -- "Deadline + threshold passed, not submitted" --> E
    E[Create escalation record<br/>type, reason, time, previous owner] --> O[Current owner := DM<br/>original assignee kept]
    O --> N[Notify DM, QC and EMP]
    N --> D{DM action}
    D -- Solve personally --> W[DM works the task]
    D -- Reassign --> R[Same or another employee<br/>new deadline only via extension]
    T2[Task owned by DM] --> M2{Deadline passed}
    M2 --> N2[Escalation recorded and sent to the DM himself<br/>ownership unchanged - D2<br/>QC sees it on the dashboard]
    P[Deadline paused: open clarification or evidence under review] -. no automatic escalation while paused .-> M
```

## W6 · Review and rework

```mermaid
sequenceDiagram
    actor EX as Executor
    actor QC as Qiyas Consultant
    actor DM as Department Manager
    participant SYS as Qiyas
    EX->>SYS: Submit evidence links
    Note over SYS: Implementation deadline paused while waiting for review
    SYS->>QC: Review queue (review deadline per link, covers decision and feedback - D5)
    loop each evidence link
        QC->>SYS: Open link (file, requirement, checklist)
        alt Accept
            QC->>SYS: Accept (optional comment)
            SYS->>SYS: Recalculate readiness up the hierarchy
            SYS->>SYS: Link enters DGA submission queue (not posted)
        else Reject
            QC->>SYS: Reject with mandatory comment
            SYS->>DM: Task returns to DM: status rework required. Implementation deadline resumes (no separate rework deadline, D5)
        end
    end
    alt All links of the task accepted
        SYS->>SYS: Task status completed
    end
    DM->>SYS: Rework personally or reassign
    EX->>SYS: Upload new version, re-link, resubmit
    Note over SYS: Old version and its rejection stay in history
```

## W7 · DGA submission

```mermaid
sequenceDiagram
    actor DSO as DGA Submission Officer
    participant SYS as Qiyas
    participant DGA as DGA portal (external)
    SYS->>DSO: Accepted links appear as "not posted" (posting deadline starts)
    DSO->>SYS: Build package for a standard (ordered artifacts + index)
    SYS-->>DSO: Download archive
    DSO->>DGA: Post evidence on the DGA portal (outside Qiyas)
    DSO->>SYS: Mark links posted (date, optional DGA reference)
    SYS->>SYS: Update posting progress
    opt Mistake
        DSO->>SYS: Revert to not posted with reason
    end
```

## W8 · Reuse from a historical bank

```mermaid
sequenceDiagram
    actor QC as Qiyas Consultant
    participant SYS as Qiyas
    QC->>SYS: Search bank "Qiyas 2026" for requirement X
    SYS-->>QC: Accepted versions with their 2026 review history
    QC->>SYS: Reuse version v3 for requirement X' in cycle 2027 (crosswalk suggests X to X')
    SYS->>SYS: New artifact in bank 2027, source = 2026 artifact v3
    SYS->>SYS: New link to X' with review status draft
    Note over SYS: Not counted in 2027 readiness until submitted and accepted in 2027
    QC->>SYS: Assign X' to a department, attaching the reused draft as a starting point
```
