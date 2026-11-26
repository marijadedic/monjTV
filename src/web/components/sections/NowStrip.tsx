import "./styles/NowStrip.css";
import type { RundownItem } from "../../../shared/types.ts";
import { useI18n } from "../../i18n.tsx";
import { gapStillSrc } from "../../utils/rundown/gapStillSrc.ts";
import { scheduleMode } from "../../utils/rundown/scheduleMode.ts";
import { scheduleSource } from "../../utils/rundown/scheduleSource.ts";
import { showsFrame } from "../../utils/rundown/showsFrame.ts";
import { stillSrc } from "../../utils/rundown/stillSrc.ts";
import { ItemActions } from "./ItemActions.tsx";
import { Pill } from "../parts/Pill.tsx";
import { StillFrame } from "../parts/StillFrame.tsx";

export function NowStrip({
  air,
  fraction,
  gapTitle,
  gapFile,
  missed,
  next,
  waitingUntil,
  running,
  busy,
  played,
  menuKey,
  onHideStill,
  onStep,
  onShuffle,
  onDone,
  onSkip,
  onMenu,
  onStart,
}: {
  air: RundownItem | null;
  fraction: number;
  gapTitle: string | null;
  gapFile: string | null;
  missed: Record<string, true>;
  next: RundownItem | null;
  waitingUntil: string | null;
  running: boolean;
  busy: string | null;
  played: ReadonlySet<string>;
  menuKey: string | null;
  onHideStill: (filePath: string) => void;
  onStep: (item: RundownItem, direction: "prev" | "next") => void;
  onShuffle: (item: RundownItem) => void;
  onDone: (item: RundownItem) => void;
  onSkip: (item: RundownItem) => void;
  onMenu: (key: string | null) => void;
  onStart: () => void;
}) {
  const { t } = useI18n();
  const stripStill = air && showsFrame(air) && !missed[air.path] ? air : null;
  const gapPath = gapFile && !missed[gapFile] ? gapFile : null;
  return (
    <div class={`now-strip${stripStill || gapPath ? " has-still" : ""}`}>
      {stripStill && <StillFrame src={stillSrc(stripStill)} onError={() => onHideStill(stripStill.path)} />}
      {gapPath && <StillFrame src={gapStillSrc(gapPath)} onError={() => onHideStill(gapPath)} />}
      <div>
        {air ? (
          <>
            <Pill tone="on-air">{t.onAir}</Pill>
            <h2 class="strip-title">{air.title}</h2>
            <div class="muted" title={air.path}>
              {air.start}–{air.end} · {scheduleMode(air.mode, t)} · {scheduleSource(air, t)}
            </div>
            <div
              class="track"
              role="progressbar"
              aria-valuenow={Math.round(fraction * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t.progress}
            >
              <i style={{ width: `${fraction * 100}%` }} />
            </div>
          </>
        ) : gapTitle ? (
          <>
            <Pill tone="gap">{t.intermission}</Pill>
            <h2 class="strip-title">{gapTitle}</h2>
            {next && (
              <p class="will-line">
                <span class="next-plain">{t.nextMark}</span>
                <b>
                  {next.title} · {next.start}
                </b>
              </p>
            )}
          </>
        ) : (
          <>
            <h2 class="strip-title">{t.nothingOn}</h2>
            {next ? (
              <div class="muted">{t.startsAt(next.title, next.start)}</div>
            ) : (
              waitingUntil && <div class="muted">{t.nextAt(waitingUntil)}</div>
            )}
          </>
        )}
      </div>
      <div class="now-actions">
        {air && (
          <ItemActions
            item={air}
            place="strip"
            passed={false}
            canEdit
            airing
            live
            played={played}
            busy={busy}
            menuKey={menuKey}
            onStep={onStep}
            onShuffle={onShuffle}
            onDone={onDone}
            onSkip={onSkip}
            onMenu={onMenu}
          />
        )}
        <button class="primary" onClick={onStart} disabled={busy === "start"}>
          {running ? t.playNow : t.startTv}
        </button>
      </div>
    </div>
  );
}
