import type { StateUpdater } from "preact/hooks";
import type { SlotLength } from "../../../shared/types.ts";
import {
  canonicalPlaylistUrl,
  parseYoutubeUrl,
} from "../../../shared/youtube.ts";
import { useI18n } from "../../i18n.tsx";
import { MANY_FILES } from "../../constants/manyFiles.ts";
import type { Draft } from "../../types/Draft.ts";
import type { FieldError } from "../../types/FieldError.ts";
import type { PlaySource } from "../../types/PlaySource.ts";
import { elapsedClock } from "@utils/clock/elapsedClock.ts";
import { endFromDuration } from "@utils/clock/endFromDuration.ts";
import { sourcePrompt } from "@utils/label/sourcePrompt.ts";
import { parentDir } from "@utils/source/parentDir.ts";
import { InfoButton } from "../buttons/InfoButton.tsx";
import { DurationPick } from "../inputs/DurationPick.tsx";
import { FolderPath } from "../inputs/FolderPath.tsx";
import { LengthMode } from "../inputs/LengthMode.tsx";
import { SourcePick } from "../inputs/SourcePick.tsx";
import { YoutubeField } from "../inputs/YoutubeField.tsx";
import { CloudHost } from "../parts/CloudHost.tsx";
import { FieldNote } from "../parts/FieldNote.tsx";
import { MeasureWait } from "../parts/MeasureWait.tsx";

