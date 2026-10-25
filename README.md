# Village Typing Defenders — smartphone and tablet ready

## Files
- `index.html` — responsive game with touch keyboard support.
- `kid-words.json` — external 2,000-word vocabulary and 100 fixed phrases.
- `kid-words.js` — fallback word data for local file testing.

## Run locally
Keep the three game files in one folder and open `index.html`. Some browsers restrict JSON fetch from `file://`, so the game falls back to `kid-words.js`.

## Publish on GitHub Pages
Upload all three files into the same game folder. The hosted game loads `kid-words.json` first and uses `kid-words.js` as a fallback.

## Touch support
Phones and touch tablets show a custom QWERTY keyboard by default so the system keyboard does not cover the playfield. Tap **Use device keyboard** to use the device or an attached physical keyboard. The mobile game layout uses the full available screen, respects safe areas, and adjusts to portrait or landscape orientation. Keyboard play on computers remains supported.
