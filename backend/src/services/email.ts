import nodemailer from 'nodemailer';
import path from 'path';
import { EmailConfig } from '../types';

export async function sendEbookToReader(config: EmailConfig, filePath: string): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: false,
    auth: { user: config.smtpUser, pass: config.smtpPass },
  });

  const filename = path.basename(filePath);

  await transporter.sendMail({
    from: config.senderEmail,
    to: config.readerEmail,
    subject: filename,
    text: `Your ebook "${filename}" is attached.`,
    attachments: [{ filename, path: filePath }],
  });
}
