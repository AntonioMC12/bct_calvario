import { bindForm, button, errorRegion, field, header } from './ui.js';
import { musicalFields, bindMusicalFields } from './part-options.js';

const sdk = 'https://www.gstatic.com/firebasejs/13.4.0/';
let client;

function googleClient(config) {
  client ??= Promise.all([import(sdk + 'firebase-app.js'), import(sdk + 'firebase-auth.js')]).then(async ([app, module]) => {
    const firebase = app.getApps().find(item => item.name === 'calvario') ?? app.initializeApp(config,'calvario');
    const auth = module.initializeAuth(firebase,{
      persistence:module.inMemoryPersistence, popupRedirectResolver:module.browserPopupRedirectResolver,
    });
    const provider = new module.GoogleAuthProvider();
    provider.setCustomParameters({ prompt:'select_account' });
    await auth.authStateReady();
    return async () => {
      let result;
      try {
        result = await module.signInWithPopup(auth,provider);
        return await result.user.getIdToken();
      } catch (error) {
        if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
          throw new Error('Has cancelado el inicio de sesión con Google.');
        }
        if (error.code === 'auth/popup-blocked') throw new Error('Permite las ventanas emergentes para continuar con Google.');
        if (error.code === 'auth/unauthorized-domain') throw new Error('Este dominio aún no está autorizado en Firebase.');
        throw new Error('No se pudo completar el acceso con Google.');
      } finally {
        await module.signOut(auth).catch(() => {});
      }
    };
  });
  return client;
}

export function googleButton(label) {
  return '<button class="button google-button" type="submit" disabled>' +
    '<img src="./public/google-g.png" width="18" height="18" alt="">' + label + '</button>';
}

export function bindGoogle(form, config, useToken) {
  const control = form.querySelector('.google-button');
  const feedback = form.querySelector('.form-error');
  googleClient(config).then(authorize => {
    if (!form.isConnected) return;
    control.disabled = false;
    bindForm(form, async (input) => {
      const idToken = await authorize();
      if (!form.isConnected) return;
      await useToken(idToken,input);
    });
  }).catch(() => {
    if (!form.isConnected) return;
    feedback.textContent = 'No se pudo cargar el acceso con Google.';
    feedback.hidden = false;
  });
}

export function googleRegistration(container, ctx, idToken) {
  container.innerHTML = header('Solicitar acceso con Google','Indica cómo participas en la banda.') +
    '<form class="stack">' +
    field('name','Nombre y apellidos','required autocomplete="name" maxlength="120"') +
    musicalFields(ctx.state.catalogValues) +
    errorRegion + '<div class="actions">' + button('Enviar solicitud') +
    button('Volver al acceso','secondary','type="button" id="cancel-google"') + '</div></form>';
  bindMusicalFields(container.querySelector('form'),ctx.state.catalogValues);
  container.querySelector('h1').focus();
  container.querySelector('#cancel-google').addEventListener('click',ctx.bootstrap);
  bindForm(container.querySelector('form'), async input => {
    await ctx.api('/auth/google','POST',{ ...input, idToken, mode:'register' });
    history.replaceState(null,'','#/inicio');
    await ctx.bootstrap();
  });
}
