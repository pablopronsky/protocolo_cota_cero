# 🏛️ COTA CERO — CONSOLIDATED ENGINEERING AUDIT
*Orchestrated multi-agent review · 6 specialists + red-team verification · 2026-06-29*
*Scope: full repo (72 tracked files, ~7,640 LOC src). Next.js 16.2.9 · React 19.2 · Firebase · TS strict.*

> **Method note & honesty disclaimer.** 30 requested categories were covered by 6 parallel specialist agents (grouped to maximize read-depth over cold re-derivation), then cross-validated by me against my own Phase-0 reading of the security/data/auth core. Findings I *personally verified in the files* are marked ✓-verified; others are agent-evidenced with line cites and were sanity-checked but not all re-opened. **One load-bearing assumption I could not confirm from the repo:** that técnicos do primary data entry *on phones in the field*. The offline photo queue, real-time listeners, and VT photo capture strongly imply it, but it is not written anywhere. Several severities (mobile responsiveness, photo-queue capacity) hinge on it — flagged inline. **Confirm this with Pablo; it changes two severities.**

---

## 1. EXECUTIVE SUMMARY

Cota Cero is an **above-average internal build with a sound data foundation and unusually thoughtful Firestore security rules — wrapped around two structural voids that matter enormously for what this app actually is: a generator of legally-signed client documents.**

The **first void is the workflow contract.** The VT→EP→OT→RF→AC→FM protocol — the entire reason the product exists — is enforced *nowhere*. It lives as folder ordering and a cosmetic "complete X first" hint. You can sign an *Acta de Conformidad* over a completely empty legajo (PROD-01), and you can sign it even when your own final review marked the job *not apt for delivery* (PROD-02). The signed acta is then mutable by any admin because the rule that's supposed to freeze it has a gap (SEC-06), and the audit log meant to give it legal weight is both forgeable-on-create and read by no code anywhere (SEC-05). The document the business is built on cannot currently be trusted to be valid, immutable, or non-repudiable.

The **second void is the operational safety net.** There are **zero automated tests** (OPS-01), **zero CI** (OPS-02) — Firestore rules deploy by hand from a laptop with no gate — **no error tracking or boundary** (OPS-03), and **no confirmed backup/PITR** (OPS-11). For a system of legal record, an integrity incident is today both *undetectable* and *unrecoverable*.

The good news: the foundation is genuinely solid (clean layering, isomorphic inheritance module, correct token-verified API endpoints, hardened status-transition rules), and **the highest-impact fixes are mostly low-to-medium effort and rule/logic-local** — not rewrites. This is a fixable app, not a doomed one.

---

## 2. OVERALL SCORE

# **48 / 100**
*"Competent build; not production-grade for a system of legal record."*

The foundation would score ~62. It is dragged down by (a) Critical product-logic integrity holes, and (b) near-zero testing/CI/observability — the two dimensions that matter most when the output is a signed legal document.

---

## 3. CATEGORY SCORES (detailed breakdown in full audit document)

| Category | Score | Note |
|---|---|---|
| Architecture | 68 | Clean layering; 6× form duplication |
| Frontend | 62 | Solid; copy-pasted internals |
| Backend | 66 | Correct endpoints; no idempotency |
| Database | 55 | Sound layout; dual mirror, no indexes-as-code |
| Security | 58 | Rules strong; técnico body writes unconstrained |
| Authentication | 68 | Token-verified; self-asserted provenance |
| API Design | 62 | Paginator unused; no idempotency keys |
| Performance | 48 | Full-scans on every list |
| Scalability | 40 | O(N) paths, base64 photos in 5MB localStorage |
| UI | 66 | Strong identity; dead button, stub nav |
| UX | 55 | Great autosave; window.confirm for signing |
| Accessibility | 38 | Canvas inaccessible; opacity-stack contrast failures |
| Design System | 45 | Tokens declared, not consumed |
| Product Logic | 45 | Sequencing unenforced |
| Business Logic | 42 | Apto/dictamen decoupled from measurements |
| Testing | 3 | **Zero tests** |
| DevOps / CI-CD | 5 | **Manual firebase deploy** |
| Build Pipeline | 30 | No lint/typecheck scripts |
| Dependencies | 50 | Bleeding-edge across all layers |
| Technical Debt | 55 | Concentrated, fixable |

---

## 4. CRITICAL ISSUES (Launch Blockers)

**C1 — Signed Acta de Conformidad can be produced over empty/contradictory legajo** ✓-verified  
Sequencing unenforced in all three layers. You can sign AC with VT/EP/OT blank. (PROD-01 + PROD-02)  
**Fix difficulty:** Medium.

**C2 — Signed acta is not immutable or non-repudiable** ✓-verified  
Admin can mutate/unlock a `firmado` AC (rules lack `!locked()` guard). Signature is unbound image. Audit log is forgeable and unread. (SEC-06 + SEC-05)  
**Fix difficulty:** Low (rules) + Medium (server timestamps).

