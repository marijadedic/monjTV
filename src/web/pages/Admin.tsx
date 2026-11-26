import "./styles/admin/controls.css";
import "./styles/admin/week.css";
import "./styles/admin/mode.css";
import "./styles/admin/chips.css";
import "./styles/admin/narrow.css";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  DAYS,
  type BlockMode,
  type Day,
  type IntermissionItem,
  type IntermissionKind,
  type Schedule,
  type ScheduleBlock,
  type SlotLength,
  type SlotMiss,
  type TvBoard,
} from "../../shared/types.ts";
import { BUSY_SPIN_MS } from "../constants/busySpinMs.ts";
import { WEEKDAY } from "../constants/weekday.ts";
import { api } from "../api.ts";
import { useI18n } from "../i18n.tsx";
import type { Draft } from "../types/Draft.ts";
import type { FieldError } from "../types/FieldError.ts";
import type { PlaySource } from "../types/PlaySource.ts";
import type { SlotOp } from "../types/SlotOp.ts";
import { addedStack } from "./utils/admin/draft/addedStack.ts";
import { draftEnd } from "./utils/admin/draft/draftEnd.ts";
import { gapDraft } from "./utils/admin/draft/gapDraft.ts";
import { gapMinutes } from "./utils/admin/draft/gapMinutes.ts";
import { modeDraft } from "./utils/admin/draft/modeDraft.ts";
import { pickedPath } from "./utils/admin/draft/pickedPath.ts";
import { playSourceDraft } from "./utils/admin/draft/playSourceDraft.ts";
import { slotDraft } from "./utils/admin/draft/slotDraft.ts";
import { withGap } from "./utils/admin/draft/withGap.ts";
import { withoutGap } from "./utils/admin/draft/withoutGap.ts";
import { backDraft } from "./utils/admin/form/backDraft.ts";
import { editPartDraft } from "./utils/admin/form/editPartDraft.ts";
import { keepPartDraft } from "./utils/admin/form/keepPartDraft.ts";
import { nextDraft } from "./utils/admin/form/nextDraft.ts";
import { stepDir } from "./utils/admin/form/stepDir.ts";
import { intermissionErrorText } from "./utils/admin/intermission/intermissionErrorText.ts";
import { measurePlan } from "./utils/admin/measure/measurePlan.ts";
import { withProbe } from "./utils/admin/measure/withProbe.ts";
import { blockFromDraft } from "./utils/admin/save/blockFromDraft.ts";
import { blocksWith } from "./utils/admin/save/blocksWith.ts";
import { blocksWithout } from "./utils/admin/save/blocksWithout.ts";
import { commitErrors } from "./utils/admin/save/commitErrors.ts";
import { draftTitleLines } from "./utils/admin/titles/draftTitleLines.ts";
import { dismissTip } from "@utils/tip/cloud.ts";
import { changedBlockIds } from "@utils/week/changedBlockIds.ts";
import { emptySchedule } from "@utils/week/emptySchedule.ts";
import { gapOf } from "@utils/playlist/gapOf.ts";
import { ghostsOn } from "@utils/week/ghostsOn.ts";
import { intermissionLabel } from "@utils/source/intermissionLabel.ts";
import { occupancyOf } from "@utils/week/occupancyOf.ts";
import { pendingSource } from "@utils/source/pendingSource.ts";
import { stackItemNeedsProbe } from "@utils/length/stackItemNeedsProbe.ts";
import { youtubeScheduleKey } from "@utils/source/youtubeScheduleKey.ts";
import { ErrorNote } from "../components/parts/ErrorNote.tsx";
import { FitWarn } from "../components/parts/FitWarn.tsx";
import { Scrim } from "../components/parts/Scrim.tsx";
import { GapDialog } from "../components/sections/GapDialog.tsx";
import { IntermissionChip, WeekHead } from "../components/sections/WeekHead.tsx";
import { IntermissionPanel } from "../components/sections/IntermissionPanel.tsx";
import { SlotForm } from "../components/sections/SlotForm.tsx";
import { WeekScale } from "../components/sections/WeekScale.tsx";

