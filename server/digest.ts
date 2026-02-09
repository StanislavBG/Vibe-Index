import { storage } from "./storage";
import { sendEmail, renderDigestEmail, isEmailConfigured } from "./email";

// Run a digest cycle for a given frequency (daily, weekly, monthly)
export async function runDigest(frequency: string): Promise<{ sent: number; skipped: number; failed: number }> {
  if (!isEmailConfigured()) {
    console.log(`[digest] SMTP not configured, skipping ${frequency} digest`);
    return { sent: 0, skipped: 0, failed: 0 };
  }

  console.log(`[digest] Starting ${frequency} digest...`);

  const eligibleUsers = await storage.getDigestEligibleUsers(frequency);
  if (eligibleUsers.length === 0) {
    console.log(`[digest] No users subscribed to ${frequency} digests`);
    return { sent: 0, skipped: 0, failed: 0 };
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of eligibleUsers) {
    try {
      // Check if we already sent this frequency recently
      const recent = await storage.getRecentEmailSend(user.id, frequency);
      if (recent?.sentAt) {
        const hoursSince = (Date.now() - recent.sentAt.getTime()) / (1000 * 60 * 60);
        const minHours = frequency === "daily" ? 20 : frequency === "weekly" ? 144 : 672;
        if (hoursSince < minHours) {
          skipped++;
          continue;
        }
      }

      // Get projects the user hasn't seen yet
      const alreadySentIds = await storage.getSentProjectIds(user.id);
      const maxProjects = user.prefs.maxProjects || 10;

      const projectList = await storage.getProjectsForDigest(
        user.categoryIds,
        user.prefs.pricingFilter,
        alreadySentIds,
        maxProjects,
      );

      if (projectList.length === 0) {
        skipped++;
        continue;
      }

      // Get or create unsubscribe token
      const unsubscribeToken = await storage.getOrCreateUnsubscribeToken(user.id);

      // Render email
      const subject = `${projectList.length} new project${projectList.length !== 1 ? "s" : ""} on Vibe Index`;
      const html = renderDigestEmail({
        username: user.username,
        frequency,
        projects: projectList,
        unsubscribeToken,
      });

      // Log the send attempt
      const sendRecord = await storage.createEmailSend(
        user.id,
        subject,
        frequency,
        projectList.map(p => p.id),
      );

      // Send
      const result = await sendEmail({
        to: user.email,
        subject,
        html,
      });

      if (result.success) {
        await storage.updateEmailSend(sendRecord.id, {
          status: "sent",
          sentAt: new Date(),
        });
        sent++;
        console.log(`[digest] Sent ${frequency} digest to ${user.email} (${projectList.length} projects)`);
      } else {
        await storage.updateEmailSend(sendRecord.id, {
          status: "failed",
          error: result.error,
        });
        failed++;
        console.error(`[digest] Failed to send to ${user.email}: ${result.error}`);
      }
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[digest] Error processing user ${user.id}: ${message}`);
    }
  }

  console.log(`[digest] ${frequency} digest complete: ${sent} sent, ${skipped} skipped, ${failed} failed`);
  return { sent, skipped, failed };
}

// Check which digests should run now based on the current time
export function getScheduledFrequencies(): string[] {
  const now = new Date();
  const hour = now.getUTCHours();
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 1 = Monday
  const dayOfMonth = now.getUTCDate();

  const frequencies: string[] = [];

  // Daily digests: every day at 8am UTC
  if (hour === 8) {
    frequencies.push("daily");
  }

  // Weekly digests: Monday at 8am UTC
  if (hour === 8 && dayOfWeek === 1) {
    frequencies.push("weekly");
  }

  // Monthly digests: 1st of the month at 8am UTC
  if (hour === 8 && dayOfMonth === 1) {
    frequencies.push("monthly");
  }

  return frequencies;
}

// Background scheduler — called every hour by setInterval
export async function digestSchedulerTick(): Promise<void> {
  const frequencies = getScheduledFrequencies();
  if (frequencies.length === 0) return;

  for (const freq of frequencies) {
    try {
      await runDigest(freq);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[digest] Scheduler error for ${freq}: ${message}`);
    }
  }
}

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

export function startDigestScheduler(): void {
  if (schedulerInterval) return;

  // Run immediately on startup to catch any pending digests
  digestSchedulerTick().catch(console.error);

  // Then check every hour
  schedulerInterval = setInterval(() => {
    digestSchedulerTick().catch(console.error);
  }, 60 * 60 * 1000);

  const configured = isEmailConfigured();
  console.log(`[digest] Scheduler started (hourly check). SMTP ${configured ? "configured" : "NOT configured — will skip sends"}`);
}
