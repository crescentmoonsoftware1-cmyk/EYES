import requests
import json
import os
import time
from supabase import create_client, Client
from dotenv import load_dotenv

current_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(current_dir, '..', '..', '.env.local'))

sb_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
sb_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
supabase: Client = create_client(sb_url, sb_key)

ENGINE_URL = "http://localhost:8000/extract"
SECRET = os.environ.get("CHRONIC_ENGINE_SECRET", "")
headers = {"Content-Type": "application/json"}
if SECRET:
    headers["X-Engine-Secret"] = SECRET

def run_real_data_test():
    print("--- Fetching Real User Data from Supabase ---")
    
    # 1. Get user_id for godfredabhishek123@gmail.com
    user_resp = supabase.table('user_profiles').select('id').eq('email', 'godfredabhishek123@gmail.com').execute()
    if not user_resp.data:
        print("User godfredabhishek123@gmail.com not found in user_profiles.")
        return
        
    user_id = user_resp.data[0]['id']
    print(f"Found User ID: {user_id}")
    
    # 2. Fetch memories from DB for this user
    response = supabase.table('memories').select('content').eq('user_id', user_id).neq('content', 'No description provided.').limit(20).execute()
    
    memories = response.data
    if not memories:
        print("No valid memories found in the database.")
        return
        
    print(f"Fetched {len(memories)} real memory records from database. Starting Extraction...")
    
    total = len(memories)
    edges_found = {"commitment": 0, "delayed_on": 0, "decided_against": 0, "other": 0}
    
    start_time = time.time()
    
    for i, mem in enumerate(memories):
        text = mem['content']
        payload = {
            "text": text,
            "labels": ["person", "organization", "project", "commitment", "decision", "goal", "event", "topic", "technology", "task", "blocker"],
            "threshold": 0.4
        }
        
        try:
            res = requests.post(ENGINE_URL, json=payload, headers=headers)
            if res.status_code == 200:
                relations = res.json().get("relations", [])
                print(f"[{i+1}/{total}] Text: {text[:50]}... -> Found {len(relations)} relations")
                
                for rel in relations:
                    label = rel.get("label")
                    if label in edges_found:
                        edges_found[label] += 1
                        print(f"    \u2705 MOAT EDGE: [{rel.get('head')}] --({label})--> [{rel.get('tail')}]")
                    else:
                        edges_found["other"] += 1
                        print(f"    \u25b6 Other Edge: [{rel.get('head')}] --({label})--> [{rel.get('tail')}]")
            else:
                print(f"[{i+1}/{total}] \u274c Engine Error {res.status_code}")
                
        except Exception as e:
            print(f"[{i+1}/{total}] \u274c Network Error")
            
    end_time = time.time()
    print("\n--- Real Data Volume Test Summary ---")
    print(f"Total Records processed: {total}")
    print(f"Commitments Found: {edges_found['commitment']}")
    print(f"Delayed_on Found: {edges_found['delayed_on']}")
    print(f"Decided_against Found: {edges_found['decided_against']}")
    print(f"Other Relations Found: {edges_found['other']}")
    print(f"Time Taken: {end_time - start_time:.2f} seconds")
    
if __name__ == "__main__":
    run_real_data_test()
