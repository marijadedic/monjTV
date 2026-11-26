import "./styles/SlotForm.css";
import type { StateUpdater } from "preact/hooks";
import type { Schedule, SlotLength, TvBoard } from "../../../shared/types.ts";
import { placedOn } from "../../../shared/placed.ts";
import { DAY_MINUTES } from "../../../shared/window.ts";
import { canonicalPlaylistUrl, parseYoutubeUrl } from "../../../shared/youtube.ts";
import { useI18n } from "../../i18n.tsx";
import type { Draft } from "../../types/Draft.ts";
import type { FieldError } from "../../types/FieldError.ts";
import { PRESETS } from "../../constants/presets.ts";
import type { PlaySource } from "../../types/PlaySource.ts";
import type { SlotOp } from "../../types/SlotOp.ts";
import { addFixedMinutes } from "../../utils/length/addFixedMinutes.ts";
import { addSeconds } from "../../utils/length/addSeconds.ts";
import { chosenSeconds } from "../../utils/length/chosenSeconds.ts";
import { dayClashes } from "../../utils/week/dayClashes.ts";
import { endFace } from "../../utils/clock/endFace.ts";
import { fixedMinutes } from "../../utils/length/fixedMinutes.ts";
import { measureKey } from "../../utils/length/measureKey.ts";
import { minuteFace } from "../../utils/clock/minuteFace.ts";
import { nextItemMinute } from "../../utils/playlist/nextItemMinute.ts";
import { stackItemNeedsProbe } from "../../utils/length/stackItemNeedsProbe.ts";
import { stackSeconds } from "../../utils/length/stackSeconds.ts";
import { startOnDraft } from "../../utils/week/startOnDraft.ts";
import { toMin } from "../../utils/clock/toMin.ts";
import { PlaylistNameField } from "../inputs/PlaylistNameField.tsx";
import { FieldNote } from "../parts/FieldNote.tsx";
import { StepTabs } from "../parts/StepTabs.tsx";
import { DeleteAsk } from "./DeleteAsk.tsx";
import { FormActions } from "./FormActions.tsx";
import { HowStep } from "./HowStep.tsx";
import { PlaylistStep } from "./PlaylistStep.tsx";
import { SlotFormHeader } from "./SlotFormHeader.tsx";
import { SlotNotices } from "./SlotNotices.tsx";
import { SlotSummary } from "./SlotSummary.tsx";
import { SourceStep } from "./SourceStep.tsx";
import { WhenEditor } from "./WhenEditor.tsx";

