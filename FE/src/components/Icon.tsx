import type { ReactNode } from "react";

export type HomeIconName =
  | "menu"
  | "close"
  | "search"
  | "user"
  | "cart"
  | "chevron"
  | "arrow"
  | "heart"
  | "star"
  | "leaf"
  | "shield"
  | "truck"
  | "facebook"
  | "tiktok"
  | "youtube"
  | "instagram"
  | "phone"
  | "mail"
  | "pin";

const homeIconPaths: Record<HomeIconName, ReactNode> = {
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  cart: (
    <>
      <path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 8H6" />
      <circle cx="10" cy="20" r="1" />
      <circle cx="18" cy="20" r="1" />
    </>
  ),
  chevron: <path d="m8 10 4 4 4-4" />,
  arrow: (
    <>
      <path d="M5 12h14M14 7l5 5-5 5" />
    </>
  ),
  heart: (
    <path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z" />
  ),
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
  leaf: (
    <>
      <path d="M20 4C10 4 5 9 5 17c8 0 13-5 15-13Z" />
      <path d="M4 20c3-5 7-8 12-11" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 20 6v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-3Z" />
      <path d="m8.5 12 2.2 2.2 4.8-5" />
    </>
  ),
  truck: (
    <>
      <path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z" />
      <circle cx="7" cy="19" r="2" />
      <circle cx="18" cy="19" r="2" />
    </>
  ),
  facebook: <path d="M14 8h3V4h-3a5 5 0 0 0-5 5v3H6v4h3v6h4v-6h3l1-4h-4V9c0-.6.4-1 1-1Z" />,
  tiktok: (
    <>
      <path d="M14 4v11.5a4.5 4.5 0 1 1-4-4.5" />
      <path d="M14 4c.6 3 2.3 4.5 5 5" />
    </>
  ),
  youtube: (
    <>
      <path d="M22 12s0-5-1-6c-1-1-9-1-9-1s-8 0-9 1-1 6-1 6 0 5 1 6 9 1 9 1 8 0 9-1 1-6 1-6Z" />
      <path d="m10 9 5 3-5 3Z" />
    </>
  ),
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r=".8" fill="currentColor" />
    </>
  ),
  phone: (
    <path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-1.5 2c-3.5-1.5-6-4-7.5-7.5L9 8 7 3Z" />
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  pin: (
    <>
      <path d="M12 22s7-6 7-13a7 7 0 1 0-14 0c0 7 7 13 7 13Z" />
      <circle cx="12" cy="9" r="2" />
    </>
  ),
};

export function HomeIcon({ name, size = 20 }: { name: HomeIconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {homeIconPaths[name]}
    </svg>
  );
}
