import "server-only";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/server/lib/errors";

/** A detail page's main read: a missing record renders the 404 page instead of an error. */
export async function orNotFound<T>(read: Promise<T>): Promise<T> {
  try {
    return await read;
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}
