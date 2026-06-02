const { config } = require('dotenv');
config({ path: '.env.local' });
const { generateEmbedding } = require('./src/services/ai/ai');

async function testSafeRotation() {
  console.log('--- EYES Safe API Rotation Test ---');
  console.log('We will send exactly 3 small embedding requests.');
  console.log('This is well below the 15 RPM limit, ensuring 100% safety for the accounts.\\n');
  
  for (let i = 1; i <= 3; i++) {
    console.log(`[Test] Request ${i} starting...`);
    const result = await generateEmbedding(`This is safe test sentence number ${i}.`);
    if (result && result.embedding) {
      console.log(`[Test] Success! Generated ${result.embedding.length} dimensions.\\n`);
    } else {
      console.log(`[Test] Failed to generate embedding.\\n`);
    }
  }
  console.log('Test complete. Check logs above to verify keys and jitter were used.');
}

testSafeRotation().catch(console.error);
