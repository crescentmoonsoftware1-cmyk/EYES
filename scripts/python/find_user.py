import os
from supabase import create_client, Client
from dotenv import load_dotenv

current_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(current_dir, '..', '..', '.env.local'))

sb_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
sb_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
supabase: Client = create_client(sb_url, sb_key)

print("Fetching user ID for thomasshelby251890@gmail.com...")
# Query auth.users via RPC or just query users table
try:
    response = supabase.table('memories').select('user_id').limit(1).execute()
    if response.data:
        uid = response.data[0]['user_id']
        print("Found User ID:", uid)
        
        mems = supabase.table('memories').select('content').eq('user_id', uid).limit(10).execute()
        for m in mems.data:
            print("Memory:", m['content'])
    else:
        print("No memories found")
except Exception as e:
    print("Error:", e)
