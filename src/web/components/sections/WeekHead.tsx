import "./styles/WeekHead.css";
import "./styles/WeekHead.chip.css";
import type { ComponentChildren, Ref } from "preact";
import { useI18n } from "../../i18n.tsx";

export function WeekHead({ chip }: { chip?: ComponentChildren }) {
  const { t } = useI18n();
  return (
    <div class="week-head">
      <h1>{t.week}</h1>
      {chip}
    </div>
  );
}

export function IntermissionChip({
  open,
  name,
  buttonRef,
  onToggle,
}: {
  open: boolean;
  name: string;
  buttonRef: Ref<HTMLButtonElement>;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      ref={buttonRef}
      type="button"
      class={open ? "intermission on" : "intermission"}
      aria-expanded={open}
      title={name || undefined}
      onClick={onToggle}
    >
      {t.intermission} · <b>{name || t.none}</b>
      <i>{open ? "▴" : "▾"}</i>
    </button>
  );
}
