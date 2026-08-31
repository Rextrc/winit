"use client";

import { signOut } from "next-auth/react";
import { IconLogout } from "@/components/Icons";

export default function SignOutButton() {
  return (
    <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className="btn-ghost">
      <IconLogout className="h-4 w-4" />
      Sign out
    </button>
  );
}
