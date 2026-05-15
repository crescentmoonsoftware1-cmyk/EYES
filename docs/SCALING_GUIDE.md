# 👁️ The EYES — Scaling & Operations Documentation

## 1. System Overview
The EYES (Everything You Ever Said) is a Neural Memory OS designed to ingest, index, and surface personal digital context through a behavioral intelligence layer. 

### Core Components:
*   **Neural Index**: Vector-based memory storage using Supabase pgvector.
*   **Cognitive Layer**: Background analysis of behavioral loops, state drift, and cognitive clusters.
*   **Privacy Shield**: A hardware-grade abstraction that prevents sensitive data from being indexed.
*   **Multi-Provider AI**: A resilient failover system (OpenRouter → Claude → Gemini).

---

## 2. Current State (Phase 1: Developer Beta)
The system is currently configured for **Single-User / Developer** usage.

| Metric | Current Configuration | Limitation |
| :--- | :--- | :--- |
| **Max Concurrent Users** | 1–3 | AI Provider Rate Limits (429 Errors) |
| **Sync Capacity** | 10 Users / Daily | Vercel Hobby Timeout (10s) |
| **AI Tiers** | Shared Free Keys | Unreliable streaming / Empty responses |
| **Vector Dims** | 1024 (Cohere/Gemini) | Free tier RPM bottlenecks |

---

## 3. Scaling Roadmap (Phase 2: 100-User Production)

To reach the **100-User Milestone**, the following infrastructure upgrades are mandatory:

### A. Infrastructure Hardening
*   **Vercel Pro**: Upgrade to the Pro plan ($20/mo) to increase the **Serverless Function Timeout** from 10s to 60s. This is required for batch syncing 100 users.
*   **Supabase Pro**: Move to the Pro tier ($25/mo) to support high-volume vector searches and millions of indexed memories.

### B. AI API Upgrades
*   **OpenRouter Paid Credits**: Add a minimum $10 credit. This unlocks "High Priority" routing and removes the free-tier rate limits.
*   **Google AI Studio (Gemini)**: Enable billing to move from the Free of Charge tier (15 RPM) to the Pay-as-you-go tier (2000 RPM).
*   **Cohere Production**: Move to a production key to support high-throughput embedding generation during the 30-minute sync windows.

---

## 4. Environment Tuning Guide
To scale to 100 users, update the following variables in your production environment:

```bash
# Increase the number of users processed in a single Cron run
CRON_MAX_USERS_PER_RUN="100"

# Increase concurrent sync tasks (Vercel Pro required for this)
USER_CONCURRENCY="10"
PLATFORM_CONCURRENCY="4"

# Set Chat Preference to the most stable provider
AI_CHAT_PREFERENCE="gemini" # Gemini is currently the most stable high-volume fallback
```

---

## 5. Security & Isolation (RLS)
The EYES uses **Row Level Security (RLS)** as its primary tenant isolation mechanism.
*   **memories table**: Isolated via `user_id`.
*   **oauth_tokens table**: Isolated via `user_id`.
*   **cognitive_clusters table**: Isolated via `user_id`.

**Rule**: Every API route and background job MUST utilize the `user_id` from the Supabase Auth context to prevent cross-user data leakage.

---

## 6. Troubleshooting "AI Unavailable"
If the UI displays *"All AI providers are currently unavailable"*, check the following:
1.  **OpenRouter Balance**: Ensure credits are > $0.
2.  **API Rate Limits**: Check the logs for `429 Too Many Requests`.
3.  **Token Encryption Key**: Verify `TOKEN_ENCRYPTION_KEY` matches the key used to encrypt the stored platform tokens.

⚠️  Common Root Cause
In most cases, "AI Unavailable" errors are caused by an exhausted OpenRouter balance or a mismatch in the TOKEN_ENCRYPTION_KEY. Check these two first before escalating.

## 7. Cost Analysis (100-User Scale)

To maintain a production-grade experience for 100 users, the estimated monthly burn is divided into Fixed Infrastructure and Variable AI Usage.

### A. Fixed Monthly Infrastructure ($45/mo)
| Service | Plan | Monthly Cost | Purpose |
| :--- | :--- | :--- | :--- |
| **Vercel** | Pro Plan | $20.00 | Higher timeouts (60s) and faster builds. |
| **Supabase** | Pro Plan | $25.00 | Vector storage for 1M+ memories and daily backups. |

### B. Variable Monthly AI Usage (Estimated ~$150 - $300/mo)
*Costs depend on how active your 100 users are.*

| Service | Metric | Estimated Cost | Details |
| :--- | :--- | :--- | :--- |
| **OpenRouter / Gemini** | Chat Reasoning | $1.00 - $2.50 / user | Based on ~500 messages per user/mo. |
| **Cohere** | Embeddings | $0.20 - $0.50 / user | Based on syncing 10k items per user/mo. |

### C. Total Estimated Budget
*   **Total Monthly**: **~$195.00 - $345.00**
*   **Cost Per User**: **~$1.95 - $3.45**

> [!TIP]
> **Cost Saving Strategy**: By setting `AI_CHAT_PREFERENCE="gemini"` and using `gemini-2.0-flash`, you can reduce the Chat Reasoning cost by nearly 60% compared to using Claude 3.5 Sonnet, with very little loss in accuracy for memory retrieval.
