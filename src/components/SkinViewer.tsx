import { useEffect, useRef } from "react";
import { IdleAnimation, SkinViewer as Viewer } from "skinview3d";

/** Aperçu 3D du skin, orientable à la souris. Immobile si le système demande moins d'animations. */
export function SkinViewer({ skin, width, height }: { skin: string; width: number; height: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvas.current) return;
    const viewer = new Viewer({ canvas: canvas.current, width, height, skin, zoom: 0.82, fov: 40 });
    viewer.controls.enableZoom = false;
    viewer.controls.enablePan = false;
    viewer.playerObject.rotation.y = -0.45;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      viewer.animation = new IdleAnimation();
    }
    return () => viewer.dispose();
  }, [skin, width, height]);

  return <canvas ref={canvas} aria-label="Aperçu 3D de ton skin" className="cursor-grab active:cursor-grabbing" />;
}
