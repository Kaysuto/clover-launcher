import { useEffect, useRef } from "react";
import { SkinViewer as Viewer } from "skinview3d";
import { type Intersection, MathUtils, type Mesh, type MeshStandardMaterial, Quaternion, Raycaster, Vector2, Vector3 } from "three";

import { cursorPosition, type Gaze, MoodAnimation } from "@/components/SkinMoods";
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

/** Prise en main : marge de l'aperçu détaché autour de sa taille, pour que le balancement ne soit pas coupé. */
const FLOAT_MARGIN = 140;
/** Curseur à moins de cette distance de la tête (pixels d'écran) : il le regarde. */
const NEAR_PX = 260;
/** Pesanteur de la chute, en pixels d'écran par seconde². */
const GRAVITY = 2600;
/** Avec des élytres, la descente plane : pesanteur réduite, vitesse plafonnée (pixels d'écran par seconde). */
const GLIDE_GRAVITY = 700;
const GLIDE_FALL_MAX = 300;
/** Retour à pied : vitesse selon la distance (pixels d'écran par seconde), pas par pixel parcouru (rad). */
const WALK_MIN = 170;
const WALK_MAX = 460;
const STRIDE_PER_PX = 0.05;
/** Demi-tour vers sa place, puis de nouveau face à l'écran, en secondes. */
const TURN_S = 0.22;
const UP = new Vector3(0, 1, 0);

/** Personnage occupé par un coup ou une prise : l'autre geste attend. */
type Busy = { busy: boolean };

const arc = (p: number) => 4 * p * (1 - p);
const smoothstep = (p: number) => p * p * (3 - 2 * p);

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
 * zoom, ni déplacement ; on peut aussi l'attraper pour le soulever. Il change d'humeur quand on ne touche plus
 * au launcher et suit le curseur des yeux par moments (`SkinMoods`), et un clic sur le personnage le frappe comme en jeu. Immobile si le système
 * demande moins d'animations : le coup n'est alors qu'une teinte rouge, sans recul.
 */
