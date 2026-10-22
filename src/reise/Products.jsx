import { useEffect, useState } from "react";
import ItemEditor from "./ItemEditor";
import { supabase } from "./supabase";
import { PRODUCT_COLUMNS, TRACK_PLURAL, customIcons, formatMoney, pick } from "./util";
import { Icon } from "./ui";

export default function Products() {
  const [products, setProducts] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    const { data, error } = await supabase.from("products").select("*").order("title");
    if (error) setError(error.message);
    setProducts(data ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function save(form) {
    const row = pick(form, PRODUCT_COLUMNS);
    const { error } = form.id
      ? await supabase.from("products").update(row).eq("id", form.id)
      : await supabase.from("products").insert(row);
    if (error) return setError(error.message);
    setEditing(null);
    load();
  }

  async function remove(p) {
    if (!confirm(`Slette «${p.title}» fra biblioteket? Elementer i reiser beholdes.`)) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) return setError(error.message);
    load();
  }

  if (!products) return <p className="r-muted">Laster…</p>;

  return (
    <section>
      <div className="r-toolbar">
        <div>
          <h1>Produkter og maler</h1>
          <p className="r-muted">
            Gjenbrukbare elementer – sjåfør, hotell, aktiviteter – med eller uten pris.
          </p>
        </div>
        <button className="r-btn r-btn-primary" onClick={() => setEditing({})}>
          + Nytt produkt
        </button>
      </div>
      {error && <p className="r-error">{error}</p>}

      {Object.entries(TRACK_PLURAL).map(([track, label]) => {
        const list = products.filter((p) => p.track === track);
        return (
          <div key={track} className="r-group">
            <h2>{label}</h2>
            {list.length === 0 && <p className="r-muted">Ingen ennå.</p>}
            <ul className="r-list">
              {list.map((p) => (
                <li key={p.id} className="r-list-row">
                  <button className="r-list-main" onClick={() => setEditing(p)}>
                    <strong><Icon value={p.icon} />{p.title}</strong>
                    <span className="r-muted">
                      {[p.location, p.contact].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                  <span className="r-price">
                    {p.price !== null && `${formatMoney(p.price)} ${p.price_unit}`}
                  </span>
                  <button className="r-btn r-btn-ghost r-btn-small" onClick={() => remove(p)}>
                    Slett
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {editing && (
        <ItemEditor
          value={editing}
          mode="product"
          customIcons={customIcons(products)}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}
    </section>
  );
}
