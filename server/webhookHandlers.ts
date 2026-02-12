import { getStripeSync } from './stripeClient';
import { storage } from './storage';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    if (!sync) {
      console.warn('Stripe sync not available, skipping webhook processing');
      return;
    }
    await sync.processWebhook(payload, signature);

    try {
      const rawEvent = JSON.parse(payload.toString());
      if (rawEvent.type === 'checkout.session.completed') {
        await WebhookHandlers.handleCheckoutCompleted(rawEvent.data.object);
      }
    } catch (err) {
      console.error('Error processing webhook event for fulfillment:', err);
    }
  }

  static async handleCheckoutCompleted(session: any): Promise<void> {
    if (session.payment_status !== 'paid') return;

    const userId = parseInt(session.metadata?.userId || '0');
    const credits = parseInt(session.metadata?.credits || '0');
    const sessionId = session.id;

    if (!userId || !credits || !sessionId) return;

    const existingLedger = await storage.getCreditLedger(userId);
    const alreadyFulfilled = existingLedger.some(
      (entry) => entry.type === 'purchase' && entry.description?.includes(sessionId)
    );
    if (alreadyFulfilled) return;

    const user = await storage.getUser(userId);
    if (!user) return;

    await storage.updateUserCredits(userId, {
      paidListingCredits: user.paidListingCredits + credits,
    });

    await storage.addCreditLedgerEntry(
      userId, credits * 100, 'purchase',
      `Purchased ${credits} listing credit${credits > 1 ? 's' : ''} via Stripe (${sessionId})`
    );

    await storage.createNotification(
      userId,
      'credit_earned',
      'Credits purchased!',
      `You purchased ${credits} listing credit${credits > 1 ? 's' : ''}. You can now submit more projects!`,
      '/submit'
    );

    console.log(`[webhook] Fulfilled ${credits} credits for user ${userId} (session ${sessionId})`);
  }
}
