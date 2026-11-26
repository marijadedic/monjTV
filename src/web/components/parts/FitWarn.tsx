import type { SlotMiss } from "../../../shared/types.ts";
import { useI18n } from "../../i18n.tsx";

function fitText(miss: SlotMiss, t: ReturnType<typeof useI18n>["t"], run: string, limit: string): string {
  if (miss.kind === "episode") return t.wontFitEpisode(miss.title, run, limit);
  if (miss.kind === "folder") return t.wontFitFolder(miss.title, run, limit);
  return t.wontFitVideo(miss.title, run, limit);
}

export function FitWarn({ miss }: { miss: SlotMiss }) {
  const { t } = useI18n();
  const run = t.runLength(miss.durationSec);
  const limit = t.runLength(miss.limitSec);
  const text = fitText(miss, t, run, limit);
  return (
    <p class="fit-warn" role="status">
      {text}
    </p>
  );
}
