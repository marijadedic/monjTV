import { useEffect, useState } from "preact/hooks";
import { DAYS, type Day, type Schedule, type ScheduleBlock } from "../../shared/types.ts";
import { api } from "../api.ts";
import { useI18n } from "../i18n.tsx";

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
  const { t } = useI18n();
  const [schedule, setSchedule] = useState<Schedule>({ blocks: [] });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);

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

  async function chooseFolder(block: ScheduleBlock) {
    setPicking(block.id);
    setError(null);
    try {
      const picked = await api.pickFolder();
      if (picked.path) update(block.id, { folder: picked.path });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPicking(null);
    }
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
        <h1>{t.weekly}</h1>
        <button
          onClick={() => {
            setSchedule((s) => ({ blocks: [...s.blocks, emptyBlock()] }));
            setSaved(false);
          }}
        >
          {t.addBlock}
        </button>
        <button class="primary" onClick={save}>
          {t.save}
        </button>
        {saved && <span class="muted">{t.saved}</span>}
      </div>
      {error && <p class="error">{t.error(error)}</p>}
      {schedule.blocks.map((block) => (
        <div key={block.id} class="block-form">
          <div class="days">
            {DAYS.map((day) => (
              <button
                key={day}
                type="button"
                class={block.days.includes(day) ? "chip on" : "chip"}
                aria-pressed={block.days.includes(day)}
                onClick={() => toggleDay(block, day)}
              >
                {t.day[day]}
              </button>
            ))}
          </div>
          <div class="row">
            <label>
              {t.start}{" "}
              <input
                type="time"
                value={block.start}
                onInput={(e) => update(block.id, { start: (e.target as HTMLInputElement).value })}
              />
            </label>
            <label>
              {t.end}{" "}
              <input
                type="time"
                value={block.end}
                onInput={(e) => update(block.id, { end: (e.target as HTMLInputElement).value })}
              />
            </label>
            <label>
              {t.mode}{" "}
              <select
                value={block.mode}
                onChange={(e) =>
                  update(block.id, {
                    mode: (e.target as HTMLSelectElement).value as ScheduleBlock["mode"],
                  })
                }
              >
                <option value="next-episode">{t.nextEpisode}</option>
                <option value="random-file">{t.randomFile}</option>
              </select>
            </label>
          </div>
          <div class="row">
            <div class="field">
              <input
                value={block.folder}
                placeholder={t.folderPlaceholder}
                onInput={(e) => update(block.id, { folder: (e.target as HTMLInputElement).value })}
              />
              <button type="button" onClick={() => chooseFolder(block)} disabled={picking === block.id}>
                {picking === block.id ? t.choosing : t.browse}
              </button>
            </div>
          </div>
          <div class="block-foot">
            <button
              type="button"
              class="quiet"
              onClick={() => {
                setSchedule((s) => ({ blocks: s.blocks.filter((b) => b.id !== block.id) }));
                setSaved(false);
              }}
            >
              {t.remove}
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
