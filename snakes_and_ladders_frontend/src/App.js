import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import Board from "./components/Board";
import Controls from "./components/Controls";
import ChatPanel from "./components/ChatPanel";
import {
  resolveSnakesAndLadders,
  ladders,
  snakes,
} from "./config/snakesAndLaddersConfig";
import { aiTakeTurn, chooseTaunt, rollDice } from "./services/simpleAI";

const START_CELL = 1;
const END_CELL = 100;

/**
 * PUBLIC_INTERFACE
 * App - Snakes & Ladders Game
 * Renders the board (as background image only), controls, and chat panel.
 * Supports human vs simple AI, with rule-based taunts. Player positions are shown
 * outside the board area (in the controls section).
 */
function App() {
  const [theme, setTheme] = useState("light");
  const [humanCell, setHumanCell] = useState(START_CELL);
  const [aiCell, setAiCell] = useState(START_CELL);
  const [currentTurn, setCurrentTurn] = useState("HUMAN"); // "HUMAN" | "AI"
  const [lastRoll, setLastRoll] = useState(null);
  const [isRolling, setIsRolling] = useState(false);
  const [messages, setMessages] = useState([
    { id: "m0", sender: "SYSTEM", text: "Welcome to Snakes & Ladders!" },
    { id: "m1", sender: "AI", text: "I’m ready to win. Try to keep up." },
  ]);
  const msgIdRef = useRef(2);

  // Apply theme attribute
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  };

  // Helper: apply a roll for a player and resolve snakes/ladders
  const applyPlayerMove = (cell, roll) => {
    if (cell === END_CELL) return { finalCell: END_CELL, intermediateCell: END_CELL, eventType: "none" };
    let intermediate = cell + roll;
    if (intermediate > END_CELL) {
      // Must land exactly; if overshoot, stay
      intermediate = cell;
    }
    const resolved = resolveSnakesAndLadders(intermediate);

    let eventType = "move";
    if (resolved > intermediate && ladders[intermediate]) eventType = "ladder";
    else if (resolved < intermediate && snakes[intermediate]) eventType = "snake";
    else if (resolved === END_CELL) eventType = "win";

    return { finalCell: resolved, intermediateCell: intermediate, eventType };
  };

  const addMessage = (sender, text) => {
    const id = `m${msgIdRef.current++}`;
    setMessages((prev) => [...prev, { id, sender, text }]);
  };

  const handleNewGame = () => {
    setHumanCell(START_CELL);
    setAiCell(START_CELL);
    setCurrentTurn("HUMAN");
    setLastRoll(null);
    setIsRolling(false);
    setMessages([
      { id: "m0", sender: "SYSTEM", text: "New game started!" },
      { id: "m1", sender: "AI", text: "Fresh board, same outcome: I win." },
    ]);
    msgIdRef.current = 2;
  };

  // Human roll
  const handleRoll = async () => {
    if (currentTurn !== "HUMAN" || isRolling) return;
    setIsRolling(true);
    const roll = rollDice();
    setLastRoll(roll);
    await new Promise((r) => setTimeout(r, 500)); // simulate roll delay

    setHumanCell((prev) => {
      const { finalCell, intermediateCell, eventType } = applyPlayerMove(prev, roll);
      // Human messages for ladder/snake
      if (eventType === "ladder") {
        addMessage("SYSTEM", `You climbed a ladder from ${intermediateCell} to ${finalCell}!`);
      } else if (eventType === "snake") {
        addMessage("SYSTEM", `Oh no! You slid down a snake from ${intermediateCell} to ${finalCell}.`);
      }
      if (finalCell === END_CELL) {
        addMessage("SYSTEM", "You reached 100! You win!");
        addMessage("AI", chooseTaunt({ eventType: "human_win" }));
        setIsRolling(false);
        return finalCell;
      }
      return finalCell;
    });

    // Next turn: AI
    setTimeout(() => {
      setCurrentTurn("AI");
      setIsRolling(false);
    }, 400);
  };

  // AI turn effect
  useEffect(() => {
    const runAI = async () => {
      if (currentTurn !== "AI") return;
      setIsRolling(true);
      await new Promise((r) => setTimeout(r, 600)); // thinking delay
      setAiCell((prev) => {
        const applyMoveWrapper = (roll) => applyPlayerMove(prev, roll);
        const { roll, finalCell, intermediateCell, eventType } = aiTakeTurn(prev, applyMoveWrapper);
        setLastRoll(roll);

        // AI messages
        if (eventType === "ladder") {
          addMessage("AI", chooseTaunt({ aiCell: prev, lastRoll: roll, movedTo: finalCell, eventType: "ladder" }));
        } else if (eventType === "snake") {
          addMessage("AI", chooseTaunt({ aiCell: prev, lastRoll: roll, movedTo: finalCell, eventType: "snake" }));
        } else {
          addMessage("AI", chooseTaunt({ aiCell: prev, lastRoll: roll, movedTo: finalCell }));
        }

        if (finalCell === END_CELL) {
          addMessage("SYSTEM", "AI reached 100 and wins!");
          addMessage("AI", chooseTaunt({ eventType: "win" }));
          setIsRolling(false);
          return finalCell;
        }

        // back to human
        setTimeout(() => {
          setCurrentTurn("HUMAN");
          setIsRolling(false);
        }, 400);

        return finalCell;
      });
    };
    runAI();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTurn]);

  return (
    <div className="App">
      <header className="navbar">
        <div className="navbar__left">
          <div className="app-title">Snakes & Ladders</div>
        </div>
        <div className="navbar__right">
          <button
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          >
            {theme === "light" ? "🌙 Dark" : "☀️ Light"}
          </button>
        </div>
      </header>

      <main className="layout">
        <section className="board-area">
          <Board />
        </section>
        <section className="chat-area">
          <ChatPanel messages={messages} />
        </section>
      </main>

      <footer className="controls-area">
        <Controls
          currentTurn={currentTurn}
          lastRoll={lastRoll}
          humanCell={humanCell}
          aiCell={aiCell}
          onRoll={handleRoll}
          onNewGame={handleNewGame}
          isRolling={isRolling}
        />
      </footer>
    </div>
  );
}

export default App;
