# EYES Engineering Status: Chronic Layer Build Initiation
**Date:** June 26, 2026
**Authors:** EYES Engineering Team
**Current Phase:** Phase 0 (Foundation) & Phase 1 (Extraction Spike)

---

## 1. Executive Summary
Today marked the official commencement of the **Track Two: Chronic Layer** build. The primary objective was to audit the existing Track One infrastructure (the live platform sync and ingestion layer), enforce strict data provenance rules, and initiate a localized spike to validate our new AI extraction toolchain. 

We successfully established the foundational "Perception Layer," refactored our core chunking mechanisms to adhere to the non-negotiable "Anchoring Rule," and initialized a local testing environment to run the GLiNER and GLiREL models against live, real-world Gmail data.

---

## 2. Architectural Audit & State of the Codebase
Before writing new extraction logic, we conducted a comprehensive review of the current system architecture:

*   **Track One Stability (The "Raw Truth"):** The current data ingestion pipelines (Gmail, Notion, Slack, etc.) located in `api/sync/*` are performing exceptionally well. The pagination logic, rate-limit shielding, and unified upsert operations into the Supabase `memories` table are highly stable. We confirmed that this existing PostgreSQL table acts as the perfect immutable "Raw Truth" ledger required by the directive.
*   **The Legacy AI Bottleneck:** The previous background entity extraction (running via `fireEntityExtraction` in `upsert.ts`) utilized a standard LLM classification prompt (`auto-classify`). 
    *   **The Problem:** It was slow, expensive, and capped at 5 events per batch. More importantly, it only identified generic entities (`person`, `organization`, `tool`, `place`) and was entirely blind to the complex relationships (e.g., `delayed_on`) that constitute the EYES platform's core intellectual property.

---

## 3. Foundation Fixes (Formalizing the Perception Layer)
To prepare the system for the Graphiti + Neo4j bi-temporal graph, we made two critical surgical interventions in the codebase today:

### A. Enforcement of the "Anchoring Rule"
The directive states clearly: *"Every claim carries its receipt."*
*   **Action Taken:** We completely refactored the core text chunker (`src/services/ai/chunking.ts`). 
*   **Technical Result:** The `buildDeterministicChunks` function now calculates and explicitly returns the exact `startIndex` and `endIndex` (character spans) for every single chunk. This ensures that when the Entity Engine eventually writes a "Commitment" node to the Neo4j graph, it will point back to the exact character offset in the original Supabase memory row.

### B. Deprecation of Legacy LLM Extraction
*   **Action Taken:** We injected bypass mechanisms (`return;`) at the top of `fireEntityExtraction` in `upsert.ts` and `extractAndStoreEntities` in `memories.ts`.
*   **Technical Result:** This immediately stops the system from polluting the Supabase database with unanchored, flat, generic entities. It eliminates unnecessary LLM API costs and clears the runway for the new localized Python extraction engine.

---

## 4. Phase 1: Local Extraction Spike
With the foundation secured, we initiated **Phase 1**—a local, isolated test of the new AI extraction toolchain to ensure quality before integrating it into the production codebase.

### Toolchain Selection & Schema Expansion
We bypassed standard LLMs in favor of localized, high-speed Natural Language Processing models:
*   **Entity Engine:** `GLiNER` (Generalist and Lightweight Named Entity Recognition) via `urchade/gliner_multi-v2.1`.
*   **Relation Engine:** `GLiREL` via `jackboyla/glirel-large-v0`.

We configured a standalone Python testing script (`phase1_spike.py`) hooked directly to the local `.env.local` Supabase database. The script loads the new **EYES v0 Schema**, vastly expanding the system's intelligence:
*   **Entities:** `person`, `organization`, `place`, `project`, `commitment`, `decision`, `goal`, `emotional_state`, `event`, `topic`, `document`, `financial_transaction`.
*   **Relationships:** `works_at`, `member_of`, `located_in`, `discusses`, `committed_to`, `delayed_on`, `decided_against`, `mentioned_with_emotion`, `depends_on`, `conflicts_with`, `referenced_alongside`, `searched_for`.

### Current Execution Status
*   The `phase1_spike.py` script has successfully connected to the database and fetched raw Gmail records.
*   **Blocker:** The system is currently actively downloading the massive 1.16 GB `glirel-large-v0` `.safetensors` model file directly from the HuggingFace Hub. Because this is a localized execution to prevent recurring cloud costs, we are waiting on local bandwidth to complete the cache.

---

## 5. Phase 2 Architecture Blueprint (Preview)
While the Phase 1 Spike concludes, the engineering team has outlined the architecture for Phase 2:

1.  **Microservice Architecture:** Because Next.js (TypeScript) cannot efficiently run 1.5 GB PyTorch models, the Phase 2 Entity Engine will be built as a highly performant **FastAPI Python Microservice**.
2.  **Asynchronous Handoff:** The Next.js `upsert.ts` route will be re-wired to fire asynchronous events (likely via Upstash QStash) to the new FastAPI server whenever new data syncs.
3.  **Graph Injection:** The FastAPI server will keep the GLiNER/GLiREL models hot in RAM, process incoming text in milliseconds, and use the **Graphiti** library to write the resulting structured nodes and edges directly into a **Neo4j** graph database.

---

## 6. Immediate Next Steps (Tomorrow)
1.  Review the final JSON output matrix from the completed Phase 1 `phase1_spike.py` run.
2.  Assess the extraction quality specifically focusing on the `commitment` and `decision` entities to verify the models do not hallucinate edges.
3.  Draft and finalize the "Go/No-Go" Extraction Quality Memo.
4.  Begin scaffolding the FastAPI Python Microservice (`/engine` directory) for Phase 2 integration.
