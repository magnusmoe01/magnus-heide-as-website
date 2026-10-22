export const TRACKS = { stay: "Overnatting", experience: "Opplevelse" };
export const TRACK_PLURAL = { stay: "Overnattinger", experience: "Opplevelser" };

export const GUEST_STATUS = {
  pending: "Venter på svar",
  accepted: "Godtatt",
  declined: "Avslått",
  question: "Spørsmål",
};

export const TRIP_STATUS = {
  draft: "Utkast",
  shared: "Delt med gjest",
  confirmed: "Bekreftet",
  archived: "Arkivert",
};

export const PRICE_UNITS = ["per gruppe", "per person", "per natt", "per stk"];

export const ICONS = {
  car: ["🚗", "Bil"],
  driver: ["🚐", "Sjåfør"],
  bus: ["🚌", "Buss"],
  boat: ["🚤", "Båt"],
  ferry: ["⛴️", "Ferge"],
  plane: ["✈️", "Fly"],
  train: ["🚆", "Tog"],
  helicopter: ["🚁", "Helikopter"],
  hotel: ["🏨", "Hotell"],
  cabin: ["🏡", "Hytte"],
  food: ["🍽️", "Mat"],
  hike: ["🥾", "Tur"],
  ski: ["⛷️", "Ski"],
  fishing: ["🎣", "Fiske"],
  activity: ["🎟️", "Aktivitet"],
  info: ["📍", "Annet"],
};

/** Egne ikoner (emoji eller bilde-URL) som er brukt i listene, uten de faste. */
export function customIcons(...lists) {
  return [...new Set(lists.flat().map((x) => x.icon).filter((i) => i && !ICONS[i]))];
}

export const PRODUCT_COLUMNS = [
  "track", "icon", "image_url", "title", "description", "location", "contact", "links", "price", "price_unit",
];
export const ITEM_COLUMNS = [
  ...PRODUCT_COLUMNS,
  "product_id", "date", "nights", "time", "end_time", "all_day", "options", "paid", "refundable", "refundable_until", "parent_id", "quantity", "ask_guest", "optional", "sort",
];

export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

