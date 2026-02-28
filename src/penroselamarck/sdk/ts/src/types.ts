export type Nullable<T> = T | null;

export interface LoginInput {
  token: string;
}

export interface LoginOutput {
  userId: string;
  roles: string[];
}

export interface ContextInput {
  language: string;
}

export interface ContextOutput {
  activeContextId: string;
  language: string;
}

export interface ExerciseCreateInput {
  question: string;
  answer: string;
  language: string;
  tags?: string[] | null;
  classes?: string[] | null;
}

export interface ExerciseListFilters {
  language?: string;
  tags?: string[];
  classes?: string[];
  limit?: number;
  offset?: number;
}

export interface ExerciseListItem {
  exerciseId: string;
  question: string;
  language: string;
  tags?: string[] | null;
  classes?: string[] | null;
  stats?: Record<string, unknown> | null;
}

export interface ExerciseGraphNode {
  id: string;
  label: string;
  language: string;
  tags: string[];
  classes: string[];
}

export interface ExerciseGraphEdge {
  source: string;
  target: string;
  sharedTags: string[];
  sharedClasses: string[];
  weight: number;
}

export interface ExerciseGraphOutput {
  nodes: ExerciseGraphNode[];
  edges: ExerciseGraphEdge[];
}

export interface ExerciseSearchQuery {
  query: string;
  language?: string;
  limit?: number;
}

export interface ExerciseSearchItem {
  exerciseId: string;
  question: string;
  language: string;
  tags?: string[] | null;
  classes?: string[] | null;
  score: number;
}

export interface ExerciseClassifyOutput {
  scanned: number;
  updated: number;
}

export interface TrainImportItem {
  question: string;
  answer: string;
  language: string;
  tags?: string[] | null;
  classes?: string[] | null;
  source?: string | null;
}

export interface TrainImportOutput {
  importedCount: number;
  duplicates: string[];
  errors: Array<Record<string, unknown>>;
}

export interface PracticeStartInput {
  language: string;
  count: number;
  strategy: string;
  filters?: Record<string, unknown> | null;
}

export interface PracticeStartOutput {
  sessionId: string;
  selectedExerciseIds: string[];
  remaining: number;
}

export interface PracticeSubmitInput {
  sessionId: string;
  exerciseId: string;
  userAnswer: string;
}

export interface PracticeSubmitOutput {
  passed: boolean;
  score: number;
  feedback: string;
  expectedAnswer: string;
  nextReady: boolean;
}

export interface PracticeEndOutput {
  [key: string]: unknown;
}

export interface PerformanceSummary {
  exercise_id: string;
  total_attempts: number;
  pass_rate: number;
  last_practiced_at?: string | null;
}

export interface PerformanceOutput {
  items: PerformanceSummary[];
  aggregates: Record<string, unknown>;
}
