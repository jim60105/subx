# Visual review: fix-match-review-language-and-row-toggle

Human-reviewed. Nothing here is enforced by a test. The implementer fills in "Observed" (task 3.2); the owner fills in "Verdict".

Check `?view=match-review` in the preview harness in light and dark, `en` and `zh-TW`. Re-check in the desktop app (`npm run dev:app`).

| # | What to judge | Observed | Verdict |
|---|---|---|---|
| 1 | Hovering a pairing row reads as clickable and stays quiet; unmatched rows do not react | Headless Chromium preview, light/en and dark/zh-TW: a pairing row shows a pointer cursor and a faint `--paper-2` fill on hover; unmatched rows keep the default cursor, no fill, and clicking their slots left the count unchanged. | |
| 2 | The low-confidence accent rule, meter, and green target name stay legible on the hover background | Hovered the 52% row in both themes: the accent rule, meter segments, percentage, and green target name all stay clearly visible on the fill. | |
| 3 | The disclosure is still easy to hit, and the space to its right toggles the row | The summary is now only as wide as its label (104 px in a 623 px column). Clicking it, or pressing Enter on it, opens or closes it with no change to the count. Clicking 40 px to its right toggled the row and left the disclosure open, and so did clicking the revealed reasoning text. | |
| 4 | Dragging across a file name selects text without toggling; double-clicking feels natural; clicking inside text that is already selected toggles once (check in the WebKitGTK desktop app) | Chromium only: an 80 px drag over a file name selected "[Sub] Friere" with no toggle, and a still click inside that selection toggled once. Two quick CDP presses toggled twice (count back to where it started). CDP sent both with `detail` 1, so a true OS double click and the WebKitGTK desktop app were not exercised and need the owner. | |
| 5 | Language controls for sc, tc, en, and a code without a hand-written label (th) fit the toolbar | With an uncommitted fixture edit (one row `th`, one `sc`) at 1280 px: "Traditional Chinese 10 / English 2 / Thai 1 / Simplified Chinese 1" and "繁體中文 10 / 英文 2 / 泰文 1 / 簡體中文 1" sit on one line beside the filters. | |
