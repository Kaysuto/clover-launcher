package fr.clovergames.client.mixin;

import fr.clovergames.client.Badge;
import net.minecraft.client.gui.components.PlayerTabOverlay;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.network.chat.Component;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Nom de la tablist, entre la tête du joueur et son pseudo ; la largeur de la colonne en tient compte. */
@Mixin(PlayerTabOverlay.class)
abstract class PlayerTabOverlayMixin {
    @Inject(method = "getNameForDisplay", at = @At("RETURN"), cancellable = true)
    private void cloverclient$badge(PlayerInfo info, CallbackInfoReturnable<Component> cir) {
        cir.setReturnValue(Badge.decorate(info.getProfile().id(), cir.getReturnValue()));
    }
}
