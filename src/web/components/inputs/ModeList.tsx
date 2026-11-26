import "./styles/ModeList.css";
import { ModeOption } from "./ModeOption.tsx";

export function ModeList<T extends string>({
  label,
  modes,
  selected,
  classFor,
  titleFor,
  hintFor,
  onPick,
}: {
  label: string;
  modes: readonly T[];
  selected: T;
  classFor: (mode: T) => string;
  titleFor: (mode: T) => string;
  hintFor: (mode: T) => string;
  onPick: (mode: T) => void;
}) {
  return (
    <div class="mode-list" role="radiogroup" aria-label={label}>
      {modes.map((mode) => (
        <ModeOption
          key={mode}
          pressed={selected === mode}
          className={classFor(mode)}
          title={titleFor(mode)}
          hint={hintFor(mode)}
          onPick={() => onPick(mode)}
        />
      ))}
    </div>
  );
}
