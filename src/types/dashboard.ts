
export interface FlaggedItem {
  id: string;
  severity: "HEAVY" | "DIRECT" | "LIGHT";
  platform: string;
  date: string;
  content: string;
  snippet?: string; // Support for short previews
  reason?: string;  // Support for audit reasons
}

export interface ComparisonRow {
  eyes: string;
  recruiter: string;
}

export interface AuditSummary {
  totalMemories: number;
  overallRisk: "HEAVY" | "DIRECT" | "LIGHT";
  riskCounts: {
    heavy: number;
    direct: number;
    light: number;
  };
  flaggedItems: FlaggedItem[];
  comparisonData: ComparisonRow[];
}

export interface PlatformStatus {
  id: string;
  name: string;
  connected: boolean;
  status: 'idle' | 'connecting' | 'authenticating' | 'syncing' | 'connected' | 'error';
  items: number;
  errorMessage?: string | null;
  lastSyncAt?: string | null;
}

export interface FeedItem {
  id: string;
  platform: string;
  title: string | null;
  content: string | null;
  timestamp: string | null;
  author: string | null;
  is_flagged: boolean;
  flag_severity: string | null;
  flag_reason: string | null;
  event_type: string | null;
}


export interface ChatRequest {
  prompt: string;
}

export interface ChatResponse {
  reply: string;
}

export interface Citation {
  sourceId: string;
  memoryId?: string;
  platform: string;
  title: string | null;
  snippet: string;
  timestamp?: string | null;
  similarity?: number;
  rerankScore?: number;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
  citations?: Citation[];
  diagnostics?: {
    confidenceScore: number;
    latencyMs: number;
  };
}

export interface Commitment {
  text: string;
  status: 'pending' | 'overdue' | 'completed';
  citation: string;
  platform: string;
  date: string;
}

export interface ReputationAudit {
  id: string;
  status: 'pending' | 'analysis' | 'generating' | 'completed' | 'failed';
  riskScore: number;
  mentionsCount: number;
  commitmentsCount: number;
  summaryNarrative: string | null;
  connectorsCovered: string[];
  reportUrl: string | null;
  createdAt: string;
  metadata: {
    subjectName?: string;
    sentimentBalance: number;
    unfulfilledCommitments: number;
    commitments: Commitment[];
    opportunities: string[];
    topEntities: string[];
    failureRate?: string;
    complianceRate?: string;
    trajectory?: string;
    riskFindings: Array<{
      severity: 'Low' | 'Medium' | 'High';
      finding: string;
      evidence: string;
      impact: string;
    }>;
  };
}

