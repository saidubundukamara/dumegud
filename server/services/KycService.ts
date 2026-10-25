import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { KycSubmission } from "@/server/db/schema";
import type { EmailService } from "@/server/integrations/email";
import { kycDecisionTemplate } from "@/server/integrations/email/templates";
import type { ObjectStorage } from "@/server/integrations/r2/storage";
import { decryptField, encryptField } from "@/server/lib/crypto";
import { decodeCursor, toPage } from "@/server/lib/cursor";
import { ConflictError, NotFoundError, ValidationError } from "@/server/lib/errors";
import { pepperedHash } from "@/server/lib/hash";
import { logger } from "@/server/lib/logger";
import { enforceRateLimit, type RateLimitPolicy } from "@/server/lib/rate-limit";
import { isUniqueViolation } from "@/server/repositories/BaseRepository";
import type { CreatorProfileRepository } from "@/server/repositories/CreatorProfileRepository";
import type { KycRepository } from "@/server/repositories/KycRepository";
import type { UserRepository } from "@/server/repositories/UserRepository";
import type { KycDoc, KycSubmitInput } from "@/server/validation/wallet";
import { assertPermission, type Actor, type AdminActor } from "./actor";
import { noAudit, type AuditLogger } from "./compliance";
import { runInTransaction } from "./transaction";

const MAX_DOC_BYTES = 8 * 1024 * 1024;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

type KycRepos = { kyc: KycRepository; profiles: CreatorProfileRepository; users: UserRepository };

export type KycServiceDeps = {
  repos: KycRepos;
  storage: ObjectStorage | null;
  bucket: string;
  email: EmailService;
  appBaseUrl: string;
  now?: () => Date;
  rateLimit?: (policy: RateLimitPolicy, id: string) => Promise<void>;
  transaction?: typeof runInTransaction;
  audit?: AuditLogger;
};

export type KycStatusDTO = {
  status: KycSubmission["status"] | "none";
  note: string | null;
  submittedAt: Date | null;
};

/**
 * Manual identity verification (implementation.md Phase 6). Documents live only in the private
 * KYC bucket: browsers PUT them to a staging key, and submission re-encodes each one (stripping
 * EXIF/GPS) to its final key. Staff review them through an authenticated route; there are no
 * public or long-lived URLs. The ID number is stored only as a peppered hash; one document can
 * verify one account (partial unique index on approved submissions).
 */
export class KycService {
  private readonly repos: KycRepos;
  private readonly deps: KycServiceDeps;
  private readonly now: () => Date;
  private readonly rateLimit: (policy: RateLimitPolicy, id: string) => Promise<void>;
  private readonly transaction: typeof runInTransaction;

  constructor(deps: KycServiceDeps) {
    this.deps = deps;
    this.repos = deps.repos;
    this.now = deps.now ?? (() => new Date());
    this.rateLimit = deps.rateLimit ?? enforceRateLimit;
    this.transaction = deps.transaction ?? runInTransaction;
  }

  get uploadsEnabled() {
    return this.deps.storage !== null;
  }

  async getStatus(actor: Actor): Promise<KycStatusDTO> {
    const latest = await this.repos.kyc.latestForUser(actor.userId);
    if (!latest) return { status: "none", note: null, submittedAt: null };
    return { status: latest.status, note: latest.status === "approved" ? null : latest.reviewNotes, submittedAt: latest.createdAt };
  }

  /** Decrypted legal name of the approved submission (for payout name matching), or null. */
  async approvedLegalName(userId: string): Promise<string | null> {
    const approved = await this.repos.kyc.approvedForUser(userId);
    return approved ? decryptField(approved.legalNameEnc) : null;
  }

  async requestUpload(actor: Actor, input: { doc: KycDoc; contentType: string; size: number }) {
    const storage = this.storage();
    await this.rateLimit("upload:user", actor.userId);
    await this.assertCanSubmit(actor);
    const key = `staging/${actor.userId}/${randomUUID()}`;
    const url = await storage.presignPut({
      bucket: this.deps.bucket,
      key,
      contentType: input.contentType,
      contentLength: input.size,
      expiresInSeconds: 10 * 60,
    });
    return { key, url };
  }

