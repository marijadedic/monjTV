import "./styles/StillFrame.css";
export function StillFrame({ src, onError }: { src: string; onError: () => void }) {
  return <img key={src} class="still" src={src} alt="" onError={onError} />;
}
