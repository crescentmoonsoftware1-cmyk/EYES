import { generateEmbedding, invokeModel } from '../src/services/ai/ai';

async function runComprehensiveBenchmark() {
  console.log('--- EYES Platform Comprehensive Speed Benchmark ---\\n');

  // 1. Network Health / Connectors (Readiness Check)
  console.log('[1/5] Testing Network Health (AI Readiness Ping)...');
  const netStart = performance.now();
  await generateEmbedding("health-check-ping");
  const netEnd = performance.now();
  console.log(`> Network Health Response Time: ${(netEnd - netStart).toFixed(2)} ms\\n`);

  // 2. Memory Feed / Data Sync (Batch Ingestion)
  console.log('[2/5] Testing Memory Feed Data Sync (Batch of 5 records)...');
  const syncStart = performance.now();
  await Promise.all([
    generateEmbedding("User completed a task in Linear"),
    generateEmbedding("User received an email from GitHub"),
    generateEmbedding("User logged into Discord"),
    generateEmbedding("New Trello card created"),
    generateEmbedding("PostHog event tracked: page_view"),
  ]);
  const syncEnd = performance.now();
  console.log(`> Data Sync Batch Processing Time: ${(syncEnd - syncStart).toFixed(2)} ms\\n`);

  // 3. AI Chat (Semantic Retrieval + Generation)
  console.log('[3/5] Testing AI Chat (Query Embedding + Neural Response)...');
  const chatStart = performance.now();
  await generateEmbedding("What is the state of the project?");
  await invokeModel({
    capability: 'chat',
    preference: 'auto',
    messages: [{ role: 'user', content: 'Say hello in one word.' }],
    system: 'You are a helpful assistant.'
  });
  const chatEnd = performance.now();
  console.log(`> AI Chat Neural Pipeline Latency: ${(chatEnd - chatStart).toFixed(2)} ms\\n`);

  // 4. Intelligence / Mind Map (Cognitive Clustering)
  console.log('[4/5] Testing Intelligence Mind Map (JSON Entity Extraction)...');
  const mindStart = performance.now();
  await invokeModel({
    capability: 'chat',
    preference: 'auto',
    messages: [{ role: 'user', content: 'Extract the entities: Google, Apple, Microsoft.' }],
    system: 'Return JSON only with the key "entities".'
  });
  const mindEnd = performance.now();
  console.log(`> Intelligence Clustering Time: ${(mindEnd - mindStart).toFixed(2)} ms\\n`);

  // 5. Audit (Pattern Recognition)
  console.log('[5/5] Testing Audit (Deep Cognitive Pattern Analysis)...');
  const auditStart = performance.now();
  await invokeModel({
    capability: 'chat',
    preference: 'auto',
    messages: [{ role: 'user', content: 'Analyze this behavior: Working late night.' }],
    system: 'Analyze the psychological pattern of the user based on their behavior.'
  });
  const auditEnd = performance.now();
  console.log(`> Cognitive Audit Generation Time: ${(auditEnd - auditStart).toFixed(2)} ms\\n`);

  console.log('--- Benchmark Complete ---');
}

runComprehensiveBenchmark().catch(console.error);
