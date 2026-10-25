const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a canonical UUID (check route params before they reach a uuid column). */
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
