/**
 * EYES Seeded Pattern Library v0
 * Confidential · Founder-Owned Artifact
 * 
 * This library contains 15 predefined "life-shapes". It acts as the answer to the
 * "cold start" problem. Before a user's graph is fully populated over months,
 * EYES uses these patterns to match against their first few weeks of data.
 * 
 * RULE 1: A pattern is a prior, not a label. (Always frame as a hypothesis).
 * RULE 2: Anchoring still applies. (Cite the data/entities).
 * RULE 3: Confidence matches the data. (Hedge claims on thin data).
 * RULE 4: Patterns must be falsifiable.
 */

export type SensitivityLevel = 'STANDARD' | 'SENSITIVE' | 'POSITIVE';
export type PatternCategory = 'BUILDING' | 'COMMITMENT' | 'IDENTITY' | 'RELATIONSHIPS' | 'STATED_VS_ACTUAL' | 'WELLBEING';

export interface SeededPattern {
  id: string;
  name: string;
  code: string;
  category: PatternCategory;
  sensitivity: SensitivityLevel;
  shape: string;
  signalsToDetect: string[];
  coldStartRead: string;
  confirmsIf: string;
  disconfirmsIf: string;
  handlingNote?: string;
}

export const SEEDED_PATTERNS: SeededPattern[] = [
  // A · HOW A PERSON BUILDS
  {
    id: 'A1',
    name: "The Builder's Loop",
    code: 'THE_LOOP',
    category: 'BUILDING',
    sensitivity: 'STANDARD',
    shape: "A person who cycles idea → deep research → architecture → build → near-launch → new, bigger idea, rarely closing the loop on the last thing before the next one captures them.",
    signalsToDetect: [
      "Multiple project entities, each reaching a 'build' stage.",
      "New project entities appearing before prior ones reach a shipped/closed event.",
      "High density of research/learning topic mentions relative to completed-milestone events.",
      "committed_to edges on projects with no matching completion."
    ],
    coldStartRead: "From your mail alone, I can already see at least three things you started with real intensity — [X], [Y], [Z]. Two of them go quiet right around the point the third one starts. Could be coincidence. Could be a pattern worth watching. I'll know more as I see more.",
    confirmsIf: "more projects follow the same start-intensify-abandon-restart shape over months.",
    disconfirmsIf: "projects reach sustained shipped states; the last thing gets finished before the next begins."
  },
  {
    id: 'A2',
    name: "Executes for Others, Orbits Own Work",
    code: 'ORBIT',
    category: 'BUILDING',
    sensitivity: 'STANDARD',
    shape: "Delivers reliably on commitments to other people, but commitments to their own work and goals stall, circle, or never get the same follow-through.",
    signalsToDetect: [
      "High completion rate on committed_to edges whose tail is another person/organization.",
      "Low completion on committed_to edges whose tail is a self-goal or own project.",
      "delayed_on concentrated on self-directed commitments.",
      "emotional_state around own work skewing anxious or avoidant."
    ],
    coldStartRead: "Early read, just from your email: when someone else is waiting on you, you deliver. When it's your own thing, it tends to orbit. The commitments with a name attached get done; the ones that are only yours get circled. Tell me if that lands, or if I'm reading it wrong.",
    confirmsIf: "the others-vs-self completion gap holds as more commitments resolve.",
    disconfirmsIf: "self-directed goals complete at a similar rate to commitments made to others."
  },
  {
    id: 'A3',
    name: "The Perfectionist Hold",
    code: 'HOLD',
    category: 'BUILDING',
    sensitivity: 'STANDARD',
    shape: "Work reaches near-completion and then stalls indefinitely in refinement, never quite crossing into release.",
    signalsToDetect: [
      "project entities with many revision/edit events but no release/publish event.",
      "long-lived valid_to-null commitments to 'finishing' a thing.",
      "A project's mention frequency staying high without any completion event closing it."
    ],
    coldStartRead: "One thing I notice early: [project] has been close to done for a while. Lots of polishing, not much shipping. I might be missing the moment it went out — but if it hasn't, that gap between 'almost' and 'out' is worth a look.",
    confirmsIf: "multiple projects show the same long refine-without-release tail.",
    disconfirmsIf: "work ships at a normal cadence; 'almost done' reliably becomes 'out.'"
  },

  // B · COMMITMENT & FOLLOW-THROUGH
  {
    id: 'B1',
    name: "Runs on External Accountability",
    code: 'EXTERNAL',
    category: 'COMMITMENT',
    sensitivity: 'STANDARD',
    shape: "Things with an external deadline or someone watching get done; things with neither don't — regardless of how important the person says they are.",
    signalsToDetect: [
      "Completion events cluster around commitments that have an associated deadline event or other-person tail.",
      "self-stated important goals without external markers accumulate delayed_on.",
      "The gap between stated priority and completion correlates with the presence or absence of an external watcher."
    ],
    coldStartRead: "Here's an early pattern, and it's a common one: the things on your plate that have a deadline or a person attached get done. The ones that are just important to you — no deadline, nobody waiting — those are the ones that slip. The work has someone watching. The personal stuff has neither.",
    confirmsIf: "presence/absence of an external marker keeps predicting completion.",
    disconfirmsIf: "unwatched personal goals complete at the same rate as deadline-bound ones."
  },
  {
    id: 'B2',
    name: "The Quiet No",
    code: 'QUIET_NO',
    category: 'COMMITMENT',
    sensitivity: 'STANDARD',
    shape: "Soft agreement to things that then never get acted on — a 'yes' that was never really a commitment, just a way to end the conversation.",
    signalsToDetect: [
      "committed_to edges followed by no action and eventual silence — decay, not an explicit decided_against.",
      "recurring delayed_on on a particular category of ask.",
      "a gap between the language of agreement and any downstream event."
    ],
    coldStartRead: "Tentative, because I need more to be sure: there's a kind of 'yes' in your mail that doesn't seem to turn into anything — agreements that just quietly go nowhere. Not refusals. Just yeses that weren't really yeses. Worth noticing which asks those are.",
    confirmsIf: "a consistent class of agreements keeps dissolving into silence.",
    disconfirmsIf: "stated agreements generally produce follow-up action."
  },

  // C · IDENTITY & TRANSITION
  {
    id: 'C1',
    name: "The Homecoming Arc",
    code: 'HOMECOMING',
    category: 'IDENTITY',
    sensitivity: 'SENSITIVE',
    shape: "A person who moved away from an origin — a place, a culture, a former life — and whose data shows a slow gravitational pull back toward it, often beneath their stated direction.",
    signalsToDetect: [
      "Rising mention frequency of origin place and origin person entities over time, while the current place's emotional_state valence flattens or declines.",
      "committed_to edges toward the current direction accumulating delayed_on.",
      "co-occurrence of the origin place with family and belonging entities."
    ],
    coldStartRead: "I don't have enough yet to say much here, and I want to be careful — but one early thread: [origin] comes up more than I'd expect for someone whose plans seem to point elsewhere. I'm not concluding anything. I'll just watch whether that holds, and you can tell me what it means.",
    confirmsIf: "origin mentions keep rising as forward-direction commitments keep slipping.",
    disconfirmsIf: "origin mentions are stable/declining and the current direction is progressing.",
    handlingNote: "Touches belonging and possibly homesickness. Surface as a gentle observation about the data, never as 'you secretly want to go home.' Let the person assign the meaning."
  },
  {
    id: 'C2',
    name: "The Reinvention",
    code: 'REINVENTION',
    category: 'IDENTITY',
    sensitivity: 'STANDARD',
    shape: "A person actively migrating away from a former identity or field — the old vocabulary fading as a new one rises.",
    signalsToDetect: [
      "An old topic/skill cluster declining in mention frequency over time (downward drift) while a new cluster rises (upward drift).",
      "decided_against edges on the old direction.",
      "new project and goal entities concentrated in the new domain."
    ],
    coldStartRead: "Something's shifting in what you spend words on. [Old domain] is fading; [new domain] is taking its place — and it doesn't look accidental. If you're in the middle of becoming a different kind of person professionally, the data already shows it before you'd probably say it out loud.",
    confirmsIf: "the old cluster keeps declining and the new one keeps rising over time.",
    disconfirmsIf: "both clusters stay active, or the 'old' one re-rises — that's C3, not reinvention."
  },
  {
    id: 'C3',
    name: "Caught Between",
    code: 'LIMINAL',
    category: 'IDENTITY',
    sensitivity: 'SENSITIVE',
    shape: "A person genuinely suspended between two places, careers, or identities — neither resolving. Sustained tension, not migration.",
    signalsToDetect: [
      "Two competing entity clusters both active over time, neither declining.",
      "conflicts_with edges between stated intentions.",
      "oscillating emotional_state valence rather than a settling trend."
    ],
    coldStartRead: "Early, and gently: you seem to be holding two things at once — [A] and [B] — and neither is winning. That in-between can be its own kind of heavy. I'm not sure yet whether it's a phase or a place you're stuck in. I'll watch, and you can tell me which it is.",
    confirmsIf: "both clusters stay active with no resolution over a long window.",
    disconfirmsIf: "one cluster clearly wins out — that's reinvention or homecoming resolving.",
    handlingNote: "Liminal states can carry real anxiety. Acknowledge the weight without dramatizing it; never imply the person is failing to choose. Observation, not pressure."
  },

  // D · RELATIONSHIPS
  {
    id: 'D1',
    name: "High-Leverage, Low-Contact",
    code: 'HIGH_LEVERAGE',
    category: 'RELATIONSHIPS',
    sensitivity: 'POSITIVE',
    shape: "A person who appears in a small number of high-consequence moments — decisions, opportunities, turning points — but a low overall volume of communication.",
    signalsToDetect: [
      "A person entity with few total mentions but high co-occurrence with decision, opportunity, and milestone event entities.",
      "Appears disproportionately at temporal inflection points in the graph."
    ],
    coldStartRead: "Here's one I find interesting already: [Name] barely shows up in your email by volume — but the few times they do, something important is happening around it. Most people never notice who their low-contact, high-leverage people are. [Name] looks like one of yours.",
    confirmsIf: "the person keeps surfacing at consequential moments despite low volume.",
    disconfirmsIf: "their appearances turn out to be routine, not tied to consequence."
  },
  {
    id: 'D2',
    name: "The Fading Thread",
    code: 'FADING',
    category: 'RELATIONSHIPS',
    sensitivity: 'SENSITIVE',
    shape: "A person whose interaction has steadily declined over time — a relationship cooling, often without the person consciously noticing.",
    signalsToDetect: [
      "Declining mention frequency of a person entity across successive periods.",
      "Lengthening gaps between interactions.",
      "A valid_to-null relationship edge with no recent supporting events."
    ],
    coldStartRead: "One quiet thing, and I'll hold it lightly: you and [Name] used to be in contact a lot more than you are now. The thread's gone thin. I don't know why — people drift, life happens, and sometimes it's nothing. Just something you might not have clocked.",
    confirmsIf: "the decline continues across later periods.",
    disconfirmsIf: "contact resumes, or the lull was a known, temporary gap.",
    handlingNote: "A fade can mean grief, estrangement, or loss. Never assume the reason, never imply fault, never push 'you should reach out.' Offer the observation; let the person decide what it is."
  },

  // E · STATED VS. ACTUAL
  {
    id: 'E1',
    name: "The Stated-Goal / Actual-Behavior Gap",
    code: 'SAY_DO_GAP',
    category: 'STATED_VS_ACTUAL',
    sensitivity: 'SENSITIVE',
    shape: "A clear, repeatedly stated intention with little or no corresponding action — the gap between what a person says they're doing and what the record actually shows. The accountability core of EYES.",
    signalsToDetect: [
      "A goal or commitment entity with high mention frequency (talked about often) but near-zero associated action or completion events.",
      "delayed_on accumulating.",
      "conflicts_with between the stated goal and where time and attention actually go."
    ],
    coldStartRead: "Early, tentative, and tell me if it's unfair: [goal] comes up a lot in how you talk — but I'm not yet seeing much in the record that looks like moving on it. Could be I just can't see the action. Could be something else. I'll get sharper, and I'd rather be corrected than wrong.",
    confirmsIf: "the talk-without-action gap persists as more data arrives.",
    disconfirmsIf: "action on the goal shows up that the thin early data simply hadn't surfaced yet.",
    handlingNote: "This is the insight most likely to sting, and the one most likely to be wrong on thin data. Always frame as a question, never a verdict. The receipt rule is non-negotiable here — name the evidence, and invite correction."
  },
  {
    id: 'E2',
    name: "The Quiet Pivot",
    code: 'QUIET_PIVOT',
    category: 'STATED_VS_ACTUAL',
    sensitivity: 'STANDARD',
    shape: "A person's actual attention has shifted significantly from what they'd describe as their focus — a drift they haven't consciously registered.",
    signalsToDetect: [
      "Divergence between the entity a person names as their 'focus' and the entities actually rising in mention frequency.",
      "A new cluster overtaking an old one with no explicit decision event marking the change."
    ],
    coldStartRead: "If someone asked what you're focused on, I suspect you'd say [stated]. But the last while of your mail is mostly about [actual]. Not a contradiction exactly — more that your attention moved and didn't send a memo. Worth knowing where it actually went.",
    confirmsIf: "the rising cluster keeps diverging from the stated focus.",
    disconfirmsIf: "stated focus and actual attention realign, or were aligned all along."
  },

  // F · STATE & WELLBEING
  {
    id: 'F1',
    name: "Building Mode vs. Recovery Mode",
    code: 'MODE_CYCLE',
    category: 'WELLBEING',
    sensitivity: 'STANDARD',
    shape: "A person who cycles between high-output building phases and quieter recovery phases. Knowing which phase they're in explains a great deal about their behavior.",
    signalsToDetect: [
      "Activity and commitment-creation events clustering into bursts separated by quiet periods.",
      "emotional_state valence shifting between energized and drained across those periods."
    ],
    coldStartRead: "You don't run at one speed — and that's not a flaw, it's a rhythm. There are stretches where you're building hard, and stretches where you go quiet and refill. Reading you well means knowing which one you're in right now. Looks like [phase], from here.",
    confirmsIf: "the burst-then-quiet rhythm repeats across multiple cycles.",
    disconfirmsIf: "output is steady-state, with no real oscillation."
  },
  {
    id: 'F2',
    name: "The Narrowing",
    code: 'NARROWING',
    category: 'WELLBEING',
    sensitivity: 'SENSITIVE',
    shape: "The breadth of a person's life — relationships, interests, activities — visibly contracts toward a single domain over time. Can be healthy focus. Can be a warning sign.",
    signalsToDetect: [
      "Declining diversity of active entity clusters over time.",
      "Rising concentration of mentions in one cluster.",
      "Declining mention of relationship and personal-life entities relative to a single dominant domain."
    ],
    coldStartRead: "Something I'll raise carefully, because it can mean very different things: your world has gotten more concentrated lately — more and more about [domain], less of the other threads that used to be there. Sometimes that's focus, and it's good. Sometimes it's worth checking in on. Only you know which.",
    confirmsIf: "cluster diversity keeps falling and personal/relationship mentions keep thinning.",
    disconfirmsIf: "breadth returns, or the concentration was a known, bounded sprint.",
    handlingNote: "This shape can correlate with isolation or depression. Never alarm, never diagnose, never assume. Frame as the person's own to interpret. If signals are strong and the personal/relationship threads have gone quiet, lean gently toward the value of human connection — and remember EYES is not a substitute for it."
  },
  {
    id: 'F3',
    name: "Avoidance-via-Research",
    code: 'AVOIDANCE',
    category: 'WELLBEING',
    sensitivity: 'STANDARD',
    shape: "When the uncomfortable next step gets replaced by more learning, research, or planning — productive-feeling activity that quietly substitutes for the hard thing.",
    signalsToDetect: [
      "Spikes in research and learning topic mentions co-occurring with the approach of a known hard commitment — a deadline, a sale, a launch.",
      "The hard commitment accruing delayed_on while research activity rises around it."
    ],
    coldStartRead: "Here's a sharp one, and I mean it kindly: right around the times [hard thing] gets close, your mail fills up with reading, researching, planning — everything except the hard thing itself. Learning more can be exactly how we avoid doing the thing we already know how to do. Worth catching yourself at it.",
    confirmsIf: "research spikes keep coinciding with avoided hard commitments.",
    disconfirmsIf: "research reliably precedes action, not avoidance — i.e. it's preparation, not flight."
  }
];
