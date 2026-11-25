/** ASS override blocks: `{\an8}`, `{\i1\b1}`. Braces without a backslash are text. */
const ASS_OVERRIDE = /\{\\[^{}]*\}/g;

/**
 * HTML-like tags as subtitle formats use them: `<i>`, `</font>`, and WebVTT
 * timestamps such as `<00:01.000>`. A `<` followed by anything else, as in
 * `b < c`, is text.
 */
const MARKUP_TAG = /<\/?(?:[A-Za-z]|\d{2}:)[^<>]*>/g;

/**
 * The cue's text with its markup removed, for display as plain text.
 *
 * Nothing here is ever interpreted: the result is rendered as a text node, so
 * stripping is about legibility, not safety. Both patterns stop at the next
 * opening brace or angle bracket, which keeps them linear on any input.
 */
export function plainCueText(text: string): string {
  return text
    .replace(ASS_OVERRIDE, "")
    .replace(MARKUP_TAG, "")
    .replace(/\\[Nn]/g, "\n")
    .replace(/\\h/g, " ")
    .trim();
}
