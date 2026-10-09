import { type PlayerObject, PlayerAnimation } from "skinview3d";

/**
 * Humeurs du personnage, selon le temps passé sans toucher au launcher (souris, clavier) :
 * en attente, puis impatient, puis fatigué. Le moindre geste le ramène en attente. Par-dessus,
 * des gestes : un bonjour quand le joueur le voit, une réaction quand il le frappe, il se débat
 * quand il est attrapé, écarte les bras en l'air, se tasse en retombant et rentre à pied. Par
 * moments, et dès que le curseur passe près de lui, il le suit des yeux.
 */
export type Mood = "idle" | "impatient" | "tired";

const IMPATIENT_AFTER_MS = 25_000;
const TIRED_AFTER_MS = 90_000;
/** Passage d'une humeur à l'autre, en secondes. */
const BLEND = 0.9;

/** Durée du bonjour et de la réaction au coup, en secondes. */
const WAVE_S = 2.3;
const HIT_S = 1.9;
const LAND_S = 0.7;
/** Passage à la pose « attrapé » et retour, en secondes. */
const GRAB_IN = 0.25;
const GRAB_OUT = 0.4;
/** Entrée et sortie de la marche ou de la pose en l'air, en secondes. */
const STANCE_BLEND = 0.15;
/** Élytres repliées (repos de skinview3d) et ouvertes pour planer, en radians ; ouverture en secondes. */
const WING_FOLDED = 0.2617994;
const WING_OPEN_X = 0.35;
const WING_OPEN_Z = Math.PI * 0.42;
const WING_BLEND = 0.25;
/** Moments où il suit le curseur même de loin : durée et attente entre deux, en secondes. */
const CURIOUS_S = [2.5, 4.5];
const CURIOUS_GAP_S = [5, 12];

/** Angles du cou pour regarder le curseur (rad) ; `near` : curseur tout près de la tête. */
export type Gaze = () => { yaw: number; pitch: number; near: boolean } | null;

let lastActivity = performance.now();
/** Curseur dans la fenêtre, `null` quand il en sort. */
let cursor: { x: number; y: number } | null = null;
/** Compteur des retours sur la fenêtre (réduite, cachée, puis de nouveau visible). */
let shown = 0;
let listening = false;

/** Un seul suivi pour tous les aperçus : l'humeur survit au changement d'écran ou de skin. */
function listen() {
  if (listening) return;
  listening = true;
  const touch = () => {
    lastActivity = performance.now();
  };
  for (const type of ["pointermove", "pointerdown", "keydown", "wheel"]) window.addEventListener(type, touch, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") shown += 1;
  });
  window.addEventListener("pointermove", (event) => (cursor = { x: event.clientX, y: event.clientY }), { passive: true });
  document.documentElement.addEventListener("mouseleave", () => (cursor = null));
}

export const cursorPosition = () => cursor;

const between = ([min, max]: number[]) => min + Math.random() * (max - min);

export function currentMood(now = performance.now()): Mood {
  const quiet = now - lastActivity;
  return quiet >= TIRED_AFTER_MS ? "tired" : quiet >= IMPATIENT_AFTER_MS ? "impatient" : "idle";
}

/** Tout ce que les humeurs font bouger ; les rotations sont en radians, les décalages en pixels de skin. */
type Pose = {
  headX: number;
  headY: number;
  headLift: number;
  bodyX: number;
  /** Torse élargi par la respiration (0 à 1). */
  breath: number;
  shoulders: number;
  leftArmX: number;
  leftArmZ: number;
  rightArmX: number;
  rightArmZ: number;
  leftLegX: number;
  rightLegX: number;
  sway: number;
  capeX: number;
};

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** 0, puis 1 entre `start` et `start + length` (montée et descente de `ease` s), à chaque `period`. */
function pulse(t: number, period: number, start: number, length: number, ease: number) {
  const local = (t % period) - start;
  if (local < 0 || local > length) return 0;
  return smooth(Math.min(local, length - local) / ease);
}

