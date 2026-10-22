import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

const Admin = lazy(() => import("./reise/Admin.jsx"));
const GuestTrip = lazy(() => import("./reise/GuestTrip.jsx"));

const match = window.location.pathname.replace(/\/+$/, "").match(/^\/reise(?:\/([^/]+))?$/);
let page = <App />;
if (match) {
  page = match[1] ? <GuestTrip code={decodeURIComponent(match[1]).toLowerCase()} /> : <Admin />;
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Suspense fallback={null}>{page}</Suspense>
  </StrictMode>
);
