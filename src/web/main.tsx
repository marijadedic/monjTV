import { render } from "preact";
import { App } from "./App.tsx";
import { I18nProvider } from "./i18n.tsx";
import "./styles.css";

const el = document.getElementById("app");
if (el) {
  render(
    <I18nProvider>
      <App />
    </I18nProvider>,
    el,
  );
}