/** Respiration de 0 à 1 : inspiration sur 40 % de la période, expiration plus lente. */
function breathing(t: number, period: number) {
  const phase = (t % period) / period;
  return phase < 0.4 ? smooth(phase / 0.4) : 1 - smooth((phase - 0.4) / 0.6);
}

const ARM_REST = Math.PI * 0.02;
const CAPE_REST = Math.PI * 0.06;

/** Attente : bras et cape qui bougent à peine, respiration, un coup d'œil de chaque côté de temps en temps. */
function idle(t: number): Pose {
  const swing = Math.cos(t * 2) * 0.03;
  const breath = breathing(t, 3.9);
  return {
    headX: 0,
    headY: 0.35 * (pulse(t, 11, 4, 2.2, 0.5) - pulse(t, 11, 7.5, 1.8, 0.5)),
    headLift: 0.4 * breath,
    bodyX: 0,
    breath,
    shoulders: 0.3 * breath,
    leftArmX: 0,
    leftArmZ: ARM_REST + swing,
    rightArmX: 0,
    rightArmZ: -ARM_REST - swing,
    leftLegX: 0,
    rightLegX: 0,
    sway: 0,
    capeX: CAPE_REST + Math.sin(t * 2) * 0.01,
  };
}

/** Impatient : tape du pied, regarde autour de lui, consulte sa montre puis soupire. */
function impatient(t: number): Pose {
  const breath = breathing(t, 2.6);
  const watch = pulse(t, 7, 4.2, 1.8, 0.35);
  const sigh = pulse(t, 7, 6.1, 0.9, 0.4);
  const tapping = pulse(t, 5, 0, 3.2, 0.2) * (1 - watch);
  return {
    headX: 0.42 * watch - 0.08 * sigh,
    headY: 0.45 * Math.sin(t * 0.9) * (1 - watch) - 0.35 * watch,
    headLift: 0.4 * breath,
    bodyX: 0,
    breath: Math.max(breath, sigh),
    shoulders: 0.3 * breath + 0.6 * sigh,
    leftArmX: 0,
    leftArmZ: 0.12,
    rightArmX: -1.25 * watch,
    rightArmZ: -0.12 * (1 - watch) + 0.55 * watch,
    leftLegX: 0,
    rightLegX: -0.16 * tapping * Math.max(0, Math.sin(t * Math.PI * 5.2)),
    sway: 0,
    capeX: CAPE_REST + Math.sin(t * 3) * 0.015,
  };
}

/** Fatigué : épaules tombantes, tête qui pique du nez puis se relève, bâillement, léger balancement. */
function tired(t: number): Pose {
  const breath = breathing(t, 5.5);
  const local = t % 9;
  const droop = local >= 2 && local < 6 ? 0.3 * smooth((local - 2) / 4) : local >= 6 && local < 6.35 ? 0.3 * (1 - smooth((local - 6) / 0.35)) : 0;
  const yawn = pulse(t, 13, 9.5, 2.4, 0.6);
  return {
    headX: (0.32 + droop) * (1 - yawn) - 0.35 * yawn,
    headY: 0,
    headLift: 0.5 * breath - 0.3,
    bodyX: 0.06,
    breath: Math.min(1, breath * 1.4),
    shoulders: 0.4 * breath - 0.35,
    leftArmX: -0.06,
    leftArmZ: 0.02,
    rightArmX: -0.06 * (1 - yawn) - 1.75 * yawn,
    rightArmZ: -0.02 * (1 - yawn) + 0.4 * yawn,
    leftLegX: 0,
    rightLegX: 0,
    sway: 0.025 * Math.sin(t * 0.7),
    capeX: CAPE_REST,
  };
}

const POSES: Record<Mood, (t: number) => Pose> = { idle, impatient, tired };

function mix(from: Pose, to: Partial<Pose>, weight: number): Pose {
  const pose = { ...from };
  for (const key of Object.keys(to) as (keyof Pose)[]) pose[key] = from[key] + (to[key]! - from[key]) * weight;
  return pose;
}

