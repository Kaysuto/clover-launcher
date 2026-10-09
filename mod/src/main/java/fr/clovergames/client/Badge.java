package fr.clovergames.client;

import java.util.UUID;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.FontDescription;
import net.minecraft.network.chat.Style;
import net.minecraft.resources.Identifier;

/** Trèfle placé devant le nom d'un joueur du launcher (police `cloverclient:badge` du mod). */
public final class Badge {
    /** `` : le trèfle ; `` : l'espace de 2 px qui le sépare du nom. */
    private static final Component ICON = Component.literal("").withStyle(Style.EMPTY
            .withFont(new FontDescription.Resource(Identifier.fromNamespaceAndPath(CloverClient.MOD_ID, "badge")))
            .withColor(ChatFormatting.WHITE));

    private Badge() {}

    public static Component decorate(UUID player, Component name) {
        return Presence.has(player) ? Component.empty().append(ICON).append(name) : name;
    }
}
