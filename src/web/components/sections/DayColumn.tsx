import type { ComponentChildren } from "preact";
import type { Day } from "../../../shared/types.ts";
import { useI18n } from "../../i18n.tsx";

export function DayColumn({
  day,
  today,
  editing,
  children,
}: {
  day: Day;
  today: Day;
  editing: boolean;
  children: ComponentChildren;
}) {
  const { t } = useI18n();
  return (
    <div class={`day${day === today ? " on" : ""}${editing ? " editing" : ""}`}>
      <span class="name">{t.day[day]}</span>
      <div class="track">{children}</div>
    </div>
  );
}
