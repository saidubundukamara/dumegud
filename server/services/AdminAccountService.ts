import "server-only";
import { z } from "zod";
import { ADMIN_PERMISSIONS, isAdminPermission, SUPER_ADMIN_ROLE, type AdminPermission } from "@/lib/admin-permissions";
import type { AdminStatus } from "@/server/db/schema";
import type { EmailService } from "@/server/integrations/email";
import { adminInviteTemplate } from "@/server/integrations/email/templates";
import { randomToken, sha256 } from "@/server/lib/crypto";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import { hashPassword } from "@/server/lib/password";
import { isUniqueViolation } from "@/server/repositories/BaseRepository";
import type { AdminAccountRepository } from "@/server/repositories/AdminAccountRepository";
import type { AdminRoleRepository } from "@/server/repositories/AdminRoleRepository";
import { newPasswordSchema } from "@/server/validation/auth";
import { assertPermission, can, type AdminActor } from "./actor";
import type { PendingAdmin } from "./AdminAuthService";
import type { AuditLogger } from "./compliance";
import { runInTransaction, type Tx } from "./transaction";

// Admin accounts and roles (RBAC). Invariants enforced under row locks:
// - nobody changes their own status or roles, or edits a role they hold (no self-escalation);
// - you can only grant (or take away) roles and permissions you hold yourself, and only super
//   admins grant super_admin;
// - at least one active super admin always remains. Every change that could remove one first
//   locks the super_admin role row, which serialises them, then counts.

const INVITE_TTL_HOURS = 72;
const ROLE_KEY = /^[a-z][a-z0-9_]{1,39}$/;

type Repos = { adminAccounts: AdminAccountRepository; adminRoles: AdminRoleRepository };

export type AdminAccountServiceDeps = {
  repos: Repos;
  audit: AuditLogger;
  email: EmailService;
  adminBaseUrl: string;
  now?: () => Date;
  transaction?: typeof runInTransaction;
};

const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")).pipe(z.string().max(254));
const nameSchema = z.string().trim().min(1, "Enter your name.").max(80);

export class AdminAccountService {
  private readonly repos: Repos;
  private readonly now: () => Date;
  private readonly transaction: typeof runInTransaction;

  constructor(private readonly deps: AdminAccountServiceDeps) {
    this.repos = deps.repos;
    this.now = deps.now ?? (() => new Date());
    this.transaction = deps.transaction ?? runInTransaction;
  }

  // ── Admins ────────────────────────────────────────────────────────────────────

  async list(actor: AdminActor) {
    assertPermission(actor, "admins.manage");
    const [admins, roles, invites] = await Promise.all([this.repos.adminAccounts.list(), this.repos.adminRoles.roleKeysByAdmin(), this.repos.adminAccounts.listOpenInvites(this.now())]);
    return { admins: admins.map((a) => ({ ...a, roles: roles.get(a.id) ?? [] })), invites };
  }

  async invite(actor: AdminActor, input: { email: string; roleIds: string[] }): Promise<void> {
    assertPermission(actor, "admins.manage");
    const email = emailSchema.safeParse(input.email);
    if (!email.success) throw new ValidationError(email.error.issues[0]?.message ?? "Enter a valid email address.");
    const roles = await this.grantableRoles(actor, input.roleIds);
    if (await this.repos.adminAccounts.findByEmail(email.data)) throw new ConflictError("That person is already an admin.");

    const token = randomToken();
    const now = this.now();
    let invite;
    try {
      invite = await this.transaction((tx) =>
        this.repos.adminAccounts.replaceInvite(
          { email: email.data, tokenHash: sha256(token), roleIds: roles.map((r) => r.id), invitedBy: actor.adminId, expiresAt: new Date(now.getTime() + INVITE_TTL_HOURS * 3_600_000) },
          now,
          tx,
        ),
      );
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError("Someone else just invited this address. Reload to see it.");
      throw err;
    }
    await this.deps.audit.log({ actor, action: "admin.invite", targetType: "admin_invite", targetId: invite.id, after: { email: email.data, roles: roles.map((r) => r.key) } });
    const inviter = await this.repos.adminAccounts.findById(actor.adminId);
    try {
      await this.deps.email.send({
        to: email.data,
        ...adminInviteTemplate({ invitedBy: inviter?.name ?? "A DuMeGud admin", roles: roles.map((r) => r.name), url: `${this.deps.adminBaseUrl.replace(/\/$/, "")}/invite/${token}`, expiresHours: INVITE_TTL_HOURS }),
      });
    } catch (err) {
      logger.error("failed to send admin invite", { err });
      throw new ConflictError("The invite was saved but the email didn't send. Try inviting again.");
    }
  }

