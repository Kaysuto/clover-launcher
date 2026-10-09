package fr.clovergames.client;

import net.fabricmc.api.ClientModInitializer;

/** Mod caché du Clover Launcher : la présence démarre avec le jeu, les mixins ajoutent l'icône. */
public final class CloverClient implements ClientModInitializer {
    public static final String MOD_ID = "cloverclient";

    @Override
    public void onInitializeClient() {
        Presence.start();
    }
}
