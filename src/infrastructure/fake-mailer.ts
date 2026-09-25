/**
 * FakeMailer — deterministic in-memory mailer.
 *
 * Records every sent message in memory. No network I/O is performed.
 * Used to verify that services send the correct notifications in tests.
 */

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
  readonly sentAt: number; // Unix ms from FakeClock
}

export class FakeMailer {
  private readonly _sent: MailMessage[] = [];

  /** Record a sent message. No I/O. */
  send(message: MailMessage): void {
    this._sent.push(message);
  }

  /** All messages sent since last clear(), in order. */
  get sentMessages(): readonly MailMessage[] {
    return this._sent;
  }

  /** Messages sent to a specific address. */
  sentTo(address: string): MailMessage[] {
    return this._sent.filter((m) => m.to === address);
  }

  /** Clear all recorded messages. Use in test setup/teardown. */
  clear(): void {
    this._sent.length = 0;
  }
}
