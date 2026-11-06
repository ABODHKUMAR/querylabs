// Query Labs icon set — proper React component signatures
// All icons accept { size } prop; chevron also accepts { dir }

export const I = {
  search: ({ size = 16 } = {}) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  plus: ({ size = 14 } = {}) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  arrow: ({ size = 14 } = {}) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M7 11.5V2.5M3 6.5L7 2.5l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  send: ({ size = 14 } = {}) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  database: ({ size = 14 } = {}) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <ellipse cx="7" cy="3" rx="4.5" ry="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M2.5 3v4c0 .83 2.01 1.5 4.5 1.5s4.5-.67 4.5-1.5V3M2.5 7v4c0 .83 2.01 1.5 4.5 1.5s4.5-.67 4.5-1.5V7" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  ),
  history: ({ size = 16 } = {}) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M2 8a6 6 0 1 0 1.8-4.3M2 2v3h3M8 5v3l2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  sparkle: ({ size = 14 } = {}) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M7 1.5l1.4 3.6L12 6.5l-3.6 1.4L7 11.5 5.6 7.9 2 6.5l3.6-1.4L7 1.5z" fill="currentColor"/>
    </svg>
  ),
  chevron: ({ size = 12, dir = 'down' } = {}) => {
    const r = { down: 0, up: 180, right: -90, left: 90 }[dir] ?? 0;
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" fill="none" style={{ transform: `rotate(${r}deg)` }}>
        <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  },
  pin: ({ size = 14 } = {}) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M9 1.5L12.5 5 10 7.5l-3-1L4.5 9 3 7.5 5.5 5l-1-3L8 1.5h1zM5 9l-3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  share: ({ size = 14 } = {}) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <circle cx="3.5" cy="7" r="1.8" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="10.5" cy="3" r="1.8" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="10.5" cy="11" r="1.8" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M5.2 6.2l3.6-2.4M5.2 7.8l3.6 2.4" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  ),
  refresh: ({ size = 14 } = {}) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M12 6a5 5 0 1 0-1.4 3.5M12 2.5V6h-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  more: ({ size = 14 } = {}) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <circle cx="3" cy="7" r="1.1" fill="currentColor"/>
      <circle cx="7" cy="7" r="1.1" fill="currentColor"/>
      <circle cx="11" cy="7" r="1.1" fill="currentColor"/>
    </svg>
  ),
  filter: ({ size = 14 } = {}) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M2 3h10l-3.8 4.5V11l-2.4 1.5V7.5L2 3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  ),
  download: ({ size = 14 } = {}) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M7 2v7m-3-3l3 3 3-3M2 12h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  code: ({ size = 14 } = {}) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M4 4l-2.5 3L4 10M10 4l2.5 3L10 10M8.5 3l-3 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  table: ({ size = 14 } = {}) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <rect x="2" y="2.5" width="10" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M2 5.5h10M2 8.5h10M5.5 5.5v6" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  ),
  chart: ({ size = 14 } = {}) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M2 12V3M12 12H2M4 10V8M6.5 10V6M9 10V4M11.5 10V7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  doc: ({ size = 14 } = {}) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M3 2h5l3 3v7H3V2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M8 2v3h3" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  ),
  bolt: ({ size = 14 } = {}) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M8 1.5L3 8h3.5L6 12.5 11 6H7.5l.5-4.5z" fill="currentColor"/>
    </svg>
  ),
  globe: ({ size = 14 } = {}) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M1.5 7h11M7 1.5c1.8 2 2.7 4 2.7 5.5S8.8 11 7 12.5C5.2 11 4.3 9 4.3 7.5S5.2 3 7 1.5z" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  ),
  check: ({ size = 14 } = {}) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M3 7.5l3 3 5-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  expand: ({ size = 14 } = {}) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M9 2h3v3M5 12H2V9M12 2L8.5 5.5M2 12l3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  attach: ({ size = 14 } = {}) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M11 5.5L6 10.5a2 2 0 1 1-3-3l5.5-5.5a3 3 0 1 1 4 4L7 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  trash: ({ size = 14 } = {}) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M2.5 4h9M5 4V2.5h4V4M10.5 4l-.8 8h-5.4L3.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  grip: ({ size = 14 } = {}) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <circle cx="5" cy="5" r="1.1" fill="currentColor"/><circle cx="9" cy="5" r="1.1" fill="currentColor"/>
      <circle cx="5" cy="9" r="1.1" fill="currentColor"/><circle cx="9" cy="9" r="1.1" fill="currentColor"/>
    </svg>
  ),
  settings: ({ size = 16 } = {}) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6.4 1.7h3.2l.35 1.55a4.6 4.6 0 0 1 1.15.66l1.55-.45 1.6 2.77-1.2 1.05c.06.28.1.57.1.87s-.04.59-.1.87l1.2 1.05-1.6 2.77-1.55-.45a4.6 4.6 0 0 1-1.15.66L9.6 14.3H6.4l-.35-1.55a4.6 4.6 0 0 1-1.15-.66l-1.55.45-1.6-2.77 1.2-1.05A4.7 4.7 0 0 1 2.85 8c0-.3.04-.59.1-.87l-1.2-1.05 1.6-2.77 1.55.45c.35-.28.74-.5 1.15-.66L6.4 1.7Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2.15" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  ),
  chip: ({ size = 16 } = {}) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="4.5" y="4.5" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 2.5v2M8 11.5v2M2.5 8h2M11.5 8h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  logout: ({ size = 16 } = {}) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M6 3H3.5A1.5 1.5 0 0 0 2 4.5v7A1.5 1.5 0 0 0 3.5 13H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M10.5 5.5L13.5 8.5 10.5 11.5M6.5 8.5H13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
};