export function Admin() {
  const { t } = useI18n();
  const today = WEEKDAY[new Date().getDay()]!;
  const [schedule, setSchedule] = useState<Schedule>(emptySchedule);
  const [board, setBoard] = useState<TvBoard | null>(null);
  const [youtubeTitles, setYoutubeTitles] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [slide, setSlide] = useState("");
  const [slideKey, setSlideKey] = useState(0);

  function slideTo(dir: "slide-next" | "slide-back") {
    setSlide(dir);
    setSlideKey((n) => n + 1);
  }

  function goBack() {
    slideTo("slide-back");
    setDraft((current) => (current ? backDraft(current) : current));
  }

  function goNext() {
    slideTo("slide-next");
    setDraft((current) => (current ? nextDraft(current) : current));
  }

  function jumpStep(step: "how" | "when" | "what") {
    if (!draft) return;
    const dir = stepDir(draft, step);
    if (!dir) return;
    slideTo(dir);
    setDraft((current) => (current ? { ...current, formStep: step, addPhase: "list" } : current));
  }

  function editPart(step: "how" | "when" | "what" | "name") {
    slideTo("slide-next");
    setDraft((current) => (current ? editPartDraft(current, step) : current));
  }

  function keepPart() {
    slideTo("slide-back");
    setDraft((current) => (current ? keepPartDraft(current) : current));
  }
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<FieldError>({});
  const [slotOp, setSlotOp] = useState<SlotOp | null>(null);
  const [slotOpSlow, setSlotOpSlow] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const confirmRemoveRef = useRef(false);
  confirmRemoveRef.current = confirmRemove;
  const [fitMiss, setFitMiss] = useState<SlotMiss | null>(null);
  const [picking, setPicking] = useState<"draft" | "fallback" | null>(null);
  const [intermissionOpen, setIntermissionOpen] = useState(false);
  const [addKind, setAddKind] = useState<IntermissionKind>("folder");
  const [addDraft, setAddDraft] = useState("");
  const [intermissionError, setIntermissionError] = useState<string | null>(null);
  const [intermissionSaving, setIntermissionSaving] = useState(false);
  const [panelToken, setPanelToken] = useState(0);
  const [measured, setMeasured] = useState<{
    key: string;
    length: SlotLength | null;
    error?: string;
  } | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [fileCount, setFileCount] = useState(0);
  const measureEpoch = useRef(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [sourceMissing, setSourceMissing] = useState(false);
  const [building, setBuilding] = useState<string[]>([]);
  const occupancyRef = useRef<Record<string, string>>({});
  const scheduleRef = useRef(schedule);
  const addKindRef = useRef<IntermissionKind>("folder");
  const addDraftRef = useRef("");
  scheduleRef.current = schedule;
  addKindRef.current = addKind;
  addDraftRef.current = addDraft;
  const formRef = useRef<HTMLFormElement>(null);
  const draggingId = useRef<string | null>(null);
  const [gapEdit, setGapEdit] = useState<{ itemId: string; minutes: string } | null>(null);
  const [gapError, setGapError] = useState<string | null>(null);
  const gapEditRef = useRef(gapEdit);
  gapEditRef.current = gapEdit;
  const gapInputRef = useRef<HTMLInputElement>(null);
  const formErrorRef = useRef<HTMLParagraphElement>(null);
  const slotOpRef = useRef<SlotOp | null>(null);
  const missTokenSeen = useRef<number | null>(null);
  const savedBlockId = useRef<string | null>(null);
  const intermissionButtonRef = useRef<HTMLButtonElement>(null);
  const intermissionPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .schedule()
      .then((loaded) => {
        setSchedule({
          ...emptySchedule(),
          ...loaded,
          blocks: loaded.blocks ?? [],
          intermissions: loaded.intermissions ?? [],
          activeIntermission: loaded.activeIntermission ?? "",
          intermissionRandomStart: loaded.intermissionRandomStart === true,
        });
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  function applyBoard(loaded: TvBoard) {
    setBoard(loaded);
    const token = loaded.missToken ?? 0;
    if (missTokenSeen.current === null) missTokenSeen.current = token;
    else if (token !== missTokenSeen.current) {
      missTokenSeen.current = token;
      const id = savedBlockId.current;
      setFitMiss(id ? (loaded.misses ?? []).find((miss) => miss.blockId === id) ?? null : null);
    }
    if (Array.isArray(loaded.building)) {
      setBuilding(loaded.building);
      return;
    }
    setBuilding((current) =>
      current.filter((id) => occupancyOf(loaded, id) === occupancyRef.current[id]),
    );
  }

  useEffect(() => {
    let cancel = false;
    function loadBoard() {
      api
        .tv()
        .then((loaded) => {
          if (!cancel) applyBoard(loaded);
        })
        .catch(() => undefined);
    }
    loadBoard();
    const id = window.setInterval(loadBoard, building.length > 0 ? 500 : 2000);
    return () => {
      cancel = true;
      window.clearInterval(id);
    };
  }, [building.length]);

  const titleKey = youtubeScheduleKey(schedule, draftTitleLines(draft, addKind, addDraft).join("\n"));
  useEffect(() => {
    const urls = titleKey ? titleKey.split("\n") : [];
    if (urls.length === 0) return;
    let cancel = false;
    api
      .youtubeTitles(urls)
      .then((res) => {
        if (!cancel) setYoutubeTitles((current) => ({ ...current, ...res.titles }));
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [titleKey]);

  useEffect(() => {
    if (draft) setIntermissionOpen(false);
    else setConfirmRemove(false);
  }, [draft]);

  useEffect(() => {
    if (!intermissionOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIntermissionOpen(false);
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (intermissionButtonRef.current?.contains(target)) return;
      if (intermissionPanelRef.current?.contains(target)) return;
      setIntermissionOpen(false);
      if (target instanceof Element && target.closest(".week-scale, .intermission-dismiss")) {
        event.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [intermissionOpen]);

  const formOpen = Boolean(draft);
  useEffect(() => {
    if (!formOpen) return;
    formRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    function cancel() {
      if (slotOpRef.current) return;
      dismissTip();
      setGapEdit(null);
      setGapError(null);
      setDraft(null);
      setFieldError({});
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (confirmRemoveRef.current) {
        setConfirmRemove(false);
        return;
      }
      if (gapEditRef.current) {
        setGapEdit(null);
        setGapError(null);
        return;
      }
      cancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [formOpen, panelToken]);

  useEffect(() => {
    if (!formOpen) {
      setGapEdit(null);
      setGapError(null);
    }
  }, [formOpen]);

  useEffect(() => {
    if (!gapEdit) return;
    gapInputRef.current?.focus();
    gapInputRef.current?.select();
  }, [gapEdit?.itemId]);

  useEffect(() => {
    if (!draft?.id || draft.mode === "playlist" || draft.source === "youtube") {
      setSourceMissing(false);
      return;
    }
    const file = draft.mode === "specific-file" ? draft.file.trim() : "";
    const folder = draft.folder.trim();
    if (draft.mode === "specific-file" ? !file : !folder) {
      setSourceMissing(false);
      return;
    }
    let cancel = false;
    api
      .videoCount(folder, file)
      .then((res) => {
        if (!cancel) setSourceMissing(res.exists === false);
      })
      .catch(() => {
        if (!cancel) setSourceMissing(false);
      });
    return () => {
      cancel = true;
    };
  }, [draft?.id, draft?.mode, draft?.folder, draft?.file]);

  useEffect(() => {
    const plan = measurePlan(draft);
    if (plan.action === "clear") {
      measureEpoch.current += 1;
      setMeasured(null);
      setMeasuring(false);
      setFileCount(0);
      return;
    }
    if (plan.action === "empty") {
      measureEpoch.current += 1;
      setMeasured({ key: plan.key, length: null });
      setMeasuring(false);
      setFileCount(0);
      return;
    }
    const epoch = ++measureEpoch.current;
    let cancel = false;
    setMeasuring(true);
    setMeasured(null);
    setFileCount(0);
    if (plan.countRandom) {
      api
        .videoCount(plan.folder)
        .then((res) => {
          if (!cancel) setFileCount(res.count);
        })
        .catch(() => {});
    }
    const timer = setTimeout(() => {
      api
        .slotLength(plan.mode, plan.folder, plan.file, plan.cap)
        .then((res) => {
          if (cancel || measureEpoch.current !== epoch) return;
          setMeasured({ key: plan.key, length: res.length });
          setMeasuring(false);
        })
        .catch((err: unknown) => {
          if (cancel || measureEpoch.current !== epoch) return;
          const message = err instanceof Error ? err.message : String(err);
          setMeasured({ key: plan.key, length: null, error: message });
          setMeasuring(false);
        });
    }, 250);
    return () => {
      cancel = true;
      clearTimeout(timer);
    };
  }, [
    draft?.mode,
    draft?.folder,
    draft?.file,
    draft?.addMode,
    draft?.addFolder,
    draft?.addFile,
    draft?.source,
    draft?.addSource,
    draft?.lengthChoice,
    draft?.addLengthChoice,
    draft?.addCustomMin,
    panelToken,
  ]);

  const stackKey = draft?.mode === "playlist" ? draft.items.map((item) => item.id).join("\n") : "";

  useEffect(() => {
    if (!draft || draft.mode !== "playlist") return;
    const pending = draft.items.filter(stackItemNeedsProbe);
    if (pending.length === 0) return;
    let cancel = false;
    void (async () => {
      for (const item of pending) {
        if (cancel) return;
        let length: SlotLength | null = null;
        let error: string | undefined;
        try {
          const res = await api.slotLength(item.mode, item.folder, item.file);
          length = res.length;
        } catch (err: unknown) {
          error = err instanceof Error ? err.message : String(err);
        }
        if (cancel) return;
        setDraft((current) => (current ? withProbe(current, item.id, length, error) : current));
      }
    })();
    return () => {
      cancel = true;
    };
  }, [draft?.mode, stackKey, panelToken]);

  useEffect(() => {
    if (!slotOp) {
      setSlotOpSlow(false);
      return;
    }
    const id = window.setTimeout(() => setSlotOpSlow(true), BUSY_SPIN_MS);
    return () => window.clearTimeout(id);
  }, [slotOp]);

  useEffect(() => {
    if (!fieldError.form) return;
    formErrorRef.current?.scrollIntoView({ block: "nearest" });
  }, [fieldError.form]);

  useEffect(() => {
    if (!measuring) {
      setElapsedSec(0);
      return;
    }
    const started = Date.now();
    setElapsedSec(0);
    const id = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [measuring, draft?.mode, draft?.folder, draft?.file]);

  useEffect(() => {
    setDraft((current) => (current ? draftEnd(current, measured) : current));
  }, [measured, draft?.start, draft?.lengthChoice, draft?.customMin, draft?.items, draft?.mode]);

  function openPanel() {
    setPanelToken((token) => token + 1);
    setSaved(false);
    setFitMiss(null);
    setError(null);
    setFieldError({});
  }

  async function persist(next: Schedule, notice = true) {
    setError(null);
    const ids = changedBlockIds(schedule.blocks, next.blocks);
    if (ids.length) {
      occupancyRef.current = Object.fromEntries(ids.map((id) => [id, occupancyOf(board, id)]));
      setBuilding(ids);
    }
    const res = await api.saveSchedule(next);
    setSchedule(res.schedule);
    api
      .tv()
      .then((loaded) => applyBoard(loaded))
      .catch(() => undefined);
    if (notice) setSaved(true);
    return res;
  }

  function openGap(day: Day, startMin: number, endMin: number, at: number) {
    measureEpoch.current += 1;
    setMeasuring(false);
    setMeasured(null);
    setDraft(gapDraft(day, startMin, endMin, at));
    openPanel();
  }

  function openSlot(block: ScheduleBlock, day: Day) {
    setDraft(slotDraft(block, day, schedule.blocks, board));
    openPanel();
  }

  function chooseMode(mode: BlockMode) {
    if (draft?.returnTo !== "summary") slideTo("slide-next");
    setDraft((current) => modeDraft(current, mode));
    setFieldError((current) => ({ ...current, folder: undefined }));
  }

  function choosePlaySource(source: PlaySource) {
    setDraft((current) => playSourceDraft(current, source));
    setFieldError((current) => ({ ...current, folder: undefined }));
  }

  async function choosePath() {
    if (!draft) return;
    const adding = draft.mode === "playlist";
    const source = adding ? draft.addSource : draft.source;
    if (source === "youtube") return;
    const video = (adding ? draft.addMode : draft.mode) === "specific-file";
    setPicking("draft");
    setFieldError((current) => ({ ...current, folder: undefined, form: undefined }));
    try {
      const picked = video ? await api.pickFile() : await api.pickFolder();
      if (!picked.path) return;
      const chosen = picked.path;
      setDraft((current) => (current ? pickedPath(current, chosen) : current));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setFieldError((current) => ({ ...current, folder: message }));
    } finally {
      setPicking(null);
    }
  }

  function addStackItem() {
    if (!draft) return;
    const next = addedStack(draft, measured);
    if (!next) return;
    slideTo("slide-back");
    setDraft(next);
    setFieldError((current) => ({ ...current, folder: undefined, time: undefined }));
  }

  function closeDraft() {
    if (slotOpRef.current) return;
    dismissTip();
    setGapEdit(null);
    setGapError(null);
    setDraft(null);
    setFieldError({});
  }

  function saveGap() {
    if (!draft || !gapEdit) return;
    const minutes = gapMinutes(gapEdit.minutes);
    if (minutes == null) {
      setGapError(t.needMinutes);
      return;
    }
    setDraft({ ...draft, items: withGap(draft.items, gapEdit.itemId, minutes) });
    setGapEdit(null);
    setGapError(null);
  }

  function clearGap() {
    if (!draft || !gapEdit) return;
    setDraft({ ...draft, items: withoutGap(draft.items, gapEdit.itemId) });
    setGapEdit(null);
    setGapError(null);
  }

  function editAddDraft(value: string) {
    addDraftRef.current = value;
    setAddDraft(value);
    setIntermissionError(null);
    setSaved(false);
  }

  function chooseAddKind(kind: IntermissionKind) {
    addKindRef.current = kind;
    setAddKind(kind);
    setIntermissionError(null);
  }

  async function chooseAddSource() {
    const video = addKindRef.current === "video";
    setPicking("fallback");
    setIntermissionError(null);
    try {
      const picked = video ? await api.pickFile() : await api.pickFolder();
      if (!picked.path) return;
      editAddDraft(picked.path);
    } catch (e) {
      setIntermissionError(e instanceof Error ? e.message : String(e));
    } finally {
      setPicking(null);
    }
  }

  async function changeIntermission(
    next: Pick<Schedule, "intermissions" | "activeIntermission"> &
      Partial<Pick<Schedule, "intermissionRandomStart">>,
  ): Promise<boolean> {
    const current = scheduleRef.current;
    setIntermissionSaving(true);
    setIntermissionError(null);
    try {
      await persist({ ...current, ...next }, false);
      return true;
    } catch (e) {
      setIntermissionError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setIntermissionSaving(false);
    }
  }

  async function addIntermission() {
    const pending = pendingSource(addKindRef.current, addDraftRef.current);
    if (pending.error) {
      setIntermissionError(pending.error);
      return;
    }
    if (!pending.source) return;
    const current = scheduleRef.current;
    const item: IntermissionItem = {
      id: crypto.randomUUID(),
      kind: addKindRef.current,
      source: pending.source,
    };
    const saved = await changeIntermission({
      intermissions: [...current.intermissions, item],
      activeIntermission: current.activeIntermission || item.id,
    });
    if (!saved) return;
    addDraftRef.current = "";
    setAddDraft("");
  }

  function setIntermissionRandomStart(on: boolean) {
    const current = scheduleRef.current;
    if (current.intermissionRandomStart === on) return;
    setSchedule({ ...current, intermissionRandomStart: on });
    void changeIntermission({
      intermissions: current.intermissions,
      activeIntermission: current.activeIntermission,
      intermissionRandomStart: on,
    }).then((saved) => {
      if (saved) return;
      setSchedule((latest) =>
        latest.intermissionRandomStart === on ? { ...latest, intermissionRandomStart: !on } : latest,
      );
    });
  }

  function selectIntermission(id: string) {
    const current = scheduleRef.current;
    if (current.activeIntermission === id) return;
    void changeIntermission({ intermissions: current.intermissions, activeIntermission: id });
  }

  function removeIntermission(id: string) {
    const current = scheduleRef.current;
    void changeIntermission({
      intermissions: current.intermissions.filter((item) => item.id !== id),
      activeIntermission: current.activeIntermission === id ? "" : current.activeIntermission,
    });
  }

  function beginSlotOp(op: SlotOp) {
    slotOpRef.current = op;
    setSlotOp(op);
    setFieldError((current) => ({ ...current, form: undefined }));
  }

  function endSlotOp() {
    slotOpRef.current = null;
    setSlotOp(null);
  }

  async function commit() {
    if (!draft) return;
    const next = commitErrors(draft, measured, measuring, sourceMissing, {
      video: t.sourceMissingVideo,
      folder: t.sourceMissingFolder,
    });
    if (next.time || next.folder) {
      setFieldError(next);
      return;
    }
    if (slotOpRef.current) return;
    const block = blockFromDraft(draft, measured);
    const blocks = blocksWith(schedule.blocks, block, draft.id);
    savedBlockId.current = block.id;
    setFitMiss(null);
    beginSlotOp("save");
    try {
      await persist({ ...schedule, blocks });
      dismissTip();
      setDraft(null);
      setFieldError({});
    } catch (e) {
      setFieldError({ form: e instanceof Error ? e.message : String(e) });
    } finally {
      endSlotOp();
    }
  }

  async function removeDraft() {
    if (!draft?.id || slotOpRef.current) return;
    const removed = draft;
    const previous = schedule;
    const next = {
      ...schedule,
      blocks: blocksWithout(schedule.blocks, draft.id),
    };
    beginSlotOp("remove");
    setSchedule(next);
    dismissTip();
    setDraft(null);
    setFieldError({});
    try {
      await persist(next);
    } catch (e) {
      setSchedule(previous);
      setDraft(removed);
      setFieldError({ form: e instanceof Error ? e.message : String(e) });
    } finally {
      endSlotOp();
    }
  }

  function stopMeasuring() {
    measureEpoch.current += 1;
    setMeasuring(false);
    setMeasured(null);
    setFileCount(0);
  }

  const selectedIntermission =
    schedule.intermissions.find((item) => item.id === schedule.activeIntermission) ?? null;
  const fallbackName = selectedIntermission
    ? intermissionLabel(selectedIntermission, youtubeTitles)
    : "";
  const pendingAdd = pendingSource(addKind, addDraft);
  const addPreview = pendingAdd.error
    ? ""
    : pendingAdd.source
      ? intermissionLabel({ id: "", kind: addKind, source: pendingAdd.source }, youtubeTitles)
      : "";
  const editingGap = draft && gapEdit ? draft.items.find((item) => item.id === gapEdit.itemId) : undefined;
  const editingGapSet = editingGap ? gapOf(editingGap) > 0 : false;
  const ghostsByDay = draft
    ? Object.fromEntries(DAYS.map((day) => [day, ghostsOn(draft, day, schedule.blocks, board)]))
    : null;

  return (
    <section>
      <WeekHead
        chip={
          !draft && (
            <IntermissionChip
              open={intermissionOpen}
              name={fallbackName}
              buttonRef={intermissionButtonRef}
              onToggle={() => setIntermissionOpen((open) => !open)}
            />
          )
        }
      />
      {error && <ErrorNote message={error} />}
      {fitMiss && !draft && <FitWarn miss={fitMiss} />}
      <div class={draft ? "week-wrap drafting" : "week-wrap"}>
        {!draft && intermissionOpen && (
          <Scrim className="intermission-dismiss" pointer onClose={() => setIntermissionOpen(false)} />
        )}
        {!draft && intermissionOpen && (
          <IntermissionPanel
            panelRef={intermissionPanelRef}
            schedule={schedule}
            titles={youtubeTitles}
            saving={intermissionSaving}
            onRandom={setIntermissionRandomStart}
            onSelect={selectIntermission}
            onRemove={removeIntermission}
            addKind={addKind}
            onKind={chooseAddKind}
            addDraft={addDraft}
            onDraft={editAddDraft}
            youtubeInvalid={pendingAdd.error === "youtube" || Boolean(intermissionError)}
            pathInvalid={pendingAdd.error === "youtube-in-path" || Boolean(intermissionError)}
            picking={picking === "fallback"}
            onBrowse={() => void chooseAddSource()}
            preview={addPreview}
            errorText={
              intermissionError || pendingAdd.error
                ? intermissionErrorText(intermissionError || pendingAdd.error || "", t)
                : null
            }
            canAdd={Boolean(pendingAdd.source) && !pendingAdd.error}
            onAdd={() => void addIntermission()}
          />
        )}
        <WeekScale
          days={DAYS}
          schedule={schedule}
          board={board}
          draft={draft}
          today={today}
          building={building}
          titles={youtubeTitles}
          fallbackName={fallbackName}
          ghostsByDay={ghostsByDay}
          onOpenGap={openGap}
          onOpenSlot={openSlot}
        />
        {draft && <Scrim onClose={closeDraft} />}
        {draft && (
          <SlotForm
            draft={draft}
            schedule={schedule}
            board={board}
            titles={youtubeTitles}
            measured={measured}
            measuring={measuring}
            fileCount={fileCount}
            elapsedSec={elapsedSec}
            sourceMissing={sourceMissing}
            picking={picking}
            slotOp={slotOp}
            slotOpSlow={slotOpSlow}
            confirmRemove={confirmRemove}
            slide={slide}
            slideKey={slideKey}
            formRef={formRef}
            draggingId={draggingId}
            formErrorRef={formErrorRef}
            fieldError={fieldError}
            setDraft={setDraft}
            setFieldError={setFieldError}
            setGapEdit={setGapEdit}
            setGapError={setGapError}
            setConfirmRemove={setConfirmRemove}
            stopMeasuring={stopMeasuring}
            slideTo={slideTo}
            onPickMode={chooseMode}
            onPickSource={choosePlaySource}
            onBrowse={() => void choosePath()}
            onCommit={() => void commit()}
            onCancel={closeDraft}
            onBack={goBack}
            onAdd={addStackItem}
            onNext={goNext}
            onKeep={keepPart}
            onJump={jumpStep}
            onEditPart={editPart}
            onDelete={() => void removeDraft()}
          />
        )}
        {draft && gapEdit && (
          <GapDialog
            minutes={gapEdit.minutes}
            error={gapError ? t.error(gapError) : null}
            editing={editingGapSet}
            inputRef={gapInputRef}
            onMinutes={(value) => {
              setGapEdit({ ...gapEdit, minutes: value });
              setGapError(null);
            }}
            onSave={saveGap}
            onDismiss={() => {
              dismissTip();
              setGapEdit(null);
              setGapError(null);
            }}
            onCancel={() => {
              setGapEdit(null);
              setGapError(null);
            }}
            onClear={clearGap}
          />
        )}
      </div>
      {saved && !draft && <p class="muted">{t.saved}</p>}
    </section>
  );
}
