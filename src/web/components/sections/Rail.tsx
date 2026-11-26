import "./styles/Rail.css";
import { Fragment, type ComponentChildren } from "preact";
import type { ItemStatus, RundownItem } from "../../../shared/types.ts";
import { itemHasPassed } from "../../../shared/window.ts";
import { useI18n } from "../../i18n.tsx";
import { beganPreviousDay } from "../../utils/rundown/beganPreviousDay.ts";
import { rowWatched } from "../../utils/rundown/rowWatched.ts";
import { scheduleMode } from "../../utils/rundown/scheduleMode.ts";
import { scheduleSource } from "../../utils/rundown/scheduleSource.ts";
import { showsFrame } from "../../utils/rundown/showsFrame.ts";
import { statusPill } from "../../utils/rundown/statusPill.ts";
import { stillSrc } from "../../utils/rundown/stillSrc.ts";
import { ItemActions } from "./ItemActions.tsx";
import { Pill } from "../parts/Pill.tsx";
import { StillFrame } from "../parts/StillFrame.tsx";

export function RailCard({
  item,
  past,
  live,
  sec,
  played,
  missed,
  airId,
  gapTitle,
  nextId,
  heldId,
  fromDay,
  menuKey,
  busy,
  onHideStill,
  onStep,
  onShuffle,
  onDone,
  onSkip,
  onMenu,
}: {
  item: RundownItem;
  past: boolean;
  live: boolean;
  sec: number;
  played: ReadonlySet<string>;
  missed: Record<string, true>;
  airId: string | null;
  gapTitle: string | null;
  nextId: string | null;
  heldId: string | null;
  fromDay: string;
  menuKey: string | null;
  busy: string | null;
  onHideStill: (filePath: string) => void;
  onStep: (item: RundownItem, direction: "prev" | "next") => void;
  onShuffle: (item: RundownItem) => void;
  onDone: (item: RundownItem) => void;
  onSkip: (item: RundownItem) => void;
  onMenu: (key: string | null) => void;
}) {
  const { t } = useI18n();
  const passed = past || (live && itemHasPassed(item, sec));
  const shown: ItemStatus = past
    ? item.mode === "next-episode"
      ? item.status === "done"
        ? "done"
        : "skipped"
      : item.mode === "random-file"
        ? rowWatched(item, played)
          ? "done"
          : "skipped"
        : "done"
    : item.status;
  const canEdit = !past && (live || !item.overnight);
  const cardStill = showsFrame(item) && !missed[item.path];
  const airing = Boolean(live && airId === item.id);
  const coming = Boolean(live && gapTitle && nextId === item.id);
  const wontStart = Boolean(live && heldId === item.id);
  const carriedRow = !past && Boolean(item.overnight);
  const started = carriedRow && beganPreviousDay(item);
  return (
    <div class={`rail-item ${shown}${airing ? " playing" : ""}${passed ? " passed" : ""}${carriedRow ? " carry-row" : ""}`}>
      <i class="dot" />
      <article
        class={`card ${shown}${airing ? " playing" : ""}${passed ? " passed" : ""}${cardStill ? " has-still" : ""}${menuKey === `card:${item.id}` ? " menu-open" : ""}`}
      >
        {cardStill && <StillFrame src={stillSrc(item)} onError={() => onHideStill(item.path)} />}
        <div class="time">
          {item.start}–{item.end}
        </div>
        <div>
          <div class="title-row">
            {coming && <span class="next-plain">{t.nextMark}</span>}
            <div class="title">{item.title}</div>
            {airing && <Pill tone="on-air">{t.onAir}</Pill>}
            {shown !== "planned" && shown !== "playing" && !airing && <Pill tone={shown}>{statusPill(shown, t)}</Pill>}
          </div>
          <div class="muted" title={item.path}>
            {scheduleMode(item.mode, t)} · {scheduleSource(item, t)}
            {started ? ` · ${t.startedDay(fromDay)}` : ""}
            {wontStart ? ` · ${t.willNotStart}` : ""}
          </div>
        </div>
        <ItemActions
          item={item}
          place="card"
          passed={passed}
          canEdit={canEdit}
          airing={airing}
          live={live}
          played={played}
          busy={busy}
          menuKey={menuKey}
          onStep={onStep}
          onShuffle={onShuffle}
          onDone={onDone}
          onSkip={onSkip}
          onMenu={onMenu}
        />
      </article>
    </div>
  );
}

export function Rail({
  carried,
  ownItems,
  fromDay,
  card,
}: {
  carried: { id: string; until: string; rows: RundownItem[] }[];
  ownItems: RundownItem[];
  fromDay: string;
  card: (item: RundownItem) => ComponentChildren;
}) {
  const { t } = useI18n();
  return (
    <div class="rail">
      {carried.map((group) => (
        <Fragment key={group.id}>
          <div class="carry">{t.fromDayUntil(fromDay, group.until)}</div>
          {group.rows.map((item) => card(item))}
        </Fragment>
      ))}
      {carried.length > 0 && ownItems.length > 0 ? <hr class="rail-split" /> : null}
      {ownItems.map((item) => card(item))}
    </div>
  );
}
