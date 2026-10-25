// React's streaming runtime reveals Suspense boundaries inside a view transition and calls
// `transition.ready.finally(...)` without handling the promise that returns. When the browser
// skips the transition (a second reveal, leaving mid-load, a hidden tab) `ready` rejects with
// "AbortError: Transition was skipped" and the derived promise becomes an unhandled rejection.
// This marks promises derived from a transition's `ready`/`finished` via `finally` as handled.
// Callers still see the rejection; only the unhandled report goes away.
// Loaded from <head> in app/layout.tsx so it runs before any streamed chunk.
(function () {
  var start = Document.prototype.startViewTransition;
  if (typeof start !== "function") return;
  function guard(promise) {
    if (!promise || typeof promise.finally !== "function") return;
    var original = promise.finally;
    promise.finally = function () {
      var derived = original.apply(this, arguments);
      derived.catch(function () {});
      return derived;
    };
  }
  Document.prototype.startViewTransition = function () {
    var transition = start.apply(this, arguments);
    if (transition) {
      guard(transition.ready);
      guard(transition.finished);
    }
    return transition;
  };
})();
