/**
 * Neural AI Integration
 * Connects chess game to the AI proxy endpoint for move generation
 */

export interface NeuralAIMove {
  move: string;
  provider: string;
  confidence?: number;
}

export interface NeuralAIStatus {
  currentProvider: string;
  providerChain: string[];
  stats: Array<{
    id: number;
    provider: string;
    validKeyCount: number;
    totalKeyCount: number;
  }>;
}

/**
 * Calls the Chess AI endpoint directly via tRPC
 * This is used from React components via hooks
 */
export async function getNeuralAIMove(fen: string, moveHistory?: string[]): Promise<NeuralAIMove> {
  // This will be called from components using trpc hooks
  // The actual implementation is in the component using trpc.chessAI.getMove.useMutation()
  throw new Error("Use trpc.chessAI.getMove.useMutation() from React components");
}

export async function getNeuralAIStatus(): Promise<NeuralAIStatus> {
  // This will be called from components using trpc hooks
  // The actual implementation is in the component using trpc.chessAI.getStatus.useQuery()
  throw new Error("Use trpc.chessAI.getStatus.useQuery() from React components");
}

// Difficulty levels for chess AI
export const DIFFICULTY_LEVELS = {
  EASY: "easy",
  MEDIUM: "medium",
  HARD: "hard",
  NEURAL_AI: "Neural AI",
} as const;

export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[keyof typeof DIFFICULTY_LEVELS];
