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

export function iconFor(item) {
  return ICONS[item.icon]?.[0] ?? "";
}

export const PRODUCT_COLUMNS = [
  "track", "icon", "title", "description", "location", "contact", "links", "price", "price_unit",
];
export const ITEM_COLUMNS = [
  ...PRODUCT_COLUMNS,
  "product_id", "date", "nights", "time", "end_time", "all_day", "quantity", "ask_guest", "optional", "sort",
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

/** Antall dager per by/kategori. En dag med to kategorier teller i begge. */
export function labelSummary(trip, items) {
  const labels = trip.day_labels || {};
  const days = tripDays(trip, items);
  const counts = new Map();
  let unlabeled = 0;
  for (const d of days) {
    const list = labels[d] || [];
    if (list.length === 0) unlabeled++;
    for (const l of list) counts.set(l, (counts.get(l) || 0) + 1);
  }
  const rows = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "nb"));
  return { rows, unlabeled, total: days.length };
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

export function formatShort(iso) {
  return iso ? shortFmt.format(new Date(iso + "T00:00:00Z")) : "";
}

export function formatRange(start, end) {
  if (!start) return "";
  if (!end || end === start) return formatShort(start);
  return `${formatShort(start)} – ${formatShort(end)}`;
}

export function formatMoney(n, currency = "NOK") {
  if (n === null || n === undefined || n === "") return "";
  return new Intl.NumberFormat("nb-NO", {
    style: "currency", currency, maximumFractionDigits: 0,
  }).format(Number(n));
}

export function itemTotal(item) {
  if (item.price === null || item.price === undefined) return 0;
  const nights = item.price_unit === "per natt" ? item.nights || 1 : 1;
  return Number(item.price) * (Number(item.quantity) || 1) * nights;
}

/** Om elementet teller med i totalprisen gitt gjestens svar. */
export function isIncluded(item) {
  return item.optional ? item.guest_status === "accepted" : item.guest_status !== "declined";
}

export function sortItems(a, b) {
  return (
    Number(!!b.all_day) - Number(!!a.all_day) ||
    (a.time || "").localeCompare(b.time || "") ||
    a.sort - b.sort
  );
}

export function formatTime(item) {
  if (item.all_day) return "Hele dagen";
  if (item.time && item.end_time) return `${item.time}–${item.end_time}`;
  return item.time || "";
}

/** Overnattinger som startet tidligere og fortsatt gjelder natten til `day`. */
export function continuingStays(items, day) {
  return items.filter(
    (i) => i.track === "stay" && i.date && i.date < day && addDays(i.date, i.nights || 1) > day
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
