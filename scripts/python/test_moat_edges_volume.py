import requests
import json
import os
import time
from dotenv import load_dotenv

current_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(current_dir, '..', '..', '.env.local'))

ENGINE_URL = "http://localhost:8000/extract"
SECRET = os.environ.get("CHRONIC_ENGINE_SECRET", "")

headers = {"Content-Type": "application/json"}
if SECRET:
    headers["X-Engine-Secret"] = SECRET

# Larger volume dataset representing noisy real-world data (Slack, Zoom, Jira context)
test_cases = [
    # COMMITMENT
    {"expected_edge": "commitment", "text": "I'll make sure the auth module is wrapped up by Friday EOD."},
    {"expected_edge": "commitment", "text": "Sarah committed to finishing the UI mockups before the client meeting."},
    {"expected_edge": "commitment", "text": "We promise to deliver the beta version next month."},
    {"expected_edge": "commitment", "text": "My main task this week is to refactor the database schema."},
    {"expected_edge": "commitment", "text": "I'll handle the API integration while you work on the frontend."},
    
    # DELAYED_ON
    {"expected_edge": "delayed_on", "text": "The release is currently stalled because we are waiting on AWS approval."},
    {"expected_edge": "delayed_on", "text": "I can't proceed with the testing phase; it's blocked by the broken staging environment."},
    {"expected_edge": "delayed_on", "text": "We are delayed on the marketing launch due to pending legal reviews."},
    {"expected_edge": "delayed_on", "text": "The mobile app update is waiting for Apple's App Store verification."},
    {"expected_edge": "delayed_on", "text": "Our payment gateway integration is blocked by Stripe's KYC process."},
    
    # DECIDED_AGAINST
    {"expected_edge": "decided_against", "text": "We ultimately chose not to migrate to GraphQL and will stick with REST."},
    {"expected_edge": "decided_against", "text": "The team decided to scrap the dark mode feature for this sprint."},
    {"expected_edge": "decided_against", "text": "After the spike, we rejected the idea of using MongoDB."},
    {"expected_edge": "decided_against", "text": "We are pivoting away from the subscription model and decided against it completely."},
    {"expected_edge": "decided_against", "text": "Management voted to cancel the offshore expansion plan."}
]

def run_volume_test():
    print(f"--- Running Volume Edge Extraction Test ({len(test_cases)} records) ---")
    misses = 0
    start_time = time.time()
    
    for i, test in enumerate(test_cases):
        payload = {
            "text": test['text'],
            "labels": ["person", "organization", "project", "commitment", "decision", "goal", "event", "topic", "technology", "task", "blocker"],
            "threshold": 0.4
        }
        
        try:
            response = requests.post(ENGINE_URL, json=payload, headers=headers)
            if response.status_code != 200:
                print(f"[{i+1}/{len(test_cases)}] \u274c Error {response.status_code}")
                misses += 1
                continue
                
            relations = response.json().get("relations", [])
            
            found = False
            for rel in relations:
                if rel.get("label") == test['expected_edge']:
                    found = True
                    break
            
            if found:
                print(f"[{i+1}/{len(test_cases)}] \u2705 SUCCESS: '{test['expected_edge']}'")
            else:
                print(f"[{i+1}/{len(test_cases)}] \u274c FAILED: Missed '{test['expected_edge']}' in text: '{test['text'][:40]}...'")
                misses += 1
                
        except Exception as e:
            print(f"[{i+1}/{len(test_cases)}] \u274c Network Error")
            misses += 1
            
    end_time = time.time()
    print("\n--- Volume Test Summary ---")
    print(f"Total Tests processed: {len(test_cases)}")
    print(f"Success Rate: {((len(test_cases)-misses)/len(test_cases))*100:.1f}%")
    print(f"Time Taken: {end_time - start_time:.2f} seconds")
    
if __name__ == "__main__":
    run_volume_test()
