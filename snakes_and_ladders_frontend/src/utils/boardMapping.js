//
// PUBLIC_INTERFACE
// boardMapping.js
// Utilities for mapping board image coordinates to logical square indices, handling
// a 4-corner perspective transform, boustrophedon numbering, and config
// persistence (localStorage and file download/upload).
//
// This file provides helpers used by MappingMode UI and by game logic to
// resolve snakes/ladders from a saved mapping.
//

// PUBLIC_INTERFACE
export const MAPPING_LOCALSTORAGE_KEY = "snl_mapping_v1";

// PUBLIC_INTERFACE
export function boustrophedonIndexFromRowCol(row, col) {
  /**
   * Given a top-based row [0..9] and left-based col [0..9], return 1..100
   * using classic boustrophedon numbering starting from bottom-left = 1.
   */
  const bottomRowIndex = 9 - row;
  const isBottomRowEven = bottomRowIndex % 2 === 0;
  const inRowIdx = isBottomRowEven ? col : 9 - col;
  return bottomRowIndex * 10 + inRowIdx + 1;
}

// PUBLIC_INTERFACE
export function rowColFromIndex(index) {
  /**
   * Convert index 1..100 to top-based row/left-based col.
   */
  let cell = Math.min(100, Math.max(1, index));
  const zero = cell - 1;
  const bottomRowIndex = Math.floor(zero / 10);
  const inRowIdx = zero % 10;
  const row = 9 - bottomRowIndex;
  const isBottomRowEven = bottomRowIndex % 2 === 0;
  const col = isBottomRowEven ? inRowIdx : 9 - inRowIdx;
  return { row, col };
}

/**
 * Perspective transform helpers
 * We map from image pixel coordinates to a normalized board coordinate (u,v) in [0..1]^2
 * based on 4 clicked corners in order:
 *  - bottom-left, bottom-right, top-right, top-left
 */

// Compute 3x3 homography matrix that maps from quad (p->q)
function computeHomography(p, q) {
  // p: [{x,y}...] source quad
  // q: [{x,y}...] dest quad
  // Solve for H such that q ~ H * p (homogeneous)
  // Using standard DLT with 4 correspondences.
  const A = [];
  for (let i = 0; i < 4; i++) {
    const px = p[i].x, py = p[i].y;
    const qx = q[i].x, qy = q[i].y;
    A.push([-px, -py, -1, 0, 0, 0, px*qx, py*qx, qx]);
    A.push([0, 0, 0, -px, -py, -1, px*qy, py*qy, qy]);
  }
  // Solve Ah = 0 via SVD. For small bundle, we implement a naive approach using
  // numeric.js style reduction with Eigen via 3x3? To keep lightweight, we use
  // a minimal 9x9 eigenvector for smallest singular value by Gaussian elimination approximation.
  // For stability in our simple UI, we'll use a small library-free approach:
  // Use numeric solution via inverse of A^T A eigen - fallback with basic power iteration.

  // Build ATA
  const ATA = Array(9).fill(null).map(() => Array(9).fill(0));
  for (let r = 0; r < A.length; r++) {
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 9; j++) {
        ATA[i][j] += A[r][i] * A[r][j];
      }
    }
  }
  // Find eigenvector corresponding to smallest eigenvalue of ATA using power iteration on inverse.
  // We approximate by repeatedly solving ATA * x = b for random b and orthonormalizing.
  // For simplicity and to avoid heavy math, we will instead perform SVD fallback by using
  // a basic numeric trick: use gradient descent to minimize ||A h|| with constraint ||h||=1
  // This is overkill; alternate: use closed-form from four-point homography.
  // To keep code maintainable, we'll use a known small helper using matrix library-less solution.

  // Closed form using projective mapping derived from 4-point:
  // We map unit square to quadrilateral. We'll invert that to go from image -> unit square.
  // So compute H_sq->img and then invert.
  const H_sq_to_img = homographyFromUnitSquareToQuad(q);
  const H_img_to_sq = invertHomography(H_sq_to_img);

  // But we want: image -> normalized board u,v based on clicking p as the board quad.
  // Our p are image points of board corners, and q are normalized unit square corners.
  // Therefore compute H_img->uv directly:
  const H_img_to_uv = homographyFromQuadToUnitSquare(p);

  return H_img_to_uv;
}

