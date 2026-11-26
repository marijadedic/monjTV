import type { TvBoard } from "../../shared/types.ts";

export function occupancyOf(board: TvBoard | null, id: string): string {
  if (!board) return "";
  return board.days
    .filter((day) => day.date >= board.today)
    .flatMap((day) => day.items.filter((item) => item.blockId === id && !item.overnight))
    .map((item) => `${item.path}:${item.durationSec}:${item.start}`)
    .join("|");
}
