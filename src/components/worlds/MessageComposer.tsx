import { useState, useRef, type KeyboardEvent } from "react";
import { ArrowUp } from "lucide-react";

interface MessageComposerProps {
  onSend: (body: string) => void;
  disabled?: boolean;
  placeholder?: string;
  observerMode?: boolean;
}

export function MessageComposer({ onSend, disabled, placeholder, observerMode }: MessageComposerProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSend() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInput() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }

  if (observerMode) {
    return (
      <div className="px-4 py-4 border-t border-zinc-100">
        <div className="text-xs text-zinc-400 text-center">
          You are observing — humans manage this space from Middle World
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-t border-zinc-100">
      <div className="flex items-end gap-2 border border-zinc-200 rounded-xl px-3 py-2.5 bg-white focus-within:border-zinc-400 focus-within:ring-2 focus-within:ring-zinc-100 transition-all">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={placeholder ?? "Message... (Enter to send)"}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-zinc-900 placeholder-zinc-400 outline-none min-h-[22px] max-h-[200px] leading-relaxed"
        />
        <button
          onClick={handleSend}
          disabled={!value.trim() || disabled}
          className="shrink-0 w-7 h-7 rounded-lg bg-zinc-900 text-white flex items-center justify-center hover:bg-zinc-700 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
