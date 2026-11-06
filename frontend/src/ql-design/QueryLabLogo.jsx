export function getInitials() {
  try {
    const name = localStorage.getItem('ql_userName') || localStorage.getItem('userName') || '';
    if (name) return name.split(' ').map(w => w[0]?.toUpperCase()).filter(Boolean).join('').slice(0, 2);
    const raw = localStorage.getItem('ql_userEmail') || localStorage.getItem('userEmail') || localStorage.getItem('ql_userID') || '';
    const local = raw.includes('@') ? raw.split('@')[0] : raw;
    if (local) return local.split('.').map(p => p[0]?.toUpperCase()).filter(Boolean).join('').slice(0, 2);
  } catch (_) {}
  return 'U';
}

/** Query Labs QL monogram — crisp SVG, scales cleanly at any size. */
export function QueryLabLogo({ size = 28 }) {
  const uid = `qlg-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Query Labs"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={uid} x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6B57E5" />
          <stop offset="55%" stopColor="#5B45D8" />
          <stop offset="100%" stopColor="#3F2DB0" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${uid})`} />
      <text
        x="32"
        y="41"
        textAnchor="middle"
        fontFamily="Geist, Inter, system-ui, -apple-system, sans-serif"
        fontSize="28"
        fontWeight="700"
        letterSpacing="-1.2"
        fill="#FFFFFF"
      >
        QL
      </text>
    </svg>
  );
}

export function QueryLabWordmark({ size = 28, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <QueryLabLogo size={size} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{
          fontFamily: 'Geist, system-ui, sans-serif',
          fontWeight: 600,
          fontSize: size * 0.78,
          lineHeight: 1,
          letterSpacing: '-0.02em',
          color: 'var(--ink)',
        }}>
          Query Labs
        </span>
        {sub && (
          <span style={{
            fontFamily: 'var(--sans)',
            fontSize: 10.5,
            color: 'var(--ink-4)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}>
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}

export function Avatar({ initials = 'U', tone = 'ink' }) {
  const map = {
    ink:  ['var(--ink)',    'var(--paper)'],
    querylab: ['var(--brand)',   'white'],
    soft: ['var(--paper-2)','var(--ink-2)'],
  };
  const [bg, fg] = map[tone] || map.ink;
  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%',
      background: bg, color: fg,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 600, letterSpacing: '0.03em',
      flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}
