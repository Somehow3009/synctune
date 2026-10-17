import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

function base(props: P) {
  return {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

export const Play = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M8 5v14l11-7z" />
  </svg>
);

export const Pause = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
  </svg>
);

export const Next = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M6 5v14l9-7zM17 5h2v14h-2z" />
  </svg>
);

export const Prev = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M18 5v14l-9-7zM5 5h2v14H5z" />
  </svg>
);

export const Shuffle = (p: P) => (
  <svg {...base(p)}>
    <path d="M16 3h5v5M4 20l17-17M21 16v5h-5M15 15l6 6M4 4l5 5" />
  </svg>
);

export const Repeat = (p: P) => (
  <svg {...base(p)}>
    <path d="M17 2l4 4-4 4M3 11V9a4 4 0 014-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 01-4 4H3" />
  </svg>
);

export const RepeatOne = (p: P) => (
  <svg {...base(p)}>
    <path d="M17 2l4 4-4 4M3 11V9a4 4 0 014-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 01-4 4H3M11 10h1v4" />
  </svg>
);

export const Volume = (p: P) => (
  <svg {...base(p)}>
    <path d="M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 010 7M19 5a9 9 0 010 14" />
  </svg>
);

export const VolumeX = (p: P) => (
  <svg {...base(p)}>
    <path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" />
  </svg>
);

export const Search = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </svg>
);

export const Library = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 3h4v18H4zM10 3h4v18h-4zM17 4l3 16" />
  </svg>
);

export const Plus = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const Trash = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
  </svg>
);

export const Share = (p: P) => (
  <svg {...base(p)}>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
  </svg>
);

export const Home = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 10.5L12 3l9 7.5M5 9.5V21h14V9.5" />
  </svg>
);

export const Mic = (p: P) => (
  <svg {...base(p)}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 11a7 7 0 0014 0M12 18v4M8 22h8" />
  </svg>
);

export const MicOff = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 5a3 3 0 016 0v5M15 15a3 3 0 01-6-2V9M5 11a7 7 0 0011 5.5M12 18v4M8 22h8M2 2l20 20" />
  </svg>
);

export const Users = (p: P) => (
  <svg {...base(p)}>
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M23 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8" />
  </svg>
);

export const Send = (p: P) => (
  <svg {...base(p)}>
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
);

export const Sun = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export const Moon = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
  </svg>
);

export const Close = (p: P) => (
  <svg {...base(p)}>
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

export const ChevronUp = (p: P) => (
  <svg {...base(p)}>
    <path d="M18 15l-6-6-6 6" />
  </svg>
);

export const ChevronDown = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const Grip = (p: P) => (
  <svg {...base(p)}>
    <circle cx="9" cy="6" r="1" />
    <circle cx="9" cy="12" r="1" />
    <circle cx="9" cy="18" r="1" />
    <circle cx="15" cy="6" r="1" />
    <circle cx="15" cy="12" r="1" />
    <circle cx="15" cy="18" r="1" />
  </svg>
);

export const Link = (p: P) => (
  <svg {...base(p)}>
    <path d="M10 13a5 5 0 007.1 0l3-3a5 5 0 00-7.1-7.1l-1.5 1.5M14 11a5 5 0 00-7.1 0l-3 3a5 5 0 007.1 7.1l1.5-1.5" />
  </svg>
);

export const Headphones = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 18v-6a9 9 0 0118 0v6M3 18a2 2 0 002 2h1v-6H5a2 2 0 00-2 2zM21 18a2 2 0 01-2 2h-1v-6h1a2 2 0 012 2z" />
  </svg>
);

export const VideoIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="2" y="6" width="14" height="12" rx="2" />
    <path d="M16 10l6-4v12l-6-4z" />
  </svg>
);

export const Settings = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2V21a2 2 0 11-4 0v-.1A1.7 1.7 0 007 19.4l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 003 15H3a2 2 0 110-4h.1A1.7 1.7 0 004.6 7l-.1-.1a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 0010.3 3V3a2 2 0 114 0v.1A1.7 1.7 0 0017 4.6l.1-.1a2 2 0 112.8 2.8l-.1.1A1.7 1.7 0 0021 10.3h.1a2 2 0 110 4H21a1.7 1.7 0 00-1.6 1.1z" />
  </svg>
);

export const Logout = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
  </svg>
);

export const Queue = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 6h13M3 12h13M3 18h9M18 15v6M15 18h6" />
  </svg>
);

export const Download = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </svg>
);

export const Upload = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
  </svg>
);

export const Heart = (p: P) => (
  <svg {...base(p)}>
    <path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z" />
  </svg>
);

export const Mail = (p: P) => (
  <svg {...base(p)}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="M2 6l10 7 10-7" />
  </svg>
);
