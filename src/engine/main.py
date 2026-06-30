from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends, Security
from fastapi.security.api_key import APIKeyHeader
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from gliner import GLiNER
import os
import json
from litellm import completion
from supabase import create_client, Client
from datetime import datetime

# Initialize Supabase
from dotenv import load_dotenv
load_dotenv('../../.env.local')  # Or system env
sb_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
sb_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
supabase: Optional[Client] = create_client(sb_url, sb_key) if sb_url and sb_key else None

# ── Auth: Bearer token check (H1 fix) ──────────────────────────────────────
CHRONIC_ENGINE_SECRET = os.environ.get("CHRONIC_ENGINE_SECRET", "")
api_key_header = APIKeyHeader(name="X-Engine-Secret", auto_error=False)

async def verify_engine_secret(key: Optional[str] = Security(api_key_header)) -> bool:
    """Validates that the caller knows the CHRONIC_ENGINE_SECRET.
    Allows unauthenticated calls only in local dev (no secret configured)."""
    if not CHRONIC_ENGINE_SECRET:
        # No secret configured — allow all calls (local dev only)
        return True
    if key != CHRONIC_ENGINE_SECRET:
        raise HTTPException(status_code=403, detail="Invalid engine secret.")
    return True

app = FastAPI(title="EYES Chronic Layer Engine", version="1.0.0")

# Global reference for the model so it stays hot in memory
gliner_model = None

# Default schema from the Build Directive
DEFAULT_ENTITY_LABELS = [
    "person", "organization", "place", "project",
    "commitment", "decision", "goal", "emotional_state",
    "event", "topic", "document", "financial_transaction"
]

class ExtractRequest(BaseModel):
    user_id: Optional[str] = None
    platform_id: Optional[str] = None
    text: str
    labels: Optional[List[str]] = None
    threshold: Optional[float] = 0.6

class EntityResult(BaseModel):
    label: str
    text: str
    score: float
    start: int
    end: int

class RelationResult(BaseModel):
    head: str
    label: str
    tail: str
    score: float

class ExtractResponse(BaseModel):
    entities: List[EntityResult]
    relations: List[RelationResult]


@app.on_event("startup")
async def load_model():
    """Loads the GLiNER model into memory when the server starts."""
    global gliner_model
    print("Loading GLiNER model into RAM...")
    try:
        gliner_model = GLiNER.from_pretrained("urchade/gliner_small-v2.1")
        print("GLiNER model loaded successfully. Engine is ready.")
    except Exception as e:
        print(f"Failed to load model: {e}")

@app.post("/extract", response_model=ExtractResponse)
async def extract_entities(request: ExtractRequest, _: bool = Depends(verify_engine_secret)):
    """
    Receives raw text from the Next.js Perception Layer,
    runs it through GLiNER, and returns structured entities with their exact character anchors.
    Requires X-Engine-Secret header when CHRONIC_ENGINE_SECRET env var is set.
    """
    if not gliner_model:
        raise HTTPException(status_code=503, detail="Model is currently loading or failed to load.")

    if not request.text:
        return {"entities": [], "relations": []}

    labels_to_use = request.labels if request.labels else DEFAULT_ENTITY_LABELS

    try:
        # 1. Predict entities via GLiNER
        predictions = gliner_model.predict_entities(request.text, labels_to_use)

        entities = []
        for p in predictions:
            if p["score"] >= request.threshold:
                entities.append({
                    "label": p["label"],
                    "text": p["text"],
                    "score": p["score"],
                    "start": p["start"],
                    "end": p["end"]
                })

        # 2. Extract Relationships via Local Model
        relations = []
        if len(entities) > 1:
            try:
                # 2A. Try local extraction first
                if hasattr(gliner_model, 'predict_relations'):
                    # Some GLiNER2 / multitask versions expose predict_relations natively
                    relations = gliner_model.predict_relations(request.text, entities=entities)
                elif hasattr(gliner_model, 'extract_relations'):
                    relations = gliner_model.extract_relations(request.text, entities)
            except Exception as local_err:
                print(f"[Relationship Engine] Local RE Error: {local_err}. Falling back to LLM.")

            # 2B. Fallback to LiteLLM (Gemini) only if local extraction yielded nothing
            if not relations:
                try:
                    entity_list_str = ", ".join([f"[{e['label']}] {e['text']}" for e in entities])
                    system_prompt = (
                        "You are a knowledge graph relationship extractor. "
                        "Extract relationships between the provided entities based on the text. "
                        "Return ONLY a valid JSON array of objects with keys: 'head', 'label', 'tail', 'score' (0.0-1.0). "
                        "Use labels like 'works_at', 'located_in', 'committed_to', 'mentioned_with_emotion', 'discusses'. "
                        "If no relationships exist, return []."
                    )

                    user_prompt = f"Text:\n{request.text[:2000]}\n\nEntities Found:\n{entity_list_str}"

                    response = completion(
                        model="gemini/gemini-1.5-flash",
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        temperature=0.0
                    )

                    llm_output = response.choices[0].message.content
                    cleaned_output = llm_output.replace("```json", "").replace("```", "").strip()
                    relations = json.loads(cleaned_output)

                except Exception as llm_err:
                    print(f"[Relationship Engine] LiteLLM Error: {llm_err}. Skipping relation extraction.")

        # 3. Phase 4.C: Contradiction Handling
        if supabase and request.user_id and len(relations) > 0:
            try:
                for rel in relations:
                    head_id = rel['head'].lower().replace(' ', '_')
                    tail_id = rel['tail'].lower().replace(' ', '_')

                    res = supabase.table("chronic_edges") \
                        .select("id, tail_node_id") \
                        .eq("user_id", request.user_id) \
                        .eq("head_node_id", head_id) \
                        .eq("relation_label", rel['label']) \
                        .is_("valid_to", "null") \
                        .execute()

                    existing_edges = res.data

                    if existing_edges:
                        for old_edge in existing_edges:
                            if old_edge['tail_node_id'] != tail_id:
                                print(f"[Phase 4] Contradiction detected! {head_id} {rel['label']} changed from {old_edge['tail_node_id']} to {tail_id}")
                                supabase.table("chronic_edges") \
                                    .update({
                                        "valid_to": datetime.utcnow().isoformat(),
                                        "is_contradicted_by": tail_id
                                    }) \
                                    .eq("id", old_edge['id']) \
                                    .execute()
            except Exception as db_err:
                print(f"[Phase 4 DB Error]: {db_err}")

        return {"entities": entities, "relations": relations}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    """Root endpoint so the browser doesn't return a 404."""
    return {"message": "EYES Chronic Layer Engine is running. Visit /docs for the API dashboard."}

@app.get("/health")
async def health_check():
    """Simple health check endpoint."""
    return {"status": "ok", "model_loaded": gliner_model is not None}
