import "./styles/icon.css";
import { PencilIcon } from "../parts/PencilIcon.tsx";

export function ChangeButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" class="icon-btn pencil" aria-label={label} onClick={onClick}>
      <PencilIcon />
    </button>
  );
}
