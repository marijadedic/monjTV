import type { StateUpdater } from "preact/hooks";
import type { ItemMode, SlotLength } from "../../../shared/types.ts";
import { nextDay } from "../../../shared/window.ts";
import { canonicalPlaylistUrl, isYoutubeLink, isYoutubeUrl, parseYoutubeUrl } from "../../../shared/youtube.ts";
import { ADD_MODES } from "../../constants/addModes.ts";
import { useI18n } from "../../i18n.tsx";
import type { Draft } from "../../types/Draft.ts";
import type { DraftItem } from "../../types/DraftItem.ts";
import type { FieldError } from "../../types/FieldError.ts";
import type { PlaySource } from "../../types/PlaySource.ts";
import { addFixedMinutes } from "@utils/length/addFixedMinutes.ts";
import { dismissTip } from "@utils/tip/cloud.ts";
import { gapOf } from "@utils/playlist/gapOf.ts";
import { parentDir } from "@utils/source/parentDir.ts";
import { modeClass } from "@utils/label/modeClass.ts";
import { modeHint } from "@utils/label/modeHint.ts";
import { modeLabel } from "@utils/label/modeLabel.ts";
import { youtubeAddNote } from "@utils/label/youtubeAddNote.ts";
import { InfoButton } from "../buttons/InfoButton.tsx";
import { DurationPick } from "../inputs/DurationPick.tsx";
import { FolderPath } from "../inputs/FolderPath.tsx";
import { LengthMode } from "../inputs/LengthMode.tsx";
import { ModeList } from "../inputs/ModeList.tsx";
import { SourcePick } from "../inputs/SourcePick.tsx";
import { YoutubeField } from "../inputs/YoutubeField.tsx";
import { FieldNote } from "../parts/FieldNote.tsx";
import { MeasureWait } from "../parts/MeasureWait.tsx";
import { PlaylistNameField } from "../inputs/PlaylistNameField.tsx";
import { PlaylistStack } from "./PlaylistStack.tsx";

