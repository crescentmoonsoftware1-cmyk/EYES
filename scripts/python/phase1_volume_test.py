import os
import json
import requests
from dotenv import load_dotenv
from supabase import create_client, Client

# Load Env
load_dotenv('.env.local')
supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not supabase_url or not supabase_key:
    print("Error: Missing Supabase credentials in .env.local")
    exit(1)

supabase: Client = create_client(supabase_url, supabase_key)

USER_ID = "4d2f3e3c-b834-43fc-852a-c3cdbb535b68"
EMAIL = "thomasshelby251890@gmail.com"
ENGINE_URL = "http://localhost:8000/extract"
MAX_RECORDS = 30  # Limit to 30 records for a clean, stable test run

def run_test():
    print(f"Fetching Gmail memories for user: {EMAIL} ({USER_ID})...")
    response = supabase.table("memories")\
        .select("id, title, content, timestamp")\
        .eq("user_id", USER_ID)\
        .eq("platform", "gmail")\
        .execute()
        
    records = response.data
    if not records:
        print(f"No Gmail memories found for {EMAIL}.")
        return

    total_records = len(records)
    records_to_process = records[:MAX_RECORDS]
    process_count = len(records_to_process)
    print(f"Found {total_records} Gmail memories. Processing a sample of {process_count} records sequentially...")

    report_samples = []
    total_entities_count = 0
    total_relations_count = 0
    
    entity_type_counts = {}
    relation_type_counts = {}

    for idx, record in enumerate(records_to_process):
        title = record.get("title", "No Subject")
        content = record.get("content", "")
        if not content:
            continue
            
        safe_title = title.encode('ascii', 'ignore').decode()
        print(f"[{idx+1}/{process_count}] Processing: {safe_title[:45]}...")
        
        try:
            payload = {
                "user_id": USER_ID,
                "platform_id": "gmail",
                "text": content[:3000] # Cap content length
            }
            res = requests.post(ENGINE_URL, json=payload, timeout=90)
            if res.status_code != 200:
                print(f"  Error from engine: {res.status_code}")
                continue
                
            data = res.json()
            entities = data.get("entities", [])
            relations = data.get("relations", [])
            
            print(f"  Success -> Entities: {len(entities)}, Relations: {len(relations)}")
            
            # Update stats
            total_entities_count += len(entities)
            total_relations_count += len(relations)
            
            for ent in entities:
                label = ent["label"]
                entity_type_counts[label] = entity_type_counts.get(label, 0) + 1
                
            for rel in relations:
                label = rel["label"]
                relation_type_counts[label] = relation_type_counts.get(label, 0) + 1
                
            report_samples.append({
                "id": record["id"],
                "title": title,
                "snippet": content[:300] + "...",
                "entities": entities,
                "relations": relations
            })
        except Exception as e:
            print(f"  Failed: {e}")

    # Compile the final report json
    report = {
        "user_email": EMAIL,
        "user_id": USER_ID,
        "total_records_processed": len(report_samples),
        "total_entities_extracted": total_entities_count,
        "total_relations_extracted": total_relations_count,
        "entity_type_counts": entity_type_counts,
        "relation_type_counts": relation_type_counts,
        "samples_for_audit": report_samples
    }

    os.makedirs('reports', exist_ok=True)
    report_path = 'reports/volume_test_results.json'
    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2)

    print(f"\nVolume test finished successfully!")
    print(f"Total processed: {len(report_samples)}")
    print(f"Total entities: {total_entities_count}")
    print(f"Total relations: {total_relations_count}")
    print(f"Results saved to: {report_path}")

if __name__ == "__main__":
    run_test()
