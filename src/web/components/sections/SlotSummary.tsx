import "./styles/SlotSummary.css";
import "./styles/SlotSummary.layout.css";
import type { Draft } from "../../types/Draft.ts";
import { useI18n } from "../../i18n.tsx";
import { blockLabel } from "@utils/label/blockLabel.ts";
import { summaryTitle } from "@utils/label/summaryTitle.ts";
import { itemLabel } from "@utils/label/itemLabel.ts";
import { stackClocks } from "@utils/playlist/stackClocks.ts";
import { stackItemLine } from "@utils/playlist/stackItemLine.ts";
import { startOnDraft } from "@utils/week/startOnDraft.ts";
import { ChangeButton } from "../buttons/ChangeButton.tsx";
import { PlaylistWhen } from "../parts/PlaylistWhen.tsx";

export function SlotSummary({
  draft,
  titles,
  end,
  lengthLabel,
  onEditTitle,
  onEditWhen,
  onEditVideos,
}: {
  draft: Draft;
  titles: Readonly<Record<string, string>>;
  end: string;
  lengthLabel: string;
  onEditTitle: () => void;
  onEditWhen: () => void;
  onEditVideos: () => void;
}) {
  const { t } = useI18n();
  const title = summaryTitle(draft, titles, t.playlistName);
  const clocks = stackClocks(draft.start, draft.items);
  return (
    <div class="summary">
      <div class="summary-title">
        <span>{title}</span>
        <ChangeButton label={t.change} onClick={onEditTitle} />
      </div>
      <div class="summary-fact">
        <span>
          {t.dayName[draft.origin]} {startOnDraft(draft, draft.origin)}
          {" – "}
          {end}
        </span>
        <span class="len">{lengthLabel}</span>
        <ChangeButton label={t.change} onClick={onEditWhen} />
      </div>
      {draft.mode === "playlist" ? (
        <>
          <div class="summary-label">
            <span class="k">{t.playlistStack}</span>
            <ChangeButton label={t.change} onClick={onEditVideos} />
          </div>
          {draft.items.length === 0 ? (
            <p class="mode-note">{t.playlistEmpty}</p>
          ) : (
            <ol class="playlist summary">
              {draft.items.map((item, index) => {
                const clock = clocks[index];
                return (
                  <li key={item.id} class="playlist-item">
                    <PlaylistWhen start={clock.start} end={clock.end} />
                    <div class="playlist-copy">
                      <b>{itemLabel(item, titles)}</b>
                      <span>{stackItemLine(item, t)}</span>
                    </div>
                    <hr />
                  </li>
                );
              })}
            </ol>
          )}
        </>
      ) : (
        <p class="summary-line">
          {blockLabel(draft.mode, t)}
          {lengthLabel && ` · ${lengthLabel}`}
        </p>
      )}
    </div>
  );
}
