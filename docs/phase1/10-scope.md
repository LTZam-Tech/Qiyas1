# 10 · Phase 1 Scope & Exclusions

[← Index](README.md)

## In scope

| Area | Included |
|---|---|
| **Framework** | Import of DGA framework versions as data (v5.0 first); crosswalk between versions; applicability per cycle |
| **Cycles** | Annual measurement cycles with their own bank, assignments, deadlines, reviews, completeness |
| **Assignment** | Consultant → department → employee or manager; split, reassign, cancel |
| **Clarification** | Executor ↔ consultant threads with response deadlines |
| **Extensions** | Manager requests, consultant decides, original deadline preserved |
| **Escalation** | Manual (consultant) and automatic (deadline), ownership to manager, full history |
| **Evidence** | Multi-artifact, multi-format, versioned, mapped to requirements, reusable across requirements, virus-scanned |
| **Review** | Per evidence link, accept / reject with comments, review deadlines, optional checklist |
| **Completeness** | Requirement → standard → axis → perspective → cycle readiness; posting progress |
| **DGA submission preparation** | Officer queue, packages, *posted / not posted* per link |
| **Evidence banks** | Per cycle; historical search; reuse with lineage |
| **Deadlines & notifications** | Per role, business-day calendar, reminders, escalations, in-app + email, three languages |
| **Dashboards & reports** | Executive, consultant, manager, employee, submission officer; exports |
| **Administration** | Users, departments, groups, roles, permissions, settings, branding |
| **Audit** | Append-only log of every change and file access |
| **Deployment** | On-premises, one client per installation |

## Explicitly excluded from Phase 1

| Excluded | Note |
|---|---|
| DGA initial verification results | Not recorded |
| DGA final verification results | Not recorded |
| DGA compliance scoring (full / partial / non-compliance / not applicable as graded by DGA) | Internal readiness % only |
| DGA correction-round management (reopened portal, notes, objections) | Not modelled |
| DGA official assessment reports and inter-entity comparisons | Not imported |
| DGA exemption request workflow | Internal applicability marking only (BR-FW-06) |
| Integration with the DGA portal (API or automation) | Posting is done by the officer on the DGA portal; Qiyas records the status |
| Shared multi-tenant SaaS | One installation per client |
| SSO / Active Directory login | Planned next (see below); Phase 1 uses local accounts |
| Native mobile apps | Responsive web only |
| AI classification or automatic evidence checking | Future |

## Candidates for Phase 2 (not committed)

- DGA results tracking per requirement and correction rounds (the excluded items above).
- Active Directory / LDAP / SSO login.
- Exemption requests to DGA with supporting evidence.
- Automatic checks on evidence (document date in cycle, signature page present, table of contents for long documents).
- Cross-installation reporting for a ministry group (only if a client asks).

## Impact on the current build

The current code was built for a single university and a simpler workflow. Before implementation starts, these gaps are known:

| Area | Today | Phase 1 needs |
|---|---|---|
| Roles | `admin`, `dean`, `consultant`, `vice_dean`, `employee`; frontend crashes for `vice_dean` | Six roles in [02](02-roles-and-permissions.md), department-scoped grants |
| Hierarchy | Perspectives / axes / standards / evidence requirements, **no framework version**, no requirement↔proof mapping | Versioned framework, requirements and expected proof items (many-to-many), crosswalk |
| Cycles | None | Measurement cycle owning all operational data |
| Tasks | One `status` field mixing execution and review states | Task execution status only; review and submission on evidence links |
| Ownership | Single assignee | Original assignee + current owner + ownership history |
| Evidence | Submissions attached to a task | Artifacts in a cycle bank, versions, links to requirements |
| Review | Task-level decision | Per evidence link |
| Clarification, extension | Not present | New modules |
| Escalation | SLA monitor exists (`backend/src/jobs/sla-monitor.ts`), escalates by notification only | Ownership move to manager, manual + automatic, configurable |
| DGA submission | Not present | Officer queue, packages, posted / not posted |
| Administration | Users only (partial) | Users, departments tree, groups, roles, permissions, settings |
| Branding | Jouf University logo hardcoded on login | Client branding from settings |
| UI | Redesigned, trilingual (Arabic / English / Urdu) | Kept; new screens follow the same design system |

The redesign and translation work already done is reusable. The data model and workflow modules need rework according to these documents.
