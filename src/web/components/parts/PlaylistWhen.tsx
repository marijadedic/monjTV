export function PlaylistWhen({ start, end }: { start: string; end: string }) {
  return (
    <span class="item-when">
      <span>{start}</span>
      <span class="dash">–</span>
      <span>{end}</span>
    </span>
  );
}
