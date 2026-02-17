import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient";
import { WebhookHandlers } from "./webhookHandlers";
import { generalLimiter, a2aLimiter } from "./middleware/rateLimit";

process.on('unhandledRejection', (reason) => {
  console.warn('[process] Unhandled promise rejection (non-fatal):', reason instanceof Error ? reason.message : reason);
});

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn('[stripe] DATABASE_URL not set, skipping Stripe initialization');
    return;
  }

  if (!process.env.REPLIT_CONNECTORS_HOSTNAME) {
    console.warn('[stripe] REPLIT_CONNECTORS_HOSTNAME not set, skipping Stripe initialization');
    return;
  }

  try {
    console.log('[stripe] Initializing Stripe schema...');
    await runMigrations({ databaseUrl });
    console.log('[stripe] Schema ready');
  } catch (error) {
    console.warn('[stripe] Schema migration skipped (non-fatal):', error instanceof Error ? error.message : error);
  }

  try {
    const stripeSync = await getStripeSync();
    if (!stripeSync) {
      console.warn('[stripe] Stripe sync not available, skipping webhook and data sync');
      return;
    }

    const replitDomains = process.env.REPLIT_DOMAINS;
    if (!replitDomains) {
      console.warn('[stripe] REPLIT_DOMAINS not set, skipping webhook setup');
      return;
    }

    console.log('[stripe] Setting up managed webhook...');
    const webhookBaseUrl = `https://${replitDomains.split(',')[0]}`;
    const webhookResult = await stripeSync.findOrCreateManagedWebhook(
      `${webhookBaseUrl}/api/stripe/webhook`
    );
    console.log('[stripe] Webhook configured:', JSON.stringify(webhookResult?.webhook?.url || webhookResult?.url || 'OK'));

    console.log('[stripe] Syncing Stripe data...');
    stripeSync.syncBackfill()
      .then(() => console.log('[stripe] Data synced'))
      .catch((err: unknown) => console.warn('[stripe] Error syncing data:', err));
  } catch (error) {
    console.warn('[stripe] Initialization skipped (non-fatal):', error instanceof Error ? error.message : error);
  }
}

app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;

      if (!Buffer.isBuffer(req.body)) {
        console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
        return res.status(500).json({ error: 'Webhook processing error' });
      }

      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error('Webhook error:', message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Security headers — contentSecurityPolicy disabled to avoid blocking the frontend served from the same origin
app.use(helmet({ contentSecurityPolicy: false, frameguard: false }));

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || true, // Allow all in dev, restrict in prod
  credentials: true,
}));

// Rate limiting — general API and A2A endpoints
app.use('/api/', generalLimiter);
app.use('/a2a', a2aLimiter);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        const responseStr = JSON.stringify(capturedJsonResponse);
        logLine += ` :: ${responseStr.length > 200 ? responseStr.slice(0, 200) + "..." : responseStr}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: Error & { status?: number; statusCode?: number }, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      initStripe().catch((err) => {
        console.warn('[stripe] Background init failed (non-fatal):', err instanceof Error ? err.message : err);
      });
    },
  );
})();
