/*
 * DuMeGud "Support me" button for your website.
 *
 *   <script src="https://dumegud.com/embed/button.js" data-handle="yourhandle" data-size="lg" async></script>
 *
 * Adds a linked badge image right after this tag. No cookies, no tracking, no iframe.
 * GitHub READMEs don't run scripts: use the Markdown snippet from dumegud.com/brand there.
 */
(function () {
  var script = document.currentScript;
  if (!script || !script.src) return;
  var handle = (script.getAttribute("data-handle") || "").trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9_]{1,28}[a-z0-9])$/.test(handle)) {
    if (window.console) console.warn("DuMeGud button: set data-handle to your DuMeGud handle.");
    return;
  }
  var size = script.getAttribute("data-size") === "sm" ? "sm" : "lg";
  var origin = new URL(script.src).origin;

  var link = document.createElement("a");
  link.href = origin + "/" + handle + "?via=badge";
  link.target = "_blank";
  link.rel = "noopener";

  var img = document.createElement("img");
  img.src = origin + "/api/badge/" + handle + "?size=" + size;
  img.alt = "Support @" + handle + " on DuMeGud";
  img.height = size === "sm" ? 20 : 32;
  img.setAttribute("loading", "lazy");
  img.setAttribute("decoding", "async");

  link.appendChild(img);
  script.parentNode.insertBefore(link, script.nextSibling);
})();
