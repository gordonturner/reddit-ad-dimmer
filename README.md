# Reddit Ad Dimmer

A small Chrome extension that recolours the text of promoted posts on Reddit to a light gray, so ads recede into the page instead of competing with real posts for attention.

It does not block, hide, or remove anything — the ad still loads, still occupies its slot in the feed, and its images and buttons are untouched. Only the text colour changes.

```
reddit-ad-dimmer/
├── manifest.json   Manifest V3 declaration
├── content.js      All of the logic
└── README.md
```

## Install

1. Save folder `reddit-ad-dimmer` locally
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the folder.
5. Open `reddit.com` and scroll. Promoted posts should now be washed out.

This works in any Chromium browser with an extensions page — Edge, Brave, Arc, Opera. Firefox needs a different manifest and is not supported as-is.

## Configuration

Both settings live at the top of `content.js`.

### `COLOR`

The gray applied to ad text. Default is `#e4e4e4`.

| Value | Effect against Reddit's white background |
| --- | --- |
| `#c2c2c2` | Clearly readable, just muted |
| `#dcdcdc` | Faint |
| `#e8e8e8` | Barely there |
| `#f2f2f2` | Nearly invisible |

These assume the **light theme**. In dark mode a light gray makes ads *more* prominent rather than less — use something around `#3a3a3a` instead.

### `TITLE_ONLY`

`false` by default, which fades the entire ad card's text. Set it to `true` to fade only the headline and body, leaving the `u/advertiser` byline, the domain line, and the Learn More / Vote / Share row at normal contrast.

## How it works

### Manifest

A single content script, matched against `*://*.reddit.com/*` and injected at `document_idle`. No permissions are requested: everything happens through DOM APIs already available to a script running in the page, so there is no host permission prompt, no background service worker, and no network access.

### Detection

Reddit's frontend (internally "shreddit") is built from custom elements, and the markup around ads changes often enough that a single selector is fragile. The script therefore runs two independent passes and takes the union of their results.

**Pass 1 — structural.** Matches the custom elements and attributes Reddit has used to mark promoted content:

```
shreddit-ad-post
shreddit-dynamic-ad-link
shreddit-comments-page-ad
shreddit-post[promoted]
shreddit-post[is-sponsored]
[data-promoted="true"]
```

This pass is wrapped in a `try` block. If Reddit ships markup that makes one of these selectors invalid, the failure is logged at debug level and pass 2 still runs.

**Pass 2 — the byline.** Regular posts show `r/subreddit`; ads show the advertiser followed by a standalone `Ad`. The script scans leaf `span` and `a` elements for text that is exactly `ad`, `promoted`, or `sponsored` (case-insensitive, and only on elements with no children and under 12 characters of text), then walks up with `closest()` to the enclosing post card:

```
article, shreddit-post, shreddit-ad-post, [data-testid="post-container"]
```

This pass is what keeps the extension working when Reddit renames its custom elements, since the visible "Ad" disclosure is a regulatory requirement and unlikely to disappear.

### Applying the colour

Each detected card gets a marker class, `rdt-ad-dim`, and a single stylesheet is injected into `document.head`:

```css
.rdt-ad-dim, .rdt-ad-dim * { color: #e4e4e4 !important; }
```

The descendant selector and `!important` are both necessary: Reddit sets explicit colours on most text nodes via utility classes, so inheritance from the card alone would not take effect.

### Shadow DOM

Some post internals render inside shadow roots, and page-level CSS cannot cross a shadow boundary. When a card is marked, the script walks it recursively and injects a scoped copy of the rules into every shadow root it finds:

```css
:host, * { color: #e4e4e4 !important; }
```

That rule can be blunt because a shadow root found inside an ad card contains only ad content.

### Infinite scroll

The feed loads continuously, so the ads present at page load are a small fraction of what you eventually see. A `MutationObserver` watches `document.body` for `childList` changes across the whole subtree and re-runs detection. Re-scans are debounced through `requestAnimationFrame` — a burst of mutations during a feed append collapses into one scan on the next frame, and already-marked cards are skipped by the class check.

## Testing in the console

To try colour values without reloading the extension, paste the standalone snippet (the version with `__rdtAdDimStop` attached to `window`) into DevTools on a Reddit tab. Run `__rdtAdDimStop()` to disconnect the observer, strip the marker classes, and remove the injected stylesheets, then paste a modified version.

If the extension is already loaded, disable it first — otherwise both copies fight over the same class name and stylesheet ID, and the console version's undo will remove the extension's styles too.

## Known limitations

- **False positives.** Pass 2 matches any post card containing a short standalone "Ad" or "Promoted" string. A real post titled exactly that would be faded too. Rare, and the tradeoff buys resilience against markup changes.
- **Light theme only.** See `COLOR` above.
- **Images are untouched.** Ad creative is usually an image, and it stays at full contrast. Adding `.rdt-ad-dim img { opacity: 0.35; }` to the stylesheet handles that if you want it.
- **Markup drift.** Reddit ships frontend changes frequently. If ads stop fading, check in DevTools what element now wraps a promoted post and add its selector to `AD_SELECTOR`.
- **Old Reddit.** `old.reddit.com` uses entirely different markup and is not covered.

## Troubleshooting

**Nothing fades.** Confirm the content script ran — open DevTools on the Reddit tab and check for a `<style id="rdt-ad-dim-style">` in `<head>`. If it is missing, the script did not inject; reload the extension and check for errors on its card in `chrome://extensions`.

**The style tag exists but ads look normal.** Detection is failing. Inspect an ad, find its outermost element, and add a selector for it to `AD_SELECTOR` in `content.js`.

**Regular posts are fading.** A post is tripping pass 2. Either narrow `AD_LABELS` or drop pass 2 by deleting the `findByLabel().forEach(dim);` line in `scan()`.
