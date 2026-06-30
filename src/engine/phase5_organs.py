"""
Phase 5: The Deep Interpretation Organs
(Drift Proper, Loops, Contradiction, Narrative, Identity, Prediction)

Usage:
    python phase5_organs.py <user_id>
    or import and call run_phase5_organs(user_id)
"""
import os
import sys
import uuid
import json
import hashlib
from collections import Counter
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client, Client
from litellm import completion

load_dotenv('../../.env.local')
supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not supabase_url or not supabase_key:
    print("Error: Missing Supabase credentials")
    sys.exit(1)

supabase: Client = create_client(supabase_url, supabase_key)


def make_insight_id(user_id: str, kind: str) -> str:
    """Deterministic UUID-shaped ID so insight upsert correctly updates existing rows.
    Same user_id + kind always produces the same ID (migration 050 adds unique constraint)."""
    digest = hashlib.sha256(f"{user_id}:{kind}".encode()).hexdigest()
    return f"{digest[:8]}-{digest[8:12]}-4{digest[13:16]}-{digest[16:20]}-{digest[20:32]}"


def _compute_loops_from_graph(edges: list) -> list:
    """
    Real loop mining: scans chronic_edges for repeated (head, relation_label)
    pairs that point to different tails over time — a behavioral pattern of
    revisiting the same topic/relationship type. Returns a list of loop descriptors.
    """
    # Count (head, relation_label) pairs — frequency > 1 = a loop
    pair_counts: Counter = Counter()
    pair_tails: dict = {}
    pair_timestamps: dict = {}

    for edge in edges:
        key = (edge.get('head_node_id', ''), edge.get('relation_label', ''))
        pair_counts[key] += 1
        pair_tails.setdefault(key, []).append(edge.get('tail_node_id', ''))
        pair_timestamps.setdefault(key, []).append(edge.get('created_at', ''))

    loops = []
    for (head, relation), count in pair_counts.items():
        if count < 2:
            continue  # Not a loop — single occurrence

        tails = pair_tails[(head, relation)]
        timestamps = sorted([t for t in pair_timestamps[(head, relation)] if t])
        unique_tails = list(dict.fromkeys(tails))  # preserve order, deduplicate

        # Estimate average duration between loop occurrences
        avg_days = 0.0
        if len(timestamps) >= 2:
            try:
                t0 = datetime.fromisoformat(timestamps[0].replace('Z', '+00:00'))
                t1 = datetime.fromisoformat(timestamps[-1].replace('Z', '+00:00'))
                total_days = abs((t1 - t0).days)
                avg_days = total_days / max(1, len(timestamps) - 1)
            except (ValueError, TypeError):
                avg_days = 0.0

        loops.append({
            "head": head,
            "relation": relation,
            "occurrence_count": count,
            "unique_targets": unique_tails[:5],  # top 5
            "avg_duration_days": round(avg_days, 1),
            "last_occurrence": timestamps[-1] if timestamps else datetime.utcnow().isoformat(),
        })

    # Sort by occurrence count descending — most frequent loops first
    return sorted(loops, key=lambda x: x['occurrence_count'], reverse=True)