export function SlotForm({
  draft,
  schedule,
  board,
  titles,
  measured,
  measuring,
  fileCount,
  elapsedSec,
  sourceMissing,
  picking,
  slotOp,
  slotOpSlow,
  confirmRemove,
  slide,
  slideKey,
  formRef,
  draggingId,
  formErrorRef,
  fieldError,
  setDraft,
  setFieldError,
  setGapEdit,
  setGapError,
  setConfirmRemove,
  stopMeasuring,
  slideTo,
  onPickMode,
  onPickSource,
  onBrowse,
  onCommit,
  onCancel,
  onBack,
  onAdd,
  onNext,
  onKeep,
  onJump,
  onEditPart,
  onDelete,
}: {
  draft: Draft;
  schedule: Schedule;
  board: TvBoard | null;
  titles: Readonly<Record<string, string>>;
  measured: { key: string; length: SlotLength | null; error?: string } | null;
  measuring: boolean;
  fileCount: number;
  elapsedSec: number;
  sourceMissing: boolean;
  picking: "draft" | "fallback" | null;
  slotOp: SlotOp | null;
  slotOpSlow: boolean;
  confirmRemove: boolean;
  slide: string;
  slideKey: number;
  formRef: { current: HTMLFormElement | null };
  draggingId: { current: string | null };
  formErrorRef: { current: HTMLParagraphElement | null };
  fieldError: FieldError;
  setDraft: (update: StateUpdater<Draft | null>) => void;
  setFieldError: (update: StateUpdater<FieldError>) => void;
  setGapEdit: (value: { itemId: string; minutes: string } | null) => void;
  setGapError: (value: string | null) => void;
  setConfirmRemove: (value: boolean) => void;
  stopMeasuring: () => void;
  slideTo: (dir: "slide-next" | "slide-back") => void;
  onPickMode: (mode: Draft["mode"]) => void;
  onPickSource: (source: PlaySource) => void;
  onBrowse: () => void;
  onCommit: () => void;
  onCancel: () => void;
  onBack: () => void;
  onAdd: () => void;
  onNext: () => void;
  onKeep: () => void;
  onJump: (step: "how" | "when" | "what") => void;
  onEditPart: (step: "how" | "when" | "what" | "name") => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const matched = measured?.key === measureKey(draft) ? measured : null;
  const length = matched?.length ?? null;
  const lengthMins = length ? Math.ceil(length.durationSec / 60) : 0;
  const pathChosen =
    draft.mode === "playlist"
      ? draft.addSource === "youtube"
        ? draft.addMode === "specific-file"
          ? Boolean(parseYoutubeUrl(draft.addFile))
          : Boolean(canonicalPlaylistUrl(draft.addFolder))
        : draft.addMode === "specific-file"
          ? Boolean(draft.addFile.trim())
          : Boolean(draft.addFolder.trim())
      : draft.source === "youtube"
        ? draft.mode === "specific-file"
          ? Boolean(parseYoutubeUrl(draft.file))
          : Boolean(canonicalPlaylistUrl(draft.folder))
        : draft.mode === "specific-file"
          ? Boolean(draft.file.trim())
          : Boolean(draft.folder.trim());
  const stackSec = draft.mode === "playlist" ? stackSeconds(draft.items) : null;
  const addSec = draft.mode === "playlist" && pathChosen ? addSeconds(draft, matched) : null;
  const addStartMin = draft.mode === "playlist" && addSec != null ? nextItemMinute(draft.start, draft.items) : null;
  const addPreviewStart = addStartMin != null ? minuteFace(addStartMin) : undefined;
  const addEndMin = addStartMin != null && addSec != null ? addStartMin + Math.max(1, Math.ceil(addSec / 60)) : null;
  const addPreviewEnd = addEndMin != null ? minuteFace(addEndMin) : undefined;
  const addPreviewSpill = addEndMin != null && addEndMin > DAY_MINUTES;
  const stackBusy = draft.mode === "playlist" && draft.items.some(stackItemNeedsProbe);
  const activeSec = chosenSeconds(draft, matched) ?? 0;
  const fixedMin = draft.lengthChoice !== "longest" ? fixedMinutes(draft) : null;
  const clashes = activeSec ? dayClashes(draft, schedule.blocks, activeSec, titles, board) : [];
  const lengthLabels = [...PRESETS.map((mins) => t.minutes(mins)), t.customLength];
  const lengthCh = Math.max(...lengthLabels.map((label) => label.length));
  const addDisabled =
    draft.mode === "playlist"
      ? !draft.name.trim() || draft.items.length === 0 || Boolean(stackBusy) || draft.items.some((item) => Boolean(item.error))
      : sourceMissing
        ? true
        : draft.lengthChoice === "longest"
          ? measuring || !pathChosen || !length || Boolean(matched?.error)
          : !pathChosen || fixedMin === null;
  const formStep = draft.formStep;
  const addPhase = draft.addPhase;
  const editingPart = Boolean(draft.returnTo);
  const showHow = formStep === "how";
  const showWhen = formStep === "when";
  const showWhat = formStep === "what" && addPhase === "list";
  const showAddKind = formStep === "what" && addPhase === "kind";
  const showAddSource = formStep === "what" && addPhase === "source";
  const showSummary = formStep === "summary";
  const showBack = addPhase !== "list" || formStep === "when" || formStep === "what" || (editingPart && !showSummary);
  const addItemReady =
    draft.mode === "playlist" && addPhase === "source"
      ? draft.addMode === "random-file" && draft.addLengthChoice !== "longest"
        ? (draft.addSource === "youtube"
            ? Boolean(canonicalPlaylistUrl(draft.addFolder))
            : Boolean(draft.addFolder.trim())) && addFixedMinutes(draft) != null
        : Boolean(measured?.length && measured.key === measureKey(draft) && !measured.error)
      : false;
  const savedBlock = draft.id ? schedule.blocks.find((block) => block.id === draft.id) : undefined;
  const painted = savedBlock ? placedOn(savedBlock, draft.origin, board) : null;
  const summaryEnd =
    draft.mode === "playlist"
      ? stackSec != null
        ? endFace(draft.start, stackSec)
        : draft.end || (painted && startOnDraft(draft, draft.origin) === painted.start ? painted.end : "") || "/"
      : activeSec
        ? endFace(draft.start, activeSec)
        : draft.end;
  const summaryMin =
    draft.mode === "playlist" && stackSec != null
      ? Math.max(1, Math.ceil(stackSec / 60))
      : activeSec
        ? Math.max(1, Math.ceil(activeSec / 60))
        : fixedMin;
  const summaryLen =
    summaryMin != null && summaryMin > 0
      ? t.slotDurationOf(summaryMin)
      : summaryEnd && summaryEnd !== "/"
        ? t.slotDurationOf(Math.max(1, toMin(summaryEnd) - toMin(draft.start)))
        : "";

  return (
    <form
      ref={formRef}
      class={confirmRemove ? "add-form asking" : "add-form"}
      aria-busy={slotOp ? "true" : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (showSummary || (showWhat && !editingPart)) void onCommit();
      }}
    >
      <SlotFormHeader
        title={draft.id ? t.editSlot(t.dayName[draft.origin]) : t.newSlot(t.dayName[draft.origin])}
        mode={draft.mode}
        showModeEdit={showSummary && draft.mode !== "playlist"}
        onEditMode={() => onEditPart("how")}
        onDelete={draft.id ? () => setConfirmRemove(true) : undefined}
      />
      {!showSummary && !editingPart && <StepTabs step={formStep} onJump={onJump} />}
      <div key={slideKey} class={slide ? `step-body ${slide}` : "step-body"}>
        {showSummary && (
          <SlotSummary
            draft={draft}
            titles={titles}
            end={summaryEnd}
            lengthLabel={summaryLen}
            onEditTitle={() => onEditPart(draft.mode === "playlist" ? "name" : "what")}
            onEditWhen={() => onEditPart("when")}
            onEditVideos={() => onEditPart("what")}
          />
        )}
        {formStep === "name" && (
          <PlaylistNameField
            value={draft.name}
            invalid={Boolean(fieldError.folder) && !draft.name.trim()}
            onInput={(value) => {
              setDraft({ ...draft, name: value });
              setFieldError((current) => ({ ...current, folder: undefined }));
            }}
          />
        )}
        {showHow && <HowStep mode={draft.mode} onPick={onPickMode} />}
        {(showWhat || ((showAddKind || showAddSource) && draft.mode === "playlist")) && draft.mode === "playlist" ? (
          <PlaylistStep
            draft={draft}
            editingPart={editingPart}
            showWhat={showWhat}
            showAddKind={showAddKind}
            showAddSource={showAddSource}
            folderError={fieldError.folder}
            picking={picking === "draft"}
            measuring={measuring}
            pathChosen={pathChosen}
            length={length}
            lengthMins={lengthMins}
            addPreviewStart={addPreviewStart}
            addPreviewEnd={addPreviewEnd}
            addPreviewSpill={addPreviewSpill}
            addSec={addSec}
            matchedError={matched?.error ?? null}
            noVideo={Boolean(pathChosen && !measuring && matched && !length && !matched.error)}
            lengthCh={lengthCh}
            stackSec={stackSec}
            titles={titles}
            draggingId={draggingId}
            formRef={formRef}
            setDraft={setDraft}
            setFieldError={setFieldError}
            setGapEdit={setGapEdit}
            setGapError={setGapError}
            stopMeasuring={stopMeasuring}
            slideTo={slideTo}
            onPickSource={onPickSource}
            onBrowse={onBrowse}
          />
        ) : showWhat ? (
          <SourceStep
            draft={draft}
            folderError={fieldError.folder}
            sourceMissing={sourceMissing}
            picking={picking === "draft"}
            pathChosen={pathChosen}
            measuring={measuring}
            length={length}
            lengthMins={lengthMins}
            elapsedSec={elapsedSec}
            fileCount={fileCount}
            fixedMin={fixedMin}
            lengthCh={lengthCh}
            setDraft={setDraft}
            setFieldError={setFieldError}
            stopMeasuring={stopMeasuring}
            onPickSource={onPickSource}
            onBrowse={onBrowse}
          />
        ) : null}
        {showWhen && (
          <WhenEditor
            draft={draft}
            clashes={clashes}
            blocks={schedule.blocks}
            board={board}
            activeSec={activeSec}
            measured={measured}
            setDraft={setDraft}
            setFieldError={setFieldError}
          />
        )}
        <SlotNotices
          warn={(showWhat || showSummary) && clashes[0] ? clashes[0] : null}
          noVideo={
            draft.mode !== "playlist" &&
            draft.lengthChoice === "longest" &&
            !measuring &&
            pathChosen &&
            Boolean(matched) &&
            !length &&
            !matched?.error
          }
          probeError={draft.mode !== "playlist" && matched?.error ? matched.error : null}
          timeError={fieldError.time}
        />
      </div>
      <FormActions
        busy={slotOp !== null}
        showCancel={addPhase === "list"}
        showBack={showBack}
        showAdd={showAddSource}
        addDisabled={!addItemReady || slotOp !== null}
        showNext={showWhen && !editingPart}
        nextDisabled={clashes.length > 0 || slotOp !== null}
        showSave={showSummary || (showWhat && !editingPart)}
        existing={Boolean(draft.id)}
        saveWorking={slotOp === "save"}
        saveBusy={Boolean(slotOpSlow && slotOp === "save")}
        saveDisabled={addDisabled || clashes.length > 0 || slotOp !== null}
        showKeep={editingPart && !showSummary && addPhase === "list"}
        onCancel={onCancel}
        onBack={onBack}
        onAdd={onAdd}
        onNext={onNext}
        onKeep={onKeep}
      />
      {fieldError.form && (
        <FieldNote nodeRef={formErrorRef} alert>
          {t.error(fieldError.form)}
        </FieldNote>
      )}
      {confirmRemove && (
        <DeleteAsk
          working={slotOp === "remove"}
          busy={Boolean(slotOpSlow && slotOp === "remove")}
          disabled={slotOp !== null}
          onKeep={() => setConfirmRemove(false)}
          onDelete={() => void onDelete()}
        />
      )}
    </form>
  );
}
