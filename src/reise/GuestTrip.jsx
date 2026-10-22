import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { LabelOverview, NotConfigured, Tag, usePageMeta } from "./ui";
import {
  GUEST_STATUS, TRACKS, TRACK_PLURAL, addDays, continuingStays, formatDay, formatMoney,
  formatRange, formatShort, formatTime, labelSummary, ICONS, iconFor, isIncluded, itemTotal, linkLabel, mapsUrl, sortItems, telHref, tripDays,
} from "./util";
import "./reise.css";

export default function GuestTrip({ code }) {
  const [data, setData] = useState(undefined);
  const [tab, setTab] = useState("timeline");
  usePageMeta(data?.trip.title ?? "Reiseplan");

  useEffect(() => {
    if (!supabase) return;
    supabase.rpc("get_trip_by_code", { p_code: code }).then(({ data }) => setData(data ?? null));
  }, [code]);

  if (!supabase) return <NotConfigured />;
  if (data === undefined) return <main className="r-center r-muted">Laster reiseplan…</main>;
  if (data === null) {
    return (
      <main className="r-center">
        <h1>Fant ikke reisen</h1>
        <p className="r-muted">Sjekk at lenken er riktig, eller ta kontakt med oss.</p>
      </main>
    );
  }

  const { trip, items } = data;
  const editable = trip.status === "shared";
  const updateItem = (id, patch) =>
    setData((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  const setTrip = (patch) => setData((d) => ({ ...d, trip: { ...d.trip, ...patch } }));

  const itemProps = { code, editable, currency: trip.currency, onChange: updateItem };
  const optional = items.filter((i) => i.optional);
  const tabs = [
    ["timeline", "Tidslinje"],
    ["stay", TRACK_PLURAL.stay],
    ["experience", TRACK_PLURAL.experience],
    ...(optional.length ? [["extras", `Tillegg (${optional.length})`]] : []),
  ];

  return (
    <div className="g-page">
      <header className="g-hero">
        {trip.client_name && <p className="g-kicker">Reiseplan for {trip.client_name}</p>}
        <h1>{trip.title}</h1>
        {trip.start_date && <p className="g-dates">{formatRange(trip.start_date, trip.end_date)}</p>}
        {trip.intro && <p className="g-intro">{trip.intro}</p>}
        <LabelOverview summary={labelSummary(trip, items)} />
        {trip.status === "confirmed" && <p className="g-confirmed">✓ Reisen er bekreftet</p>}
      </header>

      <nav className="g-tabs" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </nav>

      <div className="g-layout">
        <main className="g-main">
          {tab === "timeline" && <Timeline trip={trip} items={items} itemProps={itemProps} />}
          {(tab === "stay" || tab === "experience") && (
            <TrackList items={items.filter((i) => i.track === tab)} itemProps={itemProps} />
          )}
          {tab === "extras" && (
            <>
              <p className="g-muted">Valgfrie tillegg du kan legge til reisen.</p>
              <TrackList items={optional} itemProps={itemProps} showTrack />
            </>
          )}
        </main>
        <Summary trip={trip} items={items} code={code} editable={editable} onSubmitted={setTrip} />
      </div>
    </div>
  );
}

function Timeline({ trip, items, itemProps }) {
  const days = tripDays(trip, items);
  const undated = items.filter((i) => !i.date);
  return (
    <>
      {days.map((d) => {
        const dayItems = items.filter((i) => i.date === d).sort(sortItems);
        const staying = continuingStays(items, d);
        const stays = dayItems.filter((i) => i.track === "stay");
        const experiences = dayItems.filter((i) => i.track === "experience");
        return (
          <section className="g-day" key={d}>
            <h2>
              {formatDay(d)}
              {(trip.day_labels?.[d] || []).map((l) => <Tag key={l} label={l} />)}
            </h2>
            {experiences.map((i) => <GuestItem key={i.id} item={i} {...itemProps} />)}
            {stays.map((i) => <GuestItem key={i.id} item={i} {...itemProps} />)}
            {staying.map((s) => (
              <p className="g-staying" key={s.id}>
                🛏 Overnatting: {s.title}
              </p>
            ))}
            {dayItems.length === 0 && staying.length === 0 && <p className="g-muted">Ingen aktiviteter registrert</p>}
          </section>
        );
      })}
      {undated.length > 0 && (
        <section className="g-day">
          <h2>Uten fast dato</h2>
          {undated.sort(sortItems).map((i) => <GuestItem key={i.id} item={i} {...itemProps} showTrack />)}
        </section>
      )}
    </>
  );
}

function TrackList({ items, itemProps, showTrack }) {
  if (items.length === 0) return <p className="g-muted">Ingenting her ennå.</p>;
  const sorted = [...items].sort(
    (a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || sortItems(a, b)
  );
  return sorted.map((i) => (
    <GuestItem key={i.id} item={i} {...itemProps} showDate showTrack={showTrack} />
  ));
}

function GuestItem({ item, code, editable, currency, onChange, showDate, showTrack }) {
  const [comment, setComment] = useState(item.guest_comment || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const respondable = item.ask_guest || item.optional;
  const price = itemTotal(item);
  const tel = item.contact && telHref(item.contact);

  async function respond(status) {
    if (status === "question" && !comment.trim()) {
      return setError("Skriv spørsmålet ditt i feltet under.");
    }
    setSaving(true);
    setError("");
    const { error } = await supabase.rpc("guest_respond", {
      p_code: code, p_item_id: item.id, p_status: status, p_comment: comment,
    });
    setSaving(false);
    if (error) return setError("Kunne ikke lagre. Prøv igjen.");
    onChange(item.id, { guest_status: status, guest_comment: comment });
  }

  const when =
    item.track === "stay" && item.date
      ? `${formatShort(item.date)} – ${formatShort(addDays(item.date, item.nights || 1))} · ${
          item.nights || 1
        } ${item.nights > 1 ? "netter" : "natt"}`
      : showDate && item.date
        ? formatShort(item.date)
        : "";

  return (
    <article
      className={`g-item g-${item.track} g-st-${item.guest_status}${item.optional ? " g-optional" : ""}${
        isIncluded(item) ? "" : " g-off"
      }`}
    >
      <div className="g-item-head">
        <div>
          <p className="g-item-kicker">
            {[formatTime(item), when, (showTrack || item.track === "stay") && TRACKS[item.track], item.optional && "Tillegg"]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <h3>
            {item.icon && <span className="g-icon" title={ICONS[item.icon]?.[1]}>{iconFor(item)}</span>}
            {item.title}
          </h3>
        </div>
        {price > 0 && <span className="g-price">{formatMoney(price, currency)}</span>}
      </div>

      {item.description && <p className="g-desc">{item.description}</p>}

      {(item.location || item.contact) && (
        <dl className="g-facts">
          {item.location && (
            <>
              <dt>Sted</dt>
              <dd>
                <a href={mapsUrl(item.location)} target="_blank" rel="noopener">{item.location}</a>
              </dd>
            </>
          )}
          {item.contact && (
            <>
              <dt>Kontakt</dt>
              <dd>{tel ? <a href={tel}>{item.contact}</a> : item.contact}</dd>
            </>
          )}
        </dl>
      )}

      {item.links?.length > 0 && (
        <div className="g-links">
          {item.links.map((l, i) => (
            <a key={i} className="g-link" href={l.url} target="_blank" rel="noopener">
              {linkLabel(l)} ↗
            </a>
          ))}
        </div>
      )}

      {respondable && (
        <div className="g-respond">
          <p className="g-status">
            {item.optional
              ? item.guest_status === "accepted"
                ? "✓ Lagt til i reisen"
                : item.guest_status === "declined"
                  ? "Ikke valgt"
                  : "Valgfritt tillegg"
              : GUEST_STATUS[item.guest_status]}
          </p>
          {editable && (
            <>
              <div className="g-buttons">
                {item.optional ? (
                  <>
                    <button className="g-btn g-btn-yes" aria-pressed={item.guest_status === "accepted"} disabled={saving} onClick={() => respond("accepted")}>
                      Legg til
                    </button>
                    <button className="g-btn" aria-pressed={item.guest_status === "declined"} disabled={saving} onClick={() => respond("declined")}>
                      Nei takk
                    </button>
                  </>
                ) : (
                  <>
                    <button className="g-btn g-btn-yes" aria-pressed={item.guest_status === "accepted"} disabled={saving} onClick={() => respond("accepted")}>
                      Godta
                    </button>
                    <button className="g-btn g-btn-no" aria-pressed={item.guest_status === "declined"} disabled={saving} onClick={() => respond("declined")}>
                      Avslå
                    </button>
                    <button className="g-btn" aria-pressed={item.guest_status === "question"} disabled={saving} onClick={() => respond("question")}>
                      Har spørsmål
                    </button>
                  </>
                )}
              </div>
              <textarea
                rows={2}
                placeholder="Kommentar, ønsker eller spørsmål (valgfritt)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              {comment !== (item.guest_comment || "") && (
                <button className="g-btn g-btn-small" disabled={saving} onClick={() => respond(item.guest_status)}>
                  Lagre kommentar
                </button>
              )}
              {error && <p className="g-error">{error}</p>}
            </>
          )}
          {!editable && item.guest_comment && <p className="g-muted">«{item.guest_comment}»</p>}
        </div>
      )}
    </article>
  );
}

function Summary({ trip, items, code, editable, onSubmitted }) {
  const [message, setMessage] = useState(trip.guest_message || "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const asked = items.filter((i) => i.ask_guest && !i.optional);
  const answered = asked.filter((i) => i.guest_status !== "pending");
  const included = items.filter((i) => isIncluded(i) && !i.optional);
  const extras = items.filter((i) => i.optional && i.guest_status === "accepted");
  const base = included.reduce((s, i) => s + itemTotal(i), 0);
  const extra = extras.reduce((s, i) => s + itemTotal(i), 0);

  async function submit() {
    setSending(true);
    setError("");
    const { data, error } = await supabase.rpc("guest_submit", { p_code: code, p_message: message });
    setSending(false);
    if (error) return setError("Kunne ikke sende. Prøv igjen.");
    onSubmitted({ guest_message: message, guest_submitted_at: data });
  }

  if (!editable && !trip.guest_submitted_at && base + extra === 0) return null;

  return (
    <aside className="g-summary">
      <h2>Oppsummering</h2>
      {asked.length > 0 && (
        <p>
          {answered.length} av {asked.length} punkter besvart
          <progress max={asked.length} value={answered.length} />
        </p>
      )}
      {base + extra > 0 && (
        <dl className="g-totals">
          <dt>Reisen</dt>
          <dd>{formatMoney(base, trip.currency)}</dd>
          {extra > 0 && (
            <>
              <dt>Tillegg ({extras.length})</dt>
              <dd>{formatMoney(extra, trip.currency)}</dd>
            </>
          )}
          <dt className="g-total">Totalt</dt>
          <dd className="g-total">{formatMoney(base + extra, trip.currency)}</dd>
        </dl>
      )}
      {editable && (
        <>
          <label className="g-label">
            Melding til oss
            <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>
          <button className="g-btn g-btn-yes g-btn-block" disabled={sending} onClick={submit}>
            {sending ? "Sender…" : trip.guest_submitted_at ? "Send oppdatert svar" : "Send svar"}
          </button>
          {error && <p className="g-error">{error}</p>}
        </>
      )}
      {trip.guest_submitted_at && (
        <p className="g-muted g-small">
          Svar sendt {new Date(trip.guest_submitted_at).toLocaleString("nb-NO")}.
          {editable && " Du kan fortsatt endre og sende på nytt."}
        </p>
      )}
    </aside>
  );
}
