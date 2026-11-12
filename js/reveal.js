// Scroll reveal for the member app. Elements marked .reveal (or added later as cards load)
// rise into place as they enter the viewport instead of all firing at once on load.
// Anything already in the first screen animates right away; the rest wait for scroll.
// Respects reduced motion and the intro overlay. Safe no-op where IntersectionObserver is missing.
(function () {
  const RT = window.RT;
  if (!RT) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SEL = '.reveal, [data-reveal]';

  // Called after each view renders. Returns a cleanup function the router can call.
  RT.reveal = function (root) {
    if (reduce || !('IntersectionObserver' in window)) return null;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('in-view');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -7% 0px', threshold: 0.06 });

    const seen = new WeakSet();
    function scan() {
      const fold = window.innerHeight * 0.92;
      root.querySelectorAll(SEL).forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        const r = el.getBoundingClientRect();
        // Zero-size (not laid out yet) or on-screen: let the normal load animation play.
        if (r.height === 0 || (r.top < fold && r.bottom > 0)) { el.classList.add('in-view'); return; }
        el.classList.add('r-wait');
        io.observe(el);
      });
    }
    scan();
    // Cards often fill in after a fetch; keep catching new ones for a few seconds.
    const mo = new MutationObserver(scan);
    mo.observe(root, { childList: true, subtree: true });
    const stop = setTimeout(() => mo.disconnect(), 9000);
    return function cleanup() { io.disconnect(); mo.disconnect(); clearTimeout(stop); };
  };
})();
