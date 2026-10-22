import { Fragment, useEffect, useMemo, useState } from "react";
import ItemEditor from "./ItemEditor";
import { findOrCreateProduct } from "./library";
import { supabase } from "./supabase";
import { ConvertedTotal, Icon, LabelTimeline, Modal, Money, PriceTag, StatusBadge, Tag } from "./ui";
import {
  CONVERT_CURRENCIES, ITEM_COLUMNS, PRODUCT_COLUMNS, TRACKS, TRIP_STATUS,
  continuingStays, formatDay, formatMoney, formatNight, formatShort, endsNextDay, customIcons, isIncluded, itemTotal, labelRuns, paymentText, selectedOption, showPayment,
  pick, slugify, sortItems, tripDays, tripUrl,
} from "./util";

const RESET_RESPONSE = { guest_status: "pending", guest_comment: "", guest_option: "" };
const NOT_OPTIONAL = { optional: false, options: [], guest_status: "pending", guest_option: "" };

const META_FIELDS = [
  "title", "client_name", "code", "start_date", "end_date", "intro", "admin_notes", "status", "currency",
];

export default function TripEditor({ id, onBack }) {
  const [trip, setTrip] = useState(null);
  const [draft, setDraft] = useState(null);
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [editing, setEditing] = useState(null);
  const [picking, setPicking] = useState(null);
  const [error, setError] = useState("");
  const [dragId, setDragId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    const [t, i, p] = await Promise.all([
      supabase.from("trips").select("*").eq("id", id).single(),
      supabase.from("trip_items").select("*").eq("trip_id", id),
      supabase.from("products").select("*").order("title"),
    ]);
    const err = t.error || i.error || p.error;
    if (err) setError(err.message);
    if (t.data) {
      setTrip(t.data);
      setDraft(pick(t.data, META_FIELDS));
    }
    setItems(i.data ?? []);
    setProducts(p.data ?? []);
  }

  useEffect(() => {
    load();
  }, [id]);

  const days = useMemo(() => (trip ? tripDays(trip, items) : []), [trip, items]);

  if (!trip || !draft) return <p className="r-muted">{error || "Laster…"}</p>;

  const dirty = META_FIELDS.some((k) => (draft[k] ?? "") !== (trip[k] ?? ""));
  const setD = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  async function saveMeta(e) {
    e?.preventDefault();
    const row = {
      ...draft,
      code: slugify(draft.code),
      start_date: draft.start_date || null,
      end_date: draft.end_date || null,
    };
    if (row.code.length < 4) return setError("Koden må ha minst 4 tegn (a–z, 0–9, -).");
    const { data, error } = await supabase.from("trips").update(row).eq("id", id).select().single();
    if (error) {
      return setError(error.code === "23505" ? "Denne koden er allerede i bruk." : error.message);
    }
    setError("");
    setTrip(data);
    setDraft(pick(data, META_FIELDS));
  }

  async function patchItem(itemId, patch) {
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...patch } : i)));
    const { error } = await supabase.from("trip_items").update(patch).eq("id", itemId);
    if (error) {
      setError(error.message);
      load();
    }
  }

  async function insertItem(row) {
    // Alle elementer hører til et produkt i biblioteket.
    let productId = row.product_id;
    if (!productId) {
      try {
        const { product, created } = await findOrCreateProduct(row, products);
        if (created) setProducts((prev) => [...prev, product]);
        productId = product.id;
      } catch (err) {
        return setError(err.message);
      }
    }
    const { data, error } = await supabase
      .from("trip_items")
      .insert({ ...pick(row, ITEM_COLUMNS), product_id: productId, trip_id: id })
      .select()
      .single();
    if (error) return setError(error.message);
    setItems((prev) => [...prev, data]);
    return data;
  }

  async function saveItem(form) {
    if (form.id) {
      const patch = pick(form, ITEM_COLUMNS);
      // Fjernes avhukingen for tilleggsvalg, nullstilles gjestens svar på tillegget.
      if (editing.optional && !form.optional) Object.assign(patch, NOT_OPTIONAL);
      // Uten «be om bekreftelse» skal et tidligere svar ikke lenger gjelde.
      if (editing.ask_guest && !form.ask_guest && !form.optional) Object.assign(patch, RESET_RESPONSE);
      await patchItem(form.id, patch);
    } else {
      await insertItem(form);
    }
    setEditing(null);
  }

  function addFromProduct(p, target) {
    setPicking(null);
    insertItem({
      ...pick(p, PRODUCT_COLUMNS),
      product_id: p.id,
      date: target.date,
      nights: p.track === "stay" ? 1 : null,
    });
  }

  async function duplicate(item) {
    const copy = await insertItem({ ...item, sort: item.sort + 1 });
    if (!copy) return;
    for (const addon of items.filter((i) => i.parent_id === item.id)) {
      await insertItem({ ...addon, parent_id: copy.id });
    }
  }

  async function remove(item) {
    if (!confirm(`Fjerne «${item.title}» fra reisen?`)) return false;
    setEditing(null);
    // Tillegg under elementet slettes også (on delete cascade).
    setItems((prev) => prev.filter((i) => i.id !== item.id && i.parent_id !== item.id));
    const { error } = await supabase.from("trip_items").delete().eq("id", item.id);
    if (error) {
      setError(error.message);
      load();
    }
  }


  /** Bytter alt innhold (elementer, tillegg og byer/kategorier) mellom to dager. */
  async function swapDays(a, b) {
    const fromA = items.filter((i) => i.date === a).map((i) => i.id);
    const fromB = items.filter((i) => i.date === b).map((i) => i.id);
    setItems((prev) =>
      prev.map((i) => (i.date === a ? { ...i, date: b } : i.date === b ? { ...i, date: a } : i))
    );
    const labels = { ...(trip.day_labels || {}) };
    const [la, lb] = [labels[a], labels[b]];
    delete labels[a];
    delete labels[b];
    if (lb) labels[a] = lb;
    if (la) labels[b] = la;
    const results = await Promise.all([
      fromA.length && supabase.from("trip_items").update({ date: b }).in("id", fromA),
      fromB.length && supabase.from("trip_items").update({ date: a }).in("id", fromB),
    ]);
    const failed = results.find((r) => r && r.error);
    if (failed) {
      setError(failed.error.message);
      return load();
    }
    if (la || lb) saveDayLabels(labels);
  }

  async function saveDayLabels(next) {
    setTrip((t) => ({ ...t, day_labels: next }));
    const { error } = await supabase.from("trips").update({ day_labels: next }).eq("id", id);
    if (error) {
      setError(error.message);
      load();
    }
  }

  function addLabel(dates, label) {
    const l = label.trim();
    if (!l) return;
    const next = { ...(trip.day_labels || {}) };
    for (const d of dates) {
      const list = next[d] || [];
      if (!list.some((x) => x.toLowerCase() === l.toLowerCase())) next[d] = [...list, l];
    }
    saveDayLabels(next);
  }

  function removeLabel(dates, label) {
    const next = { ...(trip.day_labels || {}) };
    for (const d of dates) {
      const list = (next[d] || []).filter((x) => x !== label);
      if (list.length) next[d] = list;
      else delete next[d];
    }
    saveDayLabels(next);
  }

  function moveTo(itemId, date, track) {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    const patch = { date };
    if (track && track !== item.track) {
      patch.track = track;
      patch.nights = track === "stay" ? 1 : null;
    }
    if (patch.date === item.date && !patch.track) return;
    patchItem(itemId, patch);
    // Tilleggene følger elementet de hører til.
    for (const addon of items.filter((i) => i.parent_id === itemId)) {
      patchItem(addon.id, { date, track: patch.track ?? addon.track });
    }
  }

  function dropZone(date, track) {
    const key = `${date ?? "none"}:${track}`;
    return {
      className: `r-cell${dropTarget === key ? " r-cell-over" : ""}`,
      onDragOver: (e) => {
        if (!dragId) return;
        e.preventDefault();
        setDropTarget(key);
      },
      onDragLeave: () => setDropTarget((k) => (k === key ? null : k)),
      onDrop: (e) => {
        e.preventDefault();
        setDropTarget(null);
        if (dragId) moveTo(dragId, date, track);
        setDragId(null);
      },
    };
  }

  function renderCell(date, track) {
    const list = items
      .filter((i) => i.date === date && i.track === track && !i.parent_id)
      .sort(sortItems);
    const continuing = date && track === "stay" ? continuingStays(items, date) : [];
    return (
      <div {...dropZone(date, track)}>
        {continuing.map((s) => (
          <div key={s.id} className="r-continuing">
            ↳ <Icon value={s.icon} />{s.title}
          </div>
        ))}
        {list.map((item) => (
          <Fragment key={item.id}>
            <ItemCard
              item={item}
              currency={trip.currency}
              onEdit={() => setEditing(item)}
              onResetResponse={() => patchItem(item.id, RESET_RESPONSE)}
              onDragStart={() => setDragId(item.id)}
              onDragEnd={() => {
                setDragId(null);
                setDropTarget(null);
              }}
            />
            {/* Tillegg som egne linjer med innrykk under arrangementet. */}
            {items
              .filter((i) => i.parent_id === item.id)
              .sort(sortItems)
              .map((addon) => (
                <ItemCard
                  key={addon.id}
                  item={addon}
                  isAddon
                  currency={trip.currency}
                  onEdit={() => setEditing(addon)}
                  onResetResponse={() => patchItem(addon.id, RESET_RESPONSE)}
                />
              ))}
          </Fragment>
        ))}
        <button className="r-add" onClick={() => setPicking({ date, track })}>
          + {TRACKS[track]}
        </button>
      </div>
    );
  }

  const allLabels = [...new Set(Object.values(trip.day_labels || {}).flat())].sort((a, b) =>
    a.localeCompare(b, "nb")
  );
  const asked = items.filter((i) => i.ask_guest && !i.optional);
  const answered = asked.filter((i) => i.guest_status !== "pending");
  const extras = items.filter((i) => i.optional && i.guest_status === "accepted");
  const total = items.filter(isIncluded).reduce((s, i) => s + itemTotal(i), 0);
  const link = tripUrl(trip.code);

  return (
    <section>
      <button className="r-btn r-btn-ghost r-back" onClick={onBack}>
        ← Alle reiser
      </button>
      {error && <p className="r-error">{error}</p>}

      <div className="r-editor-top">
        <form className="r-form r-card" onSubmit={saveMeta}>
          <div className="r-row">
            <label className="r-grow">
              Tittel
              <input value={draft.title} onChange={setD("title")} />
            </label>
            <label className="r-grow">
              Kunde
              <input value={draft.client_name} onChange={setD("client_name")} />
            </label>
          </div>
          <div className="r-row">
            <label>
              Fra
              <input type="date" value={draft.start_date ?? ""} onChange={setD("start_date")} />
            </label>
            <label>
              Til
              <input type="date" value={draft.end_date ?? ""} onChange={setD("end_date")} />
            </label>
            <label className="r-grow">
              Kode (URL)
              <input value={draft.code} onChange={setD("code")} />
            </label>
            <label>
              Omregn til
              <select value={draft.currency} onChange={setD("currency")}>
                {CONVERT_CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select value={draft.status} onChange={setD("status")}>
                {Object.entries(TRIP_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Introduksjon til gjesten
            <textarea rows={3} value={draft.intro} onChange={setD("intro")} />
          </label>
          <label>
            Interne notater (vises ikke for gjesten)
            <textarea rows={2} value={draft.admin_notes} onChange={setD("admin_notes")} />
          </label>
          <div className="r-actions">
            <button className="r-btn r-btn-primary" disabled={!dirty}>
              {dirty ? "Lagre endringer" : "Lagret"}
            </button>
          </div>
        </form>

        <aside className="r-card r-share">
          <h2>Deling</h2>
          {trip.status === "draft" && (
            <p className="r-hint">Utkast – gjesten ser ikke reisen før status er «Delt med gjest».</p>
          )}
          {trip.status === "confirmed" && (
            <p className="r-hint">Bekreftet – gjesten kan se, men ikke endre svar.</p>
          )}
          <code className="r-link">{link}</code>
          <div className="r-row">
            <button
              className="r-btn r-btn-small"
              onClick={() => {
                navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Kopiert" : "Kopier lenke"}
            </button>
            <a className="r-btn r-btn-small" href={`/reise/${trip.code}`} target="_blank" rel="noopener">
              Forhåndsvis
            </a>
          </div>

          <h2>Svar fra gjesten</h2>
          <p>
            {answered.length} av {asked.length} punkter besvart
            {extras.length > 0 && ` · ${extras.length} tillegg valgt`}
          </p>
          {total > 0 && (
            <p>
              Totalt: <strong>{formatMoney(total)}</strong>
              <ConvertedTotal amount={total} currency={trip.currency} />
            </p>
          )}
          {trip.guest_submitted_at ? (
            <div className="r-guest-msg">
              <span className="r-muted">
                Sendt {new Date(trip.guest_submitted_at).toLocaleString("nb-NO")}
              </span>
              {trip.guest_message && <p>{trip.guest_message}</p>}
            </div>
          ) : (
            <p className="r-muted">Gjesten har ikke sendt inn svar ennå.</p>
          )}
        </aside>
      </div>

      <DayLabelPanel
        days={days}
        labels={allLabels}
        runs={labelRuns(trip, items)}
        onAdd={(range, label) => addLabel(range, label)}
        onRemove={(range, label) => removeLabel(range, label)}
      />
      <datalist id="r-day-labels">
        {allLabels.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>

      <div className="r-timeline">
        {days.length === 0 && (
          <p className="r-muted r-tl-empty">Sett fra- og til-dato for å få dager i tidslinjen.</p>
        )}
        {days.map((d, idx) => {
          const outside =
            (trip.start_date && d < trip.start_date) || (trip.end_date && d > trip.end_date);
          const isLast = idx === days.length - 1;
          const hasStay = items.some((i) => i.track === "stay" && i.date === d && !i.parent_id) ||
            continuingStays(items, d).length > 0;
          return (
            <Fragment key={d}>
            <div className={`r-tl-row r-tl-day${outside ? " r-tl-outside" : ""}`}>
              <div className="r-tl-date">
                <div className="r-day-head">
                  <span>
                    {formatDay(d)}
                    {outside && <span className="r-muted"> (utenfor reisen)</span>}
                  </span>
                  <span className="r-day-move">
                    <button
                      title="Flytt dagen opp"
                      aria-label="Flytt dagen opp"
                      disabled={idx === 0}
                      onClick={() => swapDays(d, days[idx - 1])}
                    >
                      ↑
                    </button>
                    <button
                      title="Flytt dagen ned"
                      aria-label="Flytt dagen ned"
                      disabled={isLast}
                      onClick={() => swapDays(d, days[idx + 1])}
                    >
                      ↓
                    </button>
                  </span>
                </div>
                <div className="r-tags">
                  {(trip.day_labels?.[d] || []).map((l) => (
                    <Tag key={l} label={l} onRemove={() => removeLabel([d], l)} />
                  ))}
                  <TagAdder onAdd={(l) => addLabel([d], l)} />
                </div>
              </div>
              {renderCell(d, "experience")}
            </div>
            {(!isLast || hasStay) && (
              <div className="r-tl-row r-tl-night">
                <div className="r-tl-date">{formatNight(d)}</div>
                {renderCell(d, "stay")}
              </div>
            )}
            </Fragment>
          );
        })}
        <div className="r-tl-row r-tl-undated r-tl-3">
          <div className="r-tl-date">
            Uten dato
            <span className="r-muted">Parkert eller tillegg uten fast dag</span>
          </div>
          {renderCell(null, "stay")}
          {renderCell(null, "experience")}
        </div>
      </div>

      {picking && (
        <ProductPicker
          products={products}
          target={picking}
          onPick={(p) => addFromProduct(p, picking)}
          onBlank={() => {
            setEditing({ track: picking.track, date: picking.date });
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
      {editing && (
        <ItemEditor
          value={editing}
          mode="item"
          customIcons={customIcons(products, items)}
          onSave={saveItem}
          onCancel={() => setEditing(null)}
          onAddAddon={(item) =>
            setEditing({ parent_id: item.id, track: item.track, date: item.date, optional: true })
          }
          onDuplicate={(item) => duplicate(item)}
          onDelete={() => remove(editing)}
        />
      )}
    </section>
  );
}

function ItemCard({
  item, isAddon, currency, onEdit, onResetResponse, onDragStart, onDragEnd,
}) {
  const responded = item.guest_status !== "pending";
  const option = selectedOption(item);
  return (
    <div
      className={`r-item${isAddon ? " r-item-addon" : ""}${item.optional ? " r-item-optional" : ""}${
        item.guest_status === "declined" ? " r-item-off" : ""
      }`}
      draggable={!isAddon}
      onClick={(e) => {
        // Hele kortet åpner redigering, unntatt knapper og lenker.
        if (e.target.closest("button, a, input, select")) return;
        onEdit();
      }}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <div className="r-item-time">
        {item.all_day ? "Hele dagen" : (
          <>
            {item.time}
            {item.end_time && <span> – {item.end_time}</span>}
            {endsNextDay(item) && <span className="r-next-day">(neste dag)</span>}
          </>
        )}
      </div>
      <div className="r-item-body">
      <button className="r-item-main" onClick={onEdit}>
        <span className="r-item-head">
          <span className="r-item-title">
            {item.image_url && <img className="r-thumb" src={item.image_url} alt="" loading="lazy" />}
            {isAddon && <span className="r-addon-mark">Tillegg</span>}
            <Icon value={item.icon} />
            {item.title}
          </span>
          <span className="r-item-right">
            {showPayment(item) && (
              <span className={`r-pay${item.paid ? " r-pay-paid" : ""}`}>{paymentText(item)}</span>
            )}
            <PriceTag item={item} currency={currency} className="r-item-price" />
          </span>
        </span>
        <span className="r-muted">
          {[
            !isAddon && item.track === "stay" && `${item.nights || 1} ${item.nights > 1 ? "netter" : "natt"}`,
            item.links?.length > 0 && `${item.links.length} lenke${item.links.length > 1 ? "r" : ""}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </button>
      {(item.optional && !isAddon) || item.ask_guest || responded ? (
        <div className="r-item-badges">
          {item.optional && !isAddon && <span className="r-badge r-badge-extra">Tillegg</span>}
          {/* «Venter på svar» bare når admin har bedt om bekreftelse. */}
          {(item.ask_guest || responded) && <StatusBadge status={item.guest_status} />}
          {responded && (
            <button className="r-linkbtn" onClick={onResetResponse}>
              {item.guest_status !== "accepted"
                ? "Nullstill svar"
                : item.optional ? "Trekk tilbake valget" : "Trekk tilbake godkjenning"}
            </button>
          )}
        </div>
      ) : null}
      {item.optional && item.options?.length > 0 ? (
        // Valgmulighetene vises som gjesten ser dem, med gjestens valg markert.
        <div className="g-options r-options">
          {item.options.map((o) => (
            <div key={o.id} className={`g-option${option?.id === o.id ? " g-option-selected" : ""}`}>
              {o.image_url && <img src={o.image_url} alt="" loading="lazy" />}
              <div className="g-option-body">
                <div className="g-item-head">
                  <strong>
                    {option?.id === o.id && "✓ "}
                    {o.title}
                  </strong>
                  {o.price !== null && o.price !== "" && (
                    <span className="g-price">
                      <Money amount={Number(o.price)} currency={currency} />
                    </span>
                  )}
                </div>
                {o.description && <p className="g-desc">{o.description}</p>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        option && <p className="r-comment">Valgt: {option.title}</p>
      )}
      {item.guest_comment && <p className="r-comment">«{item.guest_comment}»</p>}
      </div>
    </div>
  );
}

function TagAdder({ onAdd }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className="r-tag-add" onClick={() => setOpen(true)} aria-label="Legg til by eller kategori" title="Legg til by eller kategori">
        +
      </button>
    );
  }
  const commit = (input) => {
    onAdd(input.value);
    setOpen(false);
  };
  return (
    <input
      className="r-tag-input"
      list="r-day-labels"
      placeholder="By / kategori"
      autoFocus
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit(e.currentTarget);
        } else if (e.key === "Escape") {
          setOpen(false);
        }
      }}
      onBlur={(e) => commit(e.currentTarget)}
    />
  );
}

function ProductPicker({ products, target, onPick, onBlank, onClose }) {
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  const list = products.filter(
    (p) =>
      (all || p.track === target.track) &&
      (!q || `${p.title} ${p.location} ${p.description}`.toLowerCase().includes(q.toLowerCase()))
  );
  return (
    <Modal
      title={`Legg til ${TRACKS[target.track].toLowerCase()}${
        target.date ? ` – ${formatShort(target.date)}` : ""
      }`}
      onClose={onClose}
    >
      <div className="r-row">
        <input className="r-grow" placeholder="Søk i biblioteket…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <label className="r-inline">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Vis alle typer
        </label>
      </div>
      <ul className="r-list r-picker">
        {list.map((p) => (
          <li key={p.id}>
            <button className="r-list-main" onClick={() => onPick(p)}>
              <strong><Icon value={p.icon} />{p.title}</strong>
              <span className="r-muted">
                {[TRACKS[p.track], p.location, p.price !== null && `${formatMoney(p.price)} ${p.price_unit}`]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="r-muted">Ingen treff i biblioteket.</li>}
      </ul>
      <div className="r-actions">
        <button className="r-btn r-btn-primary" onClick={onBlank}>
          + Nytt element fra bunnen
        </button>
      </div>
    </Modal>
  );
}

function DayLabelPanel({ days, labels, runs, onAdd, onRemove }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const start = from || days[0];
  const end = to || from || days[days.length - 1];
  const range = days.filter((d) => d >= start && d <= end);

  function apply(fn) {
    if (!label.trim() || range.length === 0) return;
    fn(range, label.trim());
  }

  return (
    <div className="r-card r-labels">
      <div className="r-labels-head">
        <h2>Byer og kategorier</h2>
        <button className="r-linkbtn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "Skjul" : "Tilordne for en periode…"}
        </button>
      </div>
      {runs.some((r) => r.labels.length) ? (
        <LabelTimeline runs={runs} />
      ) : (
        <p className="r-muted r-small r-flush">
          Ingen byer eller kategorier ennå. Bruk + ved datoene i planen, eller tilordne for en periode.
        </p>
      )}
      {open && (
          <form
            className="r-row"
            onSubmit={(e) => {
              e.preventDefault();
              apply(onAdd);
            }}
          >
            <label className="r-grow">
              By / kategori
              <input list="r-day-labels" value={label} onChange={(e) => setLabel(e.target.value)} />
            </label>
            <label>
              Fra
              <select value={from} onChange={(e) => setFrom(e.target.value)}>
                <option value="">Første dag</option>
                {days.map((d) => (
                  <option key={d} value={d}>{formatShort(d)}</option>
                ))}
              </select>
            </label>
            <label>
              Til
              <select value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">{from ? "Samme dag" : "Siste dag"}</option>
                {days.map((d) => (
                  <option key={d} value={d}>{formatShort(d)}</option>
                ))}
              </select>
            </label>
            <button className="r-btn r-btn-primary" disabled={!label.trim() || !range.length}>
              Tilordne {range.length > 0 && `(${range.length})`}
            </button>
            {labels.includes(label.trim()) && (
              <button type="button" className="r-btn" onClick={() => apply(onRemove)}>
                Fjern
              </button>
            )}
          </form>
      )}
    </div>
  );
}