  async submit(actor: Actor, input: KycSubmitInput): Promise<void> {
    const storage = this.storage();
    await this.assertCanSubmit(actor);
    const staged = { id_front: input.idFrontKey, id_back: input.idBackKey, selfie: input.selfieKey };
    const ownKey = new RegExp(`^staging/${actor.userId}/${UUID}$`);
    for (const key of Object.values(staged)) {
      if (key !== null && !ownKey.test(key)) throw new ValidationError("One of your photos couldn't be found. Please add it again.");
    }

    // Re-encode each photo (EXIF/GPS stripped) to its final key, then drop the staging object.
    const submissionKey = `kyc/${actor.userId}/${randomUUID()}`;
    const finalKeys: Partial<Record<KycDoc, string>> = {};
    for (const [doc, key] of Object.entries(staged) as [KycDoc, string | null][]) {
      if (!key) continue;
      const object = await storage.getObject(this.deps.bucket, key, MAX_DOC_BYTES).catch(() => null);
      const jpeg = object
        ? await sharp(object.body, { limitInputPixels: 40_000_000, failOn: "error" })
            .rotate()
            .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer()
            .catch(() => null)
        : null;
      if (!jpeg) throw new ValidationError("One of your photos couldn't be read. Use a clear JPEG, PNG or WebP photo.");
      finalKeys[doc] = `${submissionKey}/${doc}.jpg`;
      await storage.putObject({ bucket: this.deps.bucket, key: finalKeys[doc]!, body: new Uint8Array(jpeg), contentType: "image/jpeg" });
      await storage.deleteObject(this.deps.bucket, key).catch(() => {});
    }

    try {
      await this.repos.kyc.insert({
        userId: actor.userId,
        legalNameEnc: encryptField(input.legalName),
        dateOfBirthEnc: encryptField(input.dateOfBirth),
        idType: input.idType,
        idNumberHash: pepperedHash("kyc-id", `${input.idType}:${input.idNumber}`),
        idFrontKey: finalKeys.id_front!,
        idBackKey: finalKeys.id_back ?? null,
        selfieKey: finalKeys.selfie!,
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError("You already have a verification waiting for review.");
      throw err;
    }
  }

  // ── Staff review (Phase 8 adds audit logging around every view and decision) ───

  async listPending(actor: AdminActor) {
    assertPermission(actor, "kyc.view");
    const rows = await this.repos.kyc.listByStatus("pending");
    return rows.map((r) => this.reviewDTO(r));
  }

  /** Decided submissions by outcome, newest first (pending is `listPending`, oldest first). */
  async listDecided(actor: AdminActor, status: "approved" | "rejected" | "needs_more_info", cursor: unknown) {
    assertPermission(actor, "kyc.view");
    const limit = 30;
    const page = toPage(await this.repos.kyc.listDecided(status, limit + 1, undefined, decodeCursor(cursor)), limit, (r) => r.createdAt);
    return { rows: page.rows.map((r) => this.reviewDTO(r)), next: page.next };
  }

  /** One submission plus the creator's other submissions (newest first). */
  async getForReview(actor: AdminActor, submissionId: string) {
    assertPermission(actor, "kyc.view");
    const row = await this.repos.kyc.findById(submissionId);
    if (!row) throw new NotFoundError();
    const all = await this.repos.kyc.listForUser(row.userId);
    return { ...this.reviewDTO(row), history: all.filter((r) => r.id !== row.id).reverse().map((r) => this.reviewDTO(r)) };
  }

  /** Every submission of one creator, newest first (creator detail page). */
  async historyForUser(actor: AdminActor, userId: string) {
    assertPermission(actor, "kyc.view");
    return (await this.repos.kyc.listForUser(userId)).reverse().map((r) => this.reviewDTO(r));
  }

  /** Document bytes for the staff viewer (streamed by an authenticated route, never a public URL). */
  async readDocument(actor: AdminActor, submissionId: string, doc: KycDoc): Promise<Uint8Array> {
    assertPermission(actor, "kyc.view");
    const row = await this.repos.kyc.findById(submissionId);
    const key = row ? { id_front: row.idFrontKey, id_back: row.idBackKey, selfie: row.selfieKey }[doc] : null;
    if (!key) throw new NotFoundError();
    const object = await this.storage().getObject(this.deps.bucket, key, MAX_DOC_BYTES);
    if (!object) throw new NotFoundError();
    logger.info("kyc document viewed", { submissionId, doc, reviewerId: actor.adminId });
    await (this.deps.audit ?? noAudit).log({ actor, action: "kyc.view_document", targetType: "kyc_submission", targetId: submissionId, after: { doc } });
    return object.body;
  }

  async decide(
    actor: AdminActor,
    submissionId: string,
    decision: { outcome: "approved" | "rejected" | "needs_more_info"; note: string | null; reasonCode: string | null },
  ): Promise<void> {
    assertPermission(actor, "kyc.decide");
    const review = { reviewerId: actor.adminId, reviewNotes: decision.note, rejectionReasonCode: decision.reasonCode, reviewedAt: this.now() };
    let decided: KycSubmission | null;
    try {
      decided = await this.transaction(async (tx) => {
        // The user row lock serialises decisions on this person's submissions, so two staff
        // approving two of them at once can't leave two approved identities (two legal names).
        const submission = await this.repos.kyc.findById(submissionId, tx);
        if (!submission) return null;
        await this.repos.users.lockById(submission.userId, tx);
        if (decision.outcome === "approved") {
          const approved = await this.repos.kyc.approvedForUser(submission.userId, tx);
          if (approved && approved.id !== submissionId) throw new ConflictError("This person's identity is already verified by another submission.");
        }
        const row = await this.repos.kyc.decide(submissionId, decision.outcome, review, tx);
        if (row && decision.outcome === "approved") await this.repos.profiles.setVerificationTier(row.userId, "id_verified", tx);
        return row;
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError("This document already verifies another account.");
      throw err;
    }
    if (!decided) throw new ConflictError("This submission was already reviewed.");
    logger.info("kyc decision", { submissionId, outcome: decision.outcome, reviewerId: actor.adminId });
    await (this.deps.audit ?? noAudit).log({
      actor,
      action: `kyc.${decision.outcome}`,
      targetType: "kyc_submission",
      targetId: submissionId,
      before: { status: "pending" },
      after: { status: decision.outcome, note: decision.note },
    });

    const user = await this.repos.users.findById(decided.userId);
    if (user) {
      const base = this.deps.appBaseUrl.replace(/\/$/, "");
      await this.deps.email
        .send({
          to: user.email,
          ...kycDecisionTemplate({
            outcome: decision.outcome,
            note: decision.note,
            url: `${base}/dashboard/verification`,
            payoutMethodUrl: `${base}/dashboard/payout-method`,
          }),
        })
        .catch((err) => logger.error("kyc decision email failed", { err }));
    }
  }

  private reviewDTO(r: KycSubmission) {
    return {
      id: r.id,
      userId: r.userId,
      legalName: decryptField(r.legalNameEnc),
      dateOfBirth: decryptField(r.dateOfBirthEnc),
      idType: r.idType,
      docs: (["id_front", "id_back", "selfie"] as const).filter((d) => d !== "id_back" || r.idBackKey),
      status: r.status,
      submittedAt: r.createdAt,
      reviewerId: r.reviewerId,
      reviewNotes: r.reviewNotes,
      reviewedAt: r.reviewedAt,
    };
  }

  private async assertCanSubmit(actor: Actor) {
    const latest = await this.repos.kyc.latestForUser(actor.userId);
    if (latest?.status === "pending") throw new ConflictError("Your verification is already waiting for review.");
    if (latest?.status === "approved") throw new ConflictError("You're already verified.");
  }

  private storage(): ObjectStorage {
    if (!this.deps.storage) throw new ConflictError("Document uploads aren't available yet.");
    return this.deps.storage;
  }
}
