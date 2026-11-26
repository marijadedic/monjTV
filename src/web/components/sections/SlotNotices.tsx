import "./styles/SlotNotices.css";
import { useI18n } from "../../i18n.tsx";
import { FieldNote } from "../parts/FieldNote.tsx";

export function SlotNotices({
  warn,
  noVideo,
  probeError,
  timeError,
}: {
  warn: { title: string; start: string; end: string } | null;
  noVideo: boolean;
  probeError: string | null;
  timeError: string | undefined;
}) {
  const { t } = useI18n();
  return (
    <>
      {warn && (
        <p class="warn" role="status">
          {t.overlaps} {warn.title}, {warn.start}–{warn.end}.
        </p>
      )}
      {noVideo && <FieldNote>{t.noVideo}</FieldNote>}
      {probeError && <FieldNote>{t.error(probeError)}</FieldNote>}
      {timeError && <FieldNote>{t.error(timeError)}</FieldNote>}
    </>
  );
}