  async revokeInvite(actor: AdminActor, inviteId: string): Promise<void> {
    assertPermission(actor, "admins.manage");
    const revoked = await this.repos.adminAccounts.revokeInvite(inviteId, this.now());
    if (!revoked) throw new ConflictError("This invite was already used or withdrawn.");
    await this.deps.audit.log({ actor, action: "admin.invite_revoke", targetType: "admin_invite", targetId: inviteId, before: { email: revoked.email } });
  }

  /** For the invite page: the address it's for, or null when the link is used, withdrawn or expired. */
  async openInvite(token: string): Promise<{ email: string } | null> {
    const invite = await this.repos.adminAccounts.findOpenInvite(sha256(token), this.now());
    return invite ? { email: invite.email } : null;
  }

  /**
   * Accept an invite: claim it (single conditional UPDATE), create the admin and give them the
   * roles, all in one transaction. Returns who to send to TOTP enrollment.
   */
  async acceptInvite(token: string, input: { name: string; password: string }): Promise<PendingAdmin> {
    const name = nameSchema.safeParse(input.name);
    if (!name.success) throw new ValidationError(name.error.issues[0]?.message ?? "Enter your name.");
    const password = newPasswordSchema.safeParse(input.password);
    if (!password.success) throw new ValidationError(password.error.issues[0]?.message ?? "Choose a stronger password.");
    const passwordHash = await hashPassword(password.data);
    const now = this.now();
    const result = await this.transaction(async (tx) => {
      const invite = await this.repos.adminAccounts.claimInvite(sha256(token), now, tx);
      if (!invite) throw new ConflictError("This invite was already used, withdrawn or has expired. Ask for a new one.");
      const admin = await this.repos.adminAccounts.insert({ email: invite.email, name: name.data, passwordHash }, tx);
      if (!admin) throw new ConflictError("There's already an admin with this email.");
      // Roles deleted since the invite are simply skipped.
      const roles = await this.repos.adminRoles.findByIds(invite.roleIds, tx);
      await this.repos.adminRoles.setAssignments(admin.id, roles.map((r) => r.id), invite.invitedBy, tx);
      return { admin, invite, roles };
    });
    await this.deps.audit.log({
      actor: null,
      action: "admin.invite_accept",
      targetType: "admin",
      targetId: result.admin.id,
      after: { email: result.admin.email, inviteId: result.invite.id, roles: result.roles.map((r) => r.key) },
    });
    return { adminId: result.admin.id, sessionVersion: result.admin.sessionVersion };
  }

  /** Suspending or disabling revokes every session at once. */
  async setStatus(actor: AdminActor, adminId: string, status: AdminStatus, reason: string): Promise<void> {
    assertPermission(actor, "admins.manage");
    if (adminId === actor.adminId) throw new ForbiddenError("You can't change your own account status.");
    if (!reason.trim()) throw new ValidationError("Give a reason.");
    const before = await this.transaction(async (tx) => {
      await this.repos.adminRoles.lockByKey(SUPER_ADMIN_ROLE, tx);
      const target = await this.repos.adminAccounts.lockById(adminId, tx);
      if (!target) throw new NotFoundError();
      const grants = await this.repos.adminRoles.grantsFor(adminId, tx);
      this.assertCanManage(actor, grants.roles.map((r) => r.key), grants.permissions);
      if (status !== "active" && grants.roles.some((r) => r.key === SUPER_ADMIN_ROLE)) await this.assertAnotherSuperAdmin(adminId, tx);
      await this.repos.adminAccounts.setStatus(adminId, status, tx);
      await this.repos.adminAccounts.revokeAllSessions(adminId, this.now(), tx);
      return target;
    });
    await this.deps.audit.log({ actor, action: "admin.status", targetType: "admin", targetId: adminId, before: { status: before.status }, after: { status, reason } });
  }