/** Bonjour : il lève le bras droit, salue trois fois de la main en penchant la tête, puis le baisse. */
function wave(base: Pose, t: number): Pose {
  const raised = pulse(t, Infinity, 0, WAVE_S, 0.4);
  const hand = Math.sin(Math.max(0, t - 0.35) * 9) * smooth((t - 0.35) / 0.2) * (1 - smooth((t - (WAVE_S - 0.55)) / 0.2));
  return mix(base, { rightArmX: -0.25, rightArmZ: -2.55 + 0.32 * hand, headX: -0.06, headY: 0.18, headLift: base.headLift + 0.3, leftArmZ: ARM_REST + 0.05 }, raised);
}

/**
 * Coup : il tressaille (tête rejetée en arrière et détournée du côté frappé, bras écartés), puis se
 * frotte la tête en la baissant. `side` : -1 à 1, du flanc gauche au flanc droit de l'écran.
 */
function hit(base: Pose, t: number, side: number): Pose {
  const flinch = t < 0.08 ? smooth(t / 0.08) : 1 - smooth((t - 0.08) / 0.45);
  const rub = pulse(t, Infinity, 0.45, HIT_S - 0.45, 0.3);
  const flinched = mix(base, { headX: -0.42, headY: 0.35 * side, bodyX: -0.12, shoulders: 0.45, leftArmX: -0.5, leftArmZ: 0.75, rightArmX: -0.5, rightArmZ: -0.75 }, flinch);
  return mix(flinched, { headX: 0.22, headY: -0.12, rightArmX: -2.55, rightArmZ: 0.42 + 0.12 * Math.sin(t * 18), leftArmZ: ARM_REST + 0.08 }, rub);
}

/** Attrapé : bras et jambes qui gigotent, tête tournée vers le sol, souffle court, cape qui flotte. */
function held(t: number): Pose {
  const flail = Math.sin(t * 8.5);
  const kick = Math.sin(t * 10);
  return {
    headX: 0.38,
    headY: 0.3 * Math.sin(t * 2.7),
    headLift: 0.2,
    bodyX: 0,
    breath: breathing(t, 1.1),
    shoulders: 0.45,
    leftArmX: -0.5 + 0.55 * flail,
    leftArmZ: 0.55 + 0.2 * Math.sin(t * 6),
    rightArmX: -0.5 - 0.55 * flail,
    rightArmZ: -0.55 - 0.2 * Math.sin(t * 6 + 1),
    leftLegX: 0.5 * kick,
    rightLegX: -0.5 * kick,
    sway: 0,
    capeX: CAPE_REST + 0.35 + 0.08 * Math.sin(t * 5),
  };
}

/** En l'air (chute, saut) : bras écartés vers le haut, jambes décalées, cape soulevée. */
const AIR: Partial<Pose> = { headX: -0.1, leftArmX: -0.35, leftArmZ: 0.9, rightArmX: -0.35, rightArmZ: -0.9, leftLegX: -0.3, rightLegX: 0.25, capeX: CAPE_REST + 0.6 };

/** En vol (élytres) : bras le long du corps, un peu écartés, jambes serrées, regard devant lui. */
const GLIDE: Partial<Pose> = { headX: -0.15, leftArmX: 0.1, leftArmZ: 0.45, rightArmX: 0.1, rightArmZ: -0.45, leftLegX: 0.06, rightLegX: -0.06, sway: 0 };

/** Marche : `phase` en radians, donnée par l'aperçu pour que le pas suive le déplacement. */
function walking(phase: number): Partial<Pose> {
  const swing = Math.sin(phase);
  return {
    headX: 0.06,
    headY: 0,
    headLift: 0.3 * Math.abs(Math.cos(phase)),
    leftArmX: -0.6 * swing,
    leftArmZ: ARM_REST,
    rightArmX: 0.6 * swing,
    rightArmZ: -ARM_REST,
    leftLegX: 0.7 * swing,
    rightLegX: -0.7 * swing,
    sway: 0.03 * swing,
    capeX: CAPE_REST + 0.3,
  };
}

