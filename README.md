# lastpass_width_modifier

A Tampermonkey userscript that stretches the LastPass item / secure-note drawer
so long notes are actually readable, instead of being crammed into a narrow
fixed-width panel.

Fixes the issue discussed here : https://community.lastpass.com/discussion/4810/how-can-i-see-a-bigger-display-of-a-secure-note-or-notes-on-a-password-new-ui-requires-too-much-scrolling

The width is yours to control — slider, keyboard, or an exact number — and it is
remembered between sessions.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) (Chrome, Edge, Firefox).
2. Click the raw script link:

   **[lastpass-wide-note.user.js](https://raw.githubusercontent.com/koopertrooper/lastpass_width_modifier/main/lastpass-wide-note.user.js)**

   Tampermonkey intercepts it and shows its install page.
3. Open your LastPass vault and edit or view a secure note.

The script declares `@updateURL` / `@downloadURL`, so Tampermonkey checks this
repository for new versions and updates itself.

## Usage

A small control pill appears at the bottom-left of the vault page.

| Control | Action |
| --- | --- |
| slider | Set panel width directly |
| `−` / `+` | Width in 80px steps |
| `max` | Fill the window |
| `pick` | Manually target the panel (see below) |
| `debug` | Dump panel candidates to the browser console |
| status text | Which element the script is currently stretching |

Keyboard:

| Shortcut | Action |
| --- | --- |
| `Ctrl+Alt+←` / `Ctrl+Alt+→` | Panel width ∓ 80px |
| `Ctrl+Alt+↑` / `Ctrl+Alt+↓` | Note textarea height ± 60px |
| `Esc` | Cancel picker mode |

The Tampermonkey tray menu also offers *Set panel width…*, *Set note box
height…*, *Forget picked panel*, and *Dump panel candidates to console*.

Defaults: 900px wide, 480px note box, minimum 400px, maximum `window width − 40px`.
Both values persist via `GM_setValue` (falling back to `localStorage`).

The note textarea additionally gets a monospace font, `white-space: pre`, and
`resize: both`, so notes containing config snippets or key/value blocks line up
instead of wrapping.

## How it finds the panel

LastPass class names churn between releases, so nothing is hardcoded. Detection
runs in three passes, first hit wins:

1. **By title** — find a heading matching `secure note`, `add item`, `edit item`,
   etc., then climb to the outermost ancestor that looks like a drawer.
2. **By textarea** — find a tall textarea and climb from there.
3. **By geometry** — any tall, right-anchored element containing an editable field.

"Looks like a drawer" is purely geometric: at least 45% of the viewport height,
between 240px and 96% of the viewport width, and its right edge within 40px of
the window's right edge. No `position` requirement, since the panel is sometimes
a plain flex child. All passes walk shadow roots as well as the light DOM.

Widening the panel alone is not enough when a wrapper caps it, so the script
also walks up to 8 ancestors and widens any that were roughly as narrow as the
panel, skipping full-width rows. Everything is applied as inline `!important`,
which beats LastPass's own stylesheets regardless of specificity, and is fully
reverted when the panel closes.

A `MutationObserver` plus a 1.2s interval re-scan keeps up with the SPA
re-rendering itself.

## When detection breaks

If LastPass reworks its UI and the pill reports `no panel found`:

- Click **`pick`**, then click anywhere on the note panel. The script climbs to
  the nearest tall right-edge ancestor, saves a CSS path, and reuses it on every
  later load. Shift-click `pick` to forget it; `Esc` cancels.
- Click **`debug`** to dump every candidate element to the console with its
  width, height, right edge, `position`, `max-width`, and `flex` — enough to
  work out what to target.

## Notes

- Runs only on `lastpass.com` and its subdomains.
- Purely cosmetic: it reads no vault data, sends nothing anywhere, and stores
  only two numbers and an optional CSS selector locally.
- If the vault is inside a cross-origin iframe, the script runs in that frame
  too, and the control pill will appear within it.

## License

MIT
