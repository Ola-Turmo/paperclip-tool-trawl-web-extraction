# Implementation Plan: uos-tool-trawl-web-extraction

## Project Overview
- **Name**: uos-tool-trawl-web-extraction
- **Type**: NEW
- **Stack**: TypeScript + Zod + @paperclipai/plugin-sdk + Playwright + LLM API
- **Vision**: Intelligent web intelligence platform — extract structured knowledge from any website, detect changes before they matter, turn the entire web into a queryable knowledge base

## Project Structure
```
uos-tool-trawl-web-extraction/
├── src/
│   ├── extraction/
│   │   ├── llm-extractor.ts       # LLM-based semantic extraction
│   │   ├── vision-extractor.ts     # Vision model for image-heavy pages
│   │   ├── table-detector.ts       # Table/structured data detection
│   │   ├── regex-extractor.ts      # Legacy regex-based extraction
│   │   └── extractor-factory.ts    # Factory to pick right extractor
│   ├── monitoring/
│   │   ├── scheduler.ts            # Scheduled extraction with cron
│   │   ├── version-storage.ts      # Historical version storage
│   │   ├── delta-alerting.ts       # Delta alerting on changes
│   │   └── drift-detector.ts       # Drift predictions
│   ├── pipeline/
│   │   ├── pipeline-builder.ts     # Visual pipeline builder
│   │   ├── pipeline-runner.ts      # Execute extraction flows
│   │   └── data-transformer.ts      # Data transformation steps
│   ├── extraction-schema.ts        # Zod schemas for extraction config
│   ├── confidence-scorer.ts        # Confidence scoring
│   └── index.ts                    # Main entry point
├── src/ui/
│   ├── dashboard/
│   │   ├── extraction-monitor.tsx
│   │   ├── schema-designer.tsx
│   │   ├── change-history-viewer.tsx
│   │   └── performance-metrics.tsx
│   └── pipeline-builder-ui/
│       └── pipeline-canvas.tsx
├── package.json
├── tsconfig.json
├── SPEC.md
└── README.md
```

## Tasks

### Task 1: Scaffold project structure
Create the full project scaffold — package.json, tsconfig.json, directory structure, base config files.

### Task 2: Implement core extraction types and schemas
Create Zod schemas for extraction config, extraction results, confidence scores, schema validation.

### Task 3: Implement Phase 1 — AI Extraction
- `src/extraction/llm-extractor.ts` — LLM-based semantic extraction
- `src/extraction/vision-extractor.ts` — Vision extraction for images
- `src/extraction/table-detector.ts` — Table/structured data detection
- `src/extraction/regex-extractor.ts` — Legacy regex-based extraction (backward compat)
- `src/extraction/extractor-factory.ts` — Factory to pick right extractor
- `src/confidence-scorer.ts` — Confidence scoring

### Task 4: Implement Phase 2 — Continuous Monitoring
- `src/monitoring/scheduler.ts` — Scheduled extraction with cron-style scheduling
- `src/monitoring/version-storage.ts` — Historical version storage
- `src/monitoring/delta-alerting.ts` — Delta alerting on changes
- `src/monitoring/drift-detector.ts` — Drift predictions

### Task 5: Implement Phase 3 — Pipeline + Dashboard
- `src/pipeline/pipeline-builder.ts` — Pipeline builder core
- `src/pipeline/pipeline-runner.ts` — Execute extraction flows
- `src/pipeline/data-transformer.ts` — Data transformation steps
- `src/ui/dashboard/extraction-monitor.tsx` — Extraction monitor UI
- `src/ui/dashboard/schema-designer.tsx` — Schema designer UI
- `src/ui/dashboard/change-history-viewer.tsx` — Change history viewer
- `src/ui/dashboard/performance-metrics.tsx` — Performance metrics UI
- `src/ui/pipeline-builder-ui/pipeline-canvas.tsx` — Visual pipeline canvas

### Task 6: Build verification
Run `npm run build` and verify success. All phases must compile without errors.
