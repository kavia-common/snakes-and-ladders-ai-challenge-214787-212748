import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildSquareCentersFromCorners,
  exportMappingAsFile,
  importMappingFromFile,
  loadMappingFromLocalStorage,
  makeEmptyMapping,
  nearestCellFromClick,
  saveMappingToLocalStorage,
} from "../utils/boardMapping";
import { BOARD_IMAGE_URL } from "../config/snakesAndLaddersConfig";
import { autoDetectMappingFromImage } from "../utils/autoMap";

/**
 * PUBLIC_INTERFACE
 * MappingMode
 * A minimal side-panel UI for calibrating the board mapping:
 * - Step 1: Click four board corners in order: bottom-left, bottom-right, top-right, top-left.
 * - Step 2: Auto-generate square centers (100).
 * - Step 3: Capture snakes (head->tail) and ladders (bottom->top) by clicking endpoints.
 * - Step 4: Review/edit JSON, Export/Import, and Save (writes to localStorage plus file download).
 *
 * Props:
 * - active: boolean (when true, enable capturing clicks)
 * - boardRect: DOMRect of the board element to translate click coordinates
 * - getBoardElement: () => HTMLElement | null
 * - onSaved: (mapping) => void  // Notify App to reload mapping-based logic if needed.
 */
export default function MappingMode({ active, boardRect, getBoardElement, onSaved }) {
  const [step, setStep] = useState(1);
  const [corners, setCorners] = useState([]); // [{x,y}...]
  const [centers, setCenters] = useState([]); // [{cell,x,y,u,v}...]
  const [snakes, setSnakes] = useState({});
  const [ladders, setLadders] = useState({});
  const [jsonText, setJsonText] = useState("");
  const [status, setStatus] = useState("");
  const [autoBusy, setAutoBusy] = useState(false);

  // restore existing mapping from LS on mount
  useEffect(() => {
    const saved = loadMappingFromLocalStorage();
    if (saved) {
      setCorners(saved.corners || []);
      setCenters(saved.centers || []);
      setSnakes(saved.snakes || {});
      setLadders(saved.ladders || {});
      setJsonText(JSON.stringify(saved, null, 2));
      setStep(saved.corners?.length === 4 ? 2 : 1);
    } else {
      const empty = makeEmptyMapping();
      setJsonText(JSON.stringify(empty, null, 2));
    }
  }, []);

  // Update JSON preview whenever parts change
  useEffect(() => {
    const mapping = {
      version: 1,
      meta: {
        note: "Calibration mapping for Snakes & Ladders board",
        updatedAt: new Date().toISOString(),
      },
      corners,
      centers,
      ladders,
      snakes,
    };
    setJsonText(JSON.stringify(mapping, null, 2));
  }, [corners, centers, snakes, ladders]);

  const handleBoardClick = useCallback((evt) => {
    if (!active) return;
    const boardEl = getBoardElement?.();
    if (!boardEl) return;
    const rect = boardEl.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;

    if (step === 1) {
      if (corners.length >= 4) return;
      const next = [...corners, { x, y }];
      setCorners(next);
      setStatus(`Corner ${next.length}/4 captured.`);
      if (next.length === 4) {
        setStep(2);
      }
    } else if (step === 3) {
      // Capturing endpoints for snakes/ladders depending on mode
      if (captureMode.current === "snake") {
        captureSnakePoint({ x, y });
      } else if (captureMode.current === "ladder") {
        captureLadderPoint({ x, y });
      }
    }
  }, [active, step, corners, getBoardElement]);

  // Attach handler
  useEffect(() => {
    const boardEl = getBoardElement?.();
    if (!boardEl) return;
    if (active) {
      boardEl.addEventListener("click", handleBoardClick);
      return () => boardEl.removeEventListener("click", handleBoardClick);
    }
  }, [active, handleBoardClick, getBoardElement]);

  const generateCenters = () => {
    const boardEl = getBoardElement?.();
    if (!boardEl) return;
    const rect = boardEl.getBoundingClientRect();
    if (corners.length !== 4) {
      setStatus("Please capture all 4 corners first.");
      return;
    }
    const list = buildSquareCentersFromCorners(corners, rect.width, rect.height);
    setCenters(list);
    setStatus("Generated 100 square centers.");
    setStep(3);
  };

  const captureMode = useRef("snake"); // "snake" | "ladder"
  const pendingPoint = useRef(null);   // stores first endpoint clicked

  const setModeSnake = () => { captureMode.current = "snake"; setStatus("Capturing SNAKES: click head then tail."); };
  const setModeLadder = () => { captureMode.current = "ladder"; setStatus("Capturing LADDERS: click bottom then top."); };

  const captureSnakePoint = ({ x, y }) => {
    if (!centers.length) {
      setStatus("Generate centers first.");
      return;
    }
    const headOrTail = nearestCellFromClick(x, y, centers);
    if (!pendingPoint.current) {
      pendingPoint.current = { cell: headOrTail };
      setStatus(`Snake head selected at cell ${headOrTail}. Now click tail.`);
    } else {
      const head = pendingPoint.current.cell;
      const tail = headOrTail;
      pendingPoint.current = null;
      if (tail >= head) {
        setStatus("Invalid snake: tail must be lower than head.");
        return;
      }
      setSnakes(prev => ({ ...prev, [head]: tail }));
      setStatus(`Snake recorded: ${head} -> ${tail}`);
    }
  };

  const captureLadderPoint = ({ x, y }) => {
    if (!centers.length) {
      setStatus("Generate centers first.");
      return;
    }
    const baseOrTop = nearestCellFromClick(x, y, centers);
    if (!pendingPoint.current) {
      pendingPoint.current = { cell: baseOrTop };
      setStatus(`Ladder bottom selected at cell ${baseOrTop}. Now click top.`);
    } else {
      const base = pendingPoint.current.cell;
      const top = baseOrTop;
      pendingPoint.current = null;
      if (top <= base) {
        setStatus("Invalid ladder: top must be higher than bottom.");
        return;
      }
      setLadders(prev => ({ ...prev, [base]: top }));
      setStatus(`Ladder recorded: ${base} -> ${top}`);
    }
  };

  const clearCorners = () => {
    setCorners([]);
    setCenters([]);
    setStep(1);
    setStatus("Corners cleared.");
  };

  const clearCenters = () => {
    setCenters([]);
    setStatus("Centers cleared.");
  };

  const clearMappings = () => {
    setSnakes({});
    setLadders({});
    setStatus("Snakes and ladders cleared.");
  };

  const onSave = () => {
    try {
      const obj = JSON.parse(jsonText);
      if (obj.version !== 1) throw new Error("Invalid version");
      saveMappingToLocalStorage(obj);
      // Also trigger a download that can be used to overwrite config file in codebase
      const download = new Blob([buildConfigJsFromMapping(obj)], { type: "text/javascript" });
      const url = URL.createObjectURL(download);
      const a = document.createElement("a");
      a.href = url;
      a.download = "snakesAndLaddersConfig.js";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatus("Saved to localStorage and downloaded config JS. Replace the file in src/config if desired.");
      onSaved?.(obj);
    } catch (e) {
      setStatus(`Save failed: ${e.message}`);
    }
  };

  const onExport = () => {
    try {
      const obj = JSON.parse(jsonText);
      exportMappingAsFile(obj);
      setStatus("Exported mapping JSON.");
    } catch (e) {
      setStatus("Invalid JSON; cannot export.");
    }
  };

  const onImport = async (file) => {
    try {
      const obj = await importMappingFromFile(file);
      setCorners(obj.corners || []);
      setCenters(obj.centers || []);
      setSnakes(obj.snakes || {});
      setLadders(obj.ladders || {});
      setJsonText(JSON.stringify(obj, null, 2));
      setStep(obj.corners?.length === 4 ? (obj.centers?.length === 100 ? 3 : 2) : 1);
      setStatus("Imported mapping JSON.");
    } catch (e) {
      setStatus(`Import failed: ${e.message}`);
    }
  };

  const runAutoDetectRef = useRef(null);

  const runAutoDetect = async () => {
    if (autoBusy) return;
    setAutoBusy(true);
    setStatus("Starting auto-detect...");
    try {
      const res = await autoDetectMappingFromImage(BOARD_IMAGE_URL, (msg) => setStatus(msg));
      if (!res.success) {
        setStatus(res.message || "Auto-detect failed.");
        setAutoBusy(false);
        return;
      }
      // Save and update panel state
      saveMappingToLocalStorage(res.mapping);
      setCorners(res.mapping.corners || []);
      setCenters(res.mapping.centers || []);
      setSnakes(res.mapping.snakes || {});
      setLadders(res.mapping.ladders || {});
      setJsonText(JSON.stringify(res.mapping, null, 2));
      setStep(res.mapping.corners?.length === 4 ? (res.mapping.centers?.length === 100 ? 3 : 2) : 1);
      setStatus(`${res.message} Confidence ${(res.confidence * 100).toFixed(0)}%. Saved to localStorage.`);
    } catch (e) {
      setStatus(`Auto-detect error: ${e.message}`);
    } finally {
      setAutoBusy(false);
    }
  };
  runAutoDetectRef.current = runAutoDetect;

  const boardInstructions = useMemo(() => {
    if (step === 1) return "Step 1: Click four corners on the board image: bottom-left, bottom-right, top-right, top-left.";
    if (step === 2) return "Step 2: Click 'Generate centers' to auto-compute 100 cell centers.";
    if (step === 3) return "Step 3: Choose Snake or Ladder capture mode, then click endpoints on the board.";
    return "";
  }, [step]);

  return (
    <aside
      aria-label="Mapping Mode Panel"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
        borderRadius: 12,
        padding: 12,
        width: 320,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Mapping Mode</div>
      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{boardInstructions}</div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn secondary" onClick={clearCorners}>Clear Corners</button>
        <button className="btn secondary" onClick={clearCenters}>Clear Centers</button>
        <button className="btn secondary" onClick={clearMappings}>Clear S/L</button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn primary" onClick={generateCenters} disabled={corners.length !== 4}>
          Generate centers
        </button>
        <button className={`btn ${captureMode.current === "snake" ? "primary" : "secondary"}`} onClick={setModeSnake}>
          Capture Snake
        </button>
        <button className={`btn ${captureMode.current === "ladder" ? "primary" : "secondary"}`} onClick={setModeLadder}>
          Capture Ladder
        </button>
        <button
          className="btn secondary"
          onClick={() => runAutoDetectRef.current && runAutoDetectRef.current()}
          disabled={autoBusy}
        >
          {autoBusy ? "Auto-detecting..." : "Auto-detect from board image"}
        </button>
      </div>

      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
        Corners: {corners.length}/4 • Centers: {centers.length} • Snakes: {Object.keys(snakes).length} • Ladders: {Object.keys(ladders).length}
      </div>

      <textarea
        aria-label="Mapping JSON Editor"
        value={jsonText}
        onChange={(e) => setJsonText(e.target.value)}
        style={{
          width: "100%",
          minHeight: 180,
          resize: "vertical",
          background: "transparent",
          color: "var(--text-primary)",
          border: "1px solid var(--border-color)",
          borderRadius: 8,
          padding: 8,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
          fontSize: 12,
        }}
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn primary" onClick={onSave}>Save</button>
        <button className="btn secondary" onClick={onExport}>Export JSON</button>
        <label className="btn secondary" style={{ cursor: "pointer" }}>
          Import JSON
          <input
            type="file"
            accept="application/json"
            onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])}
            style={{ display: "none" }}
          />
        </label>
        <button
          className="btn secondary"
          onClick={() => {
            try {
              const obj = JSON.parse(jsonText);
              const content = buildConfigJsFromMapping(obj);
              const blob = new Blob([content], { type: "text/javascript" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "snakesAndLaddersConfig.js";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              setStatus("Downloaded updated config file. In development, replace src/config/snakesAndLaddersConfig.js manually.");
            } catch (e) {
              setStatus("Invalid JSON; cannot persist to config.");
            }
          }}
          title="Development mode: download a file to replace src/config/snakesAndLaddersConfig.js"
        >
          Persist to config (download)
        </button>
      </div>

      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{status}</div>

      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
        Tip: Mapping clicks are captured from the board area. No overlays are drawn during normal play.
      </div>
    </aside>
  );
}

function buildConfigJsFromMapping(mapping) {
  // Generate the content for src/config/snakesAndLaddersConfig.js based on mapping
  // preserving the public interface.
  const ladderStr = JSON.stringify(mapping.ladders, null, 2);
  const snakeStr = JSON.stringify(mapping.snakes, null, 2);
  return `//
// PUBLIC_INTERFACE
// snakesAndLaddersConfig.js
// Auto-generated from MappingMode (version ${mapping.version})
// Edit via Mapping Mode JSON editor or replace by exporting/importing a new mapping.

export const BOARD_IMAGE_URL = "/assets/board-default.jpg";
export const BOARD_ROWS = 10;
export const BOARD_COLS = 10;

// PUBLIC_INTERFACE
export const ladders = ${ladderStr};

// PUBLIC_INTERFACE
export const snakes = ${snakeStr};

// PUBLIC_INTERFACE
export function resolveSnakesAndLadders(cell) {
  if (snakes[cell]) return snakes[cell];
  if (ladders[cell]) return ladders[cell];
  return cell;
}
`;
}
