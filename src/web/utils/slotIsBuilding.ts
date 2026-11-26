import type { TvBoard } from "../../shared/types.ts";

export function slotIsBuilding(board: TvBoard | null, id: string, local: string[]): boolean {
  if (board && Array.isArray(board.building)) return board.building.includes(id);
  return local.includes(id);
}
