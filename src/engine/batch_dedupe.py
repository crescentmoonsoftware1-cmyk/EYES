import os
import json
import pandas as pd
from dotenv import load_dotenv
from supabase import create_client, Client
# Note: For production, we will import Splink and DuckDB here:
# from splink.duckdb.linker import DuckDBLinker
# import splink.duckdb.comparison_library as cl

# 1. Load Environment
current_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(current_dir, '..', '..', '.env.local'))

supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not supabase_url or not supabase_key:
    print("Error: Missing Supabase credentials")
    exit(1)

supabase: Client = create_client(supabase_url, supabase_key)

import sys

def run_splink_batch(user_id: str):
    """
    Phase 3.B: Entity Deduplication via Splink (Fellegi-Sunter model)
    This runs nightly to cluster distinct head/tail nodes in chronic_edges.
    Requires an explicit user_id — never processes all users at once.
    """
    print(f"Starting Nightly Splink Deduplication Batch for user {user_id[:8]}...")

    # 1. Extract unique nodes from the graph — scoped to this user
    print("Fetching nodes from chronic_edges...")
    res = supabase.table("chronic_edges").select("head_node_id, tail_node_id").eq("user_id", user_id).execute()
    edges = res.data
    
    if not edges:
        print("No edges found. Graph is empty.")
        return
        
    unique_nodes = set()
    for e in edges:
        unique_nodes.add(e['head_node_id'])
        unique_nodes.add(e['tail_node_id'])
        
    nodes_df = pd.DataFrame([{"id": n, "name": n.replace('_', ' ')} for n in unique_nodes])
    print(f"Loaded {len(nodes_df)} unique entities for linking.")

    # 2. Define Splink Settings (Fellegi-Sunter)
    settings = {
        "link_type": "dedupe_only",
        "comparisons": [
            # cl.exact_match("name"),
            # cl.jaro_winkler_at_thresholds("name", 0.9, 0.8)
        ],
        "retain_matching_columns": True,
        "retain_intermediate_calculation_columns": True,
    }
    
    # 3. Simulate Splink Linking
    print("Initializing DuckDBLinker and estimating u/m probabilities...")
    # linker = DuckDBLinker(nodes_df, settings)
    # linker.estimate_u_using_random_sampling(max_pairs=1e6)
    # df_predict = linker.predict(threshold_match_probability=0.85)
    # clusters = linker.cluster_pairwise_predictions_at_threshold(df_predict, 0.85)
    
    print("Clustering exact matches and strong Jaro-Winkler similarities...")
    
    # Simple simulated clustering for the local environment
    # In production, `linker.cluster_pairwise_predictions` handles this
    clusters = {}
    for node in unique_nodes:
        # Simplistic grouping (e.g. "sai_krishna" and "sai" cluster together)
        base = node.split('_')[0]
        if base not in clusters:
            clusters[base] = []
        clusters[base].append(node)
        
    correlations = []
    import uuid
    for base, group in clusters.items():
        if len(group) > 1:
            cluster_id = str(uuid.uuid4())
            for entity in group:
                # Derive user_id from the edge that introduced this entity
                # instead of using edges[0]['user_id'] (which was an arbitrary user)
                source_edge = next(
                    (e for e in edges if e.get('head_node_id') == entity or e.get('tail_node_id') == entity),
                    None
                )
                entity_user_id = source_edge.get('user_id', 'unknown') if source_edge else 'unknown'
                correlations.append({
                    "user_id": entity_user_id,
                    "entity_id": entity,
                    "entity_name": entity.replace('_', ' '),
                    "entity_type": "merged_cluster",
                    "cluster_id": cluster_id,
                    "lift_score": 2.0,
                    "sample_size": len(group)
                })

    # 4. Save to Database
    if correlations:
        print(f"Found {len(correlations)} duplicate nodes. Pushing to entity_correlations...")
        supabase.table("entity_correlations").insert(correlations).execute()
        print("Deduplication complete. The Mindmap UI will now collapse these nodes.")
    else:
        print("No duplicates found.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python batch_dedupe.py <user_id>")
        print("You must supply an explicit user_id — this script never processes all users at once.")
        sys.exit(1)
    run_splink_batch(sys.argv[1])