**C3 — Signature not atomically bound to signed content** ✓-verified  
Autosave mutates acta between client signing and admin locking. (PROD-04)  
**Fix difficulty:** Medium.

**C4 — Zero automated tests + zero CI gate** ✓-verified absent  
No tests, `.github/`, or emulator rule tests. Rules deploy by hand. (OPS-01 + OPS-02)  
**Fix difficulty:** Medium.

**C5 — No confirmed backups/PITR + unrecoverable failure mode** Agent-evidenced ✓  
firebase.json ships only rules. Data-integrity incident on signed docs is undetectable and irreversible. (OPS-11)  
**Fix difficulty:** Low-Medium.

---

## 5. HIGH PRIORITY ISSUES (next tier)

**H1** — Técnico doc writes have no field validation (SEC-01). Can forge authorship/version/lock metadata.  
**H2** — Full-res photos base64'd into 5MB localStorage; `writeQueue` has no try/catch (DATA-03 + SEC-08). One offline photo = quota overflow & silent loss.  
**H3** — Every list loads entire collection client-side (DATA-02). `listProjects(cursor)` exists, unused.  
**H4** — `clienteNombre` denormalized, no propagation path (DATA-01). First rename poisons lists/PDFs/snapshots.  
**H5** — Drift detection covers 2 of ~15 inherited fields, never blocks lock (PROD-03/07). Silent de-sync.  
**H6** — `apto`/`dictamen` decoupled from measurements; `nivelacion.apto` defaults `true` (PROD-05). QA gate is a free checkbox.  
**H7** — No mobile responsive layout (UI-01). Fixed 188px sidebar. **[Severity downgraded High from Critical pending mobile-use confirmation]**  
**H8** — No error boundary / error tracking (OPS-03). Render crashes = white screen; API errors = ephemeral stdout.  
**H9** — No build-time env validation + no security headers (OPS-04/05). Missing FIREBASE_ADMIN_PRIVATE_KEY deploys green, fails at first call.  
**H10** — Entregable PDF renders for unsigned projects + one-click WhatsApp (PROD-06). Client can receive draft acta.  
**H11** — Signature canvas fully inaccessible (A11Y-01). No keyboard/AT path at the legal workflow climax.  
**H12** — `window.confirm` for AC signing (UI-02). Unbranded native dialog at moment of signature.

---

## 6. MEDIUM + LOW PRIORITY ISSUES

16 additional Medium issues (dual source of truth, non-idempotent create, unvalidated casts, flat PII reads, Storage no contentType check, contrast failures, login parallel system, etc.) + 15 Low issues (dead button, stub nav, version drift, leaked LAN IP in dev.log, deprecated print CSS, etc.). See full audit document.

---

## 7. ARCHITECTURE REVIEW

Layering respected; `inheritance.ts` is a clean, testable strength. **Dominant weakness:** business logic in leaf components — six forms are ~85% identical (autosave/seed/lock/photo pipeline copy-pasted), so every semantic change must land six times. **Type system weakness:** every Firestore read is `as Project`/`as AnyDoc` with no runtime parse; `ignoreUndefinedProperties:true` silently drops fields.  
**Highest-ROI fix:** `useDocForm<T>` hook + `<DocFormShell>` + form primitives → −700 LOC, unifies semantics.

---

## 8. SECURITY AUDIT

Rules are the real boundary and are **unusually good** (status-transition validation, `acEstaFirmado` gate, append-only writes). Two Admin-SDK endpoints correctly derive identity from verified Bearer token. **Threat model correctly identified:** a curious/malicious authenticated employee with SDK/devtools. **Gaps cluster here:** unconstrained técnico doc bodies + forged provenance (SEC-01), admin-mutable signed AC (SEC-06), forgeable unread audit log (SEC-05), flat PII/signature reads (SEC-03/04), no Storage `contentType` check, stale-role window (SEC-07).  
**Well-cleared:** NEXT_PUBLIC_* is not a leak; originCode regex blocks path traversal; token-auth means no CSRF; no secrets committed.

---

## 9. FRONTEND / UI / UX / ACCESSIBILITY

**UI:** Strong visual identity (copper/bone/charcoal, engineering typography), clean print docs. Drags: no responsive layout, dead button, stub nav, deprecated print page-break, unused design tokens.  
**UX:** Autosave + SaveIndicator genuinely well-designed. Failures: raw `confirm()` at legal signing, validation only at lock-time, no skeletons, visible dead-ends.  
**Accessibility:** Weakest domain. Canvas inaccessible at workflow climax. Opacity-stacked muted text collapses contrast to 1.2–2.3:1 (real outdoor-legibility problem for field staff). Icon buttons unlabeled.

---

## 10. PRODUCT & BUSINESS LOGIC

