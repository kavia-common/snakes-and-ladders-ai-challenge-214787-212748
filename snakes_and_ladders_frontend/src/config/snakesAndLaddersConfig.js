//
// PUBLIC_INTERFACE
// snakesAndLaddersConfig.js
// Central configuration and helpers for the Snakes & Ladders board, snakes/ladders mappings,
// and cell coordinate utilities aligned to a 10x10 boustrophedon board.
// This file is intentionally verbose and documented to support future board swaps.
//
// NOTE: We do not draw overlays on the board image in the UI; all visuals remain on the panel areas.
// We compute positions to support future extensions like click-to-cell or off-board indicators.
//
// TODO (future): When allowing custom board images, provide a UI to upload an image and an associated
// mapping object (snakes, ladders) and swap BOARD_IMAGE_URL and mappings accordingly.
//

/**
 * Public constants and helpers exported from this module:
 * - BOARD_IMAGE_URL: default board background
 * - BOARD_ROWS, BOARD_COLS: grid dimensions (10x10)
 * - snakes: mapping from head cell to tail cell
 * - ladders: mapping from base cell to top cell
 * - getRowColFromCell(cell): returns {row, col} zero-based
 * - getCellFromRowCol(row, col): returns 1..100
 * - getCellCenterForRect(cell, rect): normalized center position [0..1] within rect (no overlay used now)
 */

// PUBLIC_INTERFACE
export const BOARD_IMAGE_URL = "/assets/board-default.jpg";

// 10x10 classic board
export const BOARD_ROWS = 10;
export const BOARD_COLS = 10;

/**
 * Numbering: boustrophedon from bottom-left:
 * - Row index 9 is the bottom row (cells 1..10), row 0 is top (cells 91..100)
 * - Even rows from bottom (row 9, 7, 5, ...) go left->right, odd rows go right->left
 */

// PUBLIC_INTERFACE
export function getRowColFromCell(cell) {
  if (cell < 1) cell = 1;
  if (cell > 100) cell = 100;
  const indexFromZero = cell - 1;
  const bottomRowIndex = Math.floor(indexFromZero / 10); // 0..9 from bottom
  const row = 9 - bottomRowIndex; // convert to top-based 0..9
  const inRowIdx = indexFromZero % 10;
  const isBottomRowEven = bottomRowIndex % 2 === 0;
  const col = isBottomRowEven ? inRowIdx : 9 - inRowIdx;
  return { row, col };
}

// PUBLIC_INTERFACE
export function getCellFromRowCol(row, col) {
  const bottomRowIndex = 9 - row;
  const isBottomRowEven = bottomRowIndex % 2 === 0;
  let inRowIdx = isBottomRowEven ? col : 9 - col;
  return bottomRowIndex * 10 + inRowIdx + 1;
}

/**
 * Compute the normalized center coordinates for a given cell within a rectangle.
 * This is useful if later we choose to render off-board indicators that depend on position.
 * Returns { xNorm, yNorm } in [0..1], relative to the top-left of the rect.
 */
// PUBLIC_INTERFACE
export function getCellCenterForRect(cell, rect) {
  const { row, col } = getRowColFromCell(cell);
  const cellW = rect.width / BOARD_COLS;
  const cellH = rect.height / BOARD_ROWS;
  const x = col * cellW + cellW / 2;
  const y = row * cellH + cellH / 2;
  return {
    xNorm: x / rect.width,
    yNorm: y / rect.height,
  };
}

/**
 * Snakes and ladders mapping based on the provided board image.
 * These mappings were chosen to align with a typical snakes-and-ladders layout
 * that matches the attached image style. If a later verification reveals different
 * endpoints, adjust these pairs accordingly.
 *
 * Conventions:
 * - ladders: baseCell -> topCell (base < top)
 * - snakes: headCell -> tailCell (head > tail)
 *
 * The set below represents a coherent playable mapping for a 100-cell board:
 */

// PUBLIC_INTERFACE
export const ladders = {
  2: 38,
  4: 14,
  8: 31,
  21: 42,
  28: 84,
  36: 44,
  51: 67,
  71: 91,
  80: 100,
};

// PUBLIC_INTERFACE
export const snakes = {
  16: 6,
  47: 26,
  49: 11,
  56: 53,
  62: 19,
  64: 60,
  87: 24,
  93: 73,
  95: 75,
  98: 78,
};

/**
 * Apply snakes and ladders transitions to a given cell. If the cell is a head/base,
 * returns the new target cell; otherwise returns the original cell.
 */
// PUBLIC_INTERFACE
export function resolveSnakesAndLadders(cell) {
  if (snakes[cell]) return snakes[cell];
  if (ladders[cell]) return ladders[cell];
  return cell;
}
