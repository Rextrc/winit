"use client";

import { useState } from "react";

/**
 * Hands the current page off to whatever the platform's own share sheet is
 * (iOS/Android/most desktop browsers) when one exists, falling back to
 * copying the link — either way the player never has to select the address
 * bar text by hand.
 */
export default function ShareButton({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // The user backed out of the share sheet, or it's unsupported for
        // this content — either way, falling through to copy is not wrong.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard access can be refused; the link is on screen either way */
    }
  }

  return (
    <button type="button" onClick={() => void share()} className="btn-ghost mt-3 inline-flex px-5 py-2 text-sm">
      {copied ? "Link copied" : "Share this win"}
    </button>
  );
}
