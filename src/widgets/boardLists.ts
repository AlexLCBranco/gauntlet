// A Boardkit board's lists, in its order, read from its saved record
// (`boardkit:board:<id>`: `{ board: { lists: { <id>: { title } }, listOrder } }`).
// For the widget picker only: the list widget itself is drawn by Boardkit.

export function boardLists(boardId: string): { id: string; title: string }[] {
  try {
    const saved = JSON.parse(localStorage.getItem(`boardkit:board:${boardId}`) ?? "null") as {
      board?: { lists?: Record<string, { title?: unknown }>; listOrder?: unknown };
    } | null;
    const board = saved?.board;
    if (!board || !Array.isArray(board.listOrder) || !board.lists) return [];
    return board.listOrder
      .filter((id): id is string => typeof id === "string" && !!board.lists![id])
      .map((id) => ({ id, title: typeof board.lists![id]!.title === "string" ? (board.lists![id]!.title as string) || "Untitled list" : "Untitled list" }));
  } catch {
    return [];
  }
}
