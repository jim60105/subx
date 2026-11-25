# Visual review: fix-match-review-language-and-row-toggle

Human-reviewed. Nothing here is enforced by a test. The implementer fills in "Observed" (task 3.2); the owner fills in "Verdict".

Check `?view=match-review` in the preview harness in light and dark, `en` and `zh-TW`. Re-check in the desktop app (`npm run dev:app`).

| # | What to judge | Observed | Verdict |
|---|---|---|---|
| 1 | Hovering a pairing row reads as clickable and stays quiet; unmatched rows do not react | | |
| 2 | The low-confidence accent rule, meter, and green target name stay legible on the hover background | | |
| 3 | The disclosure is still easy to hit, and the space to its right toggles the row | | |
| 4 | Dragging across a file name selects text without toggling; double-clicking feels natural; clicking inside text that is already selected toggles once (check in the WebKitGTK desktop app) | | |
| 5 | Language controls for sc, tc, en, and a code without a hand-written label (th) fit the toolbar | | |
