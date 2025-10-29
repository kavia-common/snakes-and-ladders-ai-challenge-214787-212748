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
 * - mappingActive: boolean
 * - onToggleMapping: () => void
 */
export default function Controls({
  currentTurn,
  lastRoll,
  humanCell,
  aiCell,
  onRoll,
  onNewGame,
  isRolling,
  mappingActive = false,
  onToggleMapping,
  onAutoDetect, // new optional handler
  autoDetectBusy = false, // status
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
        <button className={`btn ${mappingActive ? "primary" : "secondary"}`} onClick={onToggleMapping}>
          {mappingActive ? "Exit Mapping Mode" : "Mapping Mode"}
        </button>
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
        <div className="spacer" />
        <button
          className="btn secondary"
          onClick={onAutoDetect}
          disabled={autoDetectBusy}
          aria-disabled={autoDetectBusy}
          title="Auto-detect mapping from board image"
        >
          {autoDetectBusy ? "Auto-detecting..." : "Auto-detect mapping from board image"}
        </button>
      </div>
    </div>
  );
}
