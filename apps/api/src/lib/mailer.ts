import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { getEnv } from '../config/env.js';
import { createLogger } from './logger.js';

const log = createLogger('mailer');

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  const env = getEnv();

  if (
    env.NODE_ENV === 'test' ||
    !env.SMTP_HOST ||
    env.SMTP_HOST === 'console' ||
    env.SMTP_HOST === 'json'
  ) {
    transporter = nodemailer.createTransport({ jsonTransport: true });
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth:
      env.SMTP_USER && env.SMTP_PASS
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
  });

  return transporter;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail(options: SendMailOptions): Promise<void> {
  const env = getEnv();
  try {
    const info = await getTransporter().sendMail({
      from: env.EMAIL_FROM,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html ?? options.text,
    });
    log.info({ messageId: info.messageId, to: options.to }, 'email sent');
    if (env.NODE_ENV !== 'production') {
      log.debug({ preview: typeof info.message === 'string' ? info.message : undefined }, 'email preview');
    }
  } catch (err) {
    log.warn({ err, to: options.to }, 'email send failed — falling back to console');
    console.info(`[mailer] To: ${options.to}\nSubject: ${options.subject}\n${options.text}`);
  }
}

export function resetMailer(): void {
  transporter = null;
}
