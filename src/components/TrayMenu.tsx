import { listen } from "@tauri-apps/api/event";
import { DropdownMenu } from "radix-ui";
import { useEffect, useState } from "react";
import { api, type TrayState } from "@/lib/api";

/** The popup only renders the menu; account restoration and game state live in the main window. */
export function TrayMenu() {
  const [state, setState] = useState<TrayState>({ available: false, canPlay: false });
  const [opening, setOpening] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let receivedState = false;
    const stateListener = listen<TrayState>("tray-state", ({ payload }) => {
      receivedState = true;
      setState(payload);
    });
    const openListener = listen("tray-open", () => setOpening((value) => value + 1));
    void stateListener.then(() => api.trayState()).then((snapshot) => {
      if (!cancelled && !receivedState) setState(snapshot);
    }).catch((reason) => console.error("[tray]", reason));
    return () => {
      cancelled = true;
      void stateListener.then((stop) => stop());
      void openListener.then((stop) => stop());
    };
  }, []);

  const act = (action: Parameters<typeof api.trayAction>[0]) =>
    void api.trayAction(action).catch((reason) => console.error("[tray]", reason));
  const dismiss = () => void api.hideTrayMenu().catch((reason) => console.error("[tray]", reason));

  return (
    <DropdownMenu.Root key={opening} defaultOpen modal={false} onOpenChange={(open) => { if (!open) dismiss(); }}>
      <DropdownMenu.Trigger className="tray-menu-anchor" aria-label="Menu Clover Launcher" tabIndex={-1} />
      <DropdownMenu.Content className="tray-menu-content" side="bottom" align="start" sideOffset={8} loop
        onCloseAutoFocus={(event) => event.preventDefault()}>
        <DropdownMenu.Item className="tray-menu-item" onSelect={() => act("open")}>Ouvrir le Clover Launcher</DropdownMenu.Item>
        <DropdownMenu.Separator className="tray-menu-separator" />
        <DropdownMenu.Item className="tray-menu-item" disabled={!state.available || !state.canPlay} onSelect={() => act("play")}>Jouer (instance sélectionnée)</DropdownMenu.Item>
        <DropdownMenu.Item className="tray-menu-item" disabled={!state.available} onSelect={() => act("instances")}>Instances</DropdownMenu.Item>
        <DropdownMenu.Item className="tray-menu-item" disabled={!state.available} onSelect={() => act("settings")}>Paramètres</DropdownMenu.Item>
        <DropdownMenu.Separator className="tray-menu-separator" />
        <DropdownMenu.Item className="tray-menu-item" onSelect={() => act("quit")}>Quitter</DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
