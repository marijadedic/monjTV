import "./styles/icon.css";
import { TrashIcon } from "../parts/TrashIcon.tsx";

export function DeleteButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" class="icon-btn trash" aria-label={label} onClick={onClick}>
      <TrashIcon />
    </button>
  );
}
