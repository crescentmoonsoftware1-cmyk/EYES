import os
import uuid
import networkx as nx
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client, Client

# Note: In production, install cdlib and leidenalg:
# pip install cdlib leidenalg networkx
# from cdlib import algorithms

load_dotenv('../../.env.local')
supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not supabase_url or not supabase_key:
    print("Error: Missing Supabase credentials")
    exit(1)

supabase: Client = create_client(supabase_url, supabase_key)

import sys

def run_leiden_clustering(user_id: str):
    """
    Phase 4.B: Leiden Community Detection
    Runs nightly against the graph for a SPECIFIC user.
    Requires an explicit user_id — never processes all users at once.
    """
    print(f"Starting Nightly Leiden Community Detection for user {user_id[:8]}...")

    # 1. Fetch the graph — scoped to this user ONLY
    res = supabase.table("chronic_edges").select("*").eq("user_id", user_id).is_("valid_to", "null").execute()
    edges = res.data
    
    if not edges:
        print("Graph is empty. Skipping clustering.")
        return
        
    print(f"Loaded {len(edges)} active edges from the Knowledge Graph.")
    
    # 2. Build NetworkX Graph
    G = nx.Graph()
    for e in edges:
        G.add_edge(e['head_node_id'], e['tail_node_id'], weight=e['confidence'])
        
    print(f"Built network with {G.number_of_nodes()} nodes.")
    
    # 3. Run Leiden Algorithm
    print("Executing Leiden algorithm for community detection...")
    try:
        from cdlib import algorithms
        coms = algorithms.leiden(G)
        communities = coms.communities
    except ImportError:
        print("[Notice] 'cdlib' or 'leidenalg' not installed. Falling back to Louvain approximation for local dev.")
        # Fallback for local development if pip install hasn't run
        communities = list(nx.community.louvain_communities(G, weight='weight'))
        
    print(f"Discovered {len(communities)} distinct cognitive clusters.")
    
    # 4. Save to Database
    clusters_to_insert = []
    # Preserve per-user scoping: each edge carries its own user_id
    # Do NOT use edges[0]['user_id'] — that operated on an arbitrary user.
    user_id_for_edge = lambda e: e.get('user_id', 'unknown')
    
    for i, comm in enumerate(communities):
        if len(comm) < 2:
            continue  # Skip trivial clusters

        cluster_id = str(uuid.uuid4())
        # Determine the user_id for this community (majority vote on edge user_ids)
        community_nodes = set(comm)
        edge_user_ids = [
            user_id_for_edge(e) for e in edges
            if e['head_node_id'] in community_nodes or e['tail_node_id'] in community_nodes
        ]
        uid = max(set(edge_user_ids), key=edge_user_ids.count) if edge_user_ids else 'unknown'
        label = f"Emerging Pattern #{i+1}"

        clusters_to_insert.append({
            "id": cluster_id,
            "user_id": uid,
            "cluster_id": cluster_id,
            "cluster_label": label,
            "cluster_description": f"Automatically grouped cluster containing {len(comm)} entities.",
            "characteristics": list(comm)[:10],
            "is_current": True,
            "occurrence_count": len(comm),
            "last_entered_at": datetime.utcnow().isoformat()
        })
        
    if clusters_to_insert:
        # Group clusters by user_id so we replace cleanly per user
        from itertools import groupby
        clusters_to_insert.sort(key=lambda x: x['user_id'])
        for uid, group in groupby(clusters_to_insert, key=lambda x: x['user_id']):
            user_clusters = list(group)
            # Replace old clusters for this specific user to avoid duplication bloat
            supabase.table("cognitive_clusters").delete().eq("user_id", uid).execute()
            supabase.table("cognitive_clusters").insert(user_clusters).execute()
        print(f"Successfully saved {len(clusters_to_insert)} clusters to Supabase across {len(set(c['user_id'] for c in clusters_to_insert))} user(s).")
        print("The Mindmap UI and User can now review and name these clusters.")
    else:
        print("No significant clusters found.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python batch_leiden.py <user_id>")
        print("You must supply an explicit user_id — this script never processes all users at once.")
        sys.exit(1)
    run_leiden_clustering(sys.argv[1])
