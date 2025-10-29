//
// PUBLIC_INTERFACE
// autoMap.js
// "Best-effort" automatic mapping extractor for a classic Snakes & Ladders board image.
//
// Pipeline (no external services or libs):
// 1) Load image (default /assets/board-default.jpg or provided URL)
// 2) Detect board area by simple edge/contrast and find largest rectangular region via Hough-like line sampling heuristics
//    For simplicity, we fallback to image bounds if confidence low.
// 3) Normalize to a 10x10 grid by perspective correction (using boardMapping bilinear helpers).
// 4) Compute square centers via boustrophedon numbering 1..100.
// 5) Color thresholding to detect elongated colored components likely to be snakes/ladders;
//    perform simple morphology and connected-components on thresholded masks.
// 6) For each component, pick two extremal points as endpoints, map to nearest squares, and classify:
//    ladders if end index > start index (bottom-to-top), snakes if end index < start index.
// 7) Return mapping object with confidence metrics. If confidence low, caller should fall back.
//
// Notes:
// - This is heuristic and may not be perfect; Mapping Mode is preserved for manual correction.
// - All drawing is offscreen; no overlays are rendered during gameplay.
//
// PUBLIC_INTERFACE
export async function autoDetectMappingFromImage(imageUrl, progressCb) {
  /**
   * Runs the whole pipeline and returns:
   * {
   *   success: boolean,
   *   confidence: number (0..1),
   *   message: string,
   *   mapping: {
   *     version: 1,
   *     meta: {...},
   *     corners: [{x,y} x4],
   *     centers: [{cell,x,y,u,v} x100],
   *     ladders: { [base:number]: number },
   *     snakes: { [head:number]: number }
   *   }
   * }
   */
  try {
    notify(progressCb, "Loading image...");
    const img = await loadImage(imageUrl);
    const { width: iw, height: ih } = img;

    // Create an offscreen canvas for processing
    const canvas = document.createElement("canvas");
    canvas.width = iw;
    canvas.height = ih;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, iw, ih);

    // Step 2: find board quad (approx). We'll use a simple approach:
    // - Detect strong vertical/horizontal lines by sampling intensity gradients across rows/cols.
    // - Choose borders that maximize edge accumulated magnitude.
    notify(progressCb, "Detecting board boundaries...");
    const imageData = ctx.getImageData(0, 0, iw, ih);
    const { data } = imageData;

    const edgeX = new Float32Array(iw);
    const edgeY = new Float32Array(ih);

    // Accumulate vertical edges per column and horizontal edges per row
    // Simple gradient on luminance
    const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
    const L = new Float32Array(iw * ih);
    for (let y = 0; y < ih; y++) {
      for (let x = 0; x < iw; x++) {
        const i = (y * iw + x) * 4;
        L[y * iw + x] = lum(data[i], data[i + 1], data[i + 2]);
      }
    }
    // gradient magnitude along x for vertical lines -> sum abs(dL/dx) over y per x
    for (let x = 1; x < iw - 1; x++) {
      let sum = 0;
      for (let y = 0; y < ih; y++) {
        const d = Math.abs(L[y * iw + (x + 1)] - L[y * iw + (x - 1)]);
        sum += d;
      }
      edgeX[x] = sum;
    }
    // gradient magnitude along y for horizontal lines -> sum abs(dL/dy) over x per y
    for (let y = 1; y < ih - 1; y++) {
      let sum = 0;
      for (let x = 0; x < iw; x++) {
        const d = Math.abs(L[(y + 1) * iw + x] - L[(y - 1) * iw + x]);
        sum += d;
      }
      edgeY[y] = sum;
    }

    // Find likely left/right/top/bottom by peak detection near edges
    const left = argMaxInRange(edgeX, 0, Math.floor(iw * 0.2));
    const right = argMaxInRange(edgeX, Math.floor(iw * 0.8), iw - 1);
    const top = argMaxInRange(edgeY, 0, Math.floor(ih * 0.2));
    const bottom = argMaxInRange(edgeY, Math.floor(ih * 0.8), ih - 1);

    // Build corners: bottom-left, bottom-right, top-right, top-left (image coords)
    let corners = [
      { x: left, y: bottom },
      { x: right, y: bottom },
      { x: right, y: top },
      { x: left, y: top },
    ];

    // Validate: ensure area reasonable; if poor, fallback to tight inset bounds
    const area = Math.abs((right - left) * (bottom - top));
    let boundaryConfidence = 0;
    if (area > 0.4 * iw * ih) {
      // suspiciously huge; likely chosen near borders - still acceptable
      boundaryConfidence = 0.5;
    } else if (area > 0.2 * iw * ih) {
      boundaryConfidence = 0.7;
    } else if (area > 0.1 * iw * ih) {
      boundaryConfidence = 0.6;
    } else {
      // fallback to margins (5% inset)
      const inset = 0.05;
      corners = [
        { x: iw * inset, y: ih * (1 - inset) },
        { x: iw * (1 - inset), y: ih * (1 - inset) },
        { x: iw * (1 - inset), y: ih * inset },
        { x: iw * inset, y: ih * inset },
      ];
      boundaryConfidence = 0.4;
    }

    notify(progressCb, "Estimating 10x10 centers...");
    // Build centers assuming we operate in the displayed image/native coords
    const { buildSquareCentersFromCorners, boustrophedonIndexFromRowCol } = await import("./boardMapping");
    const centers = buildSquareCentersFromCorners(corners, iw, ih);

    // Prepare a normalized crop for color analysis: sample 10x per cell resolution
    notify(progressCb, "Color thresholding for snakes/ladders...");
    const normN = 200; // 200x200 normalization
    const norm = document.createElement("canvas");
    norm.width = normN;
    norm.height = normN;
    const nctx = norm.getContext("2d");

    // Warp: sample each (u,v) in [0..1]^2 to original image via bilinear interpolation on clicked quad
    const [bl, br, tr, tl] = corners;
    const srcPx = (x, y) => {
      const ix = Math.max(0, Math.min(iw - 1, Math.round(x)));
      const iy = Math.max(0, Math.min(ih - 1, Math.round(y)));
      const idx = (iy * iw + ix) * 4;
      return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
    };
    const bilinear = (u, v) => {
      const x = bl.x * (1 - u) * (1 - v) + br.x * u * (1 - v) + tr.x * u * v + tl.x * (1 - u) * v;
      const y = bl.y * (1 - u) * (1 - v) + br.y * u * (1 - v) + tr.y * u * v + tl.y * (1 - u) * v;
      return srcPx(x, y);
    };
    const nImg = nctx.createImageData(normN, normN);
    for (let y = 0; y < normN; y++) {
      const v = y / (normN - 1);
      for (let x = 0; x < normN; x++) {
        const u = x / (normN - 1);
        const [r, g, b, a] = bilinear(u, v);
        const i = (y * normN + x) * 4;
        nImg.data[i] = r; nImg.data[i + 1] = g; nImg.data[i + 2] = b; nImg.data[i + 3] = a ?? 255;
      }
    }
    nctx.putImageData(nImg, 0, 0);

    // Threshold masks for common colors (red/green/yellow/blue). We will look for elongated components.
    const nm = nctx.getImageData(0, 0, normN, normN);
    const nd = nm.data;
    const masks = {
      red: new Uint8Array(normN * normN),
      green: new Uint8Array(normN * normN),
      blue: new Uint8Array(normN * normN),
      yellow: new Uint8Array(normN * normN),
    };

    for (let i = 0; i < normN * normN; i++) {
      const r = nd[i * 4], g = nd[i * 4 + 1], b = nd[i * 4 + 2];
      const sum = r + g + b + 1e-6;
      const rn = r / sum, gn = g / sum, bn = b / sum;

      if (rn > 0.5 && r > 80) masks.red[i] = 1;
      if (gn > 0.5 && g > 80) masks.green[i] = 1;
      if (bn > 0.5 && b > 80) masks.blue[i] = 1;
      if (rn > 0.35 && gn > 0.35 && bn < 0.3 && r > 80 && g > 80) masks.yellow[i] = 1;
    }

    // Morphological opening to remove noise
    notify(progressCb, "Analyzing connected components...");
    Object.keys(masks).forEach((k) => {
      masks[k] = morphOpen(masks[k], normN, normN, 1);
    });

    // Connected components and endpoints
    const components = [];
    for (const color of Object.keys(masks)) {
      const comps = findComponents(masks[color], normN, normN, 30);
      for (const c of comps) {
        const stats = componentStats(c, normN);
        // Heuristic: elongated (length/width) > 2 => plausible snake/ladder
        if (stats.aspect > 2 && stats.length > 12) {
          components.push({ color, ...stats });
        }
      }
    }

    // Map endpoints to nearest cells
    const laddersMap = {};
    const snakesMap = {};
    let slConfidence = 0;

    const toCell = (px, py) => {
      // px,py in normalized crop space [0..normN-1] -> (u,v) -> image coords -> nearest center
      const u = px / (normN - 1);
      const v = py / (normN - 1);
      const X = bl.x * (1 - u) * (1 - v) + br.x * u * (1 - v) + tr.x * u * v + tl.x * (1 - u) * v;
      const Y = bl.y * (1 - u) * (1 - v) + br.y * u * (1 - v) + tr.y * u * v + tl.y * (1 - u) * v;
      let bestCell = 1;
      let bestD2 = Infinity;
      for (const c of centers) {
        const d2 = (X - c.x) * (X - c.x) + (Y - c.y) * (Y - c.y);
        if (d2 < bestD2) { bestD2 = d2; bestCell = c.cell; }
      }
      return bestCell;
    };

    for (const comp of components) {
      const startCell = toCell(comp.minPoint.x, comp.minPoint.y); // lower point in v-axis sense
      const endCell = toCell(comp.maxPoint.x, comp.maxPoint.y);
      // In normalized crop, y increases downward; bottom-to-top means low v to high v:
      // Let's compute board indices: if end > start -> ladder, else snake
      if (endCell > startCell) {
        // Ladder
        // Avoid duplicates or trivial edges
        if (endCell - startCell >= 3) {
          laddersMap[startCell] = endCell;
          slConfidence += 0.03;
        }
      } else if (endCell < startCell) {
        // Snake
        if (startCell - endCell >= 3) {
          snakesMap[startCell] = endCell;
          slConfidence += 0.03;
        }
      }
    }

    // Basic pruning: remove obviously invalid overlaps (same start mapped to multiple ends, keep longest)
    dedupeMapping(laddersMap, true);
    dedupeMapping(snakesMap, false);

    const mapping = {
      version: 1,
      meta: {
        note: "Auto-generated mapping from board image",
        source: imageUrl,
        updatedAt: new Date().toISOString(),
        boundaryConfidence,
      },
      corners,
      centers,
      ladders: laddersMap,
      snakes: snakesMap,
    };

    // Compute final confidence
    const usableLadders = Object.keys(laddersMap).length;
    const usableSnakes = Object.keys(snakesMap).length;
    const countScore = Math.min(1, (usableLadders + usableSnakes) / 12);
    const confidence = Math.max(0, Math.min(1, 0.4 * boundaryConfidence + 0.6 * Math.min(1, slConfidence + countScore * 0.5)));

    const message = confidence < 0.5
      ? "Low confidence. You may want to refine using Mapping Mode."
      : "Auto-detection completed.";

    return { success: true, confidence, message, mapping };
  } catch (e) {
    return { success: false, confidence: 0, message: `Auto-detect failed: ${e.message}`, mapping: null };
  }
}

