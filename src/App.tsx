import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

type Profile = { uuid: string; name: string };

type Progress = { phase: "java" | "libraries" | "assets" | "mods"; done: number; total: number };

type Game =
  | { kind: "idle"; error?: string }
  | { kind: "installing"; progress?: Progress }
  | { kind: "running" };

const PHASE_LABELS: Record<Progress["phase"], string> = {
  java: "Installation de Java",
  libraries: "Téléchargement de Minecraft et Fabric",
  assets: "Téléchargement des ressources",
  mods: "Installation des mods",
};

type State =
  | { kind: "restoring" }
  | { kind: "signed-out"; error?: string }
  | { kind: "signing-in" }
  | { kind: "signed-in"; profile: Profile };

function App() {
  const [state, setState] = useState<State>({ kind: "restoring" });
  const [game, setGame] = useState<Game>({ kind: "idle" });

  useEffect(() => {
    const unlisten = [
      listen<Progress>("install-progress", ({ payload }) =>
        setGame({ kind: "installing", progress: payload }),
      ),
      listen<number | null>("game-exited", ({ payload }) =>
        setGame(
          payload === 0
            ? { kind: "idle" }
            : { kind: "idle", error: `Le jeu s'est arrêté avec une erreur (code ${payload ?? "inconnu"}).` },
        ),
      ),
    ];
    return () => unlisten.forEach((promise) => promise.then((stop) => stop()));
  }, []);

  useEffect(() => {
    invoke<Profile | null>("restore_session")
      .then((profile) => setState(profile ? { kind: "signed-in", profile } : { kind: "signed-out" }))
      .catch((error: string) => setState({ kind: "signed-out", error }));
  }, []);

  async function login() {
    setState({ kind: "signing-in" });
    try {
      const profile = await invoke<Profile>("login");
      setState({ kind: "signed-in", profile });
    } catch (error) {
      setState({ kind: "signed-out", error: String(error) });
    }
  }

  async function play() {
    setGame({ kind: "installing" });
    try {
      await invoke("play");
      setGame({ kind: "running" });
    } catch (error) {
      setGame({ kind: "idle", error: String(error) });
    }
  }

  async function logout() {
    await invoke("logout");
    setState({ kind: "signed-out" });
  }

  return (
    <main className="container">
      <h1>Clover Launcher</h1>

      {state.kind === "restoring" && <p className="muted">Reconnexion…</p>}

      {state.kind === "signed-out" && (
        <>
          <button onClick={login}>Se connecter avec Microsoft</button>
          {state.error && <p className="error">{state.error}</p>}
        </>
      )}

      {state.kind === "signing-in" && (
        <p className="muted">Termine la connexion dans ton navigateur…</p>
      )}

      {state.kind === "signed-in" && (
        <>
          <p>
            Connecté en tant que <strong>{state.profile.name}</strong>
          </p>
          <p className="muted">{state.profile.uuid}</p>

          {game.kind === "idle" && (
            <>
              <button onClick={play}>Jouer</button>
              {game.error && <p className="error">{game.error}</p>}
            </>
          )}
          {game.kind === "installing" && <InstallProgress progress={game.progress} />}
          {game.kind === "running" && <p className="muted">Minecraft est lancé.</p>}

          <button className="secondary" onClick={logout} disabled={game.kind !== "idle"}>
            Se déconnecter
          </button>
        </>
      )}
    </main>
  );
}

function InstallProgress({ progress }: { progress?: Progress }) {
  if (!progress) return <p className="muted">Préparation…</p>;
  const percent = progress.total === 0 ? 100 : Math.floor((progress.done / progress.total) * 100);
  return (
    <div className="progress">
      <p className="muted">
        {PHASE_LABELS[progress.phase]} — {progress.done} / {progress.total}
      </p>
      <progress max={100} value={percent} />
    </div>
  );
}

export default App;
