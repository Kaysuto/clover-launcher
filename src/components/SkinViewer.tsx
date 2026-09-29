import { useEffect, useRef } from "react";
import { IdleAnimation, SkinViewer as Viewer } from "skinview3d";

import type { SkinLook } from "@/types";

/**
 * Aperçu 3D du skin. On le fait seulement tourner sur lui-même, à la souris : ni inclinaison, ni
 * zoom, ni déplacement. Immobile si le système demande moins d'animations.
 */
export function SkinViewer({ look, width, height }: { look: SkinLook; width: number; height: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvas.current) return;
    const viewer = new Viewer({
      canvas: canvas.current,
      width,
      height,
      skin: look.texture,
      model: look.model === "slim" ? "slim" : "default",
      cape: look.cape?.texture,
      zoom: 0.82,
      fov: 40,
    });
    viewer.controls.enableZoom = false;
    viewer.controls.enablePan = false;
    viewer.controls.minPolarAngle = Math.PI / 2;
    viewer.controls.maxPolarAngle = Math.PI / 2;
    viewer.playerObject.rotation.y = -0.45;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      viewer.animation = new IdleAnimation();
    }
    return () => viewer.dispose();
  }, [look.texture, look.model, look.cape?.texture, width, height]);

  return <canvas ref={canvas} aria-label="Aperçu 3D de ton skin" className="cursor-grab active:cursor-grabbing" />;
}
