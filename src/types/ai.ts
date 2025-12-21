export interface AIModel {
  id: string;
  name: string;
  provider: "openai" | "google" | "anthropic" | "x-ai";
  description: string;
  capabilities: string[];
  maxTokens: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string | MessageContent[];
  timestamp: Date;
  model?: string;
  tokens?: number;
  favorite?: boolean;
}

export interface MessageContent {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
  };
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  model: string;
  contextMode: "general" | "sector";
  sector?: string;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
}

export interface AIAnalysis {
  type: "performance" | "alerts" | "financial" | "optimization";
  title: string;
  description: string;
  data: any;
  insights: string[];
  recommendations: string[];
  priority: "low" | "medium" | "high" | "critical";
  createdAt: Date;
}

export interface QuickSuggestion {
  id: string;
  category: "performance" | "financial" | "maintenance" | "legal" | "resident";
  title: string;
  prompt: string;
  icon: string;
}

export interface AIRequest {
  message: string;
  model: string;
  sessionId?: string;
  includeImages?: boolean;
  context?: any;
  contextMode?: "general" | "sector";
  sector?: string;
  companyId?: string;
  userId: string;
}

export interface AIResponse {
  message: string;
  model: string;
  tokens: number;
  sessionId: string;
  messageId: string;
  timestamp: Date;
  citations?: KnowledgeCitation[];
  memoryUsed?: UserMemory[];
}

export interface VoiceControl {
  isListening: boolean;
  isSpeaking: boolean;
  language: string;
  voiceEnabled: boolean;
}

export interface CondominiumData {
  id: string;
  name: string;
  units: number;
  residents: number;
  monthlyRevenue: number;
  expenses: number;
  projects: Project[];
  alerts: Alert[];
}

export interface Project {
  id: string;
  name: string;
  status: "pending" | "in_progress" | "completed" | "delayed";
  startDate: Date;
  endDate: Date;
  budget: number;
  spent: number;
  completion: number;
}

export interface Alert {
  id: string;
  type: "financial" | "maintenance" | "security" | "legal";
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  createdAt: Date;
  resolved: boolean;
}

// ========================================
// RAG E CONHECIMENTO
// ========================================

export interface KnowledgeSource {
  id: string;
  companyId: string;
  sector: string;
  title: string;
  kind: "url" | "file" | "manual";
  uri?: string;
  status: "active" | "disabled";
  createdAt: Date;
  updatedAt: Date;
}

export interface KnowledgeChunk {
  id: string;
  companyId: string;
  sector: string;
  sourceId: string;
  chunkIndex: number;
  content: string;
  embedding?: number[];
  tags: string[];
  createdAt: Date;
}

export interface KnowledgeCitation {
  chunkId: string;
  sourceId: string;
  sector: string;
  content: string;
  score: number;
  tags?: string[];
}

// ========================================
// MEMÓRIA E APRENDIZADO
// ========================================

export interface UserMemory {
  id: string;
  companyId: string;
  userId: string;
  memoryType: "preference" | "context" | "rule" | "fact";
  content: string;
  embedding?: number[];
  confidence: number;
  usageCount: number;
  lastUsedAt?: Date;
  createdAt: Date;
}

export interface MessageFeedback {
  id: string;
  messageId: string;
  userId: string;
  feedbackType: "like" | "dislike" | "favorite" | "report";
  comment?: string;
  createdAt: Date;
}

// ========================================
// CONTEXTO E HEADERS
// ========================================

export interface RequestContext {
  companyId: string;
  userId: string;
  contextMode: "general" | "sector";
  sector?: string;
}

export interface RAGConfig {
  maxChunks: number;
  similarityThreshold: number;
  useMemory: boolean;
  memoryWeight: number;
}

// ========================================
// DOCUMENTOS E ATAS
// ========================================

export interface GenerateDocumentRequest {
  prompt: string;
  documentType: "pdf" | "docx";
  templateId?: string;
  companyId: string;
  metadata: {
    sector: string;
    category: string;
    tags: string[];
  };
}

export interface GenerateDocumentResponse {
  documentId: string;
  title: string;
  content: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  citations?: KnowledgeCitation[];
}

export interface TranscribeAudioRequest {
  audioUrl?: string;
  companyId: string;
  meetingId?: string;
  transcriptionType?: "audio" | "audio_summary" | "audio_minutes" | "audio_summary_minutes";
  options: {
    language: "pt-BR" | "en-US" | "es-ES";
    speakerIdentification: boolean;
    actionItemExtraction: boolean;
    agendaGeneration: boolean;
    keyPointsExtraction: boolean;
    sentimentAnalysis: boolean;
    autoTranslation: boolean;
    targetLanguage?: string;
  };
  minutesOptions?: {
    format?: "markdown" | "pdf" | "word";
    includeSections?: string[];
    customInstructions?: string;
  };
  summaryOptions?: {
    summaryType?: "executive" | "detailed" | "action_items" | "decisions";
    maxLength?: number;
    includeMetrics?: boolean;
  };
}

export interface TranscribeAudioResponse {
  processingId: string;
  transcription: {
    text: string;
    confidence: number;
    language: string;
    duration: number;
  };
  speakers?: Array<{
    id: string;
    name?: string;
    segments: Array<{
      start: number;
      end: number;
      text: string;
    }>;
  }>;
  analysis: {
    actionItems?: Array<{
      description: string;
      assignee?: string;
      dueDate?: string;
      priority: "low" | "medium" | "high";
    }>;
    keyPoints?: string[];
    agenda?: Array<{
      title: string;
      description: string;
      presenter?: string;
    }>;
    sentiment?: {
      overall: "positive" | "neutral" | "negative";
      byTopic: Array<{
        topic: string;
        sentiment: "positive" | "neutral" | "negative";
        confidence: number;
      }>;
    };
    translation?: string;
  };
  summary?: {
    text: string;
    highlights: string[];
    actionItems: Array<{
      description: string;
      assignee?: string;
      dueDate?: string;
      priority: "low" | "medium" | "high";
    }>;
    decisions: Array<{
      item: string;
      decision: string;
      approved: boolean;
    }>;
    nextSteps: string[];
  };
  minutes?: {
    minuteId: string;
    content: string;
    format: "markdown" | "pdf" | "word";
    fileUrl?: string;
  };
  usage: {
    audioMinutes: number;
    transcriptionTokens: number;
    analysisTokens: number;
    summaryTokens?: number;
    minutesTokens?: number;
    totalTokens: number;
  };
}

export interface SummarizeMinuteRequest {
  minuteId: string;
  minuteContent?: string;
  summaryType: "executive" | "detailed" | "action_items" | "decisions";
  companyId: string;
}

export interface SummarizeMinuteResponse {
  summary: string;
  highlights: string[];
  actionItems: Array<{
    description: string;
    assignee?: string;
    dueDate?: string;
    priority: "low" | "medium" | "high";
  }>;
  decisions: Array<{
    item: string;
    decision: string;
    approved: boolean;
  }>;
  nextSteps: string[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AudioProcessing {
  id: string;
  companyId: string;
  meetingId?: string;
  audioFileName: string;
  audioSizeBytes: number;
  transcriptionText: string;
  transcriptionConfidence: number;
  languageDetected: string;
  durationSeconds: number;
  speakers?: any[];
  analysis?: any;
  processingOptions: any;
  status: "processing" | "completed" | "failed";
  errorMessage?: string;
  usageStats: any;
  createdBy: string;
  createdAt: Date;
  completedAt?: Date;
}
