import requests
import json
import os
from dotenv import load_dotenv

# Load env to get secret if needed
current_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(current_dir, '..', '..', '.env.local'))

ENGINE_URL = "http://localhost:8000/extract"
SECRET = os.environ.get("CHRONIC_ENGINE_SECRET", "")

headers = {"Content-Type": "application/json"}
if SECRET:
    headers["X-Engine-Secret"] = SECRET

test_cases = [
    {
        "expected_edge": "commitment",
        "text": "I promise to deliver the new API endpoints by tomorrow evening."
    },
    {
        "expected_edge": "delayed_on",
        "text": "The frontend deployment is currently blocked because we are waiting on the backend database migration."
    },
    {
        "expected_edge": "decided_against",
        "text": "After reviewing the options, we have decided not to use React Native for the mobile app."
    }
]

def run_tests():
    print("--- Running Moat Edge Extraction Tests ---")
    misses = 0
    total = len(test_cases)
    
    for i, test in enumerate(test_cases):
        print(f"\nTest {i+1}: Testing for '{test['expected_edge']}'")
        print(f"Text: \"{test['text']}\"")
        
        payload = {
            "text": test['text'],
            "labels": ["person", "organization", "project", "commitment", "decision", "goal", "event", "topic", "technology", "task", "blocker"],
            "threshold": 0.4
        }
        
        try:
            response = requests.post(ENGINE_URL, json=payload, headers=headers)
            if response.status_code != 200:
                print(f"❌ Error: Engine returned {response.status_code}")
                print(response.text)
                misses += 1
                continue
                
            data = response.json()
            entities = data.get("entities", [])
            relations = data.get("relations", [])
            
            print("Extracted Entities:", json.dumps(entities, indent=2))
            
            found = False
            for rel in relations:
                if rel.get("label") == test['expected_edge']:
                    found = True
                    print(f"✅ SUCCESS: Found '{test['expected_edge']}' edge -> [{rel.get('head')}] --({rel.get('label')})--> [{rel.get('tail')}]")
                    break
            
            if not found:
                print(f"❌ FAILED: Missed '{test['expected_edge']}' edge.")
                print("Extracted relations:", json.dumps(relations, indent=2))
                misses += 1
                
        except Exception as e:
            print(f"❌ Error connecting to engine: {e}")
            misses += 1
            
    print("\n--- Test Summary ---")
    print(f"Total Tests: {total}")
    print(f"Misses: {misses}")
    if misses == 0:
        print("\nAll moat edges successfully extracted! Ready to update Go/No-Go Memo.")
    else:
        print("\nSome moat edges were missed. Engine tuning required.")

if __name__ == "__main__":
    run_tests()
