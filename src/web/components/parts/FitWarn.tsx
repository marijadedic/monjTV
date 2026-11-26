import type { SlotMiss } from "../../../shared/types.ts";
import { useI18n } from "../../i18n.tsx";

export function FitWarn({ miss }: { miss: SlotMiss }) {
  const { t } = useI18n();
  const run = t.runLength(miss.durationSec);
  const limit = t.runLength(miss.limitSec);
  const text =
    miss.kind === "episode"
      ? t.wontFitEpisode(miss.title, run, limit)
      : miss.kind === "folder"
        ? t.wontFitFolder(miss.title, run, limit)
        : t.wontFitVideo(miss.title, run, limit);
  return (
    <p class="fit-warn" role="status">
      {text}
    </p>
  );
}