export function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dateRange(start, end) {
  if (!start) return [];
  const last = end && end >= start ? end : start;
  const out = [];
  for (let d = start; d <= last && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Datoene i reisen, pluss eventuelle datoer utenfor som har elementer. */
export function tripDays(trip, items) {
  const set = new Set(dateRange(trip.start_date, trip.end_date));
  for (const i of items) if (i.date) set.add(i.date);
  return [...set].sort();
}

/** Stabil fargetone per by/kategori. */
export function tagHue(label) {
  let h = 0;
  for (const c of label.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/** Sammenhengende perioder med samme by/kategori, i datorekkefølge. */
export function labelRuns(trip, items) {
  const labels = trip.day_labels || {};
  const runs = [];
  for (const d of tripDays(trip, items)) {
    const list = labels[d] || [];
    const key = list.join("|");
    const last = runs[runs.length - 1];
    if (last && last.key === key && addDays(last.end, 1) === d) {
      last.end = d;
      last.len++;
    } else {
      runs.push({ key, labels: list, start: d, end: d, len: 1 });
    }
  }
  return runs;
}

const dayFmt = new Intl.DateTimeFormat("nb-NO", {
  weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
});
const shortFmt = new Intl.DateTimeFormat("nb-NO", {
  day: "numeric", month: "short", timeZone: "UTC",
});

export function formatDay(iso) {
  const s = dayFmt.format(new Date(iso + "T00:00:00Z"));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const nightFmt = new Intl.DateTimeFormat("nb-NO", {
  weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
});

/** «Natt man. 2. nov. – tir. 3. nov.» for natten som starter `iso`. */
export function formatNight(iso) {
  const f = (d) => nightFmt.format(new Date(d + "T00:00:00Z"));
  return `Natt ${f(iso)} – ${f(addDays(iso, 1))}`;
}

export function formatShort(iso) {
  return iso ? shortFmt.format(new Date(iso + "T00:00:00Z")) : "";
}

export function formatRange(start, end) {
  if (!start) return "";
  if (!end || end === start) return formatShort(start);
  return `${formatShort(start)} – ${formatShort(end)}`;
}

/** Alle priser registreres i KES. Reisens `currency` er valutaen totalen omregnes til. */
export const PRICE_CURRENCY = "KES";
export const CONVERT_CURRENCIES = ["NOK", "EUR", "USD", "GBP", "SEK", "DKK"];

export function formatMoney(n, currency = PRICE_CURRENCY) {
  if (n === null || n === undefined || n === "") return "";
  return new Intl.NumberFormat("nb-NO", {
    style: "currency", currency, maximumFractionDigits: 0,
  }).format(Number(n));
}

/** Valget gjesten har gjort for et tilleggsvalg med flere valgmuligheter. */
export function selectedOption(item) {
  if (!item.optional || !item.guest_option) return null;
  return item.options?.find((o) => o.id === item.guest_option) ?? null;
}

export function unitPrice(item) {
  const option = selectedOption(item);
  const price = option ? option.price : item.price;
  return price === null || price === undefined || price === "" ? null : Number(price);
}

export function itemTotal(item) {
  const price = unitPrice(item);
  if (price === null) return 0;
  const nights = item.price_unit === "per natt" ? item.nights || 1 : 1;
  return price * (Number(item.quantity) || 1) * nights;
}

/** «5 000 KES × 4» når prisen ganges opp, ellers null. */
export function priceBreakdown(item) {
  const unit = unitPrice(item);
  if (unit === null) return null;
  const parts = [formatMoney(unit)];
  if (item.price_unit === "per natt" && (item.nights || 1) > 1) parts.push(`${item.nights} netter`);
  const qty = Number(item.quantity) || 1;
  if (qty > 1) parts.push(qty.toLocaleString("nb-NO"));
  return parts.length > 1 ? parts.join(" × ") : null;
}

/** Om betalingsstatus er relevant å vise for elementet. */
export function showPayment(item) {
  if (item.optional && item.guest_status !== "accepted") return false;
  return item.paid || itemTotal(item) > 0;
}

export function paymentText(item) {
  if (!item.paid) return "Ikke betalt ennå";
  if (!item.refundable) return "Betalt · ikke refunderbar";
  return item.refundable_until
    ? `Betalt · refunderbar til ${formatShort(item.refundable_until)}`
    : "Betalt · refunderbar";
}

/** Om elementet teller med i totalprisen gitt gjestens svar. */
export function isIncluded(item) {
  if (item.optional) return item.guest_status === "accepted";
  return !item.ask_guest || item.guest_status !== "declined";
}

export function sortItems(a, b) {
  return (
    Number(!!b.all_day) - Number(!!a.all_day) ||
    (a.time || "").localeCompare(b.time || "") ||
    a.sort - b.sort
  );
}

/** Sluttid før starttid betyr at elementet slutter neste dag. */
export function endsNextDay(item) {
  return !!(item.time && item.end_time && item.end_time < item.time);
}

/** "time" (klokkeslett), "allday" eller "none" (ingen tid vises). */
export function timeMode(item) {
  if (item.all_day) return "allday";
  return item.time || item.end_time ? "time" : "none";
}

export function formatTime(item) {
  if (item.all_day) return "Hele dagen";
  if (item.time && item.end_time) {
    return `${item.time} – ${item.end_time}${endsNextDay(item) ? " (neste dag)" : ""}`;
  }
  return item.time || "";
}

/** Overnattinger som startet tidligere og fortsatt gjelder natten til `day`. */
export function continuingStays(items, day) {
  return items.filter(
    (i) => !i.parent_id && i.track === "stay" && i.date && i.date < day && addDays(i.date, i.nights || 1) > day
  );
}

export function slugify(s) {
  return s
    .toLowerCase()
    .replace(/æ/g, "ae").replace(/ø/g, "o").replace(/å/g, "a")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** 5 tegn uten forvekslbare tegn (0/o, 1/l/i). */
export function randomCode() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return [...bytes].map((b) => chars[b % chars.length]).join("");
}

export function normalizeUrl(url) {
  const u = url.trim();
  if (!u) return "";
  return /^[a-z]+:/i.test(u) ? u : `https://${u}`;
}

export function linkLabel(link) {
  if (link.label) return link.label;
  try {
    return new URL(link.url).hostname.replace(/^www\./, "");
  } catch {
    return link.url;
  }
}

export function mapsUrl(location) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

export function telHref(contact) {
  const m = contact.match(/\+?\d[\d\s]{6,}\d/);
  return m ? `tel:${m[0].replace(/\s/g, "")}` : null;
}

export function tripUrl(code) {
  return `${window.location.origin}/reise/${code}`;
}
