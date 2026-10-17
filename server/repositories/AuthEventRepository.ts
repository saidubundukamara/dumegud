import "server-only";
import type { Executor } from "@/server/db/client";
import { authEvents, type AuthEventType } from "@/server/db/schema";
import { BaseRepository } from "./BaseRepository";

export type NewAuthEvent = {
  userId: string | null;
  type: AuthEventType;
  ipHash: string | null;
  userAgent: string | null;
};

/** Append-only: there is deliberately no update or delete. */
export class AuthEventRepository extends BaseRepository {
  async append(event: NewAuthEvent, tx?: Executor): Promise<void> {
    await this.exec(tx).insert(authEvents).values(event);
  }
}
