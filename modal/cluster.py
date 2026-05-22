"""
EYES — Cognitive Clustering Service
Deployed on Modal.com (serverless GPU-optional Python)

Endpoint: POST /cluster
Input:  { vectors: float[][], min_cluster_size: int, secret: str }
Output: { labels: int[], umap_reduced: float[][], n_clusters: int, noise_ratio: float }

Deploy:
    pip install modal
    modal deploy modal/cluster.py
    → copies the web endpoint URL into MODAL_CLUSTERING_URL
"""

import modal
import os

# ── Modal App Definition ──────────────────────────────────────────────────────
app = modal.App("eyes-clustering")

# Pre-built image with all ML deps — cached by Modal, ~30s cold start
clustering_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install([
        "umap-learn>=0.5.5",
        "hdbscan>=0.8.36",
        "numpy>=1.26.0,<2.0",
        "scikit-learn>=1.4.0",
    ])
)


# ── Endpoint ──────────────────────────────────────────────────────────────────
@app.function(
    image=clustering_image,
    # No GPU needed — UMAP + HDBSCAN run fine on CPU for ≤500 vectors
    cpu=2.0,
    memory=1024,
    # Keep at 0 idle containers (spun up on demand for weekly cron)
    min_containers=0,
    timeout=120,
)
@modal.fastapi_endpoint(method="POST")
def cluster(data: dict) -> dict:
    import numpy as np
    import umap
    import hdbscan

    # ── Auth ──────────────────────────────────────────────────────────────────
    clustering_secret = os.environ.get("CLUSTERING_SECRET", "")
    if clustering_secret and data.get("secret") != clustering_secret:
        return {"error": "Unauthorized"}, 401

    # ── Input Validation ──────────────────────────────────────────────────────
    vectors = data.get("vectors", [])
    if not vectors or len(vectors) < 5:
        return {
            "labels": [],
            "umap_reduced": [],
            "n_clusters": 0,
            "noise_ratio": 0.0,
            "error": f"Need at least 5 vectors, got {len(vectors)}",
        }

    X = np.array(vectors, dtype=np.float32)

    # Replace any NaN/Inf with 0 (defensive — state vectors should be clean)
    X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)

    # ── UMAP: reduce to 2D for visualization ─────────────────────────────────
    # n_neighbors: controls local vs global structure. 
    #   Low value (5-10) = tighter local clusters, good for small datasets.
    n_neighbors = min(10, len(X) - 1)

    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=n_neighbors,
        min_dist=0.1,
        metric="euclidean",
        random_state=42,
        low_memory=True,
    )
    embedding = reducer.fit_transform(X)  # shape: (n, 2)

    # ── HDBSCAN: cluster on full-dimensional data (not UMAP reduced) ──────────
    # min_cluster_size: minimum points to form a cluster.
    #   Default 5 — matches the 21-vector minimum requirement in Next.js route.
    min_cluster_size = max(3, int(data.get("min_cluster_size", 5)))

    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=min_cluster_size,
        min_samples=1,           # Allow single-point clusters (less noise)
        cluster_selection_method="eom",  # Excess of Mass — stable for small datasets
        prediction_data=True,
    )
    labels = clusterer.fit_predict(X)  # -1 = noise

    # ── Stats ─────────────────────────────────────────────────────────────────
    unique_clusters = set(labels) - {-1}
    n_clusters = len(unique_clusters)
    noise_count = int(np.sum(labels == -1))
    noise_ratio = round(noise_count / len(labels), 3)

    print(
        f"[EYES Clustering] n={len(X)} vectors → "
        f"{n_clusters} clusters, noise={noise_ratio:.1%}, "
        f"labels={labels.tolist()[:10]}..."
    )

    return {
        "labels": labels.tolist(),          # int[] — -1 means noise
        "umap_reduced": embedding.tolist(), # float[][] — 2D coords for Mind Map
        "n_clusters": n_clusters,
        "noise_ratio": noise_ratio,
    }
