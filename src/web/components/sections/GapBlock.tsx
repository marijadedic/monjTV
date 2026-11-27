import { useI18n } from "../../i18n.tsx";
import { clockFace } from "@utils/clock/clockFace.ts";
import { rowStyle } from "@utils/week/rowStyle.ts";

export function GapBlock({
  start,
  end,
  emptyDay,
  fallbackName,
  onOpen,
}: {
  start: number;
  end: number;
  emptyDay: boolean;
  fallbackName: string;
  onOpen: (at: number) => void;
}) {
  const { t } = useI18n();
  const span = end - start;
  const long = span >= 120;
  const tight = !long && span < 30;
  return (
    <button
      type="button"
      class={`gap${long ? " long" : ""}${tight ? " tight" : ""}${emptyDay ? " first" : ""}`}
      style={rowStyle(span)}
      title={long && fallbackName ? fallbackName : undefined}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = rect.height ? Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) : 0;
        onOpen(start + ratio * (end - start));
      }}
    >
      {long ? (
        <>
          <b>
            {clockFace(start)}–{clockFace(end)}
          </b>
          {fallbackName ? <i>{fallbackName}</i> : emptyDay ? <i>{t.clickFirst}</i> : null}
        </>
      ) : (
        <i>{tight ? `+ ${t.lengthOf(span)}` : `${clockFace(start)}–${clockFace(end)}`}</i>
      )}
    </button>
  );
}
