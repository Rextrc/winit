"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { IconChat, IconClose } from "@/components/Icons";
import sfx from "@/lib/sound";

type Message = {
  id: string;
  userId: string;
  username: string;
  body: string;
  createdAt: string;
};

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * The public lobby chat: one room, visible to anyone browsing the site,
 * postable only by a signed-in account in good standing. It polls rather
 * than holding a socket open — every other live-ish feature in this app
 * (the balance, the bet feed, the inbox) already works this way, and a
 * lobby chat has no latency requirement a few seconds of polling can't meet.
 */
export default function Chat() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [canModerate, setCanModerate] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasUnseen, setHasUnseen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastSeenId = useRef<string | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/chat", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const rows: Message[] = data.messages ?? [];
      setCanModerate(!!data.canModerate);

      const newest = rows[rows.length - 1];
      if (newest && newest.id !== lastSeenId.current) {
        const isOwn = session?.user?.id && newest.userId === session.user.id;
        if (lastSeenId.current !== null && !isOwn) {
          if (!openRef.current) setHasUnseen(true);
          sfx.notify();
        }
        lastSeenId.current = newest.id;
      }
      setMessages(rows);
    } catch {
      // A missed poll just tries again next tick.
    }
  }, [session?.user?.id]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), open ? 4000 : 20000);
    return () => clearInterval(t);
  }, [load, open]);

  useEffect(() => {
    if (open) {
      setHasUnseen(false);
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }
  }, [open, messages.length]);

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

  const send = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const body = text.trim();
      if (!body || sending) return;
      setSending(true);
      setError(null);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: body }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Couldn't send that.");
          return;
        }
        setText("");
        setMessages((m) => [...m, data.message]);
        lastSeenId.current = data.message.id;
      } catch {
        setError("Network error — try again.");
      } finally {
        setSending(false);
      }
    },
    [text, sending],
  );

  const moderate = useCallback(async (id: string) => {
    const reason = window.prompt("Reason for removing this message?");
    if (reason === null) return;
    try {
      const res = await fetch("/api/admin/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, reason }),
      });
      if (res.ok) setMessages((m) => m.filter((x) => x.id !== id));
    } catch {
      /* the message just stays visible; staff can retry */
    }
  }, []);

  return (
    <div className="fixed bottom-24 right-4 z-40" ref={wrap}>
      {open && (
        <div className="panel absolute bottom-[calc(100%+10px)] right-0 flex h-[420px] w-[320px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0 shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <p className="text-[12px] font-black uppercase tracking-[0.14em] text-white">Lobby chat</p>
            <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-white" aria-label="Close chat">
              <IconClose className="h-4 w-4" />
            </button>
          </div>

          <div ref={listRef} className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
            {messages.map((m) => (
              <div key={m.id} className="group text-[13px] leading-snug">
                <span className="font-bold text-volt">{m.username}</span>{" "}
                <span className="text-[10px] text-slate-600">{timeOf(m.createdAt)}</span>
                {canModerate && (
                  <button
                    type="button"
                    onClick={() => moderate(m.id)}
                    className="ml-1.5 hidden text-[10px] font-bold text-loss hover:underline group-hover:inline"
                  >
                    remove
                  </button>
                )}
                <p className="break-words text-slate-300">{m.body}</p>
              </div>
            ))}
            {messages.length === 0 && (
              <p className="px-1 py-8 text-center text-[12px] text-slate-500">
                Nobody&apos;s said anything yet. Be the first.
              </p>
            )}
          </div>

          <div className="border-t border-white/5 p-2.5">
            {status === "authenticated" ? (
              <form onSubmit={send} className="flex gap-1.5">
                <input
                  className="field flex-1 py-2 text-[13px]"
                  placeholder="Say something…"
                  value={text}
                  maxLength={240}
                  disabled={sending}
                  onChange={(e) => setText(e.target.value)}
                />
                <button type="submit" className="btn-primary px-3 py-2 text-xs" disabled={sending || !text.trim()}>
                  Send
                </button>
              </form>
            ) : (
              <p className="text-center text-[12px] text-slate-500">Sign in to chat.</p>
            )}
            {error && <p className="mt-1.5 text-[11px] font-semibold text-loss">{error}</p>}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative grid h-12 w-12 place-items-center rounded-full bg-volt text-white shadow-volt transition hover:-translate-y-0.5"
        aria-label={open ? "Close chat" : "Open lobby chat"}
        aria-expanded={open}
      >
        {open ? <IconClose className="h-5 w-5" /> : <IconChat className="h-5 w-5" />}
        {hasUnseen && !open && (
          <span className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-base-900 bg-loss" />
        )}
      </button>
    </div>
  );
}
