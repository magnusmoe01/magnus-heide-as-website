import { Fragment, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { ConvertedTotal, Icon, LabelTimeline, Money, PriceTag, NotConfigured, Tag, usePageMeta } from "./ui";
import {
  GUEST_STATUS, TRACKS, TRACK_PLURAL, addDays, continuingStays, formatDay, formatMoney, formatNight,
  formatRange, formatShort, formatTime, endsNextDay, labelRuns, isIncluded, itemTotal, paymentText, selectedOption, showPayment, linkLabel, mapsUrl, sortItems, telHref, tripDays,
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

  const addonsFor = (item) => items.filter((i) => i.parent_id === item.id).sort(sortItems);
  const itemProps = { code, editable, onChange: updateItem, addonsFor, currency: trip.currency };
  const topLevel = items.filter((i) => !i.parent_id);
  const optional = items.filter((i) => i.optional);
  // Tillegg-fanen: frittstående tillegg og elementer som har tillegg under seg.
  const withExtras = topLevel.filter((i) => i.optional || addonsFor(i).length > 0);
  const tabs = [
    ["timeline", "Tidslinje"],
    ["stay", TRACK_PLURAL.stay],
    ["experience", TRACK_PLURAL.experience],
    ...(optional.length ? [["extras", `Tillegg (${optional.length})`]] : []),
    ["summary", "Oppsummering"],
  ];
  const toSummary = editable && tab !== "summary" && (
    <button className="g-btn g-btn-block g-to-summary" onClick={() => {
      setTab("summary");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }}>
      Gå til oppsummering og send svar →
    </button>
  );

  return (
    <div className="g-page">
      <header className="g-hero">
        {trip.client_name && <p className="g-kicker">Reiseplan for {trip.client_name}</p>}
        <h1>{trip.title}</h1>
        {trip.start_date && <p className="g-dates">{formatRange(trip.start_date, trip.end_date)}</p>}
        {trip.intro && <p className="g-intro">{trip.intro}</p>}
        <LabelTimeline runs={labelRuns(trip, items)} />
        {trip.status === "confirmed" && <p className="g-confirmed">✓ Reisen er bekreftet</p>}
      </header>

      <nav className="g-tabs" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </nav>

      <main className="g-main">
          {tab === "timeline" && <Timeline trip={trip} items={topLevel} itemProps={itemProps} />}
          {(tab === "stay" || tab === "experience") && (
            <TrackList items={topLevel.filter((i) => i.track === tab)} itemProps={itemProps} />
          )}
          {tab === "extras" && (
            <>
              <p className="g-muted">Valgfrie tillegg du kan legge til reisen.</p>
              <TrackList items={withExtras} itemProps={itemProps} showTrack />
            </>
          )}
          {tab === "summary" && (
            <Summary trip={trip} items={items} code={code} editable={editable} onSubmitted={setTrip} />
          )}
          {toSummary}
      </main>
    </div>
  );
}

function Timeline({ trip, items, itemProps }) {
  const days = tripDays(trip, items);
  const undated = items.filter((i) => !i.date);
  // Kort som henger på den vertikale tidslinjen.
  const entry = (i, extra) => (
    <div className="g-tl-entry" key={i.id}>
      <GuestItem item={i} {...itemProps} {...extra} />
    </div>
  );
  return (
    <div className="g-tl">
      {days.map((d) => {
        const dayItems = items.filter((i) => i.date === d).sort(sortItems);
        const experiences = dayItems.filter((i) => i.track === "experience");
        const stays = dayItems.filter((i) => i.track === "stay");
        const staying = continuingStays(items, d);
        return (
          <Fragment key={d}>
            <section className="g-tl-group">
              <h2 className="g-tl-node g-tl-day">
                {formatDay(d)}
                {(trip.day_labels?.[d] || []).map((l) => <Tag key={l} label={l} />)}
              </h2>
              {experiences.map((i) => entry(i))}
              {experiences.length === 0 && <p className="g-muted g-tl-empty">Ingen aktiviteter registrert</p>}
            </section>
            {(stays.length > 0 || staying.length > 0) && (
              <section className="g-tl-group">
                <h3 className="g-tl-node g-tl-night">{formatNight(d)}</h3>
                {stays.map((i) => entry(i))}
                {staying.map((s) => (
                  <div className="g-tl-entry" key={s.id}>
                    <p className="g-staying">
                      {s.title} <span className="g-muted">· natt {nightNumber(s, d)} av {s.nights || 1}</span>
                    </p>
                  </div>
                ))}
              </section>
            )}
          </Fragment>
        );
      })}
      {undated.length > 0 && (
        <section className="g-tl-group">
          <h2 className="g-tl-node g-tl-day">Uten fast dato</h2>
          {undated.sort(sortItems).map((i) => entry(i, { showTrack: true }))}
        </section>
      )}
    </div>
  );
}

function nightNumber(stay, day) {
  return Math.round((Date.parse(day) - Date.parse(stay.date)) / 864e5) + 1;
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

function GuestItem({ item, code, editable, onChange, addonsFor, currency, showDate, showTrack, nested }) {
  const addons = nested ? [] : addonsFor(item);
  const [comment, setComment] = useState(item.guest_comment || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const respondable = item.ask_guest || item.optional;
  const hasOptions = item.options?.length > 0;
  const chosen = selectedOption(item);
  const tel = item.contact && telHref(item.contact);

  async function respond(status, option = "") {
    if (status === "question" && !comment.trim()) {
      return setError("Skriv spørsmålet ditt i feltet under.");
    }
    setSaving(true);
    setError("");
    const { error } = await supabase.rpc("guest_respond", {
      p_code: code, p_item_id: item.id, p_status: status, p_comment: comment, p_option: option,
    });
    setSaving(false);
    if (error) return setError("Kunne ikke lagre. Prøv igjen.");
    onChange(item.id, {
      guest_status: status,
      guest_comment: comment,
      guest_option: status === "accepted" ? option : "",
    });
  }

  // Datoer vises bare i listene; i tidslinjen gir plasseringen datoen.
  const when = !showDate || !item.date
    ? ""
    : item.track === "stay"
      ? `${formatShort(item.date)} – ${formatShort(addDays(item.date, item.nights || 1))} · ${
          item.nights || 1
        } ${item.nights > 1 ? "netter" : "natt"}`
      : formatShort(item.date);

  return (
    <article
      className={`g-item g-${item.track} g-st-${respondable ? item.guest_status : "none"}${item.optional ? " g-optional" : ""}${
        nested ? " g-nested" : ""
      }${item.guest_status === "declined" ? " g-off" : ""}`}
    >
      {item.image_url && <img className="g-img" src={item.image_url} alt="" loading="lazy" />}
      <div className="g-item-head">
        <div>
          {formatTime(item) && (
            <p className="g-item-time">
              {item.all_day ? "Hele dagen" : item.time}
              {!item.all_day && item.end_time && ` – ${item.end_time}`}
              {endsNextDay(item) && <small> (neste dag)</small>}
            </p>
          )}
          <p className="g-item-kicker">
            {[when, showTrack && TRACKS[item.track], item.optional && !nested && "Tillegg"]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <h3>
            <Icon value={item.icon} />
            {item.title}
          </h3>
        </div>
        <span className="r-item-right">
          {showPayment(item) && (
            <span className={`r-pay${item.paid ? " r-pay-paid" : ""}`}>{paymentText(item)}</span>
          )}
          <PriceTag item={item} currency={currency} className="g-price" />
        </span>
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
                ? `✓ Lagt til i reisen${chosen ? `: ${chosen.title}` : ""}`
                : item.guest_status === "declined"
                  ? "Ikke valgt"
                  : "Valgfritt tillegg"
              : GUEST_STATUS[item.guest_status]}
          </p>
          {item.optional && hasOptions && (
            <div className="g-options">
              {item.options.map((o) => {
                const selected = chosen?.id === o.id;
                return (
                  <div key={o.id} className={`g-option${selected ? " g-option-selected" : ""}`}>
                    {o.image_url && <img src={o.image_url} alt="" loading="lazy" />}
                    <div className="g-option-body">
                      <div className="g-item-head">
                        <strong>{o.title}</strong>
                        {o.price !== null && o.price !== "" && (
                          <span className="g-price">
                            <Money amount={Number(o.price)} currency={currency} />
                          </span>
                        )}
                      </div>
                      {o.description && <p className="g-desc">{o.description}</p>}
                      {editable && (
                        <button
                          className="g-btn g-btn-yes g-btn-small"
                          aria-pressed={selected}
                          disabled={saving}
                          onClick={() => respond("accepted", o.id)}
                        >
                          {selected ? "✓ Valgt" : "Velg"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {editable && (
            <>
              <div className="g-buttons">
                {item.optional ? (
                  <>
                    {!hasOptions && (
                      <button className="g-btn g-btn-yes" aria-pressed={item.guest_status === "accepted"} disabled={saving} onClick={() => respond("accepted")}>
                        Legg til
                      </button>
                    )}
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
                <button className="g-btn g-btn-small" disabled={saving} onClick={() => respond(item.guest_status, item.guest_option)}>
                  Lagre kommentar
                </button>
              )}
              {error && <p className="g-error">{error}</p>}
            </>
          )}
          {!editable && item.guest_comment && <p className="g-muted">«{item.guest_comment}»</p>}
        </div>
      )}

      {addons.length > 0 && (
        <div className="g-addons">
          <p className="g-addons-label">Tillegg du kan velge</p>
          {addons.map((a) => (
            <GuestItem
              key={a.id}
              item={a}
              code={code}
              editable={editable}
              onChange={onChange}
              addonsFor={addonsFor}
              currency={currency}
              nested
            />
          ))}
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

  const payable = items.filter((i) => isIncluded(i) && itemTotal(i) > 0);
  const paid = payable.filter((i) => i.paid).reduce((s, i) => s + itemTotal(i), 0);

  return (
    <section className="g-summary">
      <h2>Oppsummering</h2>
      {asked.length === 0 && base + extra === 0 && !editable && (
        <p className="g-muted">Ingenting å oppsummere ennå.</p>
      )}
      {asked.length > 0 && (
        <p>
          {answered.length} av {asked.length} punkter besvart
          <progress max={asked.length} value={answered.length} />
        </p>
      )}
      {base + extra > 0 && (
        <dl className="g-totals">
          <dt>Reisen</dt>
          <dd>{formatMoney(base)}</dd>
          {extra > 0 && (
            <>
              <dt>Tillegg ({extras.length})</dt>
              <dd>{formatMoney(extra)}</dd>
            </>
          )}
          <dt className="g-total">Totalt</dt>
          <dd className="g-total">{formatMoney(base + extra)}</dd>
          {paid > 0 && (
            <>
              <dt>Betalt</dt>
              <dd>{formatMoney(paid)}</dd>
              <dt>Gjenstår å betale</dt>
              <dd>{formatMoney(base + extra - paid)}</dd>
            </>
          )}
        </dl>
      )}
      {base + extra > 0 && (
        <p className="g-converted">
          <ConvertedTotal amount={base + extra} currency={trip.currency} />
        </p>
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
    </section>
  );
}
