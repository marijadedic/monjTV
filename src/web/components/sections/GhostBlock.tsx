import type { Day } from "../../../shared/types.ts";
import { nextDay } from "../../../shared/window.ts";
import { useI18n } from "../../i18n.tsx";
import { clockFace } from "@utils/clock/clockFace.ts";
import { rowStyle } from "@utils/week/rowStyle.ts";

export function GhostBlock({
  start,
  end,
  continues,
  spill,
  tone,
  day,
}: {
  start: number;
  end: number;
  continues: boolean;
  spill: boolean;
  tone: string;
  day: Day;
}) {
  const { t } = useI18n();
  return (
    <span class={`ghost${tone}`} style={rowStyle(end - start)}>
      <b>
        {spill
          ? t.sliceUntil(clockFace(end))
          : `${clockFace(start)}–${continues ? "24:00" : clockFace(end)}`}
      </b>
      {continues ? <i>{t.sliceContinues(t.dayName[nextDay(day)])}</i> : null}
    </span>
  );
}
