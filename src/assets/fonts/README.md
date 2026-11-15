# Bundled fonts

## UoqMunThenKhung (宇文天穹) Regular

The application's only bundled typeface: every serif heading, the title-bar
breadcrumb, stepper ordinals, task titles, and large numerals. Sans-serif and
monospace text use system font stacks and bundle nothing.

| Item | Value |
|---|---|
| Licence | SIL Open Font License 1.1 (`OFL.txt` in this directory) |
| Source | <https://github.com/google/fonts/tree/main/ofl/uoqmunthenkhung> |
| `google/fonts` commit | `cc39c4c2c304bc368c9b7c311ea2bcc6013299fe` |
| Source TTF | `UoqMunThenKhung-Regular.ttf`, 4,901,688 bytes, SHA-256 `943a23eb10d40ca85ee08491c0e3fb3adbc4bd111ef1f93526a4f766a8e66fbd` (not committed) |
| Bundled WOFF2 | `UoqMunThenKhung-Regular.woff2`, 2,111,020 bytes, SHA-256 `af77280c85072bec2568a187fdd4afac20a4b391edc2005a7d9b80898f7f77f8` |
| `OFL.txt` | 4,396 bytes, SHA-256 `406ef62322951b6ea94f7a91989971ddd05441e0768e638528b27e5e677c3b91` |

The WOFF2 is the complete font, not a subset. It was converted with:

```bash
uvx --from "fonttools[woff]" fonttools ttLib.woff2 compress \
  -o src/assets/fonts/UoqMunThenKhung-Regular.woff2 \
  <path-to>/UoqMunThenKhung-Regular.ttf
```

`src/styles/fontCoverage.test.ts` reads the WOFF2's character map and fails if
any locale string uses a character the font lacks. When the font is replaced,
re-run the conversion from the new `google/fonts` commit and update every row
above.
