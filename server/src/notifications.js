/** SMS extension point. The application writes its outbox in the same transaction
 * as each stage change. No message is marked SENT unless a provider accepts it.
 * Before enabling a worker, implement provider-side idempotency with notification.id,
 * retries/backoff, and exclusive row claims (FOR UPDATE SKIP LOCKED) per worker.
 * Do not call a network provider inside the laundry status database transaction.
 */
export class SmsProvider {
  async send({ to, message, idempotencyKey }) {
    throw new Error("SMS provider is not configured");
  }
}
export const notificationStages = ["DRYING", "FOLDING", "READY"];
