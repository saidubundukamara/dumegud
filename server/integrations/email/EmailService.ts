import "server-only";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Low-cardinality label for logs/metrics, e.g. "verify-email". Never PII. */
  tag: string;
};

export interface EmailService {
  send(message: EmailMessage): Promise<void>;
}
