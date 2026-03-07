export type AiProviderName = 'google' | 'openai' | 'mock';

export type AssistantMessageRole = 'user' | 'assistant';

export type RecordingEventType = 'open' | 'click' | 'input' | 'upload' | 'assert' | 'wait';

export type ExplorationStatus = 'draft' | 'running' | 'succeeded' | 'failed' | 'stopped';

export type ExplorationExecutionMode = 'ai' | 'scripted';

export type ExplorationArtifactKind =
  | 'trace'
  | 'video'
  | 'snapshot'
  | 'screenshot'
  | 'console'
  | 'network'
  | 'session'
  | 'other';

export type SelfHealStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export type RunEvaluationVerdict =
  | 'passed_as_expected'
  | 'failed_functional_regression'
  | 'failed_environment_issue'
  | 'failed_test_asset_issue'
  | 'passed_with_runtime_self_heal'
  | 'needs_human_review';

export interface AssistantMessage {
  id: string;
  threadId: string;
  role: AssistantMessageRole;
  content: string;
  createdAt: string;
}

export interface AssistantMemoryFact {
  id: string;
  threadId: string;
  content: string;
  confidence: number;
  sourceMessageId: string;
  sourceType: 'user_message';
  createdAt: string;
}

export interface AssistantThread {
  id: string;
  title: string | null;
  tenantId: string | null;
  projectId: string | null;
  userId: string | null;
  graphType: 'assistant';
  messages: AssistantMessage[];
  facts: AssistantMemoryFact[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssistantThreadInput {
  title?: string;
  tenantId?: string;
  projectId?: string;
  userId?: string;
}

export interface RecordingLocatorDraft {
  strategy: 'role' | 'text' | 'label' | 'placeholder' | 'test_id' | 'css' | 'xpath';
  value: string;
}

export interface ExplorationRecordingEvent {
  eventType: RecordingEventType;
  pageUrl?: string | null;
  locator?: RecordingLocatorDraft | null;
  payload?: Record<string, unknown>;
  capturedAt?: string | null;
}

export interface ExplorationArtifact {
  kind: ExplorationArtifactKind;
  path: string;
  sizeBytes: number | null;
}

export interface ExplorationSession {
  id: string;
  threadId: string | null;
  tenantId: string;
  projectId: string;
  userId: string | null;
  status: ExplorationStatus;
  executionMode: ExplorationExecutionMode;
  name: string | null;
  instruction: string;
  startUrl: string;
  recordingId: string | null;
  outputDir: string | null;
  summary: string | null;
  lastSnapshotMarkdown: string | null;
  sampleDataset: Record<string, unknown>;
  artifacts: ExplorationArtifact[];
  createdTestCaseId: string | null;
  createdTestCaseVersionId: string | null;
  defaultDatasetRowId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExplorationInput {
  tenantId: string;
  projectId: string;
  instruction: string;
  startUrl: string;
  threadId?: string;
  userId?: string;
  name?: string;
  executionMode?: ExplorationExecutionMode;
  scriptProfile?: string;
}

export interface PublishExplorationCaseInput {
  subjectId: string;
  name?: string;
  versionLabel?: string;
  changeSummary?: string;
  publish?: boolean;
  defaultDatasetName?: string;
}

export interface ExplorationPublishResult {
  exploration: ExplorationSession;
  analysisJobId: string;
  testCaseId: string;
  versionId: string;
  defaultDatasetRowId: string | null;
}

export interface SelfHealAttempt {
  id: string;
  tenantId: string;
  projectId: string;
  runId: string;
  runItemId: string;
  failedStepEventId: string | null;
  sourceStepId: string;
  failureCategory: string;
  strategySummary: string;
  explanation: string | null;
  overridePayload: Record<string, unknown> | null;
  replayRunId: string | null;
  replayRunStatus: string | null;
  derivedTestCaseVersionId: string | null;
  status: SelfHealStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSelfHealAttemptInput {
  tenantId: string;
  projectId: string;
  runId: string;
  runItemId: string;
  failedStepEventId?: string | null;
  sourceStepId: string;
  failureCategory: string;
  strategySummary: string;
  explanation?: string | null;
  overridePayload?: Record<string, unknown> | null;
  replayRunId?: string | null;
  replayRunStatus?: string | null;
  derivedTestCaseVersionId?: string | null;
  status: SelfHealStatus;
}

export interface RunEvaluation {
  id: string;
  tenantId: string;
  projectId: string;
  runId: string;
  runItemId: string;
  verdict: RunEvaluationVerdict;
  deterministicSummary: Record<string, unknown>;
  explanation: string;
  evidence: Record<string, unknown>[];
  linkedArtifactIds: string[];
  selfHealAttemptId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRunEvaluationInput {
  tenantId: string;
  projectId: string;
  runId: string;
  runItemId: string;
  verdict: RunEvaluationVerdict;
  deterministicSummary: Record<string, unknown>;
  explanation: string;
  evidence?: Record<string, unknown>[];
  linkedArtifactIds?: string[];
  selfHealAttemptId?: string | null;
}

export type AssistantActionKind =
  | 'none'
  | 'exploration_started'
  | 'exploration_status'
  | 'browser_assist'
  | 'case_published'
  | 'self_heal_started'
  | 'run_evaluated';

export interface AssistantActionResult {
  kind: AssistantActionKind;
  summary: string;
  payload?: Record<string, unknown>;
}

export interface AssistantTurnResult {
  assistantMessage: AssistantMessage;
  thread: AssistantThread;
  action: AssistantActionResult | null;
}
