---
repo: "uos-tool-trawl-web-extraction"
display_name: "uos-tool-trawl-web-extraction"
package_name: "uos-tool-trawl-web-extraction"
lane: "tool plugin"
artifact_class: "TypeScript package / Paperclip web extraction plugin"
maturity: "newly scaffolded extracted tool plugin"
generated_on: "2026-04-03"
assumptions: "Grounded in the current split-repo contents, package metadata, README/PRD alignment pass, and the Paperclip plugin scaffold presence where applicable; deeper module-level inspection should refine implementation detail as the code evolves."
autonomy_mode: "maximum-capability autonomous work with deep research and explicit learning loops"
---

# PRD: trawl-web-extraction

## 1. Product Intent

**Package / repo:** `uos-tool-trawl-web-extraction`  
**Lane:** tool plugin  
**Artifact class:** TypeScript package / Paperclip web extraction plugin  
**Current maturity:** newly scaffolded extracted tool plugin  
**Source-of-truth assumption:** This split repo is now the canonical home for the tool, delivered as a Paperclip plugin scaffold with repo-local worker, manifest, UI, and tests.
**Runtime form:** The Paperclip plugin scaffold is the primary delivery surface; extraction schemas, provenance, and downstream delivery workflows should strengthen that runtime rather than replace it.

trawl-web-extraction provides structured web extraction with an emphasis on schema fidelity, resilience to page changes, and trust-aware output generation.

## 2. Problem Statement

Web extraction is brittle by default: pages change, structured data is inconsistent, and low-quality extraction contaminates downstream automation. Robust extraction requires schema discipline, trust modeling, and failure visibility.

## 3. Target Users and Jobs to Be Done

- Agents needing structured information from the web.
- Maintainers improving extraction quality and resilience.
- Teams depending on extracted data in downstream workflows.

## 4. Outcome Thesis

**North star:** Extraction outputs are reliable enough to power real workflows because fidelity, provenance, and confidence are treated as first-class product requirements.

### 12-month KPI targets
- Schema completeness reaches >= 90% on maintained extraction targets.
- Provenance coverage reaches 100% for extracted fields in benchmark workflows.
- Source drift is detected within one scheduled run of a material page or schema change.
- Manual cleanup time per maintained extraction target falls by 50% after normalization and validation.
- Downstream delivery succeeds for >= 95% of validated benchmark extracts.

### Acceptance thresholds for the next implementation wave
- Each maintained target has an explicit schema, provenance model, and validation rule set.
- Extraction outputs can be judged against expectations instead of only eyeballed.
- Drift alerts point to what changed, not just that the extraction failed.
- The extracted result can be delivered into a downstream review or storage surface without ad hoc cleanup.

## 5. In Scope

- Schema-guided extraction and normalization.
- Source provenance, trust scoring, and confidence handling.
- Resilience to DOM/layout changes and fallback strategies.
- Quality evaluation and drift detection.

## 6. Explicit Non-Goals

- Maximizing coverage by emitting low-trust structured output.
- Treating every website as equally stable or trustworthy.
- Hiding extraction uncertainty from downstream consumers.

## 7. Maximum Tool and Connection Surface

- This repo should assume it may use any connection, API, browser flow, CLI, document surface, dataset, or storage system materially relevant to completing the job, as long as the access pattern is lawful, auditable, and proportionate to risk.
- Do not artificially limit execution to the tools already named in the repo if adjacent systems are clearly required to close the loop.
- Prefer first-party APIs and direct integrations when available, but use browser automation, provider CLIs, structured import/export, and human-review queues when they are the most reliable path to completion.
- Treat communication systems, docs, spreadsheets, issue trackers, code hosts, cloud consoles, dashboards, databases, and admin panels as valid operating surfaces whenever the repo's job depends on them.
- Escalate only when the action is irreversible, privacy-sensitive, financially material, or likely to create external side effects without adequate review.

### Priority surfaces for web extraction
- HTTP fetch, browser automation, search engines, sitemaps, RSS/Atom feeds, file downloads, PDFs, and structured-data surfaces needed to extract trustworthy information from messy websites.
- Schema registries, validation layers, screenshots, evidence capture, provenance logs, and QA workflows when downstream consumers need confidence and traceability, not just raw text.
- Docs, spreadsheets, databases, warehouses, and search indexes when extracted data must land in a form other systems can review, query, compare, or act on.
- Any adjacent system required to connect discovery, extraction, normalization, validation, enrichment, and downstream delivery into one complete workflow.