export function PlaylistStep({
  draft,
  editingPart,
  showWhat,
  showAddKind,
  showAddSource,
  folderError,
  picking,
  measuring,
  pathChosen,
  length,
  lengthMins,
  addPreviewStart,
  addPreviewEnd,
  addPreviewSpill,
  addSec,
  matchedError,
  noVideo,
  lengthCh,
  stackSec,
  titles,
  draggingId,
  formRef,
  setDraft,
  setFieldError,
  setGapEdit,
  setGapError,
  stopMeasuring,
  slideTo,
  onPickSource,
  onBrowse,
}: {
  draft: Draft;
  editingPart: boolean;
  showWhat: boolean;
  showAddKind: boolean;
  showAddSource: boolean;
  folderError: string | undefined;
  picking: boolean;
  measuring: boolean;
  pathChosen: boolean;
  length: SlotLength | null;
  lengthMins: number;
  addPreviewStart: string | undefined;
  addPreviewEnd: string | undefined;
  addPreviewSpill: boolean;
  addSec: number | null;
  matchedError: string | null;
  noVideo: boolean;
  lengthCh: number;
  stackSec: number | null;
  titles: Readonly<Record<string, string>>;
  draggingId: { current: string | null };
  formRef: { current: HTMLFormElement | null };
  setDraft: (update: StateUpdater<Draft | null>) => void;
  setFieldError: (update: StateUpdater<FieldError>) => void;
  setGapEdit: (value: { itemId: string; minutes: string } | null) => void;
  setGapError: (value: string | null) => void;
  stopMeasuring: () => void;
  slideTo: (dir: "slide-next" | "slide-back") => void;
  onPickSource: (source: PlaySource) => void;
  onBrowse: () => void;
}) {
  const { t } = useI18n();

  function changeName(value: string) {
    setDraft({ ...draft, name: value });
    setFieldError((current) => ({ ...current, folder: undefined }));
  }

  function beginAdd() {
    slideTo("slide-next");
    setDraft((current) => (current ? { ...current, addPhase: "kind" } : current));
  }

  function moveItem(id: string, dir: -1 | 1) {
    setDraft((current) => {
      if (!current) return current;
      const index = current.items.findIndex((item) => item.id === id);
      const swap = index + dir;
      if (index < 0 || swap < 0 || swap >= current.items.length) return current;
      const items = [...current.items];
      const [row] = items.splice(index, 1);
      items.splice(swap, 0, row);
      return { ...current, items };
    });
  }

  function clearDrag() {
    draggingId.current = null;
    formRef.current
      ?.querySelectorAll(".playlist-item.dragging, .playlist-item.over-before, .playlist-item.over-after, .playlist-gap.over")
      .forEach((el) => el.classList.remove("dragging", "over-before", "over-after", "over"));
  }

  function markDrop(target: HTMLElement, after: boolean) {
    const root = formRef.current;
    if (!root) return;
    root.querySelectorAll(".playlist-item.over-before, .playlist-item.over-after, .playlist-gap.over").forEach((el) => {
      el.classList.remove("over-before", "over-after", "over");
    });
    target.classList.add(target.classList.contains("playlist-gap") ? "over" : after ? "over-after" : "over-before");
  }

  function dropItem(targetId: string, after: boolean) {
    const id = draggingId.current;
    if (!id) return;
    clearDrag();
    setDraft((current) => {
      if (!current || !id || id === targetId) return current;
      const items = [...current.items];
      const from = items.findIndex((item) => item.id === id);
      if (from < 0) return current;
      const [row] = items.splice(from, 1);
      let to = items.findIndex((item) => item.id === targetId);
      if (!row || to < 0) return current;
      if (after) to += 1;
      items.splice(to, 0, row);
      return { ...current, items };
    });
  }

  function removeItem(id: string) {
    setDraft((current) => (current ? { ...current, items: current.items.filter((item) => item.id !== id) } : current));
  }

  function pickMode(mode: ItemMode) {
    if (mode === "random-file") stopMeasuring();
    slideTo("slide-next");
    const keepList = mode !== "specific-file" && draft.addMode !== "specific-file";
    setDraft({
      ...draft,
      addMode: mode,
      addSource: keepList ? draft.addSource : "path",
      addFolder: mode === "specific-file" || (!keepList && isYoutubeLink(draft.addFolder)) ? "" : draft.addFolder,
      addFile: mode === "specific-file" && !isYoutubeUrl(draft.addFile) ? draft.addFile : "",
      addLengthChoice: mode === "random-file" ? 60 : "longest",
      addPhase: "source",
    });
  }

  function changeYoutube(value: string) {
    setDraft(
      draft.addMode === "specific-file"
        ? { ...draft, addFile: value, addFolder: "" }
        : { ...draft, addFolder: value, addFile: "" },
    );
    setFieldError((current) => ({ ...current, folder: undefined }));
  }

  function changePath(value: string) {
    setDraft(
      draft.addMode === "specific-file"
        ? { ...draft, addFile: value, addFolder: parentDir(value) }
        : { ...draft, addFolder: value },
    );
    setFieldError((current) => ({ ...current, folder: undefined }));
  }

  function chooseCap(source: "fixed" | "longest") {
    if (source === "fixed") stopMeasuring();
    setDraft((current) => {
      if (!current) return current;
      if (source === "longest") {
        return current.addLengthChoice === "longest" ? current : { ...current, addLengthChoice: "longest" };
      }
      if (current.addLengthChoice !== "longest") return current;
      return { ...current, addLengthChoice: 60 };
    });
  }

  function openGap(item: DraftItem) {
    dismissTip();
    setGapError(null);
    setGapEdit({ itemId: item.id, minutes: gapOf(item) ? String(gapOf(item)) : "" });
  }

  if (draft.mode !== "playlist") return null;
  const nameInvalid = Boolean(folderError) && !draft.name.trim();
  return (
    <div class="folder-block">
      {showWhat && (
        <>
          {!editingPart && (
            <PlaylistNameField value={draft.name} invalid={nameInvalid} onInput={changeName} />
          )}
          <PlaylistStack
            items={draft.items}
            start={draft.start}
            stackSec={stackSec}
            origin={draft.origin}
            titles={titles}
            draggingId={draggingId}
            onAdd={beginAdd}
            onMove={moveItem}
            onRemove={removeItem}
            onGap={openGap}
            onDragStart={(id, transfer, element) => {
              draggingId.current = id;
              transfer?.setData("text/plain", id);
              if (transfer) transfer.effectAllowed = "move";
              element.classList.add("dragging");
            }}
            onDragEnd={clearDrag}
            onDragOver={(_id, element, after) => markDrop(element, after)}
            onDrop={dropItem}
          />
        </>
      )}
      {(showAddKind || showAddSource) && (
        <div class="add-next">
          {showAddKind && (
            <ModeList
              label={t.addToPlaylist}
              modes={ADD_MODES}
              selected={draft.addMode}
              classFor={modeClass}
              titleFor={(mode) => modeLabel(mode, t)}
              hintFor={(mode) => modeHint(mode, t)}
              onPick={pickMode}
            />
          )}
          {showAddSource && (
            <>
              <SourcePick mode={draft.addMode} source={draft.addSource} onPick={onPickSource} />
              {draft.addSource === "youtube" && (
                <p class="mode-note">
                  {youtubeAddNote(draft.addMode, t)}
                </p>
              )}
              {draft.addSource === "youtube" ? (
                <YoutubeField
                  value={draft.addMode === "specific-file" ? draft.addFile : draft.addFolder}
                  placeholder={
                    draft.addMode === "specific-file" ? t.youtubePlaceholder : t.youtubePlaylistPlaceholder
                  }
                  invalid={Boolean(folderError)}
                  onChange={changeYoutube}
                />
              ) : (
                <FolderPath
                  key={draft.addMode}
                  kind={draft.addMode === "specific-file" ? "video" : "folder"}
                  value={draft.addMode === "specific-file" ? draft.addFile : draft.addFolder}
                  placeholder={draft.addMode === "specific-file" ? t.videoPlaceholder : t.folderPlaceholder}
                  invalid={Boolean(folderError)}
                  actionLabel={picking ? t.choosing : t.browse}
                  actionBusy={picking}
                  listLabel={draft.addMode === "specific-file" ? t.video : t.folder}
                  onChange={changePath}
                  onAction={onBrowse}
                />
              )}
              {draft.addSource === "youtube" &&
                draft.addMode === "specific-file" &&
                draft.addFile.trim() &&
                !parseYoutubeUrl(draft.addFile) && (
                  <FieldNote>{t.error("Not a YouTube video URL")}</FieldNote>
                )}
              {draft.addSource === "youtube" &&
                draft.addMode !== "specific-file" &&
                draft.addFolder.trim() &&
                !canonicalPlaylistUrl(draft.addFolder) && (
                  <FieldNote>{t.error("Not a YouTube playlist URL")}</FieldNote>
                )}
              {measuring && pathChosen && !(draft.addMode === "random-file" && draft.addLengthChoice !== "longest") ? (
                <MeasureWait label={<span class="measure-label">{t.measuringVideos}</span>} />
              ) : addPreviewEnd ? (
                <div class="picked">
                  <div>
                    <span class="k">{t.videoDuration}</span>
                    <span class="value">
                      {length && (draft.addSource === "youtube" || draft.addMode === "random-file") && length.title
                        ? `${length.title} · ${t.slotDurationOf(lengthMins)}`
                        : t.slotDurationOf(Math.max(1, Math.ceil((addSec ?? 0) / 60)))}
                    </span>
                  </div>
                  <p class="when-note">
                    {t.startsMark} · {addPreviewStart} · {t.endsMark} · {addPreviewEnd}
                    {addPreviewSpill ? ` ${t.day[nextDay(draft.origin)]}` : ""}
                  </p>
                </div>
              ) : null}
              {matchedError && <FieldNote>{t.error(matchedError)}</FieldNote>}
              {noVideo && <FieldNote>{t.noVideo}</FieldNote>}
              {pathChosen && draft.addMode === "random-file" && (
                <LengthMode
                  legend={t.playlistRandomCap}
                  fixedOn={draft.addLengthChoice !== "longest"}
                  longestOn={draft.addLengthChoice === "longest"}
                  onFixed={() => chooseCap("fixed")}
                  onLongest={() => chooseCap("longest")}
                  info={
                    draft.addLengthChoice === "longest" ? (
                      <InfoButton label={t.playlistRandomCap} tip={t.playlistLongestHint} />
                    ) : undefined
                  }
                />
              )}
              {pathChosen && draft.addMode === "random-file" && draft.addLengthChoice !== "longest" && (
                <div class="fixed">
                  <span class="k">{t.playlistRandomCap}</span>
                  <DurationPick
                    lengthChoice={draft.addLengthChoice}
                    customMin={draft.addCustomMin}
                    lengthCh={lengthCh}
                    tip={t.playlistRandomHint}
                    onChoice={(value) =>
                      setDraft((current) => (current ? { ...current, addLengthChoice: value } : current))
                    }
                    onCustom={(value) =>
                      setDraft((current) => (current ? { ...current, addCustomMin: value } : current))
                    }
                  />
                  {draft.addLengthChoice === "custom" &&
                    draft.addCustomMin.trim() !== "" &&
                    addFixedMinutes(draft) === null && <FieldNote>{t.needMinutes}</FieldNote>}
                </div>
              )}
              {draft.addMode === "next-episode" && pathChosen && (
                <InfoButton label={t.playlistNextHint} tip={t.playlistNextHint} />
              )}
              {folderError && <FieldNote>{t.error(folderError)}</FieldNote>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
