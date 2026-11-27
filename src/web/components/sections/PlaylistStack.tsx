import "./styles/PlaylistStack.css";
import "./styles/PlaylistStack.list.css";
import { Fragment } from "preact";
import type { Day } from "../../../shared/types.ts";
import { nextDay } from "../../../shared/window.ts";
import { useI18n } from "../../i18n.tsx";
import type { DraftItem } from "../../types/DraftItem.ts";
import { endFace } from "@utils/clock/endFace.ts";
import { gapOf } from "@utils/playlist/gapOf.ts";
import { itemLabel } from "@utils/label/itemLabel.ts";
import { spillsPastDay } from "@utils/week/spillsPastDay.ts";
import { stackClocks } from "@utils/playlist/stackClocks.ts";
import { stackItemLine } from "@utils/playlist/stackItemLine.ts";
import { blurCloud, showCloud } from "@utils/tip/cloud.ts";
import { CloseButton } from "../buttons/CloseButton.tsx";
import { CloudHost } from "../parts/CloudHost.tsx";
import { PlaylistWhen } from "../parts/PlaylistWhen.tsx";

export function PlaylistStack({
  items,
  start,
  stackSec,
  origin,
  titles,
  draggingId,
  onAdd,
  onMove,
  onRemove,
  onGap,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  items: DraftItem[];
  start: string;
  stackSec: number | null;
  origin: Day;
  titles: Readonly<Record<string, string>>;
  draggingId: { current: string | null };
  onAdd: () => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onRemove: (id: string) => void;
  onGap: (item: DraftItem) => void;
  onDragStart: (
    id: string,
    transfer: DataTransfer | null,
    element: HTMLElement,
  ) => void;
  onDragEnd: () => void;
  onDragOver: (id: string, element: HTMLElement, after: boolean) => void;
  onDrop: (id: string, after: boolean) => void;
}) {
  const { t } = useI18n();
  const clocks = stackClocks(start, items);
  const end =
    stackSec != null
      ? `${endFace(start, stackSec)}${spillsPastDay(start, stackSec) ? ` ${t.day[nextDay(origin)]}` : ""}`
      : "/";
  return (
    <>
      <span class="k stack-head">{t.playlistStack}</span>
      {items.length > 0 && (
        <p class="tally">
          {t.videoCount(items.length)}
          {stackSec != null && (
            <> · {t.slotDurationOf(Math.max(1, Math.ceil(stackSec / 60)))}</>
          )}
          <span class="slash">/</span>
          {t.startsMark} · {start} - {t.endsMark} · {end}
        </p>
      )}
      <button type="button" class="wide" onClick={onAdd}>
        {t.addToPlaylist}
      </button>
      {items.length === 0 ? (
        <p class="mode-note">{t.playlistEmpty}</p>
      ) : (
        <ol class="playlist">
          {items.map((item, index) => {
            const clock = clocks[index];
            const gap = gapOf(item);
            return (
              <Fragment key={item.id}>
                <li
                  class="playlist-item"
                  draggable
                  onDragStart={(event) => {
                    onDragStart(
                      item.id,
                      event.dataTransfer,
                      event.currentTarget,
                    );
                  }}
                  onDragEnd={onDragEnd}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (event.dataTransfer)
                      event.dataTransfer.dropEffect = "move";
                    if (draggingId.current === item.id) return;
                    const rect = (
                      event.currentTarget as HTMLElement
                    ).getBoundingClientRect();
                    onDragOver(
                      item.id,
                      event.currentTarget,
                      event.clientY > rect.top + rect.height / 2,
                    );
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const rect = (
                      event.currentTarget as HTMLElement
                    ).getBoundingClientRect();
                    onDrop(item.id, event.clientY > rect.top + rect.height / 2);
                  }}
                >
                  <PlaylistWhen start={clock.start} end={clock.end} />
                  <div class="playlist-copy">
                    <b>{itemLabel(item, titles)}</b>
                    <span>{stackItemLine(item, t)}</span>
                  </div>
                  <div
                    class="playlist-tools"
                    onMouseDown={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      disabled={index === 0}
                      aria-label={t.moveUp}
                      title={t.moveUp}
                      onClick={() => onMove(item.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={index === items.length - 1}
                      aria-label={t.moveDown}
                      title={t.moveDown}
                      onClick={() => onMove(item.id, 1)}
                    >
                      ↓
                    </button>
                    <CloseButton
                      label={t.remove}
                      title={t.remove}
                      onClick={() => onRemove(item.id)}
                    />
                  </div>
                </li>
                {index < items.length - 1 && (
                  <li
                    class="playlist-gap"
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (event.dataTransfer)
                        event.dataTransfer.dropEffect = "move";
                      if (draggingId.current === item.id) return;
                      onDragOver(item.id, event.currentTarget, true);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      onDrop(item.id, true);
                    }}
                  >
                    <hr />
                    {gap > 0 ? (
                      <span class="gap-mins">{t.minutes(gap)}</span>
                    ) : null}
                    <CloudHost>
                      <button
                        type="button"
                        class={gap > 0 ? "gap-plus on" : "gap-plus"}
                        aria-label={t.playlistGapAdd}
                        onFocus={showCloud}
                        onBlur={blurCloud}
                        onClick={() => onGap(item)}
                      >
                        +
                      </button>
                      <span class="cloud" role="tooltip">
                        {t.playlistGapTip}
                      </span>
                    </CloudHost>
                  </li>
                )}
              </Fragment>
            );
          })}
        </ol>
      )}
    </>
  );
}
