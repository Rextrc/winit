"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconBell, IconClose } from "@/components/Icons";

type Message = {
  id: string;
  title: string;
  body: string;
  level: string;
  personal: boolean;
  createdAt: string;
  read: boolean;
};

const TONE: Record<string, { dot: string; ring: string; label: string }> = {
  INFO: { dot: "bg-sky-400", ring: "border-sky-400/30", label: "Notice" },
  WARNING: { dot: "bg-loss", ring: "border-loss/40", label: "Important" },
  CELEBRATION: { dot: "bg-volt", ring: "border-volt/40", label: "Good news" },
};

function ago(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/**
 * The player's message bell. Announcements posted from the staff dashboard —
 * site-wide ones and anything addressed to this account by name — land here.
 * Opening the panel marks them read, and that read state is a row in the
 * database rather than browser storage, so a message stays read on the
 * player's other devices too.
 */
export default function Inbox() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/me/messages", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages ?? []);
      setUnread(data.unread ?? 0);
    } catch {
      // A failed poll is not worth showing: the bell simply keeps its last count.
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  // Click-away and Escape both close the panel.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      setMessages((m) => m.map((x) => ({ ...x, read: true })));
      try {
        await fetch("/api/me/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ all: true }),
        });
      } catch {
        void load();
      }
    }
  }

  return (
    <div className="relative" ref={wrap}>
      <button
        type="button"
        onClick={() => void toggle()}
        className="relative rounded-lg p-2 text-slate-300 transition hover:bg-white/5 hover:text-white"
        aria-label={unread > 0 ? `Messages — ${unread} unread` : "Messages"}
        aria-expanded={open}
      >
        <IconBell />
        {unread > 0 && (
          <span className="num absolute -right-0.5 -top-0.5 min-w-[17px] rounded-full bg-volt px-1 text-[10px] font-black leading-[17px] text-base-950">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="panel absolute right-0 top-[calc(100%+8px)] z-40 w-[330px] max-w-[calc(100vw-2rem)] overflow-hidden p-0 shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <p className="text-[12px] font-black uppercase tracking-[0.14em] text-white">Messages</p>
            <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-white" aria-label="Close messages">
              <IconClose className="h-4 w-4" />
            </button>
          </div>

          <ul className="max-h-[60vh] divide-y divide-white/5 overflow-y-auto">
            {messages.map((m) => {
              const tone = TONE[m.level] ?? TONE.INFO;
              return (
                <li key={m.id} className={`border-l-2 px-4 py-3 ${tone.ring}`}>
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                      {m.personal ? "To you" : tone.label}
                    </span>
                    <span className="ml-auto text-[10px] text-slate-500">{ago(m.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-[13px] font-bold text-white">{m.title}</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-400">{m.body}</p>
                </li>
              );
            })}
            {messages.length === 0 && (
              <li className="px-4 py-8 text-center text-[12px] text-slate-500">
                Nothing here yet. Anything the team posts will show up in this panel.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
