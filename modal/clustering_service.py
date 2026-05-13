# clustering_service.py
# Deploy: modal deploy clustering_service.py
# Requires: pip install modal
# Then: modal token new

import modal
from typing import Optional

# ── App definition ─────────────────────────────────────────────────────────────
app = modal.App("eyes-clustering")

# Image with all required math libraries
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "umap-learn==0.5.6",
        "hdbscan==0.8.40",
        "numpy==1.26.4",
        "scikit-learn==1.4.2",
        "fastapi>=0.110.0",
        "pydantic>=2.0.0",
    )
)

# ── Request / Response types ───────────────────────────────────────────────────
from pydantic import BaseModel

class ClusterRequest(BaseModel):
    vectors: list[list[float]]   # Each item = [msg_vol, sentiment, entropy, cadence, social, tod_bias, ...platform_mix_values]
    min_cluster_size: int = 5
    secret: Optional[str] = None

class ClusterResponse(BaseModel):
    labels: list[int]            # -1 = noise/outlier, 0..N = cluster index
    n_clusters: int
    noise_ratio: float
    umap_reduced: Optional[list[list[float]]] = None  # 2D coords for Mind Map visualisation


# ── The actual endpoint ────────────────────────────────────────────────────────
@app.function(image=image, keep_warm=1)  # keep_warm=1 avoids cold starts for weekly cron
@modal.fastapi_endpoint(method="POST")
def cluster(body: ClusterRequest) -> ClusterResponse:
    import numpy as np
    from umap import UMAP
    import hdbscan as hdb

    # Auth check
    import os
    secret = os.environ.get("CLUSTERING_SECRET", "")
    if secret and body.secret != secret:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Invalid secret")

    vectors = body.vectors
    n = len(vectors)

    # Need at least 21 data points for meaningful results
    if n < 21:
        return ClusterResponse(labels=[-1] * n, n_clusters=0, noise_ratio=1.0)

    arr = np.array(vectors, dtype=np.float32)

    # Normalise each dimension to 0-1 range so no single dimension dominates
    col_min = arr.min(axis=0)
    col_max = arr.max(axis=0)
    col_range = col_max - col_min
    col_range[col_range == 0] = 1  # Avoid divide-by-zero for constant columns
    arr_norm = (arr - col_min) / col_range

    # ── UMAP: reduce to 8 dimensions ──────────────────────────────────────────
    n_neighbors = min(15, n - 1)
    reducer = UMAP(
        n_components=8,
        n_neighbors=n_neighbors,
        min_dist=0.1,
        metric="euclidean",
        random_state=42,
    )
    reduced_8d = reducer.fit_transform(arr_norm)

    # ── HDBSCAN: find natural clusters ────────────────────────────────────────
    min_cluster_size = max(body.min_cluster_size, max(3, n // 10))
    clusterer = hdb.HDBSCAN(
        min_cluster_size=min_cluster_size,
        min_samples=3,
        cluster_selection_method="eom",  # Excess of Mass — better for non-uniform density
        prediction_data=True,
    )
    labels = clusterer.fit_predict(reduced_8d)

    n_clusters = int(labels.max()) + 1 if labels.max() >= 0 else 0
    noise_ratio = float((labels == -1).sum()) / n

    # Also produce 2D UMAP for Mind Map visualisation in the UI
    reducer_2d = UMAP(
        n_components=2,
        n_neighbors=n_neighbors,
        min_dist=0.3,
        random_state=42,
    )
    reduced_2d = reducer_2d.fit_transform(arr_norm)

    return ClusterResponse(
        labels=labels.tolist(),
        n_clusters=n_clusters,
        noise_ratio=round(noise_ratio, 3),
        umap_reduced=reduced_2d.tolist(),
    )
