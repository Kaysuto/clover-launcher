/**
 * Rapports de plantage de l'interface vers Sentry, seulement avec l'accord du joueur (CLO-274).
 * Le cœur Rust envoie les siens (`src-tauri/src/crash.rs`) et fournit le DSN.
 *
 * Sentry n'est démarré qu'une fois l'accord donné et fermé s'il est retiré : sans accord, aucune
 * requête ne part. Ni suivi de session, ni rapports d'envoi, ni données personnelles ; les dossiers
 * personnels sont retirés des messages.
 */
import * as Sentry from "@sentry/react";

import type { SystemInfo } from "@/lib/api";

let active = false;

/** `C:\Users\Kevin\…`, `/Users/kevin/…`, `/home/kevin/…` → `…\Users\~\…`. */
export function scrubHome(text: string): string {
  return text.replace(/([A-Za-z]:[\\/]+Users[\\/]+|\/Users\/|\/home\/)[^\\/\s"'`]+/gi, "$1~");
}

export function setCrashReports(enabled: boolean, reporting: SystemInfo["crash"], beta: boolean) {
  if (enabled && !active) {
    active = true;
    Sentry.init({
      dsn: reporting.dsn,
      release: reporting.release,
      environment: reporting.environment,
      // Ni utilisateur, ni cookies, ni en-têtes, ni corps de requêtes, ni paramètres d'adresse.
      dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
      sendClientReports: false,
      initialScope: { tags: { canal: beta ? "beta" : "prod", origine: "interface" } },
      integrations: (defaults) => defaults.filter((integration) => integration.name !== "BrowserSession"),
      beforeSend(event) {
        for (const exception of event.exception?.values ?? []) if (exception.value) exception.value = scrubHome(exception.value);
        if (event.message) event.message = scrubHome(event.message);
        return event;
      },
      beforeBreadcrumb(breadcrumb) {
        if (breadcrumb.message) breadcrumb.message = scrubHome(breadcrumb.message);
        return breadcrumb;
      },
    });
  } else if (!enabled && active) {
    active = false;
    void Sentry.close();
  }
}
