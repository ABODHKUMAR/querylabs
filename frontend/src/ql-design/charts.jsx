// Query Labs chart primitives — SVG-based, no external dependencies

export function LineChart({ series, height = 200, accent = 'var(--brand)', labels, annotations = [] }) {
  const w = 100, h = 100;
  const allVals = series.flatMap(s => s.data);
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const range = max - min || 1;
  const padTop = 6, padBot = 6;
  const xs = (i, n) => (i / (n - 1)) * w;
  const ys = v => padTop + (1 - (v - min) / range) * (h - padTop - padBot);

  const path = (data) =>
    data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xs(i, data.length)} ${ys(v)}`).join(' ');
  const area = (data) =>
    path(data) + ` L ${xs(data.length - 1, data.length)} ${h} L 0 ${h} Z`;

  return (
    <div style={{ width: '100%' }}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        style={{ display: 'block', overflow: 'visible' }}
      >
        <defs>
          <linearGradient id="lcFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={accent} stopOpacity="0.18"/>
            <stop offset="1" stopColor={accent} stopOpacity="0"/>
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((t, i) => (
          <line
            key={i}
            x1="0" y1={padTop + t * (h - padTop - padBot)}
            x2={w}  y2={padTop + t * (h - padTop - padBot)}
            stroke="var(--line-soft)" strokeWidth="0.18"
          />
        ))}
        {series.map((s, si) => (
          <g key={si}>
            {si === 0 && <path d={area(s.data)} fill="url(#lcFill)" />}
            <path
              d={path(s.data)}
              fill="none"
              stroke={s.color || accent}
              strokeWidth={s.dashed ? '0.5' : '0.8'}
              strokeDasharray={s.dashed ? '1.2 1.2' : '0'}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {s.data.map((v, i) =>
              si === 0 && i === s.data.length - 1 ? (
                <circle key={i} cx={xs(i, s.data.length)} cy={ys(v)} r="0.9" fill={s.color || accent}/>
              ) : null
            )}
          </g>
        ))}
        {annotations.map((a, i) => (
          <line
            key={i}
            x1={xs(a.x, labels?.length ?? 1)} y1={padTop}
            x2={xs(a.x, labels?.length ?? 1)} y2={h - padBot}
            stroke="var(--ink-4)" strokeWidth="0.2" strokeDasharray="1 1"
          />
        ))}
      </svg>
      {labels && (
        <div style={{ display: 'flex', marginTop: 6, fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--sans)' }}>
          {labels.map((l, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center' }}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export function BarChart({ data, height = 200, accent = 'var(--brand)', soft = 'var(--brand-soft)', highlightLast = true, baseline }) {
  const w = 100, h = 100;
  const max = Math.max(...data.map(d => d.v));
  const bw = (w / data.length) * 0.62;
  const gap = (w / data.length) * 0.38;

  return (
    <div style={{ width: '100%' }}>
      <svg
        viewBox={`0 0 ${w} ${h + 10}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        style={{ display: 'block', overflow: 'visible' }}
      >
        {[0.25, 0.5, 0.75, 1].map((t, i) => (
          <line key={i} x1="0" y1={h - t * h * 0.88} x2={w} y2={h - t * h * 0.88}
            stroke="var(--line-soft)" strokeWidth="0.2" />
        ))}
        {baseline != null && (
          <line
            x1="0" y1={h - (baseline / max) * h * 0.88}
            x2={w}  y2={h - (baseline / max) * h * 0.88}
            stroke="var(--ink-4)" strokeWidth="0.3" strokeDasharray="1.2 1.2"
          />
        )}
        {data.map((d, i) => {
          const bh = (d.v / max) * h * 0.88;
          const x = i * (bw + gap) + gap / 2;
          const fill = highlightLast && i === data.length - 1 ? accent : (d.color || soft);
          return <rect key={i} x={x} y={h - bh} width={bw} height={bh} fill={fill} rx="0.8" />;
        })}
      </svg>
      <div style={{ display: 'flex', marginTop: 6, fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--sans)' }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center' }}>{d.label}</div>
        ))}
      </div>
    </div>
  );
}

export function Sparkline({ data, width = 80, height = 24, color = 'var(--brand)' }) {
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const path = data
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i / (data.length - 1)) * width} ${height - ((v - min) / range) * height}`)
    .join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <path d={path} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
