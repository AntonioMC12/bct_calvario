import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import nodemailer from 'nodemailer';

export function fileMail(directory) {
  const folder = resolve(directory);
  return async message => {
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const filename = resolve(folder, Date.now() + '-' + randomUUID() + '.txt');
    const content = 'Para: ' + message.to + '\nAsunto: ' + message.subject + '\n\n' + message.text + '\n';
    await writeFile(filename, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  };
}

export function smtpMail(connection, from) {
  let address;
  try {
    address = new URL(connection);
  } catch {
    throw new Error('CALVARIO_SMTP_URL debe ser una URL smtp:// o smtps://.');
  }
  if (!['smtp:', 'smtps:'].includes(address.protocol) || !address.hostname ||
    !['', '/'].includes(address.pathname) || address.search || address.hash ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from || '')) {
    throw new Error('Revisa CALVARIO_SMTP_URL y configura un correo válido en CALVARIO_MAIL_FROM.');
  }
  const secure = address.protocol === 'smtps:';
  const transporter = nodemailer.createTransport({
    host: address.hostname,
    port: Number(address.port || (secure ? 465 : 587)),
    secure,
    requireTLS: !secure,
    auth: address.username ? { user: decodeURIComponent(address.username), pass: decodeURIComponent(address.password) } : undefined,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return async message => {
    const result = await transporter.sendMail({
      from, to: { name: '', address: message.to }, subject: message.subject, text: message.text,
    });
    if (!result.accepted?.length) throw new Error('El servidor no aceptó el mensaje.');
  };
}

export function createMail({ demo = false, env = process.env } = {}) {
  if (!demo && env.CALVARIO_SMTP_URL) return smtpMail(env.CALVARIO_SMTP_URL, env.CALVARIO_MAIL_FROM);
  return fileMail(env.CALVARIO_MAILBOX || (demo ? 'data/demo-mailbox' : 'data/mailbox'));
}