def run_phase5_organs(user_id: str) -> None:
    """
    Phase 5: The Deep Interpretation Organs
    Requires an explicit user_id — never operates on arbitrary/first DB user.
    """
    print(f"--- INITIATING PHASE 5 INTERPRETATION ORGANS for user {user_id[:8]}... ---")

    # ── 1. CONTRADICTION (Read out) ──────────────────────────────────────────
    print("\n[1/5] Reading Contradictions...")
    cont_res = supabase.table("chronic_edges") \
        .select("id, head_node_id, relation_label, tail_node_id, is_contradicted_by, valid_to, created_at") \
        .eq("user_id", user_id) \
        .not_("is_contradicted_by", "is", None) \
        .execute()
    contradictions = cont_res.data or []
    print(f"Found {len(contradictions)} explicit contradictions in the graph for this user.")

    # ── 2. LOOPS (Sequence-pattern mining — real graph analysis) ────────────
    print("\n[2/5] Mining Behavioral Loops from Knowledge Graph...")
    edges_res = supabase.table("chronic_edges") \
        .select("head_node_id, tail_node_id, relation_label, created_at") \
        .eq("user_id", user_id) \
        .is_("valid_to", "null") \
        .execute()
    all_edges = edges_res.data or []

    detected_loops = _compute_loops_from_graph(all_edges)
    print(f"Detected {len(detected_loops)} behavioral loop pattern(s) from {len(all_edges)} active edges.")

    loops_saved = 0
    for loop in detected_loops[:10]:  # cap at 10 loops per run
        loop_data = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "loop_description": (
                f"Recurring: [{loop['head'].replace('_', ' ')}] "
                f"{loop['relation'].replace('_', ' ')} "
                f"({loop['occurrence_count']}x)"
            ),
            "trigger_pattern": loop['relation'],
            "occurrence_count": loop['occurrence_count'],
            "avg_duration_days": loop['avg_duration_days'],
            "last_occurrence_at": loop['last_occurrence'],
            "is_active": True
        }
        try:
            supabase.table("detected_loops").upsert(loop_data).execute()
            loops_saved += 1
        except Exception as e:
            print(f"[Loop Save Error] {e}")

    print(f"Saved {loops_saved} loop(s) to detected_loops.")

    # ── 3. NARRATIVE & IDENTITY ───────────────────────────────────────────────
    print("\n[3/5] Compressing Narrative and Identity from real graph data...")

    # Build a data-grounded context from actual edges and contradictions
    top_entities = list({e.get('head_node_id', '') for e in all_edges[:50] if e.get('head_node_id')})[:10]
    top_relations = [l['relation'] for l in detected_loops[:5]]
    contradiction_count = len(contradictions)

    context_summary = (
        f"Active graph nodes: {', '.join(top_entities[:8])}. "
        f"Most frequent behavioral patterns: {', '.join(top_relations[:5])}. "
        f"Contradiction count: {contradiction_count}. "
        f"Total active edges: {len(all_edges)}."
    )

    try:
        prompt = (
            "You are the Narrative Organ of a personal intelligence system's bi-temporal knowledge graph. "
            "Based on the following graph summary of a user's real knowledge graph data, "
            "write a 1-sentence Narrative of what this person is becoming, "
            "and a 1-2 word Identity label that captures their current dominant mode. "
            "Be specific to the data — do not hallucinate patterns that aren't implied. "
            f"\n\nGraph Summary:\n{context_summary}\n\n"
            "Return JSON only: {\"narrative\": \"string\", \"identity\": \"string\"}"
        )
        response = completion(
            model="gemini/gemini-1.5-flash",
            messages=[{"role": "user", "content": prompt}]
        )
        raw = response.choices[0].message.content.replace('```json', '').replace('```', '').strip()
        res_json = json.loads(raw)

        # Cite the graph edges used as evidence
        citation_ids = [e.get('head_node_id', '') for e in all_edges[:5] if e.get('head_node_id')]

        insight = {
            "id": make_insight_id(user_id, "narrative_identity"),  # deterministic for upsert
            "user_id": user_id,
            "kind": "narrative_identity",
            "title": f"Identity: {res_json.get('identity', 'Unknown')}",
            "body": res_json.get('narrative', ''),
            "citations": citation_ids,
            "strength": 0.85,
            "is_current": True
        }
        supabase.table("insights").upsert(insight).execute()
        print(f"Narrative: {res_json.get('narrative', '')}")
        print(f"Identity:  {res_json.get('identity', '')}")
    except Exception as e:
        print(f"Narrative generation failed: {e}")

    # ── 4. CONTRADICTION INSIGHTS ─────────────────────────────────────────────
    print("\n[4/5] Surfacing contradiction insights...")
    if contradictions:
        try:
            contradiction_summary = "; ".join([
                f"{c.get('head_node_id', '?')} {c.get('relation_label', '?')} changed to {c.get('is_contradicted_by', '?')}"
                for c in contradictions[:5]
            ])
            contradiction_insight = {
                "id": make_insight_id(user_id, "contradiction"),  # deterministic for upsert
                "user_id": user_id,
                "kind": "contradiction",
                "title": f"{len(contradictions)} behavioral contradiction(s) detected in knowledge graph",
                "body": (
                    f"The graph contains {len(contradictions)} edge(s) where a prior belief was superseded by new evidence. "
                    f"Key contradictions: {contradiction_summary}. "
                    "These represent places where stated intent diverged from lived behavior."
                ),
                "citations": [c.get('id', '') for c in contradictions[:5]],
                "strength": min(1.0, 0.5 + len(contradictions) * 0.1),
                "is_current": True
            }
            supabase.table("insights").upsert(contradiction_insight).execute()
            print(f"Contradiction insight saved ({len(contradictions)} cases).")
        except Exception as e:
            print(f"[Contradiction Insight Error]: {e}")
    else:
        print("No contradictions found — no contradiction insight written.")

    # ── 5. TRAJECTORY PREDICTION ──────────────────────────────────────────────
    print("\n[5/5] Trajectory Projection...")
    edge_velocity = len(all_edges)
    contradiction_rate = len(contradictions) / max(1, edge_velocity)
    loop_density = len(detected_loops) / max(1, edge_velocity)

    if contradiction_rate > 0.1:
        trajectory = "high contradiction density — divergence between stated intent and behavior is accelerating"
    elif loop_density > 0.05:
        trajectory = "stable loop patterns — recurring behavioral cycles are reinforcing"
    elif edge_velocity > 100:
        trajectory = "high-velocity graph growth — knowledge accumulation is rapid"
    else:
        trajectory = "early graph stage — insufficient edge volume for robust trajectory projection"

    print(f"Trajectory: {trajectory} (edges={edge_velocity}, contradiction_rate={contradiction_rate:.2%})")
    print("\n--- PHASE 5 COMPLETE ---")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python phase5_organs.py <user_id>")
        print("You must supply an explicit user_id — this script never operates on an arbitrary user.")
        sys.exit(1)
    run_phase5_organs(sys.argv[1])
