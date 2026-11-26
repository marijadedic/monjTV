import { useI18n } from "../../i18n.tsx";

export function ErrorNote({ message }: { message: string }) {
  const { t } = useI18n();
  return <p class="error">{t.error(message)}</p>;
}
