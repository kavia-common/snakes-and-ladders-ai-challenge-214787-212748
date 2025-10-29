import React, { useRef, useEffect, useState } from "react";
import { BOARD_IMAGE_URL, BOARD_ROWS, BOARD_COLS } from "../config/snakesAndLaddersConfig";

/**
 * PUBLIC_INTERFACE
 * Board
 * A purely presentational component that renders the board image as a responsive background.
 * No overlays are drawn on top of the board. Emits its bounding client rect for calculation
 * purposes, but the game UI does not render markers on the board to respect requirements.
 *
 * Props:
 * - onRectChange?: (rect: {width:number,height:number,top:number,left:number}) => void
 */
export default function Board({ onRectChange }) {
  const containerRef = useRef(null);
  const [rect, setRect] = useState(null);

  useEffect(() => {
    function handleResize() {
      if (containerRef.current) {
        const r = containerRef.current.getBoundingClientRect();
        setRect(r);
        if (onRectChange) onRectChange(r);
      }
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [onRectChange]);

  return (
    <div
      ref={containerRef}
      aria-label="Snakes and Ladders Board"
      role="img"
      style={{
        width: "100%",
        maxWidth: 800,
        aspectRatio: `${BOARD_COLS}/${BOARD_ROWS}`,
        backgroundImage: `url(${BOARD_IMAGE_URL})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        borderRadius: 12,
        border: "1px solid var(--border-color)",
        boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
        margin: "0 auto",
      }}
    />
  );
}
