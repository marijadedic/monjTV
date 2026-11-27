import type { ItemMode } from "../../../shared/types.ts";
import type { PlaySource } from "../../types/PlaySource.ts";
import { useI18n } from "../../i18n.tsx";
import { ModeOption } from "./ModeOption.tsx";

export function SourcePick({
  mode,
  source,
  onPick,
}: {
  mode: ItemMode;
  source: PlaySource;
  onPick: (source: PlaySource) => void;
}) {
  const { t } = useI18n();
  const choices: { id: PlaySource; label: string }[] = [
    { id: "path", label: mode === "specific-file" ? t.video : t.folder },
    {
      id: "youtube",
      label: mode === "specific-file" ? t.youtube : t.youtubePlaylist,
    },
  ];
  return (
    <fieldset class="source">
      <legend class="k">{t.intermissionFrom}</legend>
      <div
        class="source-grid"
        role="radiogroup"
        aria-label={t.intermissionFrom}
      >
        {choices.map((choice) => (
          <ModeOption
            key={choice.id}
            pressed={source === choice.id}
            title={choice.label}
            onPick={() => onPick(choice.id)}
          />
        ))}
      </div>
    </fieldset>
  );
}
