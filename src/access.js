import { back, bindForm, button, errorRegion, esc, field, header, icon, link, pill } from './ui.js';
import { bindGoogle, googleButton, googleRegistration } from './google.js';
import { musicalFields, bindMusicalFields } from './part-options.js';

export const mailRoutes = ['recuperar','restablecer','verificar'];
const newPassword = 'type="password" required minlength="12" maxlength="128" autocomplete="new-password"';
const emailKey = 'calvario:correo-recordado';
const emailField = () => authField('email','Correo electrónico','mail',
  'type="email" required autocomplete="email" maxlength="254" placeholder="tu@correo.es"');

function authField(name, label, glyph, attributes, action = '', assistance = '') {
  return '<div class="auth-field"><div class="auth-label"><label for="auth-' + name + '">' + label + '</label>' +
    assistance + '</div><div class="auth-input">' +
    icon(glyph) + '<input id="auth-' + name + '" name="' + name + '" ' + attributes + '>' + action + '</div></div>';
}

function accessFrame(body) {
  return '<main class="access"><div class="access-brand">' +
    '<div class="access-emblem"><img src="./public/escudo_calvario_vector.svg" width="1080" height="1080" alt="Escudo de la banda"></div>' +
    '<p class="access-name"><span class="access-kicker">Banda de Cornetas y Tambores del</span> ' +
    '<span class="access-wordmark">Santísimo Cristo del Calvario</span></p></div>' +
    '<section class="access-panel"><div class="access-content">' + body + '</div></section></main>';
}

function showAccess(shell, body) {
  shell.innerHTML = accessFrame(body);
  const heading = shell.querySelector('h1');
  document.title = heading.textContent + ' · Calvario';
  heading.focus({ preventScroll:true });
}

function accountStatus(member) {
  const pending = member.status === 'pending';
  const verify = member.needsEmailVerification;
  const rejected = member.status === 'rejected';
  const title = verify ? 'Confirma tu correo' : pending ? 'Solicitud pendiente' : rejected ? 'Solicitud no admitida' : 'Acceso bloqueado';
  const status = verify ? 'Abre el enlace enviado a ' + member.email + ' para que la banda pueda revisar tu solicitud.' :
    pending ? 'Tu solicitud está pendiente de revisión por la banda.' : rejected ? 'La banda no ha aprobado esta solicitud.' :
      'Tu cuenta no tiene una membresía activa.';
  return '<div class="account-stage"><span class="tile">' + icon(verify ? 'mail' : pending ? 'clock' : 'shield') + '</span>' +
    pill(verify ? 'Verificación' : pending ? 'En revisión' : 'Estado de la cuenta',pending ? 'waiting' : 'accent') +
    '</div>' + header(title, member.name) + '<p class="muted">' + esc(status) + '</p>' +
    (verify ? '<form class="stack" id="resend-link">' + errorRegion + button('Reenviar enlace','secondary') + '</form>' : '') +
    '<div class="actions">' + (pending ? button('Comprobar estado','primary','id="retry"') : '') +
    button('Cerrar sesión','secondary','id="signout"') + '</div>';
}

function accessForm(requesting, offline, mailEnabled, values) {
  const password = requesting ? newPassword :
    'type="password" required maxlength="128" autocomplete="current-password" placeholder="••••••••••••"';
  const reveal = '<button type="button" class="auth-reveal" id="show-password" aria-label="Mostrar contraseña" aria-pressed="false">' +
    icon('eye') + '</button>';
  const recovery = !requesting && mailEnabled ? link('¿Olvidaste tu clave?','#/recuperar') : '';
  return (requesting ? back('Acceso','#/inicio') + header('Únete a la banda',
    'Dirección revisará tu solicitud después de que confirmes el correo.','','Portal de componentes') :
    '<header class="page-head cinematic-heading"><div class="cinematic-meta"><p class="eyebrow">Portal de componentes</p>' +
    '<span class="cinematic-badge">Área privada</span></div><h1 tabindex="-1">Inicia sesión</h1>' +
    '<p class="muted">Introduce las credenciales oficiales de tu cuenta.</p></header>') +
    (offline ? '<p class="callout">Necesitas conexión para entrar o solicitar acceso.</p>' : '') +
    '<form class="stack cinematic-form" id="access-form">' +
    (requesting ? authField('name','Nombre y apellidos','perfil','required autocomplete="name" maxlength="120"') : '') +
    emailField() + authField('password','Contraseña','lock',password,reveal,recovery) +
    (requesting ? '<p class="muted">Usa una contraseña de al menos 12 caracteres.</p><div class="field-grid">' +
      musicalFields(values) + '</div>' :
      '<label class="auth-remember"><input id="remember-email" type="checkbox"> Recordar mi correo en este dispositivo</label>') +
    errorRegion + '<button type="submit" class="button primary access-submit">' + icon(requesting ? 'arrow' : 'login') +
    (requesting ? 'Enviar solicitud' : 'Entrar') + '</button></form>';
}

function accessFooter(mailEnabled) {
  return '<footer class="access-help">' + icon('shield') +
    '<p>Portal de acceso exclusivo para componentes, aspirantes y dirección. ' +
    (mailEnabled ? '<a href="#/solicitud">Solicitar alta a Secretaría</a>.' : 'Solicita el alta a Dirección.') + '</p></footer>';
}

