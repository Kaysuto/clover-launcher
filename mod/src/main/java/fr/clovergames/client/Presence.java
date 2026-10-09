package fr.clovergames.client;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientPacketListener;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Joueurs de la tablist qui jouent eux aussi avec le Clover Launcher, sur n'importe quel serveur.
 *
 * <p>Toutes les {@value #PERIOD_SECONDS} s, le mod signale au site que ce joueur est en jeu et lui
 * demande lesquels des joueurs de la tablist le sont aussi ({@link Site#presence}). Le site oublie
 * un joueur une minute après son dernier signal.
 */
public final class Presence {
    private static final long PERIOD_SECONDS = 20;
    /** Limite acceptée par le site (`/api/launcher/presence`). */
    private static final int MAX_PLAYERS = 500;
    private static final Logger LOGGER = LoggerFactory.getLogger(CloverClient.MOD_ID);

    private static volatile Set<UUID> online = Set.of();

    private Presence() {}

    public static boolean has(UUID player) {
        return online.contains(player);
    }

    static void start() {
        ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor(task -> {
            Thread thread = new Thread(task, "Clover presence");
            thread.setDaemon(true);
            return thread;
        });
        executor.scheduleWithFixedDelay(Presence::refresh, 5, PERIOD_SECONDS, TimeUnit.SECONDS);
    }

    private static void refresh() {
        Minecraft minecraft = Minecraft.getInstance();
        try {
            // La liste des joueurs appartient au thread du jeu : copiée là-bas.
            List<UUID> players = minecraft.submit(() -> tabList(minecraft)).get(10, TimeUnit.SECONDS);
            online = Site.presence(minecraft, players);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            // Site ou réseau indisponible : les icônes déjà connues restent jusqu'au prochain essai.
            LOGGER.debug("Présence Clover indisponible", e);
        }
    }

    private static List<UUID> tabList(Minecraft minecraft) {
        ClientPacketListener connection = minecraft.getConnection();
        return connection == null ? List.of() : connection.getOnlinePlayerIds().stream().limit(MAX_PLAYERS).toList();
    }
}
