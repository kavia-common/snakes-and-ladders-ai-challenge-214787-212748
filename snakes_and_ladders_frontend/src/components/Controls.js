import React from "react";

/**
 * PUBLIC_INTERFACE
 * Controls
 * Minimal control surface for the game: shows current turn, dice result, player positions,
 * and buttons for Roll and New Game.
 *
 * Props:
 * - currentTurn: "HUMAN" | "AI"
 * - lastRoll: number | null
 * - humanCell: number
 * - aiCell: number
 * - onRoll: () => void
 * - onNewGame: () => void
 * - isRolling: boolean
 */
export default function Controls({
  currentTurn,
  lastRoll,
  humanCell,
  aiCell,
  onRoll,
  onNewGame,
  isRolling,
}) {
  return (
    <div className="controls">
      <div className="controls__row">
        <div className={`badge ${currentTurn === "HUMAN" ? "badge--active" : ""}`}>
          Human Turn
        </div>
        <div className={`badge ${currentTurn === "AI" ? "badge--active" : ""}`}>
          AI Turn
        </div>
        <div className="spacer" />
        <button className="btn secondary" onClick={onNewGame} disabled={isRolling}>
          New Game
        </button>
        <button
          className="btn primary"
          onClick={onRoll}
          disabled={currentTurn !== "HUMAN" || isRolling}
          aria-disabled={currentTurn !== "HUMAN" || isRolling}
        >
          {isRolling ? "Rolling..." : "Roll Dice"}
        </button>
      </div>
      <div className="controls__row stats">
        <div>Last Roll: {lastRoll ?? "-"}</div>
        <div>Human Position: {humanCell}</div>
        <div>AI Position: {aiCell}</div>
      </div>
    </div>
  );
}
