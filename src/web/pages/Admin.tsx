import { useEffect, useState } from "preact/hooks";
import { DAYS, type BrowseResult, type Day, type Schedule, type ScheduleBlock } from "../../shared/types.ts";
import { api } from "../api.ts";

function emptyBlock(): ScheduleBlock {
  return {
    id: crypto.randomUUID(),
    days: ["mon", "tue", "wed", "thu", "fri"],
    start: "09:00",
    end: "10:00",
    folder: "",
    mode: "next-episode",
  };
}

export function Admin() {
  const [schedule, setSchedule] = useState<Schedule>({ blocks: [] });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [browseFor, setBrowseFor] = useState<string | null>(null);
  const [browse, setBrowse] = useState<BrowseResult | null>(null);

  useEffect(() => {
    api.schedule().then(setSchedule).catch((e: Error) => setError(e.message));
  }, []);

  function update(id: string, patch: Partial<ScheduleBlock>) {
    setSchedule((s) => ({
      blocks: s.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));
    setSaved(false);
  }

  function toggleDay(block: ScheduleBlock, day: Day) {
    const days = block.days.includes(day)
      ? block.days.filter((d) => d !== day)
      : [...block.days, day];
    update(block.id, { days });
  }

  async function openBrowse(block: ScheduleBlock) {
    setBrowseFor(block.id);
    setBrowse(await api.browse(block.folder || undefined));
  }

  async function save() {
    setError(null);
    try {
      const res = await api.saveSchedule(schedule);
      setSchedule(res.schedule);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section>
      <div class="row">
        <h1>Weekly grid</h1>
        <button
          onClick={() => {
            setSchedule((s) => ({ blocks: [...s.blocks, emptyBlock()] }));
            setSaved(false);
          }}
        >
          Add block
        </button>
        <button class="primary" onClick={save}>
          Save
        </button>
        {saved && <span class="muted">Saved. Today’s rundown rebuilt.</span>}
      </div>
      {error && <p class="error">{error}</p>}
      {schedule.blocks.map((block) => (
        <div key={block.id} class="block-form">
          <div class="days">
            {DAYS.map((day) => (
              <label key={day}>
                <input
                  type="checkbox"
                  checked={block.days.includes(day)}
                  onChange={() => toggleDay(block, day)}
                />
                {day}
              </label>
            ))}
          </div>
          <div class="row">
            <label>
              Start{" "}
              <input
                type="time"
                value={block.start}
                onInput={(e) => update(block.id, { start: (e.target as HTMLInputElement).value })}
              />
            </label>
            <label>
              End{" "}
              <input
                type="time"
                value={block.end}
                onInput={(e) => update(block.id, { end: (e.target as HTMLInputElement).value })}
              />
            </label>
            <label>
              Mode{" "}
              <select
                value={block.mode}
                onChange={(e) =>
                  update(block.id, {
                    mode: (e.target as HTMLSelectElement).value as ScheduleBlock["mode"],
                  })
                }
              >
                <option value="next-episode">Next episode</option>
                <option value="random-file">Random file</option>
              </select>
            </label>
          </div>
          <div class="row">
            <input
              style={{ flex: 1, minWidth: "200px" }}
              value={block.folder}
              placeholder="/path/to/folder"
              onInput={(e) => update(block.id, { folder: (e.target as HTMLInputElement).value })}
            />
            <button onClick={() => openBrowse(block)}>Browse</button>
            <button
              onClick={() =>
                setSchedule((s) => ({ blocks: s.blocks.filter((b) => b.id !== block.id) }))
              }
            >
              Remove
            </button>
          </div>
          {browseFor === block.id && browse && (
            <div class="browse">
              <button
                disabled={!browse.parent}
                onClick={async () => {
                  if (browse.parent) setBrowse(await api.browse(browse.parent));
                }}
              >
                ..
              </button>
              {browse.dirs.map((dir) => (
                <button
                  key={dir.path}
                  onClick={async () => {
                    update(block.id, { folder: dir.path });
                    setBrowse(await api.browse(dir.path));
                  }}
                >
                  {dir.name}/
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
