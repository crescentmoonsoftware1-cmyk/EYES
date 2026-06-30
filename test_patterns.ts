import { SEEDED_PATTERNS } from './src/config/seed_patterns';

// 1. Imagine a user just synced their Gmail.
// EYES scans the emails and extracts these "Entities" and "Events":
const mockUserGraph = {
  projects: ["Project X", "Project Y", "Project Z"],
  milestonesReached: 0,
  behavior: "starts many projects, but leaves them when a new one starts"
};

console.log("--- EYES AI TEST SIMULATION ---");
console.log("User Data Scanned: Started 3 projects (X, Y, Z), 0 shipped.\n");

// 2. EYES checks the new Seeded Pattern Library to see if this matches a known life-shape.
const matchedPattern = SEEDED_PATTERNS.find(pattern => pattern.code === 'THE_LOOP');

if (matchedPattern) {
  console.log(`✅ MATCH FOUND: [${matchedPattern.name}]`);
  console.log(`\n🧠 AI THINKING: ${matchedPattern.shape}`);
  
  // 3. EYES replaces the placeholders with the real user data
  let responseToUser = matchedPattern.coldStartRead
    .replace('[X]', mockUserGraph.projects[0])
    .replace('[Y]', mockUserGraph.projects[1])
    .replace('[Z]', mockUserGraph.projects[2]);

  console.log(`\n💬 WHAT EYES SAYS TO THE USER:\n"${responseToUser}"`);
} else {
  console.log("No patterns matched.");
}
