Village Typing Defenders

Files:
- index.html: game interface and gameplay
- kid-words.json: canonical vocabulary bank (2,000 short words) plus 100 fixed funny phrases
- kid-words.js: synchronized fallback for local file:// testing in browsers that block JSON fetches

For GitHub Pages, upload all three files to the same folder. The game loads kid-words.json first.
For direct local opening, keep the JS fallback beside index.html.

Planet Crisis selects the 100 phrases in shuffled order, without repeats until the phrase list is exhausted, then shuffles again.