  /** Replace an admin's roles. Their sessions are revoked so the change (and step-up) start fresh. */
  async setRoles(actor: AdminActor, adminId: string, roleIds: string[]): Promise<void> {
    assertPermission(actor, "admins.manage");
    if (adminId === actor.adminId) throw new ForbiddenError("You can't change your own roles.");
    const wanted = await this.repos.adminRoles.findByIds([...new Set(roleIds)]);
    if (wanted.length !== new Set(roleIds).size) throw new ValidationError("One of those roles no longer exists. Reload and try again.");
    const { before, after } = await this.transaction(async (tx) => {
      await this.repos.adminRoles.lockByKey(SUPER_ADMIN_ROLE, tx);
      const target = await this.repos.adminAccounts.lockById(adminId, tx);
      if (!target) throw new NotFoundError();
      const current = await this.repos.adminRoles.grantsFor(adminId, tx);
      const added = wanted.filter((r) => !current.roles.some((c) => c.id === r.id));
      const removed = current.roles.filter((c) => !wanted.some((r) => r.id === c.id));
      // Granting or taking away: either way only for roles you could grant yourself.
      await this.assertGrantable(actor, [...added, ...removed], tx);
      if (removed.some((r) => r.key === SUPER_ADMIN_ROLE) && target.status === "active") await this.assertAnotherSuperAdmin(adminId, tx);
      await this.repos.adminRoles.setAssignments(adminId, wanted.map((r) => r.id), actor.adminId, tx);
      await this.repos.adminAccounts.bumpSessionVersion(adminId, tx);
      await this.repos.adminAccounts.revokeAllSessions(adminId, this.now(), tx);
      return { before: current.roles.map((r) => r.key), after: wanted.map((r) => r.key) };
    });
    await this.deps.audit.log({ actor, action: "admin.roles", targetType: "admin", targetId: adminId, before: { roles: before }, after: { roles: after } });
  }

