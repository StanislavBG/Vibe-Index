import { describe, it, expect, beforeEach } from 'vitest';
import { createMockStorage } from './helpers/mockStorage';
import type { IStorage } from '../storage';

describe('MockStorage', () => {
  let storage: IStorage;

  beforeEach(() => {
    storage = createMockStorage();
  });

  // === USER ROUND-TRIP ===
  describe('Users', () => {
    it('createUser and getUser round-trip', async () => {
      const created = await storage.createUser({
        clerkId: 'clerk_123',
        username: 'alice',
        email: 'alice@example.com',
      });

      expect(created.id).toBeDefined();
      expect(created.username).toBe('alice');
      expect(created.email).toBe('alice@example.com');
      expect(created.clerkId).toBe('clerk_123');
      expect(created.role).toBe('user');
      expect(created.freeListingsRemaining).toBe(3);
      expect(created.paidListingCredits).toBe(0);
      expect(created.likesRemaining).toBe(10);
      expect(created.earnedCredits).toBe(0);

      const fetched = await storage.getUser(created.id);
      expect(fetched).toEqual(created);
    });

    it('getUserByClerkId returns the correct user', async () => {
      await storage.createUser({ clerkId: 'clerk_a', username: 'a', email: 'a@test.com' });
      const b = await storage.createUser({ clerkId: 'clerk_b', username: 'b', email: 'b@test.com' });

      const found = await storage.getUserByClerkId('clerk_b');
      expect(found).toBeDefined();
      expect(found!.id).toBe(b.id);
    });

    it('getUserByClerkId returns undefined for unknown clerkId', async () => {
      const result = await storage.getUserByClerkId('nonexistent');
      expect(result).toBeUndefined();
    });

    it('getUserByUsername returns the correct user', async () => {
      const user = await storage.createUser({ clerkId: 'c1', username: 'bob', email: 'bob@test.com' });
      const found = await storage.getUserByUsername('bob');
      expect(found).toBeDefined();
      expect(found!.id).toBe(user.id);
    });

    it('getUserByEmail returns the correct user', async () => {
      const user = await storage.createUser({ clerkId: 'c2', username: 'carol', email: 'carol@test.com' });
      const found = await storage.getUserByEmail('carol@test.com');
      expect(found).toBeDefined();
      expect(found!.id).toBe(user.id);
    });

    it('upsertUserFromClerk creates new user when clerkId not found', async () => {
      const user = await storage.upsertUserFromClerk('new_clerk', 'newuser', 'new@test.com');
      expect(user.clerkId).toBe('new_clerk');
      expect(user.username).toBe('newuser');
    });

    it('upsertUserFromClerk updates existing user when clerkId found', async () => {
      await storage.createUser({ clerkId: 'existing_clerk', username: 'old', email: 'old@test.com' });
      const updated = await storage.upsertUserFromClerk('existing_clerk', 'newname', 'new@test.com');
      expect(updated.username).toBe('newname');
      expect(updated.email).toBe('new@test.com');
    });

    it('promoteUserToAdmin changes role', async () => {
      await storage.createUser({ clerkId: 'c3', username: 'dave', email: 'dave@test.com' });
      await storage.promoteUserToAdmin('dave@test.com');
      const user = await storage.getUserByEmail('dave@test.com');
      expect(user!.role).toBe('admin');
    });
  });

  // === PROJECT ROUND-TRIP ===
  describe('Projects', () => {
    it('createProject and getProject round-trip', async () => {
      const created = await storage.createProject({
        url: 'https://example.com/project',
        name: 'My Project',
        shortDescription: 'A cool project',
        status: 'active',
      });

      expect(created.id).toBeDefined();
      expect(created.url).toBe('https://example.com/project');
      expect(created.name).toBe('My Project');
      expect(created.likesCount).toBe(0);
      expect(created.status).toBe('active');
      expect(created.pricingModel).toBe('free');

      const fetched = await storage.getProject(created.id);
      expect(fetched).toEqual(created);
    });

    it('getProject returns undefined for unknown ID', async () => {
      const result = await storage.getProject(999);
      expect(result).toBeUndefined();
    });

    it('getProjects filters by status=active', async () => {
      await storage.createProject({ url: 'https://a.com', name: 'Active', status: 'active' });
      await storage.createProject({ url: 'https://b.com', name: 'Pending', status: 'pending' });

      const { projects, total } = await storage.getProjects({});
      expect(total).toBe(1);
      expect(projects[0].name).toBe('Active');
    });

    it('getProjects filters by pricingModel', async () => {
      await storage.createProject({ url: 'https://a.com', name: 'Free', status: 'active', pricingModel: 'free' });
      await storage.createProject({ url: 'https://b.com', name: 'Paid', status: 'active', pricingModel: 'paid' });

      const { projects } = await storage.getProjects({ pricingModel: 'paid' });
      expect(projects.length).toBe(1);
      expect(projects[0].name).toBe('Paid');
    });

    it('getProjects supports search', async () => {
      await storage.createProject({ url: 'https://a.com', name: 'Widget Maker', status: 'active' });
      await storage.createProject({ url: 'https://b.com', name: 'Todo App', status: 'active' });

      const { projects } = await storage.getProjects({ search: 'widget' });
      expect(projects.length).toBe(1);
      expect(projects[0].name).toBe('Widget Maker');
    });

    it('getProjects supports pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await storage.createProject({ url: `https://${i}.com`, name: `P${i}`, status: 'active' });
      }

      const { projects, total } = await storage.getProjects({ limit: 2, offset: 1 });
      expect(total).toBe(5);
      expect(projects.length).toBe(2);
    });

    it('getProjectsByOwner returns only that owner\'s projects', async () => {
      const user = await storage.createUser({ clerkId: 'o1', username: 'owner', email: 'owner@test.com' });
      await storage.createProject({ url: 'https://a.com', name: 'Mine', ownerId: user.id, status: 'active' });
      await storage.createProject({ url: 'https://b.com', name: 'Other', ownerId: user.id + 999, status: 'active' });

      const projects = await storage.getProjectsByOwner(user.id);
      expect(projects.length).toBe(1);
      expect(projects[0].name).toBe('Mine');
    });

    it('updateProject modifies fields', async () => {
      const proj = await storage.createProject({ url: 'https://a.com', name: 'Original', status: 'active' });
      const updated = await storage.updateProject(proj.id, { name: 'Updated' });
      expect(updated).toBeDefined();
      expect(updated!.name).toBe('Updated');
    });

    it('deleteProject removes the project', async () => {
      const proj = await storage.createProject({ url: 'https://a.com', name: 'ToDelete', status: 'active' });
      const deleted = await storage.deleteProject(proj.id);
      expect(deleted).toBe(true);
      const fetched = await storage.getProject(proj.id);
      expect(fetched).toBeUndefined();
    });

    it('deleteProject returns false for unknown ID', async () => {
      const deleted = await storage.deleteProject(9999);
      expect(deleted).toBe(false);
    });

    it('incrementLikesCount adjusts count', async () => {
      const proj = await storage.createProject({ url: 'https://a.com', name: 'Likeable', status: 'active' });
      expect(proj.likesCount).toBe(0);

      await storage.incrementLikesCount(proj.id, 3);
      const fetched = await storage.getProject(proj.id);
      expect(fetched!.likesCount).toBe(3);

      await storage.incrementLikesCount(proj.id, -1);
      const fetched2 = await storage.getProject(proj.id);
      expect(fetched2!.likesCount).toBe(2);
    });
  });

  // === FEEDBACK ===
  describe('Feedback', () => {
    it('createFeedback and getFeedback round-trip', async () => {
      const proj = await storage.createProject({ url: 'https://a.com', name: 'FBTest', status: 'active' });
      const fb = await storage.createFeedback(proj.id, 8, 'fp123', '[]', 'Great project');

      expect(fb.id).toBeDefined();
      expect(fb.projectId).toBe(proj.id);
      expect(fb.rating).toBe(8);
      expect(fb.fingerprint).toBe('fp123');
      expect(fb.summary).toBe('Great project');

      const list = await storage.getFeedback(proj.id);
      expect(list.length).toBe(1);
      expect(list[0].id).toBe(fb.id);
    });

    it('getFeedbackCount returns correct count', async () => {
      const proj = await storage.createProject({ url: 'https://a.com', name: 'CountTest', status: 'active' });
      expect(await storage.getFeedbackCount(proj.id)).toBe(0);

      await storage.createFeedback(proj.id, 7, 'fp1');
      await storage.createFeedback(proj.id, 9, 'fp2');
      expect(await storage.getFeedbackCount(proj.id)).toBe(2);
    });

    it('getAverageRating computes correct average', async () => {
      const proj = await storage.createProject({ url: 'https://a.com', name: 'AvgTest', status: 'active' });
      expect(await storage.getAverageRating(proj.id)).toBeNull();

      await storage.createFeedback(proj.id, 6, 'fp1');
      await storage.createFeedback(proj.id, 8, 'fp2');
      expect(await storage.getAverageRating(proj.id)).toBe(7);
    });
  });

  // === CREDIT BALANCE OPERATIONS ===
  describe('Credits', () => {
    it('updateUserCredits modifies credit fields', async () => {
      const user = await storage.createUser({ clerkId: 'cr1', username: 'creditor', email: 'cr@test.com' });
      expect(user.freeListingsRemaining).toBe(3);

      const updated = await storage.updateUserCredits(user.id, {
        freeListingsRemaining: 1,
        paidListingCredits: 5,
      });
      expect(updated!.freeListingsRemaining).toBe(1);
      expect(updated!.paidListingCredits).toBe(5);
    });

    it('updateUserCredits returns undefined for unknown user', async () => {
      const result = await storage.updateUserCredits(9999, { freeListingsRemaining: 0 });
      expect(result).toBeUndefined();
    });

    it('addCreditLedgerEntry and getCreditLedger round-trip', async () => {
      const user = await storage.createUser({ clerkId: 'cr2', username: 'ledger', email: 'ledger@test.com' });
      const entry = await storage.addCreditLedgerEntry(user.id, 20, 'social_share', 'Shared on Twitter');

      expect(entry.id).toBeDefined();
      expect(entry.amount).toBe(20);
      expect(entry.type).toBe('social_share');

      const ledger = await storage.getCreditLedger(user.id);
      expect(ledger.length).toBe(1);
      expect(ledger[0].id).toBe(entry.id);
    });

    it('getEarnedCredits returns current earned credits', async () => {
      const user = await storage.createUser({ clerkId: 'cr3', username: 'earner', email: 'earn@test.com' });
      expect(await storage.getEarnedCredits(user.id)).toBe(0);
    });

    it('updateEarnedCredits accumulates correctly', async () => {
      const user = await storage.createUser({ clerkId: 'cr4', username: 'accum', email: 'accum@test.com' });
      await storage.updateEarnedCredits(user.id, 20);
      await storage.updateEarnedCredits(user.id, 30);
      expect(await storage.getEarnedCredits(user.id)).toBe(50);
    });

    it('convertEarnedCredits converts 100 earned to 1 listing credit', async () => {
      const user = await storage.createUser({ clerkId: 'cr5', username: 'converter', email: 'conv@test.com' });
      await storage.updateEarnedCredits(user.id, 250);

      const converted = await storage.convertEarnedCredits(user.id);
      expect(converted).toBe(2); // 250 / 100 = 2 full credits

      const updatedUser = await storage.getUser(user.id);
      expect(updatedUser!.earnedCredits).toBe(50); // 250 % 100 = 50 remainder
      expect(updatedUser!.paidListingCredits).toBe(2);
    });

    it('convertEarnedCredits returns 0 when under 100', async () => {
      const user = await storage.createUser({ clerkId: 'cr6', username: 'small', email: 'small@test.com' });
      await storage.updateEarnedCredits(user.id, 50);

      const converted = await storage.convertEarnedCredits(user.id);
      expect(converted).toBe(0);
      expect(await storage.getEarnedCredits(user.id)).toBe(50); // unchanged
    });
  });

  // === LIKES ===
  describe('Likes', () => {
    it('createLike and getLike round-trip', async () => {
      const user = await storage.createUser({ clerkId: 'lk1', username: 'liker', email: 'lk@test.com' });
      const proj = await storage.createProject({ url: 'https://a.com', name: 'Liked', status: 'active' });

      const like = await storage.createLike(user.id, proj.id);
      expect(like.userId).toBe(user.id);
      expect(like.projectId).toBe(proj.id);

      const found = await storage.getLike(user.id, proj.id);
      expect(found).toBeDefined();
    });

    it('deleteLike removes the like', async () => {
      const user = await storage.createUser({ clerkId: 'lk2', username: 'unliker', email: 'ul@test.com' });
      const proj = await storage.createProject({ url: 'https://a.com', name: 'Unliked', status: 'active' });

      await storage.createLike(user.id, proj.id);
      const deleted = await storage.deleteLike(user.id, proj.id);
      expect(deleted).toBe(true);

      const found = await storage.getLike(user.id, proj.id);
      expect(found).toBeUndefined();
    });

    it('getUserLikes returns all likes for user', async () => {
      const user = await storage.createUser({ clerkId: 'lk3', username: 'multliker', email: 'ml@test.com' });
      const p1 = await storage.createProject({ url: 'https://a.com', name: 'P1', status: 'active' });
      const p2 = await storage.createProject({ url: 'https://b.com', name: 'P2', status: 'active' });

      await storage.createLike(user.id, p1.id);
      await storage.createLike(user.id, p2.id);

      const likes = await storage.getUserLikes(user.id);
      expect(likes.length).toBe(2);
    });
  });

  // === NOTIFICATIONS ===
  describe('Notifications', () => {
    it('createNotification and getNotifications round-trip', async () => {
      const user = await storage.createUser({ clerkId: 'n1', username: 'notified', email: 'n@test.com' });
      await storage.createNotification(user.id, 'system', 'Hello', 'Welcome!');

      const notifs = await storage.getNotifications(user.id);
      expect(notifs.length).toBe(1);
      expect(notifs[0].title).toBe('Hello');
      expect(notifs[0].read).toBe(false);
    });

    it('markNotificationRead marks as read', async () => {
      const user = await storage.createUser({ clerkId: 'n2', username: 'reader', email: 'nr@test.com' });
      const notif = await storage.createNotification(user.id, 'system', 'Read me', 'body');

      await storage.markNotificationRead(notif.id, user.id);
      const notifs = await storage.getNotifications(user.id);
      expect(notifs[0].read).toBe(true);
    });

    it('getUnreadNotificationCount returns correct count', async () => {
      const user = await storage.createUser({ clerkId: 'n3', username: 'counter', email: 'nc@test.com' });
      await storage.createNotification(user.id, 'system', 'A', 'a');
      await storage.createNotification(user.id, 'system', 'B', 'b');

      expect(await storage.getUnreadNotificationCount(user.id)).toBe(2);

      const notifs = await storage.getNotifications(user.id);
      await storage.markNotificationRead(notifs[0].id, user.id);
      expect(await storage.getUnreadNotificationCount(user.id)).toBe(1);
    });
  });

  // === SYSTEM CONFIG ===
  describe('System Config', () => {
    it('setConfig and getConfig round-trip', async () => {
      await storage.setConfig('site_name', 'Vibe Index');
      expect(await storage.getConfig('site_name')).toBe('Vibe Index');
    });

    it('getConfig returns null for missing key', async () => {
      expect(await storage.getConfig('nonexistent')).toBeNull();
    });
  });

  // === NOT IMPLEMENTED STUBS ===
  describe('Not-implemented methods throw', () => {
    it('getJob throws', async () => {
      await expect(storage.getJob(1)).rejects.toThrow('Not implemented in mock');
    });

    it('createJob throws', async () => {
      await expect(storage.createJob(1)).rejects.toThrow('Not implemented in mock');
    });
  });
});
