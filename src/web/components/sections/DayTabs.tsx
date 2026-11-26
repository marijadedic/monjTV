import "./styles/DayTabs.css";
import { dateOffset } from "../../../shared/dates.ts";
import { useI18n } from "../../i18n.tsx";
import { pageHref } from "../../href.ts";

export function DayTabs({
  days,
  today,
  selected,
  labelFor,
  onSelect,
}: {
  days: { date: string }[];
  today: string;
  selected: string | undefined;
  labelFor: (date: string) => string;
  onSelect: (date: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div class="day-tabs" role="tablist" aria-label={t.days}>
      {days.map((entry) => {
        const on = entry.date === selected;
        const offset = dateOffset(today, entry.date);
        return (
          <button
            key={entry.date}
            type="button"
            role="tab"
            id={`day-${entry.date}`}
            aria-selected={on}
            aria-controls="tv-day"
            class={`${on ? "on" : ""}${offset < 0 ? " past" : ""}`}
            onClick={() => onSelect(entry.date)}
          >
            {labelFor(entry.date)}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyDay({ live }: { live: boolean }) {
  const { t } = useI18n();
  return (
    <div class="empty" id="tv-day" role="tabpanel">
      <p>{live ? t.noSlots : t.noSlotsDay}</p>
      <a href={pageHref("/admin")}>{t.addInAdmin}</a>
    </div>
  );
}
