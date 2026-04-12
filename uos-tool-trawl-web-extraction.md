# PRD: uos-tool-trawl-web-extraction — Intelligent Web Intelligence Platform

## Context
Web extraction tool — structured extraction with regex-based HTML parsing, confidence scoring, drift detection, schema validation. Strong type system but limited extraction technology.

## Vision (April 2026 — World-Class)
This should be the **intelligent web intelligence platform** — extracting structured knowledge from any website automatically, detecting changes before they matter, and turning the entire web into a queryable knowledge base.

## What's Missing / Innovation Opportunities

### 1. AI-Powered Extraction
Currently: Regex-based HTML parsing.
**Add**: LLM-based semantic extraction. Vision model for image-heavy pages. Table/structured data detection. Multi-page crawling with sitemap inference.

### 2. Continuous Monitoring
Currently: One-shot extraction.
**Add**: Scheduled extraction with change detection. Delta alerting. Historical version storage. Drift predictions.

### 3. Extraction Pipeline Builder
Currently: Single extract action.
**Add**: Visual pipeline builder. Multi-step extraction flows. Data transformation steps. Output routing.

### 4. Web Intelligence Dashboard (UI)
Currently: Basic widget.
**Add**: Extraction monitor. Schema designer. Change history viewer. Performance metrics.

## Implementation Phases

### Phase 1: AI Extraction
- LLM extractor (`src/extraction/llm-extractor.ts`)
- Vision extraction for images
- Table detector

### Phase 2: Continuous Monitoring
- Scheduled extraction (`src/extraction/scheduler.ts`)
- Version storage
- Delta alerting

### Phase 3: Pipeline + Dashboard
- Pipeline builder
- Schema designer UI
- Advanced monitoring dashboard

## Technical Approach
- TypeScript + Zod
- `@paperclipai/plugin-sdk`
- LLM API for semantic extraction
- Playwright for rendering JavaScript pages

## Success Metrics
- Extraction accuracy: > 90%
- Coverage: 50+ supported site types
- Drift detection time: < 10 minutes