/** Réception : il se tasse, tête baissée et bras écartés, puis se redresse. */
function land(base: Pose, t: number): Pose {
  const weight = t < 0.08 ? smooth(t / 0.08) : 1 - smooth((t - 0.08) / (LAND_S - 0.08));
  return mix(
    base,
    { headX: 0.3, headLift: base.headLift - 0.9, bodyX: 0.12, shoulders: -0.5, leftArmX: -0.45, leftArmZ: 0.7, rightArmX: -0.45, rightArmZ: -0.7, leftLegX: -0.18, rightLegX: 0.18 },
    weight,
  );
}

export class MoodAnimation extends PlayerAnimation {
  private mood = currentMood();
  private previous: Mood = this.mood;
  private changedAt = -BLEND;
  private shown = shown;
  /** Début du bonjour, `null` hors salut. */
  private wavedAt: number | null;
  private hitAt: number | null = null;
  private hitSide = 0;
  private heldAt: number | null = null;
  private releasedAt = -Infinity;
  private landedAt: number | null = null;
  private airborne = false;
  private air = 0;
  private gliding = false;
  private wings = 0;
  private walkPhase: number | null = null;
  private lastPhase = 0;
  private stride = 0;
  private gaze: Gaze | null = null;
  private gazeWeight = 0;
  private gazeYaw = 0;
  private gazePitch = 0;
  private curiousUntil = 0;
  private nextCurious = between([2, 5]);

  /** `greet` : salue dès l'apparition (première ouverture de l'aperçu). */
  constructor({ greet }: { greet: boolean }) {
    super();
    listen();
    this.wavedAt = greet ? 0.25 : null;
  }

  /** Réaction au coup ; interrompt le bonjour. */
  hit(side: number) {
    this.hitAt = this.progress;
    this.hitSide = Math.max(-1, Math.min(1, side));
    this.wavedAt = null;
  }

  /** Attrapé (`true`) ou lâché ; le geste en cours s'efface. */
  hold(held: boolean) {
    if (held) {
      this.heldAt = this.progress;
      this.wavedAt = this.hitAt = null;
    } else if (this.heldAt !== null) {
      this.heldAt = null;
      this.releasedAt = this.progress;
    }
  }

  land() {
    this.landedAt = this.progress;
  }

  /** En l'air (chute ou saut) ou de nouveau au sol. */
  setAirborne(airborne: boolean) {
    this.airborne = airborne;
  }

  /** Élytres ouvertes (vol) ou repliées. */
  glide(gliding: boolean) {
    this.gliding = gliding;
  }

  /** Source du regard, donnée par l'aperçu qui sait où est la tête à l'écran. */
  follow(gaze: Gaze) {
    this.gaze = gaze;
  }

  /** Pas de la marche (`null` : à l'arrêt). */
  walk(phase: number | null) {
    this.walkPhase = phase;
    if (phase !== null) this.lastPhase = phase;
  }

  /** Suit le curseur des yeux par moments (pas quand il est fatigué) et toujours quand il passe tout près. */
  private look(pose: Pose, t: number, delta: number): Pose {
    if (t >= this.nextCurious) {
      this.curiousUntil = t + between(CURIOUS_S);
      this.nextCurious = this.curiousUntil + between(CURIOUS_GAP_S);
    }
    const target = this.gaze?.() ?? null;
    const watching = target !== null && (target.near || (this.mood !== "tired" && t < this.curiousUntil));
    this.gazeWeight += ((watching ? 1 : 0) - this.gazeWeight) * Math.min(1, delta * 4);
    if (target) {
      // Fatigué, il suit plus mollement.
      const follow = Math.min(1, delta * (this.mood === "tired" ? 3 : 8));
      this.gazeYaw += (target.yaw - this.gazeYaw) * follow;
      this.gazePitch += (target.pitch - this.gazePitch) * follow;
    }
    return this.gazeWeight > 0.001 ? mix(pose, { headX: this.gazePitch, headY: this.gazeYaw }, smooth(this.gazeWeight)) : pose;
  }