export function SourceStep({
  draft,
  folderError,
  sourceMissing,
  picking,
  pathChosen,
  measuring,
  length,
  lengthMins,
  elapsedSec,
  fileCount,
  fixedMin,
  lengthCh,
  setDraft,
  setFieldError,
  stopMeasuring,
  onPickSource,
  onBrowse,
}: {
  draft: Draft;
  folderError: string | undefined;
  sourceMissing: boolean;
  picking: boolean;
  pathChosen: boolean;
  measuring: boolean;
  length: SlotLength | null;
  lengthMins: number;
  elapsedSec: number;
  fileCount: number;
  fixedMin: number | null;
  lengthCh: number;
  setDraft: (update: StateUpdater<Draft | null>) => void;
  setFieldError: (update: StateUpdater<FieldError>) => void;
  stopMeasuring: () => void;
  onPickSource: (source: PlaySource) => void;
  onBrowse: () => void;
}) {
  const { t } = useI18n();

  function changeYoutube(value: string) {
    setDraft(
      draft.mode === "specific-file"
        ? { ...draft, file: value, folder: "" }
        : { ...draft, folder: value, file: "" },
    );
    setFieldError((current) => ({ ...current, folder: undefined }));
  }

  function changePath(value: string) {
    setDraft(
      draft.mode === "specific-file"
        ? { ...draft, file: value, folder: parentDir(value) }
        : { ...draft, folder: value },
    );
    setFieldError((current) => ({ ...current, folder: undefined }));
  }

  function chooseLength(source: "fixed" | "longest") {
    if (source === "fixed") stopMeasuring();
    setDraft((current) => {
      if (!current) return current;
      if (source === "longest") {
        return current.lengthChoice === "longest"
          ? current
          : { ...current, lengthChoice: "longest", end: "" };
      }
      if (current.lengthChoice !== "longest") return current;
      const mins = 60;
      return {
        ...current,
        lengthChoice: mins,
        end: endFromDuration(current.start, mins * 60),
      };
    });
    setFieldError((current) => ({ ...current, time: undefined }));
  }

  if (draft.mode === "playlist") return null;
  return (
    <div class="folder-block">
      {(draft.mode === "specific-file" ||
        draft.mode === "next-episode" ||
        draft.mode === "random-file") && (
        <SourcePick
          mode={draft.mode}
          source={draft.source}
          onPick={onPickSource}
        />
      )}
      <span class="k">{sourcePrompt(draft.mode, draft.source, t)}</span>
      {draft.source === "youtube" ? (
        <YoutubeField
          value={draft.mode === "specific-file" ? draft.file : draft.folder}
          placeholder={
            draft.mode === "specific-file"
              ? t.youtubePlaceholder
              : t.youtubePlaylistPlaceholder
          }
          invalid={Boolean(folderError)}
          onChange={changeYoutube}
        />
      ) : (
        <FolderPath
          key={`${draft.mode}:${draft.source}`}
          kind={draft.mode === "specific-file" ? "video" : "folder"}
          value={draft.mode === "specific-file" ? draft.file : draft.folder}
          placeholder={
            draft.mode === "specific-file"
              ? t.videoPlaceholder
              : t.folderPlaceholder
          }
          invalid={sourceMissing || Boolean(folderError)}
          actionLabel={picking ? t.choosing : t.browse}
          actionBusy={picking}
          listLabel={draft.mode === "specific-file" ? t.video : t.folder}
          onChange={changePath}
          onAction={onBrowse}
        />
      )}
      {draft.source === "youtube" && draft.mode === "specific-file" && (
        <p class="mode-note">{t.youtubeCaveat}</p>
      )}
      {draft.source === "youtube" && draft.mode === "next-episode" && (
        <p class="mode-note">{t.youtubePlaylistNote}</p>
      )}
      {draft.source === "youtube" && draft.mode === "random-file" && (
        <p class="mode-note">{t.youtubeRandomNote}</p>
      )}
      {draft.source === "youtube" &&
        draft.mode === "specific-file" &&
        draft.file.trim() &&
        !parseYoutubeUrl(draft.file) &&
        !folderError && (
          <FieldNote>{t.error("Not a YouTube video URL")}</FieldNote>
        )}
      {draft.source === "youtube" &&
        draft.mode !== "specific-file" &&
        draft.folder.trim() &&
        !canonicalPlaylistUrl(draft.folder) &&
        !folderError && (
          <FieldNote>{t.error("Not a YouTube playlist URL")}</FieldNote>
        )}
      {sourceMissing && (
        <FieldNote>
          {draft.mode === "specific-file"
            ? t.sourceMissingVideo
            : t.sourceMissingFolder}
        </FieldNote>
      )}
      {!sourceMissing && folderError && (
        <FieldNote>{t.error(folderError)}</FieldNote>
      )}
      {pathChosen && (
        <>
          {draft.mode !== "next-episode" &&
            !(draft.mode === "specific-file" && draft.source === "youtube") && (
              <LengthMode
                legend={t.slotDuration}
                fixedOn={draft.lengthChoice !== "longest"}
                longestOn={draft.lengthChoice === "longest"}
                longestHint={t.findLongest}
                onFixed={() => chooseLength("fixed")}
                onLongest={() => chooseLength("longest")}
              />
            )}
          {(draft.mode === "specific-file" && draft.source === "youtube") ||
          draft.lengthChoice === "longest" ? (
            measuring && pathChosen ? (
              <MeasureWait
                label={
                  <>
                    <CloudHost>
                      <span class="measure-label">{t.measuringVideos}</span>
                      <span class="cloud" role="tooltip">
                        {t.elapsed(elapsedClock(elapsedSec))}
                      </span>
                    </CloudHost>
                    <InfoButton
                      label={t.whySlow}
                      tip={
                        draft.source === "youtube"
                          ? t.youtubeProbeCache
                          : t.probeCache
                      }
                    />
                  </>
                }
                note={
                  draft.mode === "random-file" && fileCount > MANY_FILES
                    ? t.manyFiles
                    : undefined
                }
              />
            ) : length ? (
              <div class="picked">
                <div>
                  <span class="k">{t.slotDuration}</span>
                  <span class="value">{t.slotDurationOf(lengthMins)}</span>
                </div>
                {draft.source === "youtube" &&
                  draft.mode === "specific-file" && (
                    <div>
                      <span class="k">{t.youtube}</span>
                      <span class="value">{length.title}</span>
                    </div>
                  )}
                {length.kind === "random" && (
                  <div>
                    <span class="k">{t.longestVideo}</span>
                    <span class="value">
                      {length.title} · {t.slotDurationOf(lengthMins)}
                    </span>
                  </div>
                )}
                {length.kind === "random" &&
                  length.shortest &&
                  length.shortest.path !== length.path && (
                    <div>
                      <span class="k">{t.shortestVideo}</span>
                      <span class="value">
                        {length.shortest.title} ·{" "}
                        {t.slotDurationOf(
                          Math.max(
                            1,
                            Math.ceil(length.shortest.durationSec / 60),
                          ),
                        )}
                      </span>
                    </div>
                  )}
              </div>
            ) : null
          ) : (
            <div class="fixed">
              <span class="k">{t.chooseLength}</span>
              <DurationPick
                lengthChoice={draft.lengthChoice}
                customMin={draft.customMin}
                lengthCh={lengthCh}
                onChoice={(value) =>
                  setDraft((current) =>
                    current ? { ...current, lengthChoice: value } : current,
                  )
                }
                onCustom={(value) =>
                  setDraft((current) =>
                    current ? { ...current, customMin: value } : current,
                  )
                }
              />
              {draft.lengthChoice === "custom" &&
                draft.customMin.trim() !== "" &&
                fixedMin === null && <FieldNote>{t.needMinutes}</FieldNote>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