function homographyFromUnitSquareToQuad(quad) {
  // quad: [bl, br, tr, tl]
  const [bl, br, tr, tl] = quad;
  const dx1 = br.x - tr.x;
  const dy1 = br.y - tr.y;
  const dx2 = tl.x - tr.x;
  const dy2 = tl.y - tr.y;
  const sx = tr.x - bl.x;
  const sy = tr.y - bl.y;
  const denom = dx1 * dy2 - dx2 * dy1;
  const g = (dx1 * sy - dx2 * sy) / denom; // not used in this variant
  const h = (dy1 * sx - dy2 * sx) / denom; // not used in this variant
  // We use a simpler formulation via direct solve
  // Using known form for mapping (u,v) to xy:
  // x = a0 + a1 u + a2 v + a3 u v
  // y = b0 + b1 u + b2 v + b3 u v
  // Solve coefficients:
  const A = [
    [1, 0, 0, 0, 1, 0, 0, 0],          // (u=0,v=0) -> bl
    [1, 1, 0, 0, 0, 0, 0, 0],          // (1,0) -> br
    [1, 1, 1, 1, 0, 0, 0, 0],          // (1,1) -> tr
    [1, 0, 1, 0, 0, 0, 0, 0],          // (0,1) -> tl
    [0, 0, 0, 0, 1, 0, 0, 0],          // x part done above; now y coefficients
    [0, 0, 0, 0, 1, 1, 0, 0],
    [0, 0, 0, 0, 1, 1, 1, 1],
    [0, 0, 0, 0, 1, 0, 1, 0],
  ];
  const b = [bl.x, br.x, tr.x, tl.x, bl.y, br.y, tr.y, tl.y];
  const coeff = solveLinearSystem(A, b); // [a0,a1,a2,a3,b0,b1,b2,b3]
  const H = {
    a0: coeff[0], a1: coeff[1], a2: coeff[2], a3: coeff[3],
    b0: coeff[4], b1: coeff[5], b2: coeff[6], b3: coeff[7],
  };
  return H;
}

function homographyFromQuadToUnitSquare(quad) {
  // Compute inverse of unit->quad mapping
  const H_q_to_img = homographyFromUnitSquareToQuad(quad);
  // invert approximately by sampling/bilinear? Instead derive direct inverse by solving multiple points.
  // For simplicity, we compute 3x3 homography using DLT by mapping the quad to unit square exactly:
  // Points mapping: quad -> [(0,1)=bl_u, (1,1)=br_u, (1,0)=tr_u, (0,0)=tl_u] in normalized image space
  // But we already have a parametric bilinear mapping, not projective exactly. Snakes and Ladders board
  // is near planar; bilinear suffices for UI calibration. We'll perform a numeric inverse using Newton.

  return {
    // PUBLIC_INTERFACE
    mapPoint: (x, y) => invertBilinear(H_q_to_img, x, y),
  };
}

function invertHomography(H) {
  return H; // Not used with our simplified bilinear model
}

function solveLinearSystem(A, b) {
  // Simple Gaussian elimination for small 8x8
  const n = A.length; // 8
  const M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    // pivot
    let maxRow = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(M[r][i]) > Math.abs(M[maxRow][i])) maxRow = r;
    }
    const tmp = M[i]; M[i] = M[maxRow]; M[maxRow] = tmp;
    const pivot = M[i][i] || 1e-12;
    for (let c = i; c <= n; c++) M[i][c] /= pivot;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const factor = M[r][i];
      for (let c = i; c <= n; c++) M[r][c] -= factor * M[i][c];
    }
  }
  return M.map(row => row[n]);
}

function invertBilinear(H, x, y) {
  // Given x,y and bilinear forward mapping (u,v)->(x,y), find (u,v) via Newton iterations.
  // Start from linear guess
  let u = 0.5, v = 0.5;
  for (let k = 0; k < 20; k++) {
    const fx = H.a0 + H.a1*u + H.a2*v + H.a3*u*v - x;
    const fy = H.b0 + H.b1*u + H.b2*v + H.b3*u*v - y;
    // Jacobian
    const j11 = H.a1 + H.a3*v;
    const j12 = H.a2 + H.a3*u;
    const j21 = H.b1 + H.b3*v;
    const j22 = H.b2 + H.b3*u;
    const det = j11*j22 - j12*j21 || 1e-12;
    const du = (-fx*j22 + fy*j12) / det;
    const dv = ( -fy*j11 + fx*j21) / det;
    u -= du;
    v -= dv;
    if (Math.abs(du) + Math.abs(dv) < 1e-6) break;
  }
  return { u, v };
}

