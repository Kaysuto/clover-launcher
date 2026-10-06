import { getCurrentWindow, type Window } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

type Direction = Parameters<Window["startResizeDragging"]>[0];

const HANDLES: [Direction, string][] = [
  ["North", "inset-x-3 top-0 h-1.5 cursor-n-resize"],
  ["South", "inset-x-3 bottom-0 h-1.5 cursor-s-resize"],
  ["West", "inset-y-3 left-0 w-1.5 cursor-w-resize"],
  ["East", "inset-y-3 right-0 w-1.5 cursor-e-resize"],
  ["NorthWest", "top-0 left-0 size-3 cursor-nw-resize"],
  ["NorthEast", "top-0 right-0 size-3 cursor-ne-resize"],
  ["SouthWest", "bottom-0 left-0 size-3 cursor-sw-resize"],
  ["SouthEast", "bottom-0 right-0 size-3 cursor-se-resize"],
];

/**
 * Fenêtre sans cadre : la WebView couvre les bords et le système ne propose plus de les tirer.
 * Ces bandes invisibles rendent le redimensionnement, sauf une fois la fenêtre agrandie.
 */
export function ResizeHandles() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    appWindow.isMaximized().then(setMaximized);
    const unlisten = appWindow.onResized(() => appWindow.isMaximized().then(setMaximized));
    return () => void unlisten.then((stop) => stop());
  }, []);

  if (maximized) return null;
  return HANDLES.map(([direction, place]) => (
    <div
      key={direction}
      aria-hidden
      className={`fixed z-[100] ${place}`}
      onMouseDown={(event) => event.button === 0 && void getCurrentWindow().startResizeDragging(direction)}
    />
  ));
}
