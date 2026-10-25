Village Typing Defenders — typo-friendly update

Files:
- index.html: responsive game (desktop, phone, and tablet layouts)
- kid-words.json: 2,000-word vocabulary bank and 100 phrases
- kid-words.js: fallback word data for direct/local launch if JSON fetch is unavailable

Typing behavior:
- Correctly typed prefixes are retained after a typo.
- An incorrect newly typed character is ignored, and the player can immediately try the correct character.
- Backspace still lets the player shorten a valid prefix.
- This applies to both War Zone word targets and Planet Crisis phrase targets.

For GitHub Pages, place all three files in the same game folder. Open index.html through a web server/site for best JSON loading behavior.
