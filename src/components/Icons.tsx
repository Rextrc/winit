/** Original inline SVG icon set — no third-party icon assets. */

type P = { className?: string };
const base = "h-5 w-5";

function S({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? base}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: P) => (
  <S {...p}>
    <path d="M3.5 10.5 12 4l8.5 6.5V19a1 1 0 0 1-1 1h-5v-5h-5v5h-5a1 1 0 0 1-1-1z" />
  </S>
);

export const IconSlots = (p: P) => (
  <S {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M9 5v14M15 5v14M6 12h.01M12 10h.01M12 14h.01M18 12h.01" />
  </S>
);

export const IconTable = (p: P) => (
  <S {...p}>
    <path d="M12 3.5 16.5 8 12 12.5 7.5 8z" />
    <path d="M5 13.5h14M6.5 13.5 5 20.5h14l-1.5-7" />
  </S>
);

export const IconLive = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4M3.6 3.6a12 12 0 0 0 0 16.8M20.4 3.6a12 12 0 0 1 0 16.8" />
  </S>
);

export const IconOriginals = (p: P) => (
  <S {...p}>
    <path d="M12 3.2 20 7.6v8.8L12 20.8 4 16.4V7.6z" />
    <path d="M12 9.4 15.4 11v3.4L12 16 8.6 14.4V11z" />
  </S>
);

export const IconRewards = (p: P) => (
  <S {...p}>
    <path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z" />
  </S>
);

export const IconHistory = (p: P) => (
  <S {...p}>
    <path d="M3.6 12a8.4 8.4 0 1 0 2.6-6.1" />
    <path d="M3.4 4.6v3.9h3.9M12 7.6V12l3 1.8" />
  </S>
);

export const IconSettings = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.8v2.4M12 18.8v2.4M4.5 4.5l1.7 1.7M17.8 17.8l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.5 19.5l1.7-1.7M17.8 6.2l1.7-1.7" />
  </S>
);

export const IconSearch = (p: P) => (
  <S {...p}>
    <circle cx="11" cy="11" r="6.4" />
    <path d="m16 16 4.4 4.4" />
  </S>
);

export const IconChevronLeft = (p: P) => (
  <S {...p}>
    <path d="m14.5 6-5 6 5 6" />
  </S>
);

export const IconChevronRight = (p: P) => (
  <S {...p}>
    <path d="m9.5 6 5 6-5 6" />
  </S>
);

export const IconClose = (p: P) => (
  <S {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </S>
);

export const IconMenu = (p: P) => (
  <S {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </S>
);

export const IconGift = (p: P) => (
  <S {...p}>
    <rect x="3.5" y="9.5" width="17" height="11" rx="1.6" />
    <path d="M2.6 9.5h18.8M12 9.5v11" />
    <path d="M12 9.5S10.6 4 8 4a2.2 2.2 0 0 0 0 5.5zM12 9.5S13.4 4 16 4a2.2 2.2 0 0 1 0 5.5z" />
  </S>
);

export const IconPlay = (p: P) => (
  <S {...p}>
    <path d="M8 5.5 18.5 12 8 18.5z" />
  </S>
);

export const IconLogout = (p: P) => (
  <S {...p}>
    <path d="M14.5 4.5h4a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-4" />
    <path d="M10 8.5 13.5 12 10 15.5M13.5 12h-10" />
  </S>
);

export const IconInfo = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 7.8h.01" />
  </S>
);

export const IconLock = (p: P) => (
  <S {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
  </S>
);

export const IconLife = (p: P) => (
  <S {...p}>
    <path d="M12 3.5 14.4 9l5.6.4-4.3 3.7 1.4 5.5L12 15.7 6.9 18.6l1.4-5.5L4 9.4 9.6 9z" />
  </S>
);

export const IconBell = (p: P) => (
  <S {...p}>
    <path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
    <path d="M10.3 20a2 2 0 0 0 3.4 0" />
  </S>
);