// Helpers

function notify(cb, msg) {
  try { cb && cb(msg); } catch {}
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
}

function argMaxInRange(arr, a, b) {
  a = Math.max(0, a); b = Math.min(arr.length - 1, b);
  let idx = a, val = -Infinity;
  for (let i = a; i <= b; i++) {
    if (arr[i] > val) { val = arr[i]; idx = i; }
  }
  return idx;
}

function morphOpen(mask, w, h, r = 1) {
  // Erode then dilate on a binary mask (Uint8Array)
  const eroded = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  // Erode
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let ok = 1;
      for (let dy = -r; dy <= r && ok; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const xx = Math.max(0, Math.min(w - 1, x + dx));
          const yy = Math.max(0, Math.min(h - 1, y + dy));
          if (!mask[yy * w + xx]) { ok = 0; break; }
        }
      }
      eroded[y * w + x] = ok;
    }
  }
  // Dilate
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let dy = -r; dy <= r && !v; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const xx = Math.max(0, Math.min(w - 1, x + dx));
          const yy = Math.max(0, Math.min(h - 1, y + dy));
          if (eroded[yy * w + xx]) { v = 1; break; }
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

function findComponents(mask, w, h, minSize = 20) {
  const visited = new Uint8Array(w * h);
  const comps = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i] && !visited[i]) {
        const pixels = [];
        const q = [i];
        visited[i] = 1;
        while (q.length) {
          const p = q.pop();
          pixels.push(p);
          const px = p % w, py = (p / w) | 0;
          // 8-connectivity
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const xx = px + dx, yy = py + dy;
              if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
              const ni = yy * w + xx;
              if (mask[ni] && !visited[ni]) {
                visited[ni] = 1;
                q.push(ni);
              }
            }
          }
        }
        if (pixels.length >= minSize) comps.push(pixels);
      }
    }
  }
  return comps;
}

