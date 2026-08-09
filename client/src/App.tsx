import './styles.css';

/**
 * Temporary token check — replaced by the real App in the router task.
 * Class names are written out in full rather than constructed, because
 * Tailwind scans source text and cannot see `bg-${name}`.
 */
const SWATCHES = [
  { cls: 'bg-bg', name: 'bg', note: 'page' },
  { cls: 'bg-surface', name: 'surface', note: 'cards' },
  { cls: 'bg-raised', name: 'raised', note: 'borders only' },
  { cls: 'bg-muted', name: 'muted', note: 'secondary text' },
  { cls: 'bg-dim', name: 'dim', note: 'decorative' },
  { cls: 'bg-text', name: 'text', note: 'primary text' },
  { cls: 'bg-accent', name: 'accent', note: 'once per screen' },
  { cls: 'bg-sage', name: 'sage', note: 'positive' },
  { cls: 'bg-gold', name: 'gold', note: 'caution' },
  { cls: 'bg-negative', name: 'negative', note: 'destructive' },
];

const App = () => (
  <div className="min-h-dvh p-8">
    <div className="lbl text-accent">Dashboard</div>
    <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Design tokens</h1>

    <div className="mt-6 max-w-md rounded-card border border-raised bg-surface">
      {SWATCHES.map((s) => (
        <div
          key={s.name}
          className="flex items-center gap-3 border-b border-raised px-4 py-2.5 last:border-0"
        >
          <span className={`inline-block h-6 w-6 rounded border border-raised ${s.cls}`} />
          <span className="font-mono text-xs text-text">{s.name}</span>
          <span className="ml-auto text-xs text-muted">{s.note}</span>
        </div>
      ))}
    </div>

    <p className="mt-6 max-w-md text-sm text-muted">
      Tabular figures: <span className="tnum font-bold text-text">82.4</span> kg ·{' '}
      <span className="tnum font-bold text-accent">640</span> kcal left
    </p>
  </div>
);

export default App;