  protected animate(player: PlayerObject, delta: number) {
    const t = this.progress;
    const mood = currentMood();
    if (mood !== this.mood) {
      // Le joueur revient après s'être absenté : le personnage le salue.
      if (mood === "idle" && this.hitAt === null) this.wavedAt = t;
      this.previous = this.mood;
      this.mood = mood;
      this.changedAt = t;
    }
    if (this.shown !== shown) {
      this.shown = shown;
      if (this.hitAt === null) this.wavedAt = t;
    }
    const weight = smooth((t - this.changedAt) / BLEND);
    let pose = weight >= 1 ? POSES[this.mood](t) : mix(POSES[this.previous](t), POSES[this.mood](t), weight);
    if (this.wavedAt !== null) {
      if (t - this.wavedAt >= WAVE_S) this.wavedAt = null;
      else if (t >= this.wavedAt) pose = wave(pose, t - this.wavedAt);
    }
    pose = this.look(pose, t, delta);
    if (this.hitAt !== null) {
      if (t - this.hitAt >= HIT_S) this.hitAt = null;
      else pose = hit(pose, t - this.hitAt, this.hitSide);
    }
    const grip = this.heldAt !== null ? smooth((t - this.heldAt) / GRAB_IN) : 1 - smooth((t - this.releasedAt) / GRAB_OUT);
    if (grip > 0) pose = mix(pose, held(t), grip);
    const ease = Math.min(1, delta / STANCE_BLEND);
    this.air += ((this.airborne ? 1 : 0) - this.air) * ease;
    this.stride += ((this.walkPhase !== null ? 1 : 0) - this.stride) * ease;
    if (this.air > 0.001) pose = mix(pose, AIR, smooth(this.air));
    this.wings += ((this.gliding ? 1 : 0) - this.wings) * Math.min(1, delta / WING_BLEND);
    if (this.wings > 0.001) pose = mix(pose, GLIDE, smooth(this.wings));
    if (this.stride > 0.001) pose = mix(pose, walking(this.lastPhase), smooth(this.stride));
    if (this.landedAt !== null) {
      if (t - this.landedAt >= LAND_S) this.landedAt = null;
      else pose = land(pose, t - this.landedAt);
    }

    const { skin, cape } = player;
    // Tourner puis incliner, comme un cou : l'inclinaison reste verticale quand la tête est tournée.
    skin.head.rotation.set(pose.headX, pose.headY, 0, "YXZ");
    skin.head.position.y = pose.headLift;
    skin.body.rotation.x = pose.bodyX;
    skin.body.scale.set(1 + 0.012 * pose.breath, 1, 1 + 0.06 * pose.breath);
    skin.leftArm.rotation.set(pose.leftArmX, 0, pose.leftArmZ);
    skin.rightArm.rotation.set(pose.rightArmX, 0, pose.rightArmZ);
    skin.leftArm.position.y = skin.rightArm.position.y = -2 + pose.shoulders;
    skin.leftLeg.rotation.x = pose.leftLegX;
    skin.rightLeg.rotation.x = pose.rightLegX;
    skin.rotation.z = pose.sway;
    cape.rotation.x = pose.capeX;
    // Élytres : repliées au repos, ouvertes en vol avec un léger frémissement.
    const open = smooth(this.wings);
    player.elytra.leftWing.rotation.x = WING_FOLDED + (WING_OPEN_X - WING_FOLDED) * open;
    player.elytra.leftWing.rotation.z = WING_FOLDED + (WING_OPEN_Z - WING_FOLDED + 0.05 * Math.sin(t * 14)) * open;
    player.elytra.updateRightWing();
  }
}