  /** One admin's account, roles, live sessions and recent security events. */
  async detail(actor: AdminActor, adminId: string) {
    assertPermission(actor, "admins.manage");
    const admin = await this.repos.adminAccounts.findById(adminId);
    if (!admin) throw new NotFoundError();
    const now = this.now();
    const [grants, sessions, recent] = await Promise.all([this.repos.adminRoles.grantsFor(adminId), this.repos.adminAccounts.listLiveSessions(adminId, now), this.repos.adminAccounts.listEvents(adminId, 50)]);
    return {
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        status: admin.status,
        totpEnabledAt: admin.totpEnabledAt,
        lastLoginAt: admin.lastLoginAt,
        createdAt: admin.createdAt,
        failedLoginCount: admin.failedLoginCount,
        lockedUntil: admin.lockedUntil && admin.lockedUntil > now ? admin.lockedUntil : null,
      },
      roles: grants.roles,
      sessions,
      events: recent,
    };
  }

  /** Lift a sign-in lockout (too many wrong passwords or codes). */
  async unlock(actor: AdminActor, adminId: string): Promise<void> {
    assertPermission(actor, "admins.manage");
    if (adminId === actor.adminId) throw new ForbiddenError("You can't unlock your own account.");
    const before = await this.transaction(async (tx) => {
      const target = await this.repos.adminAccounts.lockById(adminId, tx);
      if (!target) throw new NotFoundError();
      const grants = await this.repos.adminRoles.grantsFor(adminId, tx);
      this.assertCanManage(actor, grants.roles.map((r) => r.key), grants.permissions);
      await this.repos.adminAccounts.clearLockout(adminId, tx);
      return target;
    });
    await this.deps.audit.log({ actor, action: "admin.unlock", targetType: "admin", targetId: adminId, before: { failedLoginCount: before.failedLoginCount, lockedUntil: before.lockedUntil } });
  }

  /**
   * Break-glass for an admin who lost their authenticator and recovery codes: they set up a new
   * authenticator at their next sign-in. Every session they have is signed out.
   */
  async resetSecondFactor(actor: AdminActor, adminId: string, reason: string): Promise<void> {
    assertPermission(actor, "admins.manage");
    if (adminId === actor.adminId) throw new ForbiddenError("You can't reset your own two-step sign-in. Ask another admin.");
    if (!reason.trim()) throw new ValidationError("Give a reason.");
    await this.transaction(async (tx) => {
      const target = await this.repos.adminAccounts.lockById(adminId, tx);
      if (!target) throw new NotFoundError();
      const grants = await this.repos.adminRoles.grantsFor(adminId, tx);
      this.assertCanManage(actor, grants.roles.map((r) => r.key), grants.permissions);
      await this.repos.adminAccounts.resetSecondFactor(adminId, tx);
      await this.repos.adminAccounts.revokeAllSessions(adminId, this.now(), tx);
    });
    await this.deps.audit.log({ actor, action: "admin.reset_2fa", targetType: "admin", targetId: adminId, after: { reason: reason.slice(0, 500) } });
  }

  // ── Roles ─────────────────────────────────────────────────────────────────────

  async listRoles(actor: AdminActor) {
    if (!can(actor, "roles.manage") && !can(actor, "admins.manage")) throw new ForbiddenError();
    return this.repos.adminRoles.list();
  }

  async createRole(actor: AdminActor, input: { key: string; name: string; description: string; permissions: string[] }): Promise<string> {
    assertPermission(actor, "roles.manage");
    const key = input.key.trim().toLowerCase();
    if (!ROLE_KEY.test(key) || key === SUPER_ADMIN_ROLE) throw new ValidationError("Use 2–40 lowercase letters, digits or underscores, starting with a letter.");
    const permissions = this.validPermissions(actor, input.permissions, []);
    const fields = this.roleFields(input);
    const role = await this.transaction(async (tx) => {
      const role = await this.repos.adminRoles.insert({ key, ...fields }, tx);
      if (!role) throw new ConflictError("A role with that key already exists.");
      await this.repos.adminRoles.setPermissions(role.id, permissions, tx);
      return role;
    });
    await this.deps.audit.log({ actor, action: "admin_role.create", targetType: "admin_role", targetId: role.id, after: { key, ...fields, permissions } });
    return role.id;
  }

  async updateRole(actor: AdminActor, roleId: string, input: { name: string; description: string; permissions: string[] }): Promise<void> {
    assertPermission(actor, "roles.manage");
    const fields = this.roleFields(input);
    const { before, permissions } = await this.transaction(async (tx) => {
      const role = await this.repos.adminRoles.lockById(roleId, tx);
      if (!role) throw new NotFoundError();
      if (role.isSystem) throw new ForbiddenError("The super admin role can't be edited.");
      if (!actor.superAdmin && actor.roles.includes(role.key)) throw new ForbiddenError("You can't edit a role you hold.");
      const current = await this.repos.adminRoles.permissionsOf(roleId, tx);
      const permissions = this.validPermissions(actor, input.permissions, current);
      await this.repos.adminRoles.update(roleId, fields, tx);
      await this.repos.adminRoles.setPermissions(roleId, permissions, tx);
      return { before: { name: role.name, description: role.description, permissions: current }, permissions };
    });
    await this.deps.audit.log({ actor, action: "admin_role.update", targetType: "admin_role", targetId: roleId, before, after: { ...fields, permissions } });
  }

  async deleteRole(actor: AdminActor, roleId: string): Promise<void> {
    assertPermission(actor, "roles.manage");
    const role = await this.transaction(async (tx) => {
      const role = await this.repos.adminRoles.lockById(roleId, tx);
      if (!role) throw new NotFoundError();
      if (role.isSystem) throw new ForbiddenError("The super admin role can't be deleted.");
      // Checked under the role lock; assignments also FK-restrict the delete.
      if ((await this.repos.adminRoles.memberCount(roleId, tx)) > 0) throw new ConflictError("Take this role away from everyone who has it first.");
      await this.repos.adminRoles.delete(roleId, tx);
      return role;
    });
    await this.deps.audit.log({ actor, action: "admin_role.delete", targetType: "admin_role", targetId: roleId, before: { key: role.key, name: role.name } });
  }

  // ── Internals ─────────────────────────────────────────────────────────────────

  private roleFields(input: { name: string; description: string }) {
    const name = input.name.trim().slice(0, 60);
    if (!name) throw new ValidationError("Give the role a name.");
    return { name, description: input.description.trim().slice(0, 300) };
  }

  /**
   * The permission set to store. Non-super admins can only add or remove permissions they hold
   * themselves, so a role editor can't mint access they don't have.
   */
  private validPermissions(actor: AdminActor, requested: string[], current: string[]): AdminPermission[] {
    const wanted = [...new Set(requested)];
    const unknown = wanted.filter((p) => !isAdminPermission(p));
    if (unknown.length) throw new ValidationError(`Unknown permission: ${unknown[0]}.`);
    const changed = [...wanted.filter((p) => !current.includes(p)), ...current.filter((p) => !wanted.includes(p))];
    const notHeld = changed.filter((p) => isAdminPermission(p) && !can(actor, p));
    if (notHeld.length) throw new ForbiddenError(`You can only grant or remove permissions you have yourself (${ADMIN_PERMISSIONS[notHeld[0] as AdminPermission].label}).`);
    return wanted as AdminPermission[];
  }

  private async grantableRoles(actor: AdminActor, roleIds: string[]) {
    const ids = [...new Set(roleIds)];
    const roles = await this.repos.adminRoles.findByIds(ids);
    if (roles.length !== ids.length) throw new ValidationError("One of those roles no longer exists. Reload and try again.");
    await this.assertGrantable(actor, roles);
    return roles;
  }

  /** super_admin only by super admins; any other role only if you hold all of its permissions. */
  private async assertGrantable(actor: AdminActor, roles: { id: string; key: string }[], tx?: Tx): Promise<void> {
    if (actor.superAdmin) return;
    for (const role of roles) {
      if (role.key === SUPER_ADMIN_ROLE) throw new ForbiddenError("Only a super admin can grant or remove the super admin role.");
      const perms = await this.repos.adminRoles.permissionsOf(role.id, tx);
      if (perms.some((p) => !isAdminPermission(p) || !can(actor, p))) throw new ForbiddenError("You can only grant roles whose permissions you have yourself.");
    }
  }

  /** Only super admins act on admins who hold more than they do. */
  private assertCanManage(actor: AdminActor, targetRoles: string[], targetPermissions: string[]): void {
    if (actor.superAdmin) return;
    if (targetRoles.includes(SUPER_ADMIN_ROLE) || targetPermissions.some((p) => !isAdminPermission(p) || !can(actor, p))) {
      throw new ForbiddenError("Only a super admin can change an admin with more access than you.");
    }
  }

  /** Call with the super_admin role row locked. */
  private async assertAnotherSuperAdmin(adminId: string, tx: Tx): Promise<void> {
    const others = (await this.repos.adminRoles.activeSuperAdminIds(tx)).filter((id) => id !== adminId);
    if (others.length === 0) throw new ConflictError("There must always be at least one active super admin.");
  }
}
