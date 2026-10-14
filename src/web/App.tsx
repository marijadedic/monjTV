import { Today } from "./pages/Today.tsx";
import { Admin } from "./pages/Admin.tsx";

export function App() {
  const admin = location.pathname.startsWith("/admin");
  return (
    <div class="shell">
      <header class="top">
        <a class="brand" href="/">
          monjTV
        </a>
        <nav>
          <a href="/" class={admin ? "" : "active"}>
            Today
          </a>
          <a href="/admin" class={admin ? "active" : ""}>
            Admin
          </a>
        </nav>
      </header>
      <main>{admin ? <Admin /> : <Today />}</main>
    </div>
  );
}
