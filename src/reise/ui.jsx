import { useEffect } from "react";
import { GUEST_STATUS } from "./util";

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
        {children}
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
