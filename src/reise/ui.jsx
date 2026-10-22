import { useEffect } from "react";
import { GUEST_STATUS, formatRange, tagHue } from "./util";

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="r-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`r-modal${wide ? " r-modal-wide" : ""}`} role="dialog" aria-label={title}>
        <div className="r-modal-head">
          <h2>{title}</h2>
          <button type="button" className="r-btn r-btn-ghost" onClick={onClose} aria-label="Lukk">
            ✕
          </button>
        </div>
        <div className="r-modal-body">{children}</div>
      </div>
    </div>
  );
}

export function StatusBadge({ status }) {
  return <span className={`r-badge r-status-${status}`}>{GUEST_STATUS[status]}</span>;
}

export function NotConfigured() {
  return (
    <main className="r-center">
      <h1>Reiseplaner er ikke satt opp</h1>
      <p className="r-muted">
        Sett <code>VITE_SUPABASE_URL</code> og <code>VITE_SUPABASE_ANON_KEY</code> i <code>.env</code>{" "}
        (se README).
      </p>
    </main>
  );
}

export function usePageMeta(title) {
  useEffect(() => {
    document.title = title;
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, [title]);
}

export function Tag({ label, onRemove }) {
  return (
    <span className="r-tag" style={{ "--h": tagHue(label) }}>
      {label}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Fjern ${label}`}>
          ✕
        </button>
      )}
    </span>
  );
}

/** Byer/kategorier som en tidslinje over reisens datoer. */
export function LabelTimeline({ runs }) {
  if (!runs.some((r) => r.labels.length)) return null;
  const total = runs.reduce((s, r) => s + r.len, 0);
  return (
    <div className="r-ltl" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
      {runs.map((r) => (
        <div
          key={r.start}
          className="r-ltl-run"
          style={{ gridColumn: `span ${r.len}` }}
          title={`${r.labels.join(" / ") || "Uten kategori"}: ${formatRange(r.start, r.end)}`}
        >
          <div className="r-ltl-bar">
            {r.labels.length ? (
              r.labels.map((l) => <span key={l} style={{ "--h": tagHue(l) }} />)
            ) : (
              <span className="r-ltl-none" />
            )}
          </div>
          <span className="r-ltl-label">{r.labels.join(" / ")}</span>
          <span className="r-ltl-dates">{formatRange(r.start, r.end)}</span>
        </div>
      ))}
    </div>
  );
}

export function LabelOverview({ summary }) {
  const { rows, unlabeled, total } = summary;
  if (rows.length === 0) return null;
  const dager = (n) => `${n} ${n === 1 ? "dag" : "dager"}`;
  return (
    <div className="r-overview">
      <div className="r-overview-bar" aria-hidden="true">
        {rows.map(([label, n]) => (
          <span key={label} style={{ "--h": tagHue(label), flexGrow: n }} />
        ))}
        {unlabeled > 0 && <span className="r-overview-none" style={{ flexGrow: unlabeled }} />}
      </div>
      <ul>
        {rows.map(([label, n]) => (
          <li key={label}>
            <Tag label={label} /> {dager(n)}
          </li>
        ))}
        {unlabeled > 0 && <li className="r-muted">Uten kategori: {dager(unlabeled)}</li>}
        <li className="r-muted">Totalt {dager(total)}</li>
      </ul>
    </div>
  );
}
