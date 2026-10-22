import { useEffect, useRef, useState } from "react";
import { uploadImage } from "./library";
import { Icon, Modal } from "./ui";
import { ICONS, PRICE_UNITS, TRACKS, normalizeUrl, timeMode } from "./util";

const toNum = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
const newOptionId = () => crypto.randomUUID().slice(0, 8);

/**
 * Skjema for et element i en reise (mode="item") eller et produkt i biblioteket (mode="product").
 */
export default function ItemEditor({ value, mode, customIcons = [], onSave, onCancel }) {
  const isItem = mode === "item";
  // Tillegg som hører til et arrangement eller en overnatting.
  const isAddon = isItem && !!value.parent_id;
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
    image_url: "",
    quantity: 1,
    ask_guest: false,
    optional: false,
    paid: false,
    refundable: false,
    refundable_until: "",
    ...Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null)),
    links: value.links?.length ? value.links : [],
    options: value.options?.length ? value.options : [],
  }));
  const [saving, setSaving] = useState(false);
  const [uploads, setUploads] = useState(0);
  const [showEmoji, setShowEmoji] = useState(false);
  // Nye elementer starter med klokkeslett; eksisterende viser det de er lagret med.
  const [timeChoice, setTimeChoice] = useState(() => (value.id ? timeMode(value) : "time"));
  const onBusy = (d) => setUploads((n) => n + d);

  const set = (k) => (e) =>
    setF((prev) => ({ ...prev, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const setLink = (idx, k, v) =>
    setF((prev) => ({ ...prev, links: prev.links.map((l, i) => (i === idx ? { ...l, [k]: v } : l)) }));

  const setOption = (idx, k, v) =>
    setF((prev) => ({ ...prev, options: prev.options.map((o, i) => (i === idx ? { ...o, [k]: v } : o)) }));

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
      out.all_day = timeChoice === "allday";
      if (timeChoice !== "time") {
        out.time = "";
        out.end_time = "";
      }
      out.refundable = f.paid && f.refundable;
      out.refundable_until = out.refundable && f.refundable_until ? f.refundable_until : null;
      if (isAddon) out.optional = true;
      out.options = out.optional
        ? f.options
            .filter((o) => o.title?.trim())
            .map((o) => ({ ...o, title: o.title.trim(), price: toNum(o.price) }))
        : [];
    }
    try {
      await onSave(out);
    } finally {
      setSaving(false);
    }
  }

  const title = isAddon
    ? value.id ? "Rediger tillegg" : "Nytt tillegg"
    : value.id ? "Rediger" : isItem ? "Nytt element" : "Nytt produkt";

  return (
    <Modal title={title} onClose={onCancel}>
      <form className="r-form" onSubmit={submit}>
        <div className="r-row">
          {!isAddon && (
            <label>
              Type
              <select value={f.track} onChange={set("track")}>
                {Object.entries(TRACKS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
          )}
          <label className="r-grow">
            Tittel
            <input required value={f.title} onChange={set("title")} autoFocus />
          </label>
        </div>

        {isItem && !isAddon && (
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
          </div>
        )}

        {isItem && (
          <div className="r-row">
            <div className="r-segmented" role="radiogroup" aria-label="Tidspunkt">
              {[["time", "Klokkeslett"], ["allday", "Hele dagen"], ["none", "Ingen tid"]].map(([k, label]) => (
                <button
                  type="button"
                  key={k}
                  role="radio"
                  aria-checked={timeChoice === k}
                  onClick={() => setTimeChoice(k)}
                >
                  {label}
                </button>
              ))}
            </div>
            {timeChoice === "time" && (
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
          <div className="r-row">
            <button
              type="button"
              className="r-btn r-btn-small"
              aria-expanded={showEmoji}
              onClick={() => setShowEmoji((s) => !s)}
            >
              {f.icon && !ICONS[f.icon] && <Icon value={f.icon} />}
              {showEmoji ? "Lukk emojier" : "Velg emoji…"}
            </button>
            <input
              className="r-grow"
              value={ICONS[f.icon] ? "" : f.icon}
              onChange={(e) => setF((p) => ({ ...p, icon: e.target.value.trim() }))}
              placeholder="…eller lim inn bilde-URL"
            />
          </div>
          {showEmoji && (
            <EmojiPicker
              onPick={(emoji) => {
                setF((p) => ({ ...p, icon: emoji }));
                setShowEmoji(false);
              }}
            />
          )}
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
          <legend>Bilde</legend>
          <ImageField value={f.image_url} onChange={(url) => setF((p) => ({ ...p, image_url: url }))} onBusy={onBusy} />
        </fieldset>

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
            Pris (KES)
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
          <fieldset>
            <legend>Betaling</legend>
            <div className="r-row">
              <label className="r-inline">
                <input type="checkbox" checked={f.paid} onChange={set("paid")} />
                Betalt
              </label>
              {f.paid && (
                <label className="r-inline">
                  <input type="checkbox" checked={f.refundable} onChange={set("refundable")} />
                  Refunderbar
                </label>
              )}
              {f.paid && f.refundable && (
                <label>
                  Refunderbar til (valgfritt)
                  <input type="date" value={f.refundable_until} onChange={set("refundable_until")} />
                </label>
              )}
            </div>
          </fieldset>
        )}

        {isItem && !isAddon && (
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

        {isItem && (f.optional || isAddon) && (
          <fieldset>
            <legend>Hva gjesten kan velge</legend>
            <p className="r-muted r-small r-flush">
              Legg inn ett eller flere valg. Uten valg tilbys selve elementet over som tillegg.
            </p>
            {f.options.map((o, i) => (
              <div className="r-option" key={o.id}>
                <div className="r-row">
                  <label className="r-grow">
                    Produkttittel
                    <input value={o.title} onChange={(e) => setOption(i, "title", e.target.value)} />
                  </label>
                  <label>
                    Pris (KES)
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={o.price ?? ""}
                      onChange={(e) => setOption(i, "price", e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="r-btn r-btn-ghost"
                    aria-label="Fjern valg"
                    onClick={() => setF((p) => ({ ...p, options: p.options.filter((_, j) => j !== i) }))}
                  >
                    ✕
                  </button>
                </div>
                <label>
                  Beskrivelse
                  <textarea
                    rows={2}
                    value={o.description}
                    onChange={(e) => setOption(i, "description", e.target.value)}
                  />
                </label>
                <ImageField value={o.image_url} onChange={(url) => setOption(i, "image_url", url)} onBusy={onBusy} />
              </div>
            ))}
            <button
              type="button"
              className="r-btn r-btn-small"
              onClick={() =>
                setF((p) => ({
                  ...p,
                  options: [...p.options, { id: newOptionId(), title: "", description: "", price: "", image_url: "" }],
                }))
              }
            >
              + Legg til valg
            </button>
          </fieldset>
        )}

        <div className="r-actions">
          <button type="button" className="r-btn" onClick={onCancel}>
            Avbryt
          </button>
          <button className="r-btn r-btn-primary" disabled={saving || uploads > 0}>
            {saving ? "Lagrer…" : uploads > 0 ? "Laster opp bilde…" : "Lagre"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ImageField({ value, onChange, onBusy }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    onBusy(1);
    try {
      onChange(await uploadImage(file));
    } catch (err) {
      setError(`Opplasting feilet: ${err.message}`);
    } finally {
      setBusy(false);
      onBusy(-1);
    }
  }

  return (
    <div className="r-image-field">
      {value && <img className="r-img-preview" src={value} alt="" />}
      <div className="r-row">
        <button type="button" className="r-btn r-btn-small" disabled={busy} onClick={() => input.current.click()}>
          {busy ? "Laster opp…" : value ? "Bytt bilde" : "Last opp bilde"}
        </button>
        <input ref={input} type="file" accept="image/*" hidden onChange={onFile} />
        <input
          className="r-grow"
          placeholder="…eller lim inn bilde-URL"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
        />
        {value && (
          <button type="button" className="r-btn r-btn-small r-btn-ghost" onClick={() => onChange("")}>
            Fjern
          </button>
        )}
      </div>
      {error && <p className="r-error">{error}</p>}
    </div>
  );
}

/** Alle emojier med søk (emoji-picker-element, lastes først når den åpnes). */
function EmojiPicker({ onPick }) {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    import("emoji-picker-element").then(() => setReady(true));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e) => onPick(e.detail.unicode);
    el.addEventListener("emoji-click", handler);
    return () => el.removeEventListener("emoji-click", handler);
  }, [ready, onPick]);

  if (!ready) return <p className="r-muted r-small">Laster emojier…</p>;
  return <emoji-picker ref={ref} className="r-emoji-picker" />;
}
