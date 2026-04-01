import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { ArrowUp } from "lucide-react";

interface BotMember {
  id: string;
  displayName: string;
}

interface MessageComposerProps {
  onSend: (body: string) => void;
  disabled?: boolean;
  placeholder?: string;
  observerMode?: boolean;
  botMembers?: BotMember[];
}

export function MessageComposer({ onSend, disabled, placeholder, observerMode, botMembers = [] }: MessageComposerProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // @mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number>(-1);
  const [mentionHighlight, setMentionHighlight] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const mentionMatches = mentionQuery !== null
    ? botMembers.filter((b) =>
        b.displayName.toLowerCase().startsWith(mentionQuery.toLowerCase())
      )
    : [];

  function handleSend() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    setMentionQuery(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const newValue = e.target.value;
    setValue(newValue);

    // Detect @mention: find last @ before cursor
    const cursor = e.target.selectionStart ?? newValue.length;
    const textBeforeCursor = newValue.slice(0, cursor);
    // Match @ followed by letters/spaces (no punctuation) at end of text before cursor
    const match = textBeforeCursor.match(/@([\w ]*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionStart(textBeforeCursor.lastIndexOf("@"));
      setMentionHighlight(0);
    } else {
      setMentionQuery(null);
    }

    // Auto-resize
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }

  function insertMention(displayName: string) {
    const before = value.slice(0, mentionStart);
    const cursor = textareaRef.current?.selectionStart ?? value.length;
    const after = value.slice(cursor);
    const newValue = `${before}@${displayName} ${after}`;
    setValue(newValue);
    setMentionQuery(null);
    // Restore focus and move cursor after inserted mention
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const pos = before.length + displayName.length + 2; // @ + name + space
        textareaRef.current.setSelectionRange(pos, pos);
      }
    }, 0);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null && mentionMatches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionHighlight((h) => (h + 1) % mentionMatches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionHighlight((h) => (h - 1 + mentionMatches.length) % mentionMatches.length);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && mentionMatches.length > 0)) {
        e.preventDefault();
        insertMention(mentionMatches[mentionHighlight]!.displayName);
        return;
      }
      if (e.key === "Escape") {
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMentionQuery(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (observerMode) {
    return (
      <div className="px-4 py-4 border-t border-zinc-100">
        <div className="text-xs text-zinc-400 text-center">
          You are observing — humans manage this space from Middle Ground
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-t border-zinc-100">
      <div className="relative">
        {/* @mention dropdown */}
        {mentionQuery !== null && mentionMatches.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute bottom-full left-0 mb-1.5 bg-white border border-zinc-200 rounded-xl shadow-lg overflow-hidden z-10 min-w-[160px]"
          >
            {mentionMatches.map((bot, i) => (
              <button
                key={bot.id}
                onMouseDown={(e) => { e.preventDefault(); insertMention(bot.displayName); }}
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                  i === mentionHighlight ? "bg-zinc-100 text-zinc-900" : "text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                <span className="text-xs text-green-600 font-bold">@</span>
                <span className="flex-1">{bot.displayName}</span>
                <span className="text-[10px] text-zinc-400 font-medium">Agent</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 border border-zinc-200 rounded-xl px-3 py-2.5 bg-white focus-within:border-zinc-400 focus-within:ring-2 focus-within:ring-zinc-100 transition-all">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? "Message room — use @ to call an agent"}
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
    </div>
  );
}
