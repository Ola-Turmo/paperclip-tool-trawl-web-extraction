# Trawl Web Extraction

trawl-web-extraction is a narrow UOS tool plugin for structured web extraction. It owns schema-guided extraction, provenance, trust scoring, and source-drift handling. It does not own the generic connector boundary or broader automation routing across unrelated tools.

Built as part of the UOS split workspace on top of [Paperclip](https://github.com/paperclipai/paperclip), which remains the upstream control-plane substrate.

## Boundary Summary

- Owns schema-guided extraction, provenance, trust scoring, and extraction-target drift handling.
- Depends on [uos-plugin-connectors](https://github.com/Ola-Turmo/uos-plugin-connectors) only when provider auth or callback plumbing is required around extraction jobs.
- Feeds extraction quality and provenance evidence into [uos-plugin-operations-cockpit](https://github.com/Ola-Turmo/uos-plugin-operations-cockpit) when operators need reviewable signals.
- Stays narrower than the generic connector layer and narrower than the broader task-routing plugin.

## What This Repo Owns

- Schema-guided extraction and normalization.
- Source provenance, trust scoring, and confidence handling.
- Resilience to DOM or layout changes and fallback strategies.
- Quality evaluation and drift detection for extraction targets.

## Runtime Form

- Tool plugin first. Extraction schemas, provenance, and downstream delivery workflows should strengthen targeted extraction jobs without becoming a generic connector or automation surface.

## Highest-Value Workflows

- Define or refine target schemas.
- Extract structured content with provenance and confidence.
- Detect drift when sources change.
- Validate extracted output against expectations and downstream needs.

## Key Connections and Operating Surfaces

- HTTP fetch, browser automation, search engines, sitemaps, RSS/Atom feeds, file downloads, PDFs, and structured-data surfaces needed to extract trustworthy information from messy websites.
- Schema registries, validation layers, screenshots, evidence capture, provenance logs, and QA workflows when downstream consumers need confidence and traceability, not just raw text.
- Docs, spreadsheets, databases, warehouses, and search indexes when extracted data must land in a form other systems can review, query, compare, or act on.
- Any adjacent system required to connect discovery, extraction, normalization, validation, enrichment, and downstream delivery into one complete workflow.

## KPI Targets

- Schema completeness reaches >= 90% on maintained extraction targets.
- Provenance coverage reaches 100% for extracted fields in benchmark workflows.
- Source drift is detected within one scheduled run of a material page or schema change.
- Manual cleanup time per maintained extraction target falls by 50% after normalization and validation.

## Implementation Backlog

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

## Local Plugin Use

```bash
curl -X POST http://127.0.0.1:3100/api/plugins/install \
  -H "Content-Type: application/json" \
  -d '{"packageName":"<absolute-path-to-this-repo>","isLocalPath":true}'
```

## Validation

```bash
pnpm install
pnpm build
pnpm test
pnpm plugin:typecheck
```
