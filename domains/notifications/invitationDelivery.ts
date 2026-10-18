/** Delivery is deliberately unavailable until a reviewed transport is installed.
 * A provider key or an environment flag alone must never enable sending. */
export type InvitationEmail = { to: string; subject: string; text: string; html: string };
export type InvitationDeliveryResult =
  | { status: "NOT_SENT"; reason: "DELIVERY_NOT_CONFIGURED" }
  | { status: "SUBMITTED"; providerMessageId: string }
  | { status: "FAILED"; reason: string };
export interface InvitationEmailTransport {
  send(message: InvitationEmail): Promise<InvitationDeliveryResult>;
}
export const invitationDelivery = Object.freeze({
  mode: "MANUAL" as const,
  emailEnabled: false,
  status: "NOT_SENT" as const,
  reason: "DELIVERY_NOT_CONFIGURED" as const,
});
export const disabledInvitationTransport: InvitationEmailTransport = {
  async send() {
    // Do not enqueue, retain, log, or transmit recipient details or invitation tokens.
    return { status: "NOT_SENT", reason: "DELIVERY_NOT_CONFIGURED" };
  },
};
