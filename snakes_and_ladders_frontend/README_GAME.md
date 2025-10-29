# Snakes & Ladders Frontend

- Board: Renders the attached image as background with no overlays.
- Players: Human vs simple AI.
- Controls: Roll Dice (human turn), New Game, display of positions and last roll.
- Chat: Rule-based AI taunts appear in the right panel.
- Layout: Responsive with board center, chat right, controls bottom.

Files:
- src/config/snakesAndLaddersConfig.js: snakes/ladders mapping, board utilities, and default image URL.
- src/components/Board.js: background-only board view.
- src/components/Controls.js: buttons and status.
- src/components/ChatPanel.js: taunt display.
- src/services/simpleAI.js: dice, AI move, taunts.

TODO:
- Support uploading a custom board image and swapping mapping in snakesAndLaddersConfig.js.
- Add optional click-to-highlight grid (off-board visualization) without overlaying the board.
- Improve AutoMap heuristics and add per-component confidence visualization inside Mapping Mode (without board overlays).
