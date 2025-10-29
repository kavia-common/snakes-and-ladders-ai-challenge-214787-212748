import React from "react";

/**
 * PUBLIC_INTERFACE
 * ChatPanel
 * Simple right-side panel showing AI taunts and system messages.
 *
 * Props:
 * - messages: Array<{id:string, sender:"AI"|"SYSTEM"|"YOU", text:string}>
 */
export default function ChatPanel({ messages }) {
  return (
    <aside className="chat-panel" aria-label="Chat Panel">
      <div className="chat-panel__header">AI Chat</div>
      <div className="chat-panel__messages">
        {messages.map((m) => (
          <div key={m.id} className={`chat-msg chat-msg--${m.sender.toLowerCase()}`}>
            <div className="chat-msg__sender">{m.sender}</div>
            <div className="chat-msg__text">{m.text}</div>
          </div>
        ))}
        {messages.length === 0 && (
          <div className="chat-panel__empty">AI taunts will appear here.</div>
        )}
      </div>
    </aside>
  );
}
