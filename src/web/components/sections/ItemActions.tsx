import type { RundownItem } from "../../../shared/types.ts";
import { useI18n } from "../../i18n.tsx";
import { canStepEpisode } from "../../utils/rundown/canStepEpisode.ts";
import { rowWatched } from "../../utils/rundown/rowWatched.ts";
import { StepIcon } from "../parts/StepIcon.tsx";

export function ItemActions({
  item,
  place,
  passed,
  canEdit,
  airing,
  live,
  played,
  busy,
  menuKey,
  onStep,
  onShuffle,
  onDone,
  onSkip,
  onMenu,
}: {
  item: RundownItem;
  place: string;
  passed: boolean;
  canEdit: boolean;
  airing: boolean;
  live: boolean;
  played: ReadonlySet<string>;
  busy: string | null;
  menuKey: string | null;
  onStep: (item: RundownItem, direction: "prev" | "next") => void;
  onShuffle: (item: RundownItem) => void;
  onDone: (item: RundownItem) => void;
  onSkip: (item: RundownItem) => void;
  onMenu: (key: string | null) => void;
}) {
  const { t } = useI18n();
  const done = rowWatched(item, played);
  const trackable = item.mode === "next-episode" || item.mode === "random-file";
  const canStep = canEdit && canStepEpisode(item, passed);
  const onAirMovie = item.mode === "random-file" && (airing || item.status === "playing");
  const canShuffle = canEdit && item.mode === "random-file" && (onAirMovie || !passed);
  const canDone = onAirMovie || (trackable && !done && !airing && item.status !== "playing");
  const earlier = passed || (live && item.status === "done");
  const canSkip = trackable && done && !airing && item.status !== "playing" && earlier;
  const hasMenu = canShuffle || canDone || canSkip;
  if (!canStep && !hasMenu) return null;
  const key = `${place}:${item.id}`;
  const open = menuKey === key;
  const pending =
    busy === item.id ||
    busy === `${item.id}:done` ||
    busy === `${item.id}:skipped` ||
    busy === `${item.id}:prev` ||
    busy === `${item.id}:next`;
  const upcoming = !passed && item.status !== "done" && item.status !== "skipped";
  const doneTip =
    item.mode === "next-episode"
      ? upcoming
        ? t.markDoneEpisode
        : t.markDoneEpisodeAired
      : upcoming
        ? t.markDoneMovie
        : t.markDoneMovieAired;
  const skipTip = item.mode === "next-episode" ? t.markSkippedEpisode : t.markSkippedMovie;
  function choose(action: () => void) {
    onMenu(null);
    action();
  }
  return (
    <div class="item-actions">
      {canStep && (
        <>
          <button
            type="button"
            class="item-step"
            data-tip={t.previousEpisodeLabel}
            aria-label={t.previousEpisodeLabel}
            disabled={pending}
            onClick={() => onStep(item, "prev")}
          >
            <StepIcon direction="prev" />
          </button>
          <button
            type="button"
            class="item-step"
            data-tip={t.nextEpisodeLabel}
            aria-label={t.nextEpisodeLabel}
            disabled={pending}
            onClick={() => onStep(item, "next")}
          >
            <StepIcon direction="next" />
          </button>
        </>
      )}
      {hasMenu && (
        <div class={`item-menu${open ? " open" : ""}`}>
          <button
            type="button"
            class="item-menu-toggle"
            aria-label={t.itemOptions}
            aria-expanded={open}
            aria-haspopup="menu"
            disabled={pending}
            onClick={() => onMenu(open ? null : key)}
          >
            <i />
            <i />
            <i />
          </button>
          {open && (
            <div class="item-menu-list" role="menu">
              {canShuffle && (
                <button type="button" role="menuitem" data-tip={t.shuffleHint} onClick={() => choose(() => onShuffle(item))}>
                  {t.shuffle}
                </button>
              )}
              {canDone && (
                <button type="button" role="menuitem" data-tip={doneTip} onClick={() => choose(() => onDone(item))}>
                  {t.markDone}
                </button>
              )}
              {canSkip && (
                <button type="button" role="menuitem" data-tip={skipTip} onClick={() => choose(() => onSkip(item))}>
                  {t.markSkipped}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
