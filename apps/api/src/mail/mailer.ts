import { Logger } from '@nestjs/common';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(msg: MailMessage): Promise<void>;
}

/** Development fallback when SMTP_URL is unset: prints the email (including links) to the API log. */
export class ConsoleMailer implements Mailer {
  private readonly logger = new Logger('Mail');
  async send(msg: MailMessage) {
    this.logger.log(`\n--- email to ${msg.to} ---\nSubject: ${msg.subject}\n\n${msg.text}\n---`);
  }
}

export class SmtpMailer implements Mailer {
  private transport: import('nodemailer').Transporter | undefined;
  constructor(
    private readonly url: string,
    private readonly from: string,
  ) {}
  async send(msg: MailMessage) {
    if (!this.transport) {
      const nodemailer = await import('nodemailer');
      this.transport = nodemailer.createTransport(this.url);
    }
    await this.transport.sendMail({ from: this.from, ...msg });
  }
}

/** Test double. */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  async send(msg: MailMessage) {
    this.sent.push(msg);
  }
  last(to: string): MailMessage | undefined {
    return [...this.sent].reverse().find((m) => m.to === to);
  }
}