function rememberEmail(email) {
  try {
    if (email) localStorage.setItem(emailKey,email.trim());
    else localStorage.removeItem(emailKey);
  } catch {}
}

function mailForm(route) {
  let title, prompt, submit, content;
  if (route === 'recuperar') {
    title = 'Recuperar acceso';
    prompt = 'Indica el correo de tu cuenta para recibir un enlace de recuperación.';
    submit = 'Enviar enlace';
    content = emailField();
  } else if (route === 'restablecer') {
    title = 'Elige una contraseña nueva';
    prompt = 'Usa al menos 12 caracteres. Las sesiones anteriores se cerrarán.';
    submit = 'Cambiar contraseña';
    content = authField('password','Contraseña nueva','lock',newPassword) +
      authField('confirmation','Repetir contraseña','lock',newPassword);
  } else {
    title = 'Confirma tu correo';
    prompt = 'Confirma que este correo pertenece a tu solicitud de acceso.';
    submit = 'Confirmar correo';
    content = '';
  }
  return back('Acceso','#/inicio') + header(title,prompt) +
    '<form class="stack" id="mail-form">' + content + errorRegion + button(submit) + '</form>';
}

export function access(shell, ctx, route, id) {
  const requesting = route === 'solicitud' && ctx.state.mailEnabled;
  const member = ctx.state.member;
  if (!member && ctx.state.pilotUnavailable) {
    showAccess(shell,header('Piloto de Calvario') +
      '<p class="muted" role="status">El servidor del piloto todavía no está disponible.</p>' +
      button('Reintentar','secondary','id="retry"'));
    shell.querySelector('#retry').addEventListener('click',ctx.bootstrap);
    return;
  }
  if (mailRoutes.includes(route)) {
    showAccess(shell,mailForm(route));
    bindForm(shell.querySelector('#mail-form'), async input => {
      if (route === 'recuperar') {
        await ctx.api('/account/forgot','POST',{ email:input.email });
        showAccess(shell,back('Acceso','#/inicio') + header('Revisa tu correo') +
          '<p class="muted" role="status">Si la dirección corresponde a una cuenta que puede recuperarse, recibirás un enlace.</p>');
        return;
      }
      if (!id || !/^[0-9A-Za-z_-]{43}$/.test(id)) throw new Error('El enlace es inválido o ha caducado.');
      if (route === 'restablecer' && input.password !== input.confirmation) throw new Error('Las contraseñas deben coincidir.');
      const verify = route === 'verificar';
      await ctx.api(verify ? '/account/verify' : '/account/reset','POST',{ token:id, password:input.password });
      history.replaceState(null,'','#/inicio');
      await ctx.bootstrap();
      ctx.toast(verify ? 'Correo confirmado. Ya se puede revisar tu solicitud.' : 'Contraseña cambiada.');
    });
    return;
  }
  const google = !member && !ctx.state.offline && ctx.state.google;
  const federated = '<p class="auth-divider">O accede mediante</p><form class="stack google-access" id="google-form"' +
    (google ? '' : ' aria-label="Acceso con Google no disponible" title="Acceso con Google no disponible"') + '>' +
    errorRegion + googleButton('Acceder con Google') + '</form>';
  showAccess(shell,member && member.status !== 'active' ? accountStatus(member) :
    accessForm(requesting,ctx.state.offline,ctx.state.mailEnabled,ctx.state.catalogValues) +
    (!requesting || google ? federated : '') + (requesting ? '' : accessFooter(ctx.state.mailEnabled)));
  const googleForm = shell.querySelector('#google-form');
  if (google && googleForm) bindGoogle(googleForm,google,async idToken => {
    try {
      await ctx.api('/auth/google','POST',{ mode:'login',idToken });
      history.replaceState(null,'','#/inicio');
      await ctx.bootstrap();
    } catch (error) {
      if (error.code !== 'profile_required') throw error;
      googleRegistration(shell.querySelector('.access-content'),ctx,idToken);
    }
  });
  shell.querySelector('#retry')?.addEventListener('click',ctx.bootstrap);
  shell.querySelector('#signout')?.addEventListener('click',() => ctx.logout().catch(error => ctx.toast(error.message)));
  const resend = shell.querySelector('#resend-link');
  if (resend) bindForm(resend,async () => {
    await ctx.api('/account/resend','POST',{});
    ctx.toast('Revisa tu bandeja de entrada. El enlace puede tardar en llegar.');
  });
  const form = shell.querySelector('#access-form');
  if (requesting) bindMusicalFields(form,ctx.state.catalogValues);
  const remember = form?.querySelector('#remember-email');
  if (remember) {
    try {
      const email = localStorage.getItem(emailKey);
      if (email) {
        form.elements.email.value = email;
        remember.checked = true;
      }
    } catch {}
    remember.addEventListener('change', () => { if (!remember.checked) rememberEmail(''); });
  }
  const reveal = form?.querySelector('#show-password');
  if (reveal) reveal.onclick = () => {
    const visible = form.elements.password.type === 'password';
    form.elements.password.type = visible ? 'text' : 'password';
    reveal.setAttribute('aria-pressed',String(visible));
    reveal.innerHTML = icon(visible ? 'eye-off' : 'eye');
  };
  if (form) bindForm(form,async input => {
    await ctx.signIn(requesting,input);
    if (remember?.checked) rememberEmail(input.email);
    history.replaceState(null,'','#/inicio');
    await ctx.bootstrap();
  });
}