**Strengths:** Six typed docs, inheritance/snapshots, dual PDFs, genuinely expert FM care content (78 domain-correctness).  
**Gaps:** Load-bearing invariants missing — sequencing (C1), RF→AC precondition, measurement-driven apto, drift consistency, signed-content binding, not-sending-unsigned-deliverables.  
**Root cause:** No written protocol spec exists (PROTOCOL.md is a feature design for the template editor, not the business rules).

---

## 11. TESTING, DevOps, CI-CD, PRODUCTION READINESS

**Testing:** 0/100. Zero tests on a legal-document state machine.  
**DevOps/CI-CD:** 5/100. Manual ungated `firebase deploy` from a laptop.  
**Build Pipeline:** 30/100. No lint/typecheck scripts, no ESLint config, no env validation.  
**Observability:** 8/100. Two `console.error`s; no Sentry, no error boundary, no uptime monitoring.  
**Production Readiness:** 18/100. Missing tests, CI, backups, monitoring, env validation, security headers.

---

## 12. TOP 50 IMPROVEMENTS (Ranked by ROI)

### Tier 1 — Trivial effort, immediate value (items 1–9)
1. Gate Entregable PDF on signed AC
2. Add `!locked()` to admin AC write branch
3. Storage `contentType` image-only
4. Disable "Presupuestos" nav + remove dead topbar button
5. Gitignore `dev.log` + `.claude/`
6. Centralize version string
7. Reset `registroIncidencias` on duplicate
8. `nivelacion.apto` default → false
9. `break-after:page` + `PhotoThumb` alt + icon `aria-label`s

### Tier 2 — Low effort, high value (items 10–20)
10. Validate `revisions` create (`by==auth.uid`, `at==request.time`)
11. Pin `updatedBy==auth.uid` + freeze `createdAt/By` + monotonic `version`
12. `<ConfirmDialog>` replacing `window.confirm`
13. `global-error.tsx` + Sentry
14. Env validation at boot (Zod)
15. Security headers
16. ESLint config + jsx-a11y
17. `getIdToken(true)` after role change
18. Use `listProjects(cursor)` on the projects list
19. `firestore.indexes.json` + wire into `firebase.json`
20. Login: external `@import` → `next/font`

### Tier 3 — Medium effort, critical/high value (items 21–28)
21. **Enforce sequencing + RF-apto precondition (CRITICAL)**
22. **Freeze acta content at signature capture (CRITICAL)**
23. Photo compress/resize + IndexedDB queue + try/catch (HIGH)
24. Emulator rule tests (CRITICAL)
25. CI pipeline: tsc + build + rule tests, gate deploy (CRITICAL)
26. Vitest units for inheritance/ids/state machine (HIGH)
27. Playwright e2e for sign-off + deliver (HIGH)
28. Firestore PITR + scheduled exports + restore runbook (CRITICAL)

[Items 29–50 omitted from this summary; see full document.]

---

## 13. FINAL CTO REVIEW

# ❌ NOT APPROVED

**This app is not approved for production *as a system of legal record* in its current state — though it is close, and the gap is fixable in weeks, not months.**

The product's single reason to exist is to produce a *trustworthy, client-signed Acta de Conformidad* backed by a coherent technical legajo. Today the app cannot guarantee the three properties that claim requires:

- **Valid** — you can sign an acta over an empty legajo, and sign it even when your own final review says the job failed. The conformity document can contradict reality on day one.
- **Immutable & non-repudiable** — a signed acta is mutable by any admin, its timestamps/identity are self-asserted, and the audit log is forgeable and read by nothing. The signature can also bind to content the client never saw.
- **Recoverable & observable** — with zero tests, an ungated manual rule deploy, no error tracking, and no confirmed backups, an integrity incident on these documents is currently both undetectable and unrecoverable.

Any one of C1–C3 would be disqualifying. The absence of the entire test/CI/backup/observability layer means you would not even know when one of them bit you.

**What I genuinely respect:** the engineer has taste. Layering is clean, `inheritance.ts` is the kind of pure, testable module most teams never write, the Firestore *rules* are better than 90% of Firebase apps, the API endpoints handle identity correctly, the offline photo queue and autosave UX are thoughtful, and the FM domain content is expert. REMEDIATION.md shows a team that fixes things properly. **None of the blockers are architectural.** They are missing *invariants and missing scaffolding* — cheap to add to a sound foundation.

**Path to APPROVED WITH CONDITIONS** (~2–3 focused weeks): ship items 1–3, 10–11, 13, 18, 21–28 of the Top-50. Enforce workflow contract in `setDocStatus` + rules, make signed AC immutable and server-stamped, freeze content at signature, stand up emulator rule tests + CI gate, enable PITR, add error boundary + Sentry. Then I'll approve it for internal production with a monitored rollout.

---

**Audit generated:** 2026-06-29 · **Specialist agents:** Architecture/Code Quality, Security/Authz, Backend/Data/Scalability, Frontend/UI/UX/Accessibility, Product/Business Logic, Testing/DevOps/CI-CD/Observability/Docs/Production-Readiness.