// PUBLIC_INTERFACE
export function buildSquareCentersFromCorners(corners, width, height) {
  /**
   * corners: [{x,y} x4] in order: bottom-left, bottom-right, top-right, top-left (in image pixels)
   * width/height: image displayed dimensions for click coordinate basis.
   * Returns array of 100 items: [{cell, x, y, u, v}]
   */
  if (!corners || corners.length !== 4) return [];
  const quad = corners;
  const H = homographyFromQuadToUnitSquare(quad);

  const res = [];
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      const cell = boustrophedonIndexFromRowCol(row, col);
      // center in unit square
      const u = (col + 0.5) / 10;
      const v = (row + 0.5) / 10;
      // We need inverse mapping unit->image; we have image->unit inverter via Newton.
      // We'll project desired (u,v) back to image by another Newton iteration that finds (x,y) with mapPoint(x,y)=(u,v).
      // Start with linear interpolation between quad corners:
      const guess = bilinearInterpolateQuad(quad, u, v);
      // Refine by minimizing |mapPoint(x,y)-(u,v)|
      let x = guess.x, y = guess.y;
      for (let k = 0; k < 10; k++) {
        const mapped = H.mapPoint(x, y);
        const du = mapped.u - u;
        const dv = mapped.v - v;
        // numeric gradient approximation
        const eps = 1e-3;
        const m1 = H.mapPoint(x + eps, y);
        const m2 = H.mapPoint(x, y + eps);
        const gux = (m1.u - mapped.u) / eps;
        const guy = (m2.u - mapped.u) / eps;
        const gvx = (m1.v - mapped.v) / eps;
        const gvy = (m2.v - mapped.v) / eps;
        const det = gux*gvy - guy*gvx || 1e-9;
        const dx = (-du*gvy + dv*guy) / det;
        const dy = ( -dv*gux + du*gvx) / det;
        x -= dx;
        y -= dy;
        if (Math.abs(dx) + Math.abs(dy) < 1e-3) break;
      }
      res.push({ cell, x, y, u, v });
    }
  }
  return res;
}

function bilinearInterpolateQuad(quad, u, v) {
  const [bl, br, tr, tl] = quad;
  const x = bl.x*(1-u)*(1-v) + br.x*u*(1-v) + tr.x*u*v + tl.x*(1-u)*v;
  const y = bl.y*(1-u)*(1-v) + br.y*u*(1-v) + tr.y*u*v + tl.y*(1-u)*v;
  return { x, y };
}

// PUBLIC_INTERFACE
export function nearestCellFromClick(x, y, centers) {
  /**
   * Given a click at image coords (x,y) and precomputed centers [{cell,x,y}],
   * return the nearest cell index.
   */
  if (!centers || centers.length === 0) return null;
  let best = centers[0];
  let bestD2 = (x - best.x) ** 2 + (y - best.y) ** 2;
  for (let i = 1; i < centers.length; i++) {
    const c = centers[i];
    const d2 = (x - c.x) ** 2 + (y - c.y) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = c;
    }
  }
  return best.cell;
}

// PUBLIC_INTERFACE
export function makeEmptyMapping() {
  return {
    version: 1,
    meta: {
      note: "Calibration mapping for Snakes & Ladders board",
      createdAt: new Date().toISOString(),
    },
    corners: [], // [{x,y} x4]
    centers: [], // [{cell,x,y,u,v} x100]
    ladders: {}, // base->top
    snakes: {},  // head->tail
  };
}

// PUBLIC_INTERFACE
export function saveMappingToLocalStorage(mapping) {
  localStorage.setItem(MAPPING_LOCALSTORAGE_KEY, JSON.stringify(mapping));
}

// PUBLIC_INTERFACE
export function loadMappingFromLocalStorage() {
  try {
    const raw = localStorage.getItem(MAPPING_LOCALSTORAGE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object" && obj.version === 1) return obj;
    return null;
  } catch {
    return null;
  }
}

// PUBLIC_INTERFACE
export function exportMappingAsFile(mapping) {
  const blob = new Blob([JSON.stringify(mapping, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "snl-mapping.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// PUBLIC_INTERFACE
export function importMappingFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        if (obj && typeof obj === "object" && obj.version === 1) {
          resolve(obj);
        } else {
          reject(new Error("Invalid mapping format/version"));
        }
      } catch (e) {
        reject(e);
      }
    };
    reader.readAsText(file);
  });
}
