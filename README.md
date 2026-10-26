Village Typing Defenders

Files
- index.html: responsive game with mobile/tablet on-screen typing keys
- kid-words.json: 2,000-word vocabulary and 100 fixed kid-friendly phrases
- kid-words.js: JavaScript vocabulary fallback

On-screen keyboard layout
- QWERTY letter rows
- Bottom row: Clear on the left, a wide centered Space bar, and Delete (⌫) on the right
- Key labels prevent text selection, long-press callouts, and browser tap highlights
- Space is enabled for phrase mode; Delete removes the last correctly typed character

Keep index.html, kid-words.json, and kid-words.js in the same folder when hosting on GitHub Pages.

Mobile overlay behavior
- While the Ready / Pause overlay is open, the input field and touch keyboard are hidden behind it so the playfield expands
- Overlay text and the Start / Resume button are compacted to fit without requiring a vertical scroll on common phone and tablet sizes
Typing progress behavior
- A miss clears the typing box only when the specific threat currently being typed reaches the floor.
- If a different threat reaches the floor, the player's in-progress word or phrase is preserved.
- Successfully neutralizing a threat still clears the box for the next target.

Mobile UFO layout update
- Phrase UFOs are smaller on phone-sized playfields and moderately smaller on tablets.
- UFO spawns now check actual horizontal and vertical space before appearing; if there is no safe slot, that spawn is skipped rather than allowing targets to overlap.
- Wrapped phrase height is measured for subsequent spawn-spacing checks.

Header link
- A 🎮 More Games link sits directly to the right of Sound on/off and returns to https://gurutaku.ca/coolgames/.
- The link uses responsive styling for phone and tablet widths.