/**
 * Compute simple stats for a connected component in the normalized crop.
 * Returns bounding box, two extremal points, length and aspect ratio.
 */
function componentStats(pixels, w) {
  // Compute bbox, extremal points by PCA-like method (approx via furthest point heuristic)
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const p of pixels) {
    const x = p % w; const y = (p / w) | 0;
    if (x < minx) minx = x;
    if (y < miny) miny = y;
    if (x > maxx) maxx = x;
    if (y > maxy) maxy = y;
  }
  const bboxW = Math.max(1, maxx - minx + 1);
  const bboxH = Math.max(1, maxy - miny + 1);
  // Find two farthest points by double pass
  const first = pixels[0];
  let far = first, farD = -1;
  for (const p of pixels) {
    const dx = (p % w) - (first % w);
    const dy = ((p / w) | 0) - ((first / w) | 0);
    const d2 = dx * dx + dy * dy;
    if (d2 > farD) { farD = d2; far = p; }
  }
  let far2 = far, far2D = -1;
  for (const p of pixels) {
    const dx = (p % w) - (far % w);
    const dy = ((p / w) | 0) - ((far / w) | 0);
    const d2 = dx * dx + dy * dy;
    if (d2 > far2D) { far2D = d2; far2 = p; }
  }
  const p1 = { x: far % w, y: (far / w) | 0 };
  const p2 = { x: far2 % w, y: (far2 / w) | 0 };
  // Determine min/max along vertical to interpret "bottom/top" approximately (by y value)
  const minPoint = p1.y > p2.y ? p2 : p1; // smaller y is nearer "top"
  const maxPoint = p1.y > p2.y ? p1 : p2; // larger y is nearer "bottom"
  const length = Math.sqrt(far2D);
  const aspect = Math.max(bboxW, bboxH) / Math.max(1, Math.min(bboxW, bboxH));
  return { minx, miny, maxx, maxy, bboxW, bboxH, minPoint, maxPoint, length, aspect };
}

function dedupeMapping(map, isLadder) {
  const entries = Object.entries(map).map(([a, b]) => [parseInt(a, 10), b]);
  const grouped = {};
  for (const [s, e] of entries) {
    if (!grouped[s]) grouped[s] = [];
    grouped[s].push(e);
  }
  for (const k of Object.keys(grouped)) {
    const s = parseInt(k, 10);
    const cands = grouped[k];
    // keep the one with max absolute delta
    let best = cands[0];
    let bestSpan = Math.abs(best - s);
    for (const e of cands) {
      const span = Math.abs(e - s);
      if (span > bestSpan) { best = e; bestSpan = span; }
    }
    map[s] = best;
  }
  // Additionally, ensure direction matches expected (ladders up, snakes down)
  for (const k of Object.keys(map)) {
    const s = parseInt(k, 10);
    if (isLadder && map[k] <= s) delete map[k];
    if (!isLadder && map[k] >= s) delete map[k];
  }
}
