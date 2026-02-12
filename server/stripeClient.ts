import Stripe from 'stripe';

let connectionSettings: any;
let stripeAvailable = false;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  const connectorName = 'stripe';
  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  const targetEnvironment = isProduction ? 'production' : 'development';

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set('include_secrets', 'true');
  url.searchParams.set('connector_names', connectorName);
  url.searchParams.set('environment', targetEnvironment);

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'X_REPLIT_TOKEN': xReplitToken
    }
  });

  const data = await response.json();

  connectionSettings = data.items?.[0];

  if (!connectionSettings || (!connectionSettings.settings?.publishable || !connectionSettings.settings?.secret)) {
    throw new Error(`Stripe ${targetEnvironment} connection not found`);
  }

  return {
    publishableKey: connectionSettings.settings.publishable,
    secretKey: connectionSettings.settings.secret,
  };
}

export function isStripeAvailable() {
  return stripeAvailable;
}

export async function getUncachableStripeClient(): Promise<Stripe | null> {
  try {
    const { secretKey } = await getCredentials();
    stripeAvailable = true;
    return new Stripe(secretKey);
  } catch (error: any) {
    console.warn('Stripe client unavailable:', error?.message);
    stripeAvailable = false;
    return null;
  }
}

export async function getStripePublishableKey(): Promise<string | null> {
  try {
    const { publishableKey } = await getCredentials();
    return publishableKey;
  } catch (error: any) {
    console.warn('Stripe publishable key unavailable:', error?.message);
    return null;
  }
}

export async function getStripeSecretKey(): Promise<string | null> {
  try {
    const { secretKey } = await getCredentials();
    return secretKey;
  } catch (error: any) {
    console.warn('Stripe secret key unavailable:', error?.message);
    return null;
  }
}

let stripeSync: any = null;

export async function getStripeSync(): Promise<any | null> {
  if (!stripeSync) {
    try {
      const { StripeSync } = await import('stripe-replit-sync');
      const secretKey = await getStripeSecretKey();

      if (!secretKey) {
        console.warn('Stripe sync unavailable: no secret key');
        return null;
      }

      stripeSync = new StripeSync({
        poolConfig: {
          connectionString: process.env.DATABASE_URL!,
          max: 2,
        },
        stripeSecretKey: secretKey,
      });
    } catch (error: any) {
      console.warn('Failed to initialize StripeSync:', error?.message);
      return null;
    }
  }
  return stripeSync;
}