### Selection rules
- Start by identifying the systems that would let the repo complete the real job end to end, not just produce an intermediate artifact.
- Use the narrowest safe action for high-risk domains, but not the narrowest tool surface by default.
- When one system lacks the evidence or authority needed to finish the task, step sideways into the adjacent system that does have it.
- Prefer a complete, reviewable workflow over a locally elegant but operationally incomplete one.

## 8. Autonomous Operating Model

This PRD assumes **maximum-capability autonomous work**. The repo should not merely accept tasks; it should research deeply, compare options, reduce uncertainty, ship safely, and learn from every outcome. Autonomy here means higher standards for evidence, reversibility, observability, and knowledge capture—not just faster execution.

### Required research before every material task
1. Read the repo README, this PRD, touched source modules, existing tests, and recent change history before proposing a solution.
1. Trace impact across adjacent UOS repos and shared contracts before changing interfaces, schemas, or runtime behavior.
1. Prefer evidence over assumption: inspect current code paths, add repro cases, and study real failure modes before implementing a fix.
1. Use external official documentation and standards for any upstream dependency, provider API, framework, CLI, or format touched by the task.
1. For non-trivial work, compare at least two approaches and explicitly choose based on reversibility, operational safety, and long-term maintainability.

### Repo-specific decision rules
- Source fidelity beats maximal coverage when uncertainty is high.
- Provenance and confidence must travel with the extracted data.
- A broken extractor should fail loudly rather than degrade silently.

### Mandatory escalation triggers
- Potential legal/terms concerns, gated/private content, or sensitive downstream usage.
- Low-confidence extraction feeding high-impact workflows.

## 9. Continuous Learning Requirements

### Required learning loop after every task
- Every completed task must leave behind at least one durable improvement: a test, benchmark, runbook, migration note, ADR, or automation asset.
- Capture the problem, evidence, decision, outcome, and follow-up questions in repo-local learning memory so the next task starts smarter.
- Promote repeated fixes into reusable abstractions, templates, linters, validators, or code generation rather than solving the same class of issue twice.
- Track confidence and unknowns; unresolved ambiguity becomes a research backlog item, not a silent assumption.
- Prefer instrumented feedback loops: telemetry, evaluation harnesses, fixtures, or replayable traces should be added whenever feasible.

### Repo-specific research agenda
- Which extractor classes are most brittle today and why?
- What schema patterns improve downstream reliability?
- How can trust and provenance be represented compactly but usefully?

### Repo-specific memory objects that must stay current
- Schema registry.
- Source trust notes.
- Extraction drift archive.
- Failure and fallback pattern library.

## 10. Core Workflows the Repo Must Master

1. Define or refine target schemas.
1. Extract structured content with provenance and confidence.
1. Detect drift when sources change.
1. Validate extracted output against expectations and downstream needs.

## 11. Interfaces and Dependencies

- Paperclip plugin runtime, manifest, worker, UI, and local install flows.

- Web sources and extraction runtimes.
- Downstream consumers of structured output.
- Potential cataloging in skills metadata if relevant.

## 12. Implementation Backlog

### Now
- Define the first wave of target schemas and provenance capture rules.
- Build validation and drift-detection logic for the maintained extraction targets.
- Standardize downstream export formats so extracted data is immediately usable.

### Next
- Improve resilience to layout and source changes without hiding extraction uncertainty.
- Reduce cleanup work by strengthening normalization and quality scoring.
- Expand target coverage once the validation loop is stable.

### Later
- Support richer enrichment and cross-source reconciliation for more complex extraction workflows.
- Integrate extraction evidence into broader automation and review systems by default.

## 13. Risks and Mitigations

- Silent extraction degradation.
- Schema drift contaminating downstream systems.
- Trust-insensitive extraction causing bad decisions.

## 14. Definition of Done

A task in this repo is only complete when all of the following are true:

- The code, configuration, or skill behavior has been updated with clear intent.
- Tests, evals, replay cases, or validation artifacts were added or updated to protect the changed behavior.
- Documentation, runbooks, or decision records were updated when the behavior, contract, or operating model changed.
- The task produced a durable learning artifact rather than only a code diff.
- Cross-repo consequences were checked wherever this repo touches shared contracts, orchestration, or downstream users.

### Repo-specific completion requirements
- Outputs include schema validation and confidence/provenance behavior.
- New extractors or changes are evaluated against drift and quality checks.

## 15. Recommended Repo-Local Knowledge Layout

- `/docs/research/` for research briefs, benchmark notes, and upstream findings.
- `/docs/adrs/` for decision records and contract changes.
- `/docs/lessons/` for task-by-task learning artifacts and postmortems.
- `/evals/` for executable quality checks, golden cases, and regression suites.
- `/playbooks/` for operator runbooks, migration guides, and incident procedures.
