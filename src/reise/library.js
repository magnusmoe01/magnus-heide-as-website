import { supabase } from "./supabase";
import { PRODUCT_COLUMNS, pick } from "./util";

const BUCKET = "reise-bilder";

const productKey = (x) => `${x.track}:${x.title.trim().toLowerCase()}`;

/** Finner produktet med samme type og tittel, eller oppretter det. */
export async function findOrCreateProduct(row, products) {
  const existing = products.find((p) => productKey(p) === productKey(row));
  if (existing) return { product: existing, created: false };
  const { data, error } = await supabase
    .from("products")
    .insert(pick(row, PRODUCT_COLUMNS))
    .select()
    .single();
  if (error) throw error;
  return { product: data, created: true };
}

let linking = null;

/** Knytter elementer i reiser som mangler produkt til et (nytt) produkt. Returnerer oppdatert produktliste. */
export function linkOrphanItems(products) {
  // Unngå doble produkter hvis siden laster to ganger samtidig.
  linking ??= doLinkOrphanItems(products).finally(() => {
    linking = null;
  });
  return linking;
}

async function doLinkOrphanItems(products) {
  const { data: orphans, error } = await supabase
    .from("trip_items")
    .select("*")
    .is("product_id", null)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const list = [...products];
  const groups = new Map();
  for (const item of orphans) {
    const key = productKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  for (const items of groups.values()) {
    // Nyeste versjon av elementet blir malen for produktet.
    const { product, created } = await findOrCreateProduct(items[0], list);
    if (created) list.push(product);
    const { error } = await supabase
      .from("trip_items")
      .update({ product_id: product.id })
      .in("id", items.map((i) => i.id));
    if (error) throw error;
  }
  return list;
}

/** Skalerer ned bildet (maks 1600 px) og laster det opp. Returnerer offentlig URL. */
export async function uploadImage(file) {
  let blob = file;
  let ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  try {
    blob = await resize(file, 1600);
    ext = "jpg";
  } catch {
    // F.eks. HEIC i nettlesere som ikke kan lese det – last opp originalen.
  }
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: blob.type || file.type });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function resize(file, max) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", 0.85)
  );
}
