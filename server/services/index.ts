import "server-only";

// Composition root: the single place where repositories, integrations and services are
// instantiated and wired together. Actions and route handlers import `services` from here;
// tests can construct services directly with fakes.
//
// Each phase registers its pieces, e.g.
//   const repos = { users: new UserRepository(), … };
//   export const services = { auth: new AuthService(repos, email), … };

export const repos = {};

export const services = {};
