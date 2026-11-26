import type { Ref } from "preact";
import type { IntermissionItem, IntermissionKind, Schedule } from "../../../shared/types.ts";
import { useI18n } from "../../i18n.tsx";
import { intermissionLabel } from "../../utils/source/intermissionLabel.ts";
import { CloseButton } from "../buttons/CloseButton.tsx";
import { FieldNote } from "../parts/FieldNote.tsx";
import { FolderPath } from "../inputs/FolderPath.tsx";
import { YoutubeField } from "../inputs/YoutubeField.tsx";

export function IntermissionPanel({
  panelRef,
  schedule,
  titles,
  saving,
  onRandom,
  onSelect,
  onRemove,
  addKind,
  onKind,
  addDraft,
  onDraft,
  youtubeInvalid,
  pathInvalid,
  picking,
  onBrowse,
  preview,
  errorText,
  canAdd,
  onAdd,
}: {
  panelRef: Ref<HTMLDivElement>;
  schedule: Schedule;
  titles: Readonly<Record<string, string>>;
  saving: boolean;
  onRandom: (next: boolean) => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  addKind: IntermissionKind;
  onKind: (kind: IntermissionKind) => void;
  addDraft: string;
  onDraft: (value: string) => void;
  youtubeInvalid: boolean;
  pathInvalid: boolean;
  picking: boolean;
  onBrowse: () => void;
  preview: string;
  errorText: string | null;
  canAdd: boolean;
  onAdd: () => void;
}) {
  const { t } = useI18n();
  const selectedItem = schedule.intermissions.find((item) => item.id === schedule.activeIntermission) ?? null;
  return (
    <div class="intermission-open" ref={panelRef}>
      <span>{t.ifEmpty}</span>
      <button
        type="button"
        class={schedule.intermissionRandomStart ? "intermission-random on" : "intermission-random"}
        role="switch"
        aria-checked={schedule.intermissionRandomStart}
        title={t.intermissionRandomHint}
        disabled={saving}
        onClick={() => onRandom(!schedule.intermissionRandomStart)}
      >
        <i aria-hidden="true" />
        <span>{t.intermissionRandom}</span>
      </button>
      {schedule.intermissions.length === 0 ? (
        <p class="intermission-empty">{t.intermissionEmpty}</p>
      ) : (
        <ul class="intermission-list" role="radiogroup" aria-label={t.intermissionPick}>
          <li class={!selectedItem ? "on" : ""}>
            <button
              type="button"
              role="radio"
              aria-checked={!selectedItem}
              class="pick"
              disabled={saving}
              onClick={() => onSelect("")}
            >
              <i />
              <b>{t.none}</b>
            </button>
          </li>
          {schedule.intermissions.map((item) => (
            <IntermissionRow
              key={item.id}
              item={item}
              on={item.id === schedule.activeIntermission}
              titles={titles}
              saving={saving}
              onSelect={() => onSelect(item.id)}
              onRemove={() => onRemove(item.id)}
            />
          ))}
        </ul>
      )}
      <span class="k">{t.add}</span>
      <div class="seg intermission-kind" role="radiogroup" aria-label={t.intermissionFrom}>
        {(["folder", "video", "youtube"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={addKind === kind}
            class={addKind === kind ? "on" : ""}
            onClick={() => onKind(kind)}
          >
            {kind === "folder" ? t.folder : kind === "video" ? t.video : t.youtube}
          </button>
        ))}
      </div>
      {addKind === "youtube" ? (
        <YoutubeField
          value={addDraft}
          placeholder={t.youtubePlaceholder}
          invalid={youtubeInvalid}
          onChange={onDraft}
          onEnter={onAdd}
        />
      ) : (
        <FolderPath
          kind={addKind === "video" ? "video" : "folder"}
          value={addDraft}
          placeholder={addKind === "video" ? t.videoPlaceholder : t.folderPlaceholder}
          invalid={pathInvalid}
          actionLabel={picking ? t.choosing : t.browse}
          actionBusy={picking}
          listLabel={addKind === "video" ? t.video : t.folder}
          onChange={onDraft}
          onAction={onBrowse}
          onEnter={onAdd}
        />
      )}
      {preview && <p class="folder-name">{preview}</p>}
      {errorText && <FieldNote>{errorText}</FieldNote>}
      <span>
        {addKind === "youtube" ? t.youtubeIntermission : addKind === "video" ? t.oneHint : t.nextHint}{" "}
        {t.intermissionCut}
      </span>
      <div class="intermission-actions">
        <button type="button" class="primary" disabled={!canAdd || saving} onClick={onAdd}>
          {t.add}
        </button>
      </div>
    </div>
  );
}

function IntermissionRow({
  item,
  on,
  titles,
  saving,
  onSelect,
  onRemove,
}: {
  item: IntermissionItem;
  on: boolean;
  titles: Readonly<Record<string, string>>;
  saving: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  return (
    <li class={on ? "on" : ""}>
      <button
        type="button"
        role="radio"
        aria-checked={on}
        class="pick"
        title={item.source}
        disabled={saving}
        onClick={onSelect}
      >
        <i />
        <b>{intermissionLabel(item, titles)}</b>
        <span>{item.kind === "folder" ? t.folder : item.kind === "video" ? t.video : t.youtube}</span>
      </button>
      <CloseButton label={t.remove} title={t.remove} disabled={saving} onClick={onRemove} />
    </li>
  );
}
