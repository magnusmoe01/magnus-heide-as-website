import { useEffect, useState } from "react";
import Products from "./Products";
import TripEditor from "./TripEditor";
import { supabase } from "./supabase";
import { NotConfigured, usePageMeta } from "./ui";
import { TRIP_STATUS, formatRange, randomCode } from "./util";
import "./reise.css";

function readRoute() {
  const p = new URLSearchParams(window.location.search);
  if (p.get("t")) return { view: "trip", id: p.get("t") };
  if (p.get("vis") === "produkter") return { view: "products" };
  return { view: "trips" };
}

export default function Admin() {
  usePageMeta("Reiser – admin");
  const [session, setSession] = useState(undefined);
  const [isAdmin, setIsAdmin] = useState(null);
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    const onPop = () => setRoute(readRoute());
    window.addEventListener("popstate", onPop);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  useEffect(() => {
    if (!session) return setIsAdmin(null);
    supabase.rpc("is_admin").then(({ data }) => setIsAdmin(!!data));
  }, [session?.user.id]);

  if (!supabase) return <NotConfigured />;
  if (session === undefined) return null;
  if (!session) return <Login />;
  if (isAdmin === null) return null;
  if (!isAdmin) {
    return (
      <main className="r-center">
        <h1>Ingen tilgang</h1>
        <p className="r-muted">{session.user.email} er ikke registrert som administrator.</p>
        <button className="r-btn" onClick={() => supabase.auth.signOut()}>Logg ut</button>
      </main>
    );
  }

  const go = (params) => {
    const qs = new URLSearchParams(params).toString();
    window.history.pushState(null, "", `/reise${qs ? `?${qs}` : ""}`);
    setRoute(readRoute());
    window.scrollTo(0, 0);
  };

  return (
    <div className="r-app">
      <header className="r-nav">
        <a href="/reise" className="r-brand" onClick={(e) => (e.preventDefault(), go({}))}>
          Reiser
        </a>
        <nav>
          <button className={route.view !== "products" ? "r-active" : ""} onClick={() => go({})}>
            Reiser
          </button>
          <button
            className={route.view === "products" ? "r-active" : ""}
            onClick={() => go({ vis: "produkter" })}
          >
            Produkter
          </button>
        </nav>
        <button className="r-btn r-btn-ghost r-btn-small" onClick={() => supabase.auth.signOut()}>
          Logg ut
        </button>
      </header>
      <main className="r-main">
        {route.view === "trip" && <TripEditor id={route.id} onBack={() => go({})} />}
        {route.view === "products" && <Products />}
        {route.view === "trips" && <TripList onOpen={(id) => go({ t: id })} />}
      </main>
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError("Feil e-post eller passord.");
  }

  return (
    <main className="r-center">
      <form className="r-form r-card r-login" onSubmit={submit}>
        <h1>Logg inn</h1>
        <label>
          E-post
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Passord
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="r-error">{error}</p>}
        <button className="r-btn r-btn-primary" disabled={busy}>
          {busy ? "Logger inn…" : "Logg inn"}
        </button>
      </form>
    </main>
  );
}

function TripList({ onOpen }) {
  const [trips, setTrips] = useState(null);
  const [stats, setStats] = useState({});
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      supabase.from("trips").select("*").order("start_date", { ascending: false, nullsFirst: true }),
      supabase.from("trip_items").select("trip_id, guest_status, ask_guest, optional"),
    ]).then(([t, i]) => {
      if (t.error || i.error) setError((t.error || i.error).message);
      setTrips(t.data ?? []);
      const s = {};
      for (const it of i.data ?? []) {
        if (!it.ask_guest && !it.optional) continue;
        s[it.trip_id] ??= { asked: 0, answered: 0 };
        s[it.trip_id].asked++;
        if (it.guest_status !== "pending") s[it.trip_id].answered++;
      }
      setStats(s);
    });
  }, []);

  async function create() {
    const { data, error } = await supabase
      .from("trips")
      .insert({ title: "Ny reise", code: randomCode() })
      .select()
      .single();
    if (error) return setError(error.message);
    onOpen(data.id);
  }

  if (!trips) return <p className="r-muted">Laster…</p>;
  const visible = trips.filter((t) => showArchived || t.status !== "archived");

  return (
    <section>
      <div className="r-toolbar">
        <h1>Reiser</h1>
        <button className="r-btn r-btn-primary" onClick={create}>
          + Ny reise
        </button>
      </div>
      {error && <p className="r-error">{error}</p>}
      <ul className="r-list">
        {visible.map((t) => {
          const s = stats[t.id];
          return (
            <li key={t.id} className="r-list-row">
              <button className="r-list-main" onClick={() => onOpen(t.id)}>
                <strong>{t.title}</strong>
                <span className="r-muted">
                  {[t.client_name, formatRange(t.start_date, t.end_date), `/reise/${t.code}`]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>
              {t.guest_submitted_at && <span className="r-badge r-status-accepted">Svar mottatt</span>}
              {s && <span className="r-muted r-small">{s.answered}/{s.asked} besvart</span>}
              <span className={`r-badge r-trip-${t.status}`}>{TRIP_STATUS[t.status]}</span>
            </li>
          );
        })}
        {visible.length === 0 && <li className="r-muted">Ingen reiser ennå.</li>}
      </ul>
      <label className="r-inline r-small">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        Vis arkiverte
      </label>
    </section>
  );
}
