const keys = [
  "AIzaSyAr6L0rJY6zrNVnDJOJ_HX8RY_sATWcass",
  "AIzaSyCTKqQVGp8iio5QYZH5OjIu56K5M16yfxQ",
  "AIzaSyAlN48PmzuoxRVzFGUb48H30Em9k8gxHX0"
];

async function testKeys() {
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: "Hi" }] }] })
      });
      const data = await res.json();
      if (res.ok) {
        console.log(`Key ${i + 1}: WORKING ✅`);
      } else {
        console.log(`Key ${i + 1}: FAILED ❌ - ${data.error?.message || res.status}`);
      }
    } catch (err) {
      console.log(`Key ${i + 1}: FAILED ❌ - ${err.message}`);
    }
  }
}

testKeys();
