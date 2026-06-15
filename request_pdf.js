async function run() {
  try {
    const url = 'http://localhost:3000/api/audit/dd1fe08c-e7b4-46ba-a1b2-da6517cfc89b/pdf?bypass_auth=true';
    console.log('Fetching:', url);
    const res = await fetch(url);
    console.log('Status:', res.status);
    console.log('Headers:', Object.fromEntries(res.headers.entries()));
    const text = await res.text();
    console.log('Body snippet (first 1000 chars):');
    console.log(text.slice(0, 1000));
  } catch (err) {
    console.error('Request failed:', err);
  }
}
run();
