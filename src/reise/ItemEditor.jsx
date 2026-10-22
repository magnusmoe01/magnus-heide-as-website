import { useState } from "react";
import { Icon, Modal } from "./ui";
import { ICONS, PRICE_UNITS, TRACKS, normalizeUrl } from "./util";

const toNum = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

/**
 * Skjema for et element i en reise (mode="item") eller et produkt i biblioteket (mode="product").
 */
export default function ItemEditor({ value, mode, customIcons = [], onSave, onCancel }) {
  const isItem = mode === "item";
  const [f, setF] = useState(() => ({
    track: "experience",
    title: "",
    description: "",
    location: "",
    contact: "",
    price: "",
    price_unit: "per gruppe",
    date: "",
    nights: 1,
    time: "",
    end_time: "",
    all_day: false,
    icon: "",
    quantity: 1,
    ask_guest: false,
    optional: false,
    ...Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null)),
    links: value.links?.length ? value.links : [],
  }));
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) =>
    setF((prev) => ({ ...prev, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const setLink = (idx, k, v) =>
    setF((prev) => ({ ...prev, links: prev.links.map((l, i) => (i === idx ? { ...l, [k]: v } : l)) }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    const out = {
      ...f,
      price: toNum(f.price),
      links: f.links
        .map((l) => ({ label: (l.label || "").trim(), url: normalizeUrl(l.url || "") }))
        .filter((l) => l.url),
    };
    if (isItem) {
      out.date = f.date || null;
      out.quantity = toNum(f.quantity) ?? 1;
      out.nights = f.track === "stay" ? toNum(f.nights) || 1 : null;
      if (f.all_day) {
        out.time = "";
        out.end_time = "";
      }
    }
    try {
      await onSave(out);
    } finally {
      setSaving(false);
    }
  }

  const title = value.id ? "Rediger" : isItem ? "Nytt element" : "Nytt produkt";

  return (
    <Modal title={title} onClose={onCancel}>
      <form className="r-form" onSubmit={submit}>
        <div className="r-row">
          <label>
            Type
            <select value={f.track} onChange={set("track")}>
              {Object.entries(TRACKS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <label className="r-grow">
            Tittel
            <input required value={f.title} onChange={set("title")} autoFocus />
          </label>
        </div>

        {isItem && (
          <div className="r-row">
            <label>
              {f.track === "stay" ? "Innsjekk" : "Dato"}
              <input type="date" value={f.date} onChange={set("date")} />
            </label>
            {f.track === "stay" ? (
              <label>
                Netter
                <input type="number" min="1" value={f.nights} onChange={set("nights")} />
              </label>
            ) : null}
            {!f.all_day && (
              <>
                <label>
                  Fra
                  <input type="time" value={f.time} onChange={set("time")} />
                </label>
                <label>
                  Til
                  <input type="time" value={f.end_time} onChange={set("end_time")} />
                </label>
              </>
            )}
            <label className="r-inline r-allday">
              <input type="checkbox" checked={f.all_day} onChange={set("all_day")} />
              Hele dagen
            </label>
          </div>
        )}

        <fieldset>
          <legend>Ikon</legend>
          <div className="r-icons">
            {Object.entries(ICONS).map(([k, [emoji, label]]) => (
              <button
                type="button"
                key={k}
                className="r-icon-btn"
                aria-pressed={f.icon === k}
                title={label}
                onClick={() => setF((p) => ({ ...p, icon: p.icon === k ? "" : k }))}
              >
                <span>{emoji}</span>
                {label}
              </button>
            ))}
            {customIcons.map((c) => (
              <button
                type="button"
                key={c}
                className="r-icon-btn"
                aria-pressed={f.icon === c}
                title="Eget ikon"
                onClick={() => setF((p) => ({ ...p, icon: p.icon === c ? "" : c }))}
              >
                <Icon value={c} />
              </button>
            ))}
          </div>
          <label>
            Eget ikon – emoji eller bilde-URL
            <input
              value={ICONS[f.icon] ? "" : f.icon}
              onChange={(e) => setF((p) => ({ ...p, icon: e.target.value.trim() }))}
              placeholder="f.eks. 🦁 eller https://…/ikon.png"
            />
          </label>
        </fieldset>

        <label>
          Beskrivelse
          <textarea rows={4} value={f.description} onChange={set("description")} />
        </label>

        <div className="r-row">
          <label className="r-grow">
            Sted / adresse
            <input value={f.location} onChange={set("location")} />
          </label>
          <label className="r-grow">
            Kontakt
            <input value={f.contact} onChange={set("contact")} placeholder="Navn, telefon" />
          </label>
        </div>

        <fieldset>
          <legend>Lenker (booking, bekreftelse, info)</legend>
          {f.links.map((l, i) => (
            <div className="r-row" key={i}>
              <input
                placeholder="Tekst, f.eks. Bekreftelse"
                value={l.label}
                onChange={(e) => setLink(i, "label", e.target.value)}
              />
              <input
                className="r-grow"
                placeholder="https://…"
                value={l.url}
                onChange={(e) => setLink(i, "url", e.target.value)}
              />
              <button
                type="button"
                className="r-btn r-btn-ghost"
                onClick={() => setF((p) => ({ ...p, links: p.links.filter((_, j) => j !== i) }))}
                aria-label="Fjern lenke"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="r-btn r-btn-small"
            onClick={() => setF((p) => ({ ...p, links: [...p.links, { label: "", url: "" }] }))}
          >
            + Legg til lenke
          </button>
        </fieldset>

        <div className="r-row">
          <label>
            Pris
            <input type="number" step="any" min="0" value={f.price} onChange={set("price")} />
          </label>
          <label>
            Enhet
            <select value={f.price_unit} onChange={set("price_unit")}>
              {PRICE_UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </label>
          {isItem && (
            <label>
              Antall
              <input type="number" step="any" min="0" value={f.quantity} onChange={set("quantity")} />
            </label>
          )}
        </div>

        {isItem && (
          <div className="r-checks">
            <label>
              <input type="checkbox" checked={f.ask_guest} onChange={set("ask_guest")} />
              Be gjesten om bekreftelse / avslag
            </label>
            <label>
              <input type="checkbox" checked={f.optional} onChange={set("optional")} />
              Tilleggsvalg – gjesten kan velge å legge til (mersalg)
            </label>
          </div>
        )}

        <div className="r-actions">
          <button type="button" className="r-btn" onClick={onCancel}>
            Avbryt
          </button>
          <button className="r-btn r-btn-primary" disabled={saving}>
            {saving ? "Lagrer…" : "Lagre"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
