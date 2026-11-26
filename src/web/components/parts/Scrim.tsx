export function Scrim({
  className = "scrim",
  pointer,
  onClose,
}: {
  className?: string;
  pointer?: boolean;
  onClose: () => void;
}) {
  if (pointer) {
    return (
      <div
        class={className}
        onPointerDown={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
    );
  }
  return <div class={className} onClick={onClose} />;
}