export function SkinViewer({ look, width, height, animate = true, elytra = false }: { look: SkinLook; width: number; height: number; animate?: boolean; /** Élytres à la place de la cape (même texture). */ elytra?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const instance = useRef<Viewer | null>(null);
  /** Lu à la fin du chargement de la cape, qui peut arriver après une bascule. */
  const equipment = useRef<"cape" | "elytra">("cape");
  /**
   * Apparition de l'aperçu : le bonjour n'a lieu qu'à ce moment, pas à chaque skin essayé. Une
   * fenêtre d'une seconde plutôt qu'un drapeau, l'effet étant joué deux fois en mode strict.
   */
  const appeared = useRef<number | null>(null);

  useEffect(() => {
    if (!canvas.current || !look.texture) return;
    const viewer = new Viewer({
      canvas: canvas.current,
      width,
      height,
      skin: look.texture,
      model: look.model === "slim" ? "slim" : "default",
      zoom: 0.82,
      fov: 40,
    });
    // Montrée seulement une fois chargée : skinview3d remettrait sinon la cape par-dessus des élytres choisies entre-temps.
    if (look.cape?.texture) void viewer.loadCape(look.cape.texture, { makeVisible: false }).then(() => (viewer.playerObject.backEquipment = equipment.current));
    instance.current = viewer;
    viewer.controls.enableZoom = false;
    viewer.controls.enablePan = false;
    viewer.controls.minPolarAngle = Math.PI / 2;
    viewer.controls.maxPolarAngle = Math.PI / 2;
    viewer.playerObject.rotation.y = -0.45;
    const motion = animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    appeared.current ??= performance.now();
    const moods = motion ? new MoodAnimation({ greet: performance.now() - appeared.current < 1000 }) : null;
    viewer.animation = moods;
    const state: Busy = { busy: false };
    const detachHit = attachHit(viewer, canvas.current, motion, state, (side) => moods?.hit(side));
    const detachGrab = moods ? attachGrab(viewer, canvas.current, moods, state) : () => {};
    moods?.follow(gazeAt(viewer, canvas.current, state));
    return () => {
      instance.current = null;
      detachGrab();
      detachHit();
      viewer.dispose();
    };
  }, [look.texture, look.model, look.cape?.texture, width, height, animate]);

  // Bascule sans recréer l'aperçu ; `backEquipment` reste nul tant que la cape n'est pas chargée.
  useEffect(() => {
    equipment.current = elytra ? "elytra" : "cape";
    const player = instance.current?.playerObject;
    if (player?.backEquipment) player.backEquipment = equipment.current;
  }, [elytra]);

  // La place reste réservée quand le personnage en sort (prise en main) ou que le skin est encore
  // inconnu. Le canvas est toujours rendu : React ne le retire jamais pendant qu'il est détaché.
  return (
    <div style={{ width, height }}>
      <canvas ref={canvas} hidden={!look.texture} aria-label="Aperçu 3D de ton skin" className="block cursor-ew-resize" />
    </div>
  );
}

/**
 * Regard : angles du cou pour que la tête vise le curseur, comme s'il était sur la vitre de l'écran
 * (point du rayon de la caméra à mi-chemin du personnage). Rien pendant un coup ou une prise, ni si
 * le curseur est hors de la fenêtre ou derrière lui.
 */
function gazeAt(viewer: Viewer, canvas: HTMLCanvasElement, state: Busy): Gaze {
  const { skin } = viewer.playerObject;
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const neck = new Vector3();
  const projected = new Vector3();
  const target = new Vector3();
  return () => {
    const cursor = cursorPosition();
    if (!cursor || state.busy || !canvas.isConnected) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return null;
    skin.head.getWorldPosition(neck);
    projected.copy(neck).project(viewer.camera);
    const near = Math.hypot(cursor.x - (rect.left + ((projected.x + 1) / 2) * rect.width), cursor.y - (rect.top + ((1 - projected.y) / 2) * rect.height)) < NEAR_PX;
    ndc.set(((cursor.x - rect.left) / rect.width) * 2 - 1, 1 - ((cursor.y - rect.top) / rect.height) * 2);
    raycaster.setFromCamera(ndc, viewer.camera);
    raycaster.ray.at(viewer.camera.position.distanceTo(neck) * 0.55, target);
    skin.worldToLocal(target);
    // Depuis les yeux, 4 pixels au-dessus du cou ; l'inclinaison est accentuée, moins visible que la rotation.
    const across = Math.hypot(target.x, target.z);
    const yaw = Math.atan2(target.x, target.z);
    if (Math.abs(yaw) > 1.7) return null;
    return { yaw: MathUtils.clamp(yaw, -1, 1), pitch: MathUtils.clamp(1.4 * Math.atan2(skin.head.position.y + 4 - target.y, across), -0.75, 0.75), near };
  };
}

/**
 * Coup façon Minecraft : un clic (pas un glisser, qui fait tourner) sur le personnage le teinte en
 * rouge et, avec `knockback`, le projette loin de la caméra, et de côté selon où le clic tombe (`onHit` fait
 * réagir le personnage) : saut,
 * rebond à l'atterrissage, puis retour en place. Comme en jeu, un coup pendant le précédent ne compte
 * pas. Rend le nettoyage.
 */
function attachHit(viewer: Viewer, canvas: HTMLCanvasElement, knockback: boolean, state: Busy, onHit: (side: number) => void) {
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
      state.busy = false;
      return;
    }
    if (knockback) pose(t);
    frame = requestAnimationFrame(step);
  };
  const strike = (point: Vector3) => {
    if (frame || state.busy) return;
    state.busy = true;
    dir.copy(viewer.camera.position).setY(0).normalize().negate();
    // Droite de l'écran au sol ; un coup sur le flanc droit pousse vers la gauche.
    side.set(-dir.z, 0, dir.x);
    const across = MathUtils.clamp(point.dot(side) / 6, -1, 1);
    dir.addScaledVector(side, -0.8 * across).normalize();
    onHit(across);
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

/**
 * Prise en main : appuyer sur le personnage puis glisser l'attrape. L'aperçu sort alors de sa place
 * (déplacé dans `body`, au-dessus de tout le launcher, sans capter la souris) et suit la main dans
 * toute la fenêtre ; le personnage se balance selon la vitesse du geste et se débat (`moods`).
 * Lâché, il garde son élan (on peut le lancer) et retombe jusqu'à la hauteur de sa place, se tasse
 * s'il tombe vraiment, puis rentre à pied, tourné vers sa place ; lâché plus bas, il y remonte d'un
 * saut. Avec des élytres, il plane au lieu de tomber et remonte en volant au lieu de sauter. Arrivé,
 * il se retourne face à l'écran. Glisser à côté de lui le fait toujours tourner. Rend le nettoyage.
 */
function attachGrab(viewer: Viewer, canvas: HTMLCanvasElement, moods: MoodAnimation, state: Busy) {
  const player = viewer.playerObject;
  const parent = player.parent!;
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const forward = new Vector3();
  const right = new Vector3();
  const look = new Vector3();
  /** Point saisi et décalage depuis le centre du joueur, dans le repère du parent. */
  const grip = new Vector3();
  const offset = new Vector3();
  const rotated = new Vector3();
  const base = new Quaternion();
  const facing = new Quaternion();
  const heading = new Quaternion();
  const tilt = new Quaternion();
  let pressed: { id: number; x: number; y: number; hit: Intersection } | null = null;
  /** Place de l'aperçu pendant qu'il en est sorti. */
  let home: { slot: HTMLElement; width: number; height: number } | null = null;
  /** Point saisi à l'écran : il reste dans la fenêtre. */
  let originX = 0;
  let originY = 0;
  // Décalage de l'aperçu depuis sa place, en pixels d'écran (y vers le bas), et sa vitesse.
  let x = 0;
  let y = 0;
  let vx = 0;
  let vy = 0;
  let goalX = 0;
  let goalY = 0;
  /** Balancement autour du point saisi, dans le plan de l'écran (rad, rad/s). */
  let angle = 0;
  let spin = 0;
  /** Orientation : 0 face à l'écran, 1 tourné vers sa place. */
  let turn = 0;
  let stride = 0;
  let walkSpeed = 0;
  /** Décalage au départ de la marche : le trajet se calcule sur le temps, pas image par image. */
  let walkFrom = 0;
  /** Étape en cours, et son début (ms). */
  let phase: "held" | "fall" | "rest" | "walk" | "hop" | "fly" | "home" = "held";
  let phaseAt = 0;
  let restFor = 0;
  let hop = { x: 0, y: 0, duration: 0, height: 0 };
  let frame = 0;
  let last = 0;

  /** Élytres portées (bascule de la page Skins) : lu à chaque image, la bascule peut arriver en vol. */
  const winged = () => player.backEquipment === "elytra";

  const bodyAt = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, 1 - ((event.clientY - rect.top) / rect.height) * 2);
    raycaster.setFromCamera(pointer, viewer.camera);
    // Le corps seul, comme pour le coup.
    return raycaster.intersectObject(player.skin)[0];
  };

  // Plus grand et décalé d'autant, avec la même projection : le personnage ne bouge pas à l'écran.
  const detach = () => {
    const rect = canvas.getBoundingClientRect();
    home = { slot: canvas.parentElement!, width: rect.width, height: rect.height };
    document.body.append(canvas);
    Object.assign(canvas.style, { position: "fixed", left: `${rect.left - FLOAT_MARGIN}px`, top: `${rect.top - FLOAT_MARGIN}px`, zIndex: "70", pointerEvents: "none" });
    const size = (length: number) => length + 2 * FLOAT_MARGIN;
    viewer.setSize(size(rect.width), size(rect.height));
    viewer.camera.setViewOffset(rect.width, rect.height, -FLOAT_MARGIN, -FLOAT_MARGIN, size(rect.width), size(rect.height));
  };
  const reattach = () => {
    if (!home) return;
    const { slot, width, height } = home;
    home = null;
    Object.assign(canvas.style, { position: "", left: "", top: "", zIndex: "", pointerEvents: "", transform: "" });
    viewer.camera.clearViewOffset();
    // Place disparue (écran quitté pendant le retour) : l'aperçu part avec elle.
    if (!slot.isConnected) return canvas.remove();
    slot.append(canvas);
    viewer.setSize(width, height);
  };

  /** Tourné vers sa place, de trois quarts pour qu'on voie encore son visage. */
  const faceHome = () => {
    look.copy(right).multiplyScalar(x > 0 ? -1 : 1).addScaledVector(forward, -0.5).normalize();
    facing.setFromAxisAngle(UP, Math.atan2(look.x, look.z));
  };

  const go = (next: typeof phase, now: number) => {
    phase = next;
    phaseAt = now;
  };

  const startWalk = (now: number) => {
    if (Math.abs(x) < 2) return go("home", now);
    faceHome();
    walkSpeed = MathUtils.clamp(Math.abs(x) / 1.1, WALK_MIN, WALK_MAX);
    walkFrom = x;
    go("walk", now);
  };

  /** Arrivé à la hauteur de sa place ; `thud` : il se tasse avant de repartir. */
  const touchDown = (now: number, thud: boolean) => {
    y = vy = 0;
    moods.setAirborne(false);
    moods.glide(false);
    if (thud) moods.land();
    restFor = thud ? 450 : 120;
    go("rest", now);
  };

  const finish = () => {
    player.position.set(0, 0, 0);
    player.quaternion.copy(base);
    moods.walk(null);
    moods.setAirborne(false);
    moods.glide(false);
    reattach();
    frame = 0;
    state.busy = false;
  };

  const step = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.05) || 0.016;
    last = now;
    const elapsed = (now - phaseAt) / 1000;
    let bob = 0;
    if (phase === "held") {
      vx += ((goalX - x) / dt - vx) * 0.3;
      vy += ((goalY - y) / dt - vy) * 0.3;
      x = goalX;
      y = goalY;
    } else if (phase === "fall") {
      // Plané : la montée d'un lancer reste vive, seule la descente ralentit.
      const gliding = winged();
      moods.glide(gliding);
      vy += (gliding && vy > 0 ? GLIDE_GRAVITY : GRAVITY) * dt;
      if (gliding) vy = Math.min(vy, GLIDE_FALL_MAX);
      vx -= vx * Math.min(1, (gliding ? 0.8 : 2.5) * dt);
      x = MathUtils.clamp(x + vx * dt, -originX, window.innerWidth - originX);
      y = Math.max(y + vy * dt, -originY);
      if (y === -originY) vy = Math.max(vy, 0);
      if (y >= 0) {
        // Une chute rapide rebondit un peu avant de se poser.
        if (vy > 700) {
          y = 0;
          vy *= -0.25;
        } else touchDown(now, !gliding && (vy > 250 || elapsed > 0.25));
      }
    } else if (phase === "rest") {
      if (now - phaseAt >= restFor) startWalk(now);
    } else if (phase === "walk") {
      turn = Math.min(1, turn + dt / TURN_S);
      // Démarrage en douceur le temps du demi-tour.
      const travelled = Math.min(Math.abs(walkFrom), walkSpeed * Math.max(0, elapsed - TURN_S / 2));
      x = walkFrom - Math.sign(walkFrom) * travelled;
      stride = travelled * STRIDE_PER_PX;
      bob = 2 * Math.abs(Math.sin(stride));
      moods.walk(stride);
      if (x === 0) {
        moods.walk(null);
        go("home", now);
      }
    } else if (phase === "hop") {
      const progress = Math.min(elapsed / hop.duration, 1);
      x = hop.x * (1 - progress);
      y = hop.y * (1 - progress) - 4 * hop.height * progress * (1 - progress);
      turn = Math.min(1, turn + dt / TURN_S);
      if (progress === 1) {
        x = 0;
        touchDown(now, true);
      }
    } else if (phase === "fly") {
      // Départ et arrivée en douceur ; il passe au-dessus de sa place et s'y pose en descendant.
      const progress = Math.min(elapsed / hop.duration, 1);
      const eased = smoothstep(progress);
      const next = hop.x * (1 - eased);
      vx = (next - x) / dt;
      x = next;
      y = hop.y * (1 - eased) - hop.height * arc(eased);
      turn = Math.min(1, turn + dt / TURN_S);
      if (progress === 1) {
        x = 0;
        touchDown(now, false);
      }
    } else {
      turn = Math.max(0, turn - dt / TURN_S);
    }

    // Pendule amorti : en avançant vers la droite, le bas du corps traîne à gauche. En vol, il se
    // penche dans le sens du déplacement.
    const flying = phase === "fly" || (phase === "fall" && winged());
    const lean = phase === "held" ? MathUtils.clamp(vx * 0.0016, -0.6, 0.6) : flying ? MathUtils.clamp(vx * 0.0011, -0.45, 0.45) : 0;
    spin += ((lean - angle) * 60 - spin * 6) * dt;
    angle += spin * dt;
    if (phase === "home" && turn === 0 && Math.abs(angle) < 0.003 && Math.abs(spin) < 0.02) return finish();

    heading.slerpQuaternions(base, facing, smoothstep(turn));
    tilt.setFromAxisAngle(forward, angle);
    player.quaternion.multiplyQuaternions(tilt, heading);
    player.position.copy(grip).sub(rotated.copy(offset).applyQuaternion(tilt));
    canvas.style.transform = `translate(${x}px, ${y - bob}px)`;
    frame = requestAnimationFrame(step);
  };

  const begin = (hit: Intersection) => {
    state.busy = true;
    x = y = vx = vy = goalX = goalY = angle = spin = turn = stride = 0;
    viewer.camera.getWorldDirection(forward).setY(0).normalize();
    right.crossVectors(forward, UP).normalize();
    parent.worldToLocal(grip.copy(hit.point));
    offset.copy(grip).sub(player.position);
    base.copy(player.quaternion);
    facing.copy(base);
    detach();
    document.documentElement.style.cursor = "grabbing";
    moods.hold(true);
    last = performance.now();
    go("held", last);
    frame = requestAnimationFrame(step);
  };

  // Suivi sur la fenêtre : l'aperçu détaché ne capte plus la souris.
  const onMove = (event: PointerEvent) => {
    if (!pressed || event.pointerId !== pressed.id) return;
    if (phase !== "held" || !home) {
      if (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 4) begin(pressed.hit);
      else return;
    }
    goalX = MathUtils.clamp(event.clientX, 0, window.innerWidth) - originX;
    goalY = MathUtils.clamp(event.clientY, 0, window.innerHeight) - originY;
  };
  const stopFollowing = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
  const onUp = (event: PointerEvent) => {
    if (!pressed || event.pointerId !== pressed.id) return;
    stopFollowing();
    pressed = null;
    viewer.controls.enabled = true;
    document.documentElement.style.cursor = "";
    if (!home || phase !== "held") return;
    moods.hold(false);
    const now = performance.now();
    if (y < 0) {
      // Lâché au-dessus de sa place : il garde l'élan du geste, borné pour ne pas traverser la fenêtre.
      vx = MathUtils.clamp(vx, -2000, 2000);
      vy = MathUtils.clamp(vy, -1600, 900);
      moods.setAirborne(true);
      go("fall", now);
    } else if (y > 16) {
      // Lâché plus bas : il remonte d'un saut, plus haut et plus long s'il est loin ; avec des
      // élytres, il y vole, plus lentement et en passant au-dessus.
      const distance = Math.hypot(x, y);
      faceHome();
      moods.setAirborne(true);
      if (winged()) {
        hop = { x, y, duration: MathUtils.clamp(0.8 + distance / 1500, 0.8, 1.4), height: 30 + 0.4 * y };
        moods.glide(true);
        go("fly", now);
      } else {
        hop = { x, y, duration: MathUtils.clamp(0.45 + distance / 1800, 0.45, 0.85), height: 40 + 0.25 * y };
        go("hop", now);
      }
    } else touchDown(now, false);
  };

  // Phase de capture : passe avant les contrôles de rotation, désactivés le temps de la prise.
  const onPointerDown = (event: PointerEvent) => {
    if (state.busy || event.button !== 0) return;
    const hit = bodyAt(event);
    if (!hit) return;
    pressed = { id: event.pointerId, x: event.clientX, y: event.clientY, hit };
    originX = event.clientX;
    originY = event.clientY;
    viewer.controls.enabled = false;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
  const onHover = (event: PointerEvent) => {
    if (!pressed && event.buttons === 0) canvas.style.cursor = !state.busy && bodyAt(event) ? "grab" : "";
  };

  canvas.addEventListener("pointerdown", onPointerDown, { capture: true });
  canvas.addEventListener("pointermove", onHover);
  return () => {
    cancelAnimationFrame(frame);
    stopFollowing();
    if (pressed || home) document.documentElement.style.cursor = "";
    if (home) {
      player.position.set(0, 0, 0);
      reattach();
    }
    canvas.removeEventListener("pointerdown", onPointerDown, { capture: true });
    canvas.removeEventListener("pointermove", onHover);
  };
}
