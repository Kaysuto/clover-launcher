package fr.clovergames.client;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.authlib.exceptions.AuthenticationException;
import com.mojang.util.UndashedUuid;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import net.minecraft.client.Minecraft;
import net.minecraft.client.User;

/**
 * Échanges avec clovergames.fr, depuis le thread de la présence uniquement.
 *
 * <p>Le mod prouve le compte du joueur comme un serveur Minecraft le ferait, par la même route que
 * le launcher (`/api/launcher/session`) : il appelle `join` chez Mojang avec un `serverId` donné
 * par le site, qui vérifie par `hasJoined`. Le jeton Minecraft ne part que chez Mojang ; le jeton
 * court rendu par le site reste en mémoire le temps de la partie.
 */
final class Site {
    /** Adresse du site, ou celle donnée au launcher en développement (`CLOVER_SITE_URL`). */
    private static final String SITE_URL = siteUrl();
    /** Attente après une connexion refusée (compte hors ligne, Mojang indisponible). */
    private static final Duration AUTH_RETRY = Duration.ofMinutes(10);
    private static final Duration TIMEOUT = Duration.ofSeconds(10);
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(TIMEOUT).build();
    private static final Gson GSON = new Gson();

    private static String token;
    private static UUID tokenOwner;
    private static Instant nextAuth = Instant.MIN;

    private Site() {}

    /** Signale ce joueur en jeu ; rend ceux de `players` qui jouent aussi avec le launcher. */
    static Set<UUID> presence(Minecraft minecraft, List<UUID> players) throws IOException, InterruptedException {
        String bearer = token(minecraft);
        if (bearer == null) return Set.of();

        JsonArray uuids = new JsonArray();
        players.forEach(player -> uuids.add(UndashedUuid.toString(player)));
        JsonObject body = new JsonObject();
        body.add("uuids", uuids);
        HttpResponse<String> response = send(post("/api/launcher/presence", body).header("Authorization", "Bearer " + bearer));
        if (response.statusCode() == 401) {
            token = null;
            return Set.of();
        }
        if (response.statusCode() != 200) throw new IOException("presence : HTTP " + response.statusCode());

        Set<UUID> online = new HashSet<>();
        for (JsonElement id : GSON.fromJson(response.body(), JsonObject.class).getAsJsonArray("online")) {
            online.add(UndashedUuid.fromStringLenient(id.getAsString()));
        }
        return Set.copyOf(online);
    }

    private static String token(Minecraft minecraft) throws IOException, InterruptedException {
        User user = minecraft.getUser();
        if (token != null && user.getProfileId().equals(tokenOwner)) return token;
        if (Instant.now().isBefore(nextAuth)) return null;
        nextAuth = Instant.now().plus(AUTH_RETRY);

        String uuid = UndashedUuid.toString(user.getProfileId());
        HttpResponse<String> challenge = send(HttpRequest.newBuilder(uri("/api/launcher/session?uuid=" + uuid)).GET());
        if (challenge.statusCode() != 200) return null;
        String serverId = GSON.fromJson(challenge.body(), JsonObject.class).get("serverId").getAsString();
        try {
            minecraft.services().sessionService().joinServer(user.getProfileId(), user.getAccessToken(), serverId);
        } catch (AuthenticationException e) {
            return null;
        }

        JsonObject body = new JsonObject();
        body.addProperty("uuid", uuid);
        body.addProperty("name", user.getName());
        HttpResponse<String> session = send(post("/api/launcher/session", body));
        if (session.statusCode() != 200) return null;
        token = GSON.fromJson(session.body(), JsonObject.class).get("token").getAsString();
        tokenOwner = user.getProfileId();
        return token;
    }

    private static HttpRequest.Builder post(String path, JsonObject body) {
        return HttpRequest.newBuilder(uri(path))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(GSON.toJson(body)));
    }

    private static HttpResponse<String> send(HttpRequest.Builder request) throws IOException, InterruptedException {
        return HTTP.send(request.timeout(TIMEOUT).header("User-Agent", "CloverClient").build(), HttpResponse.BodyHandlers.ofString());
    }

    private static URI uri(String path) {
        return URI.create(SITE_URL + path);
    }

    private static String siteUrl() {
        String override = System.getenv("CLOVER_SITE_URL");
        return override == null || override.isBlank() ? "https://clovergames.fr" : override.replaceAll("/+$", "");
    }
}
