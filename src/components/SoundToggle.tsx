"use client";

import { useEffect, useState } from "react";
import { IconSoundOff, IconSoundOn } from "@/components/Icons";
import { isSoundMuted, setSoundMuted } from "@/lib/sound";

/**
 * Sound is on by default but entirely client-side and stored only in this
 * browser — there is nothing to sync server-side, so a new tab or device
 * just starts from the default again.
 */
export default function SoundToggle() {
  // Starts "on" for the very first paint (matching the server-rendered
  // markup) and corrects itself from localStorage immediately after mount.
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    setMuted(isSoundMuted());
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        const next = !muted;
        setMuted(next);
        setSoundMuted(next);
      }}
      className="rounded-lg p-2 text-slate-300 transition hover:bg-white/5 hover:text-white"
      aria-label={muted ? "Unmute sound" : "Mute sound"}
      title={muted ? "Sound off" : "Sound on"}
    >
      {muted ? <IconSoundOff className="h-[18px] w-[18px]" /> : <IconSoundOn className="h-[18px] w-[18px]" />}
    </button>
  );
}
