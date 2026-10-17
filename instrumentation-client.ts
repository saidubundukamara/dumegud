import { initBotId } from "botid/client/core";

// Vercel BotID: attaches challenge headers to these requests; the matching Server Actions call
// assertNotBot() (server/lib/bot.ts). Server Actions POST to the page URL they're used on.
initBotId({
  protect: [
    { path: "/login", method: "POST" },
    { path: "/register", method: "POST" },
    { path: "/forgot-password", method: "POST" },
    // The support widget's Server Action posts to the creator page, /{handle}.
    { path: "/*", method: "POST" },
  ],
});
