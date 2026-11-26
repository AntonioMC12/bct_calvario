import { back, bindForm, button, errorRegion, esc, field, header, icon, link, pill } from './ui.js';
import { bindGoogle, googleButton, googleRegistration } from './google.js';
import { optionLists } from './part-options.js';

export const mailRoutes = ['recuperar','restablecer','verificar'];
const emailField = () => field('email','Correo electrónico','type="email" required autocomplete="email" maxlength="254"');
const newPassword = 'type="password" required minlength="12" maxlength="128" autocomplete="new-password"';

function accessFrame(body) {
  return '<main class="access"><div class="access-brand"><img src="./public/escudo.png" alt="" width="210" height="210">' +
    '<div><span class="brand">Calvario</span><p>Banda de Cornetas y Tambores<br>Santísimo Cristo del Calvario</p></div></div><div class="access-body">' +
    '<section class="access-panel">' + body + '</section></div></main>';
}

function accountStatus(member) {
  const pending = member.status === 'pending';
  const verify = member.needsEmailVerification;
  const rejected = member.status === 'rejected';
  const title = verify ? 'Confirma tu correo' : pending ? 'Solicitud pendiente' : rejected ? 'Solicitud no admitida' : 'Acceso bloqueado';
  const status = verify ? 'Abre el enlace enviado a ' + member.email + ' para que la banda pueda revisar tu solicitud.' :
    pending ? 'Tu solicitud está pendiente de revisión por la banda.' : rejected ? 'La banda no ha aprobado esta solicitud.' :
      'Tu cuenta no tiene una membresía activa.';
  return '<div class="account-stage">' + pill(verify ? 'Verificación' : pending ? 'En revisión' : 'Estado de la cuenta',pending ? 'waiting' : 'accent') +
    '</div>' + header(title, member.name) + '<p class="muted">' + esc(status) + '</p>' +
    (verify ? '<form class="stack" id="resend-link">' + errorRegion + button('Reenviar enlace','secondary') + '</form>' : '') +
    '<div class="actions">' + (pending ? button('Comprobar estado','primary','id="retry"') : '') +
    button('Cerrar sesión','secondary','id="signout"') + '</div>';
}

function accessForm(requesting, offline, mailEnabled, values) {
  const password = requesting ? newPassword : 'type="password" required maxlength="128" autocomplete="current-password"';
  const tab = (title, href, glyph, active) => '<a href="' + href + '"' + (active ? ' aria-current="page"' : '') + '>' + icon(glyph) + title + '</a>';
  return (mailEnabled ? '<nav class="access-tabs" aria-label="Entrada a Calvario">' + tab('Acceso','#/inicio','perfil',!requesting) +
    tab('Solicitud','#/solicitud','plus',requesting) + '</nav>' : '') +
    header(requesting ? 'Únete a la banda' : 'Acceso a la banda', requesting ? 'Tu solicitud requiere aprobación.' : '') +
    (offline ? '<p class="callout">Necesitas conexión para entrar o solicitar acceso.</p>' : '') +
    '<form class="stack" id="access-form">' +
    (requesting ? field('name','Nombre y apellidos','required autocomplete="name" maxlength="120"') : '') +
    emailField() + '<div class="password-field">' + field('password','Contraseña',password) +
    '<button type="button" class="text-link" id="show-password" aria-label="Mostrar contraseña" aria-pressed="false">' + icon('eye') + '</button></div>' +
    (requesting ? '<p class="muted">Usa una contraseña de al menos 12 caracteres.</p><div class="field-grid">' +
      field('instrument','Instrumento','required maxlength="80" list="instrument-options"') +
      field('voice','Voz','maxlength="80" list="voice-options"') + '</div>' + optionLists(values) :
      (mailEnabled ? link('¿Has olvidado la contraseña?','#/recuperar') : '')) +
    errorRegion + button(requesting ? 'Enviar solicitud' : 'Entrar') + '</form>' +
    (mailEnabled ? '' : '<p class="muted access-help">Si necesitas una cuenta, solicita el alta a la dirección de la banda.</p>');
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
    content = field('password','Contraseña nueva',newPassword) + field('confirmation','Repetir contraseña',newPassword);
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
    shell.innerHTML = accessFrame(header('Piloto de Calvario') +
      '<p class="muted" role="status">El servidor del piloto todavía no está disponible.</p>' +
      button('Reintentar','secondary','id="retry"'));
    shell.querySelector('#retry').addEventListener('click',ctx.bootstrap);
    return;
  }
  if (mailRoutes.includes(route)) {
    shell.innerHTML = accessFrame(mailForm(route));
    bindForm(shell.querySelector('#mail-form'), async input => {
      if (route === 'recuperar') {
        await ctx.api('/account/forgot','POST',{ email:input.email });
        shell.innerHTML = accessFrame(back('Acceso','#/inicio') + header('Revisa tu correo') +
          '<p class="muted" role="status">Si la dirección corresponde a una cuenta que puede recuperarse, recibirás un enlace.</p>');
        shell.querySelector('h1').focus();
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
    shell.querySelector('h1').focus({ preventScroll:true });
    return;
  }
  const google = !member && !ctx.state.offline && ctx.state.google;
  const federated = google ? '<form class="stack google-access" id="google-form">' + errorRegion +
    googleButton('Continuar con Google') + '</form>' : '';
  shell.innerHTML = accessFrame(member && member.status !== 'active' ? accountStatus(member) :
    accessForm(requesting,ctx.state.offline,ctx.state.mailEnabled,ctx.state.catalogValues) + federated);
  if (google) bindGoogle(shell.querySelector('#google-form'),google,async idToken => {
    try {
      await ctx.api('/auth/google','POST',{ mode:'login',idToken });
      history.replaceState(null,'','#/inicio');
      await ctx.bootstrap();
    } catch (error) {
      if (error.code !== 'profile_required') throw error;
      googleRegistration(shell.querySelector('.access-panel'),ctx,idToken);
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
  const reveal = form?.querySelector('#show-password');
  if (reveal) reveal.onclick = () => {
    const visible = form.elements.password.type === 'password';
    form.elements.password.type = visible ? 'text' : 'password';
    reveal.setAttribute('aria-pressed',String(visible));
  };
  if (form) bindForm(form,async input => {
    await ctx.signIn(requesting,input);
    history.replaceState(null,'','#/inicio');
    await ctx.bootstrap();
  });
}
