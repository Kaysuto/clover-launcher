import { useEffect, useState } from "react";
import { SkinViewer as Viewer } from "skinview3d";

import { SkinFront } from "@/components/SkinFront";
import { cn } from "@/lib/utils";
import type { SkinModel } from "@/types";

const WIDTH = 160;
const HEIGHT = 200;
/** Images gardées en mémoire (une page de la Découverte en fait 36). */
const KEPT = 400;

let viewer: Viewer | null = null;
/** Rendus un par un : un seul contexte WebGL sert toutes les vignettes. */
let queue: Promise<unknown> = Promise.resolve();
const rendered = new Map<string, Promise<string>>();

/** Personnage de trois quarts, en pleine marche, comme sur laby.net ou NameMC. */
function pose(scene: Viewer) {
  const player = scene.playerObject;
  player.rotation.y = 0.55;
  const { head, leftArm, rightArm, leftLeg, rightLeg } = player.skin;
  head.rotation.y = 0.12;
  leftArm.rotation.x = rightLeg.rotation.x = -0.5;
  rightArm.rotation.x = leftLeg.rotation.x = 0.5;
  leftArm.rotation.z = 0.06;
  rightArm.rotation.z = -0.06;
  scene.camera.position.set(0, 0.28, 1);
  scene.adjustCameraDistance();
  scene.camera.lookAt(0, 0, 0);
  return scene;
}

const newViewer = (width: number, height: number, pixelRatio: number) =>
  new Viewer({ width, height, pixelRatio, preserveDrawingBuffer: true, renderPaused: true, enableControls: false, fov: 30, zoom: 0.9 });

function poser() {
  viewer ??= pose(newViewer(WIDTH, HEIGHT, 2));
  return viewer;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

/**
 * Image PNG (data URL, 320 × 400) du personnage posé ; les textures se téléchargent en parallèle,
 * le rendu attend son tour. Sert aussi à la carte de profil à partager.
 */
export function renderPose(texture: string, model: SkinModel) {
  const key = `${model}:${texture}`;
  const known = rendered.get(key);
  if (known) return known;
  const image = loadImage(texture);
  const job = image.then((loaded) => {
    const next = queue.then(() => {
      const scene = poser();
      scene.loadSkin(loaded, { model: model === "slim" ? "slim" : "default" });
      scene.render();
      return scene.canvas.toDataURL("image/png");
    });
    queue = next.catch(() => {});
    return next;
  });
  rendered.set(key, job);
  job.catch(() => rendered.delete(key));
  if (rendered.size > KEPT) rendered.delete(rendered.keys().next().value!);
  return job;
}

/**
 * Même pose en grand (`width` × `height` pixels), avec la cape portée : pour la carte à partager.
 * Un aperçu à part, libéré aussitôt, rendu à son tour comme les vignettes.
 */
export async function renderLargePose(texture: string, model: SkinModel, cape: string | null, width: number, height: number) {
  const [skin, back] = await Promise.all([loadImage(texture), cape ? loadImage(cape).catch(() => null) : null]);
  const job = queue.then(() => {
    const large = pose(newViewer(width, height, 1));
    try {
      large.loadSkin(skin, { model: model === "slim" ? "slim" : "default" });
      if (back) {
        // Un peu plus de profil, cape soulevée par la marche : elle dépasse derrière lui.
        large.loadCape(back);
        large.playerObject.rotation.y = 0.85;
        large.playerObject.cape.rotation.x = 0.7;
      }
      large.render();
      return large.canvas.toDataURL("image/png");
    } finally {
      large.dispose();
    }
  });
  queue = job.catch(() => {});
  return job;
}

/** Vignette 3D d'un skin. Repli sur la vue de face à plat si le rendu échoue. */
export function SkinPose({ texture, model, className }: { texture: string; model: SkinModel; className?: string }) {
  const [state, setState] = useState<{ texture: string; image: string | null; failed: boolean }>({ texture, image: null, failed: false });

  useEffect(() => {
    let alive = true;
    renderPose(texture, model)
      .then((image) => alive && setState({ texture, image, failed: false }))
      .catch(() => alive && setState({ texture, image: null, failed: true }));
    return () => {
      alive = false;
    };
  }, [texture, model]);

  const current = state.texture === texture;
  if (current && state.failed) return <SkinFront texture={texture} model={model} scale={3.5} className={className} />;
  if (!current || !state.image) return <span aria-hidden className={cn("block", className)} style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }} />;
  return <img src={state.image} alt="" draggable={false} className={cn("animate-in fade-in", className)} style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }} />;
}
