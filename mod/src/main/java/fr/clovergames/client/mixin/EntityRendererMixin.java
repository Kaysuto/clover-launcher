package fr.clovergames.client.mixin;

import fr.clovergames.client.Badge;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Nametag au-dessus de la tête : `AvatarRenderer` (joueurs) hérite de ce `getNameTag`. */
@Mixin(EntityRenderer.class)
abstract class EntityRendererMixin {
    @Inject(method = "getNameTag", at = @At("RETURN"), cancellable = true)
    private void cloverclient$badge(Entity entity, CallbackInfoReturnable<Component> cir) {
        Component name = cir.getReturnValue();
        if (name != null && entity instanceof Player) cir.setReturnValue(Badge.decorate(entity.getUUID(), name));
    }
}
