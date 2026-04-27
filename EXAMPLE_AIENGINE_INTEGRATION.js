/**
 * EXAMPLE: How to integrate Neural AI into your chess game's aiEngine.js
 * 
 * This file shows how to add the "Neural AI" difficulty mode to your existing
 * chess AI engine. Copy the relevant parts into your actual aiEngine.js file.
 */

// ============================================================================
// DIFFICULTY LEVELS - Add "Neural AI" to your existing difficulty options
// ============================================================================

const DIFFICULTY_LEVELS = {
  EASY: { name: "Easy", depth: 2 },
  MEDIUM: { name: "Medium", depth: 4 },
  HARD: { name: "Hard", depth: 6 },
  NEURAL_AI: { name: "Neural AI", type: "neural" }, // NEW
};

// ============================================================================
// MAIN AI MOVE FUNCTION - Route to appropriate engine
// ============================================================================

/**
 * Get the best move for the current position
 * @param {string} fen - FEN string of the current position
 * @param {array} moveHistory - Array of moves in algebraic notation
 * @param {string} difficulty - Difficulty level (EASY, MEDIUM, HARD, NEURAL_AI)
 * @returns {Promise<string>} - The best move in algebraic notation
 */
async function getAIMove(fen, moveHistory, difficulty) {
  console.log(`[AI] Getting move for difficulty: ${difficulty}`);

  // Route to appropriate engine based on difficulty
  if (difficulty === "NEURAL_AI" || difficulty === "Neural AI") {
    return getNeuralAIMove(fen, moveHistory);
  } else {
    // Use existing minimax engine for other difficulties
    return getMiniaxMove(fen, DIFFICULTY_LEVELS[difficulty].depth);
  }
}

// ============================================================================
// NEURAL AI ENGINE - Call the chess-ai-proxy endpoint
// ============================================================================

/**
 * Get move from Neural AI (real AI providers with fallback chain)
 * @param {string} fen - FEN string
 * @param {array} moveHistory - Move history
 * @returns {Promise<string>} - Best move
 */
async function getNeuralAIMove(fen, moveHistory) {
  try {
    console.log("[Neural AI] Requesting move from AI proxy...");

    // Call the chess-ai-proxy endpoint
    const response = await fetch("/api/chess-ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fen: fen,
        moveHistory: moveHistory || [],
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`[Neural AI] Got move: ${data.move} from ${data.provider} (confidence: ${data.confidence})`);

    // Validate the move is legal
    if (!isLegalMove(fen, data.move)) {
      console.warn(`[Neural AI] Illegal move returned: ${data.move}, falling back to minimax`);
      return getMiniaxMove(fen, 4);
    }

    return data.move;
  } catch (error) {
    console.error("[Neural AI] Failed:", error.message);
    console.log("[Neural AI] Falling back to minimax engine (depth 4)");

    // Fallback to minimax if Neural AI fails
    try {
      return getMiniaxMove(fen, 4);
    } catch (fallbackError) {
      console.error("[AI] Fallback also failed:", fallbackError);
      throw new Error("All AI engines failed");
    }
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate that a move is legal in the given position
 * @param {string} fen - FEN string
 * @param {string} move - Move in algebraic notation (e.g., "e2e4")
 * @returns {boolean}
 */
function isLegalMove(fen, move) {
  // This depends on your chess library (chess.js, chessops, etc.)
  // Example using chess.js:
  // const chess = new Chess(fen);
  // const legalMoves = chess.moves({ verbose: true });
  // return legalMoves.some(m => m.from + m.to === move);

  // For now, just do basic validation
  if (!move || move.length !== 4) {
    return false;
  }

  const files = "abcdefgh";
  const ranks = "12345678";

  const fromFile = move[0];
  const fromRank = move[1];
  const toFile = move[2];
  const toRank = move[3];

  return (
    files.includes(fromFile) &&
    ranks.includes(fromRank) &&
    files.includes(toFile) &&
    ranks.includes(toRank)
  );
}

/**
 * Get move from minimax engine (your existing implementation)
 * @param {string} fen - FEN string
 * @param {number} depth - Search depth
 * @returns {string} - Best move
 */
function getMiniaxMove(fen, depth) {
  // This is your existing minimax implementation
  // Replace this with your actual minimax engine code
  console.log(`[Minimax] Searching at depth ${depth}...`);

  // Example placeholder - implement your actual minimax here
  const chess = new Chess(fen);
  const moves = chess.moves();

  if (moves.length === 0) {
    throw new Error("No legal moves available");
  }

  // For now, return a random move (replace with real minimax)
  return moves[Math.floor(Math.random() * moves.length)];
}

// ============================================================================
// GAME INITIALIZATION - Update difficulty selection UI
// ============================================================================

/**
 * Example: Update your game initialization to include Neural AI option
 */
function initializeGameDifficulties() {
  const difficultyOptions = [
    {
      id: "EASY",
      label: "Easy (Minimax Depth 2)",
      description: "Quick moves, basic strategy",
    },
    {
      id: "MEDIUM",
      label: "Medium (Minimax Depth 4)",
      description: "Balanced difficulty",
    },
    {
      id: "HARD",
      label: "Hard (Minimax Depth 6)",
      description: "Strong play, slower moves",
    },
    {
      id: "NEURAL_AI",
      label: "Neural AI (Real AI Providers)",
      description: "Uses OpenAI, Anthropic, Google Gemini, and more",
    },
  ];

  // Render these options in your UI
  return difficultyOptions;
}

// ============================================================================
// GAME LOOP - Handle AI moves with loading state
// ============================================================================

/**
 * Example: Update your game loop to handle Neural AI moves
 */
async function handleAIMove(gameState, difficulty) {
  try {
    // Show loading indicator
    if (difficulty === "NEURAL_AI") {
      showLoadingIndicator("Neural AI is thinking...");
    } else {
      showLoadingIndicator("AI is thinking...");
    }

    // Get the AI move
    const move = await getAIMove(gameState.fen, gameState.moveHistory, difficulty);

    // Apply the move to the board
    applyMove(move);

    // Update game state
    gameState.moveHistory.push(move);
    updateGameDisplay();

    // Hide loading indicator
    hideLoadingIndicator();

    return move;
  } catch (error) {
    console.error("[Game] AI move failed:", error);
    hideLoadingIndicator();
    showError(`AI failed to generate move: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// UI HELPERS - Implement these based on your UI framework
// ============================================================================

function showLoadingIndicator(message) {
  // Show a loading spinner with the given message
  // Example: document.getElementById("ai-thinking").textContent = message;
  console.log(`[UI] ${message}`);
}

function hideLoadingIndicator() {
  // Hide the loading spinner
  console.log("[UI] Hiding loading indicator");
}

function showError(message) {
  // Show an error message to the user
  console.error(`[UI] Error: ${message}`);
}

function updateGameDisplay() {
  // Refresh the board display
  console.log("[UI] Updating game display");
}

function applyMove(move) {
  // Apply the move to your chess board
  console.log(`[Game] Applying move: ${move}`);
}

// ============================================================================
// EXPORT - Make functions available to your game
// ============================================================================

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getAIMove,
    getNeuralAIMove,
    getMiniaxMove,
    DIFFICULTY_LEVELS,
    initializeGameDifficulties,
    handleAIMove,
  };
}
