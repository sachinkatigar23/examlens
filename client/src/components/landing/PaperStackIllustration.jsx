// Static stand-in for the 3D scene: used with prefers-reduced-motion, without WebGL, and while the 3D chunk loads.
// It shows the story's end state in one picture: the pile of papers, highlighted repeats, and the heatmap.
const PAPER = '#FBF8F1';
const INK = '#1B2A4A';
const RULE = '#E4DCCB';
const PEN = '#D7452C';
const HL = '#F4D35E';

const COUNTS = [
  [2, 2, 1, 2],
  [1, 3, 1, 1],
  [2, 2, 1, 1],
  [1, 2, 1, 1],
  [2, 0, 1, 2],
];

function Sheet({ x, y, rotate, year, children }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <rect x="-4" y="6" width="200" height="283" rx="3" fill="#1B2A4A" opacity="0.08" />
      <rect width="200" height="283" rx="3" fill={PAPER} stroke={RULE} />
      <line x1="22" y1="0" x2="22" y2="283" stroke={PEN} strokeOpacity="0.5" />
      {[70, 92, 114, 136, 158, 180, 202, 224, 246].map((ly) => (
        <line key={ly} x1="0" y1={ly} x2="200" y2={ly} stroke={RULE} />
      ))}
      <text x="30" y="34" fontFamily="Fraunces Variable, Georgia, serif" fontSize="15" fontWeight="600" fill={INK}>
        Computer Networks
      </text>
      <text x="150" y="52" fontFamily="JetBrains Mono Variable, monospace" fontSize="11" fill={PEN}>{year}</text>
      {children}
    </g>
  );
}

const Lines = ({ widths, top = 64 }) =>
  widths.map((w, i) => <rect key={i} x="30" y={top + i * 22} width={w} height="4" rx="2" fill={INK} opacity="0.55" />);

export default function PaperStackIllustration({ className = '' }) {
  return (
    <svg
      viewBox="0 0 520 440"
      className={className}
      role="img"
      aria-label="A fanned stack of past exam papers with the repeated questions highlighted, next to a small heatmap of topics by year"
    >
      <Sheet x={40} y={90} rotate={-12} year="2022"><Lines widths={[130, 150, 110, 140, 90]} /></Sheet>
      <Sheet x={110} y={60} rotate={-4} year="2023"><Lines widths={[140, 120, 150, 100, 130]} /></Sheet>
      <Sheet x={180} y={40} rotate={4} year="2025">
        <rect x="26" y="58" width="150" height="14" fill={HL} opacity="0.8" />
        <rect x="26" y="102" width="122" height="14" fill={HL} opacity="0.8" />
        <Lines widths={[140, 120, 115, 150, 100]} />
      </Sheet>
      <g transform="translate(330 250)">
        <rect x="-4" y="6" width="176" height="150" rx="4" fill="#1B2A4A" opacity="0.1" />
        <rect width="176" height="150" rx="4" fill={PAPER} stroke={RULE} />
        <text x="14" y="24" fontFamily="Fraunces Variable, Georgia, serif" fontSize="13" fontWeight="600" fill={INK}>
          Topics × years
        </text>
        {COUNTS.map((row, r) =>
          row.map((n, c) => (
            <rect
              key={`${r}-${c}`}
              x={62 + c * 26}
              y={36 + r * 21}
              width="22"
              height="17"
              rx="2"
              fill={n ? HL : 'none'}
              fillOpacity={n >= 3 ? 1 : n === 2 ? 0.75 : 0.45}
              stroke={n ? 'none' : RULE}
              strokeDasharray="3 2"
            />
          )),
        )}
        {COUNTS.map((_, r) => (
          <rect key={r} x="14" y={42 + r * 21} width={[40, 34, 38, 30, 20][r]} height="4" rx="2" fill={INK} opacity="0.5" />
        ))}
        <ellipse cx="74" cy="44" rx="16" ry="13" fill="none" stroke={PEN} strokeWidth="1.6" />
      </g>
    </svg>
  );
}
