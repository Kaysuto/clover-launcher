import { useEffect, useRef } from "react";
import { IdleAnimation, SkinViewer as Viewer } from "skinview3d";
import { MathUtils, type Mesh, type MeshStandardMaterial, Quaternion, Raycaster, Vector2, Vector3 } from "three";

import type { SkinLook } from "@/types";

/** Durée de la teinte rouge, celle du hurtTime de Minecraft (10 ticks). */
const HURT_MS = 500;
/** Saut de recul ; le rebond qui suit dure moitié moins, donc monte quatre fois moins haut. */
const JUMP_MS = 280;
const LAND_MS = JUMP_MS * 1.5;
/** Fin du retour à la place de départ. */
const KNOCKBACK_MS = LAND_MS + 320;
/** Pieds du modèle, dans le repère du joueur (origine à la taille, 16 au-dessus des pieds). */
const FEET = new Vector3(0, -16, 0);

const arc = (p: number) => 4 * p * (1 - p);

/** Recul à `t` ms du coup : distance poussée, hauteur, inclinaison (rad, amortie avec un contrecoup). */
function recoil(t: number) {
  const hop = t < JUMP_MS ? 3 * arc(t / JUMP_MS) : t < LAND_MS ? 0.75 * arc((t - JUMP_MS) / (LAND_MS - JUMP_MS)) : 0;
  const push =
    t < JUMP_MS ? 1 - (1 - t / JUMP_MS) ** 3 : t < LAND_MS ? 1 : (1 + Math.cos((Math.PI * (t - LAND_MS)) / (KNOCKBACK_MS - LAND_MS))) / 2;
  const lean = 0.17 * Math.exp(-t / 150) * Math.sin((2 * Math.PI * t) / 360);
  return { push: 4 * push, hop, lean };
}

/**
 * Aperçu 3D du skin. On le fait seulement tourner sur lui-même, à la souris : ni inclinaison, ni
 * zoom, ni déplacement. Un clic sur le personnage le frappe comme en jeu. Immobile si le système
 * demande moins d'animations : le coup n'est alors qu'une teinte rouge, sans recul.
 */
export function SkinViewer({ look, width, height, animate = true }: { look: SkinLook; width: number; height: number; animate?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvas.current || !look.texture) return;
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
    const motion = animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (motion) viewer.animation = new IdleAnimation();
    const detachHit = attachHit(viewer, canvas.current, motion);
    return () => {
      detachHit();
      viewer.dispose();
    };
  }, [look.texture, look.model, look.cape?.texture, width, height, animate]);

  // Skin encore inconnu (profil pas chargé) : place réservée, sans aperçu.
  if (!look.texture) return <div aria-hidden style={{ width, height }} />;
  return <canvas ref={canvas} aria-label="Aperçu 3D de ton skin" className="cursor-grab active:cursor-grabbing" />;
}

/**
 * Coup façon Minecraft : un clic (pas un glisser, qui fait tourner) sur le personnage le teinte en
 * rouge et, avec `knockback`, le projette loin de la caméra, et de côté selon où le clic tombe : saut,
 * rebond à l'atterrissage, puis retour en place. Comme en jeu, un coup pendant le précédent ne compte
 * pas. Rend le nettoyage.
 */
function attachHit(viewer: Viewer, canvas: HTMLCanvasElement, knockback: boolean) {
  const player = viewer.playerObject;
  const materials = new Set<MeshStandardMaterial>();
  player.traverse((object) => {
    if ((object as Mesh).isMesh) materials.add((object as Mesh).material as MeshStandardMaterial);
  });
  const tint = (hurt: boolean) => {
    for (const material of materials) {
      material.color.set(hurt ? 0xff8f8f : 0xffffff);
      material.emissive.set(hurt ? 0x3a0000 : 0x000000);
    }
  };

  const duration = knockback ? KNOCKBACK_MS : HURT_MS;
  const dir = new Vector3();
  const side = new Vector3();
  const axis = new Vector3();
  const shift = new Vector3();
  const base = new Quaternion();
  const tilt = new Quaternion();
  let start = 0;
  let frame = 0;
  const pose = (t: number) => {
    const { push, hop, lean } = recoil(t);
    tilt.setFromAxisAngle(axis, lean);
    player.quaternion.multiplyQuaternions(tilt, base);
    // Penché depuis les pieds, pas depuis l'origine du modèle.
    shift.copy(FEET).applyQuaternion(tilt).sub(FEET);
    player.position.copy(dir).multiplyScalar(push).sub(shift).setY(hop - shift.y);
  };
  const step = (now: number) => {
    const t = now - start;
    tint(t < HURT_MS);
    if (t >= duration) {
      player.position.set(0, 0, 0);
      player.quaternion.copy(base);
      frame = 0;
      return;
    }
    if (knockback) pose(t);
    frame = requestAnimationFrame(step);
  };
  const strike = (point: Vector3) => {
    if (frame) return;
    dir.copy(viewer.camera.position).setY(0).normalize().negate();
    // Droite de l'écran au sol ; un coup sur le flanc droit pousse vers la gauche.
    side.set(-dir.z, 0, dir.x);
    dir.addScaledVector(side, -0.8 * MathUtils.clamp(point.dot(side) / 6, -1, 1)).normalize();
    axis.set(dir.z, 0, -dir.x);
    base.copy(player.quaternion);
    start = performance.now();
    tint(true);
    frame = requestAnimationFrame(step);
  };

  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const down = new Vector2();
  const onPointerDown = (event: PointerEvent) => down.set(event.clientX, event.clientY);
  const onClick = (event: MouseEvent) => {
    if (down.distanceTo(pointer.set(event.clientX, event.clientY)) > 4) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, 1 - ((event.clientY - rect.top) / rect.height) * 2);
    raycaster.setFromCamera(pointer, viewer.camera);
    // Le corps seul : cape, élytres et oreilles existent même masquées.
    const [hit] = raycaster.intersectObject(player.skin);
    if (hit) strike(hit.point);
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("click", onClick);
  return () => {
    cancelAnimationFrame(frame);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("click", onClick);
  };
}
