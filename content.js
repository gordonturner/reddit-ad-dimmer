/**
 * Reddit Ad Dimmer
 *
 * Finds promoted posts in the Reddit feed and recolours their text to a light
 * gray so they read as background noise rather than as regular posts.
 *
 * Detection uses two independent strategies, because Reddit's markup for ads
 * changes fairly often:
 *   1. Known custom elements / attributes (shreddit-ad-post, [promoted], etc.)
 *   2. The literal "Ad" / "Promoted" byline next to the advertiser name,
 *      walked up to its enclosing post card.
 */

(() => {
  // ---------------------------------------------------------------- config --

  /**
   * The gray applied to ad text. Lighter values fade further into the page
   * background (#ffffff in Reddit's light theme):
   *   #c2c2c2  clearly readable, just muted
   *   #dcdcdc  faint
   *   #e8e8e8  barely there
   *   #f2f2f2  nearly invisible
   */
  const COLOR = '#e4e4e4';

  /**
   * Set to true to recolour only the headline/body of the ad and leave the
   * byline, domain, and action row alone.
   */
  const TITLE_ONLY = false;

  // --------------------------------------------------------------- internals --

  const MARK = 'rdt-ad-dim';
  const STYLE_ID = 'rdt-ad-dim-style';

  const TITLE_PARTS = [
    '[slot="title"]',
    '[slot="text-body"]',
    '[slot="post-title"]',
    'h1',
    'h2',
    'h3'
  ];

  const PAGE_CSS = TITLE_ONLY
    ? TITLE_PARTS.map(s => `.${MARK} ${s}, .${MARK} ${s} *`).join(',') +
      ` { color: ${COLOR} !important; }`
    : `.${MARK}, .${MARK} * { color: ${COLOR} !important; }`;

  // Styles injected into a shadow root are already scoped to ad content, so
  // they can be blunt.
  const SHADOW_CSS = TITLE_ONLY
    ? TITLE_PARTS.map(s => `${s}, ${s} *`).join(',') + ` { color: ${COLOR} !important; }`
    : `:host, * { color: ${COLOR} !important; }`;

  /** Custom elements and attributes Reddit has used to mark promoted posts. */
  const AD_SELECTOR = [
    'shreddit-ad-post',
    'shreddit-dynamic-ad-link',
    'shreddit-comments-page-ad',
    'shreddit-post[promoted]',
    'shreddit-post[is-sponsored]',
    '[data-promoted="true"]'
  ].join(',');

  /** Elements that count as "one post card". */
  const CONTAINER = 'article, shreddit-ad-post, shreddit-post, [data-testid="post-container"]';

  /** Byline text that identifies an ad. */
  const AD_LABELS = new Set(['ad', 'promoted', 'sponsored']);

  /**
   * Adds the stylesheet to a document or shadow root, once.
   * @param {Document|ShadowRoot} root
   * @param {string} css
   */
  const injectStyle = (root, css) => {
    const host = root === document ? document.head : root;
    if (!host || host.querySelector(`#${STYLE_ID}`)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    host.appendChild(style);
  };

  /**
   * Page-level CSS cannot cross a shadow boundary, so each shadow root inside
   * an ad needs its own copy of the rules.
   * @param {Element|ShadowRoot} node
   */
  const injectIntoShadows = (node) => {
    if (node.shadowRoot) {
      injectStyle(node.shadowRoot, SHADOW_CSS);
      injectIntoShadows(node.shadowRoot);
    }
    node.querySelectorAll?.('*').forEach(child => {
      if (child.shadowRoot) {
        injectStyle(child.shadowRoot, SHADOW_CSS);
        injectIntoShadows(child.shadowRoot);
      }
    });
  };

  /**
   * Fallback detection: locate the "Ad" byline and return its post card.
   * @returns {Element[]}
   */
  const findByLabel = () => {
    const hits = [];
    document.querySelectorAll('span, a').forEach(el => {
      if (el.children.length || el.textContent.length > 12) return;
      if (!AD_LABELS.has(el.textContent.trim().toLowerCase())) return;
      const card = el.closest(CONTAINER);
      if (card) hits.push(card);
    });
    return hits;
  };

  /** @param {Element} el */
  const dim = (el) => {
    if (!el || el.classList.contains(MARK)) return;
    el.classList.add(MARK);
    injectIntoShadows(el);
  };

  const scan = () => {
    try {
      document.querySelectorAll(AD_SELECTOR).forEach(dim);
    } catch (err) {
      // A selector Reddit no longer supports shouldn't kill the label pass.
      console.debug('[Reddit Ad Dimmer] selector pass failed:', err);
    }
    findByLabel().forEach(dim);
  };

  // ------------------------------------------------------------------- run --

  const start = () => {
    injectStyle(document, PAGE_CSS);
    scan();

    // The feed is infinite-scroll, so new ads arrive long after load.
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        scan();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };

  if (document.body) {
    start();
  } else {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  }
})();
