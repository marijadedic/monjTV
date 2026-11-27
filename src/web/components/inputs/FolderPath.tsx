import "./styles/FolderPath.css";
import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "../../api.ts";
import type { FolderHit } from "../../types/FolderHit.ts";
import { isYoutubeLink } from "../../../shared/youtube.ts";

export function FolderPath({
  value,
  placeholder,
  invalid,
  actionLabel,
  actionBusy,
  listLabel,
  kind = "folder",
  onChange,
  onAction,
  onBlur,
  onEnter,
}: {
  value: string;
  placeholder: string;
  invalid?: boolean;
  actionLabel: string;
  actionBusy: boolean;
  listLabel: string;
  kind?: "folder" | "video";
  onChange: (value: string) => void;
  onAction: () => void;
  onBlur?: () => void;
  onEnter?: () => void;
}) {
  const [dirs, setDirs] = useState<FolderHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useRef(
    `folders-${Math.random().toString(36).slice(2)}`,
  ).current;

  useEffect(() => {
    if (!open || !value.trim() || isYoutubeLink(value)) {
      setDirs([]);
      setActive(-1);
      return;
    }
    let cancel = false;
    const timer = setTimeout(() => {
      api
        .suggestPaths(value, kind)
        .then((next) => {
          if (cancel) return;
          setDirs(
            kind === "video" ? [...next.videos, ...next.dirs] : next.dirs,
          );
          setActive(-1);
        })
        .catch(() => {
          if (!cancel) setDirs([]);
        });
    }, 150);
    return () => {
      cancel = true;
      clearTimeout(timer);
    };
  }, [open, value, kind]);

  function onKey(event: KeyboardEvent) {
    if (event.key === "Escape" && open && dirs.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (!open || dirs.length === 0) {
      if (event.key === "Enter") onEnter?.();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % dirs.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index <= 0 ? dirs.length - 1 : index - 1));
    } else if (event.key === "Enter" && active >= 0 && dirs[active]) {
      event.preventDefault();
      onChange(dirs[active].path);
    } else if (event.key === "Enter") {
      onEnter?.();
    }
  }

  const shown = open && dirs.length > 0;

  return (
    <div class="path-field">
      <div class="field">
        <input
          value={value}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={shown}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={invalid ? "true" : undefined}
          aria-activedescendant={
            shown && active >= 0 ? `${listId}-${active}` : undefined
          }
          onFocus={() => setOpen(true)}
          onInput={(event) => {
            setOpen(true);
            onChange((event.target as HTMLInputElement).value);
          }}
          onKeyDown={onKey}
          onBlur={() => {
            setOpen(false);
            onBlur?.();
          }}
        />
        <button type="button" onClick={onAction} disabled={actionBusy}>
          {actionLabel}
        </button>
      </div>
      {shown && (
        <ul
          class="path-suggest"
          id={listId}
          role="listbox"
          aria-label={listLabel}
        >
          {dirs.map((dir, index) => (
            <li key={dir.path} role="presentation">
              <button
                type="button"
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                class={index === active ? "on" : ""}
                title={dir.path}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onChange(dir.path)}
              >
                {dir.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
