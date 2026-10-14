import { render } from "preact";
import { App } from "./App.tsx";
import "./styles.css";

const el = document.getElementById("app");
if (el) render(<App />, el);
