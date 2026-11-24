import { back, bindForm, button, empty, errorRegion, header } from './ui.js';

const cacheName = 'calvario-device-push';
const bindingPath = '/_calvario-push-binding';

async function setBinding(binding) {
  const cache = await caches.open(cacheName);
  await cache.put(bindingPath,new Response(binding));
}

async function currentBinding() {
  return (await (await caches.open(cacheName)).match(bindingPath))?.text();
}

export async function clearPush() {
  if (!globalThis.caches) return;
  const exists = await caches.delete(cacheName);
  if (!exists || !navigator.serviceWorker) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager?.getSubscription();
  await subscription?.unsubscribe();
  for (const notification of await registration?.getNotifications() ?? []) notification.close();
}

function publicKeyBytes(value) {
  const base64 = value.replaceAll('-','+').replaceAll('_','/');
  return Uint8Array.from(atob(base64),character => character.charCodeAt(0));
}

export async function pushSettings(container,ctx) {
  const previous = back('Perfil','#/perfil') + header('Notificaciones');
  container.innerHTML = previous;
  if (!ctx.state.pushEnabled || ctx.state.offline) {
    container.insertAdjacentHTML('beforeend',empty(ctx.state.offline ? 'Conéctate para cambiar las notificaciones.' :
      'Los avisos push aún no están disponibles en esta instalación. Puedes consultarlos en Avisos.'));
    return;
  }
  if (!('Notification' in globalThis) || !('PushManager' in globalThis) || !navigator.serviceWorker) {
    container.insertAdjacentHTML('beforeend',empty('Este navegador no permite avisos push en esta vista. En iPhone y iPad, añade Calvario a la pantalla de inicio.'));
    return;
  }
  const account = ctx.state.member.id;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.active?.scriptURL || !registration.pushManager) {
    container.insertAdjacentHTML('beforeend',empty('Vuelve a abrir Calvario cuando termine de instalarse.'));
    return;
  }
  let subscription = await registration.pushManager.getSubscription();
  let binding = await currentBinding();
  const config = await ctx.api('/push');
  if (!container.isConnected) return;
  const matched = config.bindings.includes(binding);
  const enabled = Boolean(matched && subscription && Notification.permission === 'granted');
  const denied = Notification.permission === 'denied';

  container.insertAdjacentHTML('beforeend','<form class="card stack"><p>' +
    (enabled ? 'Recibes avisos en este dispositivo.' : 'La bandeja de Avisos está siempre disponible.') + '</p>' +
    (denied ? '<p class="muted">Las notificaciones están bloqueadas. Puedes permitirlas en los ajustes del navegador o del dispositivo.</p>' : '') +
    errorRegion + (enabled ? button('Desactivar en este dispositivo','secondary') :
      denied ? '' : button('Activar en este dispositivo')) + '</form>');
  if (denied && !enabled) return;
  bindForm(container.querySelector('form'),async () => {
    if (enabled) {
      await caches.delete(cacheName);
      try {
        await ctx.api('/push','DELETE',{ endpoint:subscription.endpoint });
      } finally {
        await subscription.unsubscribe();
        for (const notification of await registration.getNotifications()) notification.close();
      }
      ctx.toast('Avisos push desactivados en este dispositivo.');
    } else {
      if (await Notification.requestPermission() !== 'granted') {
        await pushSettings(container,ctx);
        return;
      }
      if (subscription && binding && !matched) {
        await subscription.unsubscribe();
        subscription = null;
      }
      if (!subscription) subscription = await registration.pushManager.subscribe({
        userVisibleOnly:true, applicationServerKey:publicKeyBytes(config.publicKey),
      });
      try {
        const result = await ctx.api('/push','POST',subscription.toJSON());
        if (ctx.state.member?.id !== account) throw new Error('Tu sesión ha cambiado.');
        binding = result.id;
        await setBinding(binding);
        if (ctx.state.member?.id !== account) {
          await clearPush();
          throw new Error('Tu sesión ha cambiado.');
        }
      } catch (error) {
        await subscription.unsubscribe().catch(() => {});
        throw error;
      }
      ctx.toast('Avisos push activados en este dispositivo.');
    }
    await pushSettings(container,ctx);
  });
}
