Fonts used on backdash.gg (Project Backdash)
=============================================

Display: PBD Display, Project Backdash's own caps-only typeface, a free font
under the SIL Open Font License 1.1 (OFL), with no Reserved Font Name.
Copyright 2026 Project Backdash contributors. The full licence text is next
to this file: OFL-pbd.txt.

Body and interface: Barlow, a free font under the SIL Open Font License 1.1
(OFL), with no Reserved Font Name. The full licence text is next to this file:
OFL-Barlow.txt.

Each licence text must stay with its font files.

Files
-----
pbd-display.woff2  PBD Display 1.000 regular, one weight, caps only  10,020 bytes
barlow-400.woff2   Barlow Regular                                    13,060 bytes
barlow-500.woff2   Barlow Medium                                     13,040 bytes
barlow-600.woff2   Barlow SemiBold                                   13,228 bytes
barlow-700.woff2   Barlow Bold                                       13,092 bytes
                                                             total   62,440 bytes

The @font-face rules are in /assets/css/fonts.css (font-display: swap).

Sources
-------
PBD Display  drawn by Project Backdash contributors, Version 1.000:
        generated from rectangles, parallelograms and the brand's 2:1 corner cut
        by docs/brand/assets/explore/type/v11/build-pbd-display.py in the source
        repository (pbd-display.woff2 there, byte for byte), hinted by afdko
        otfautohint. The font's own names state the same licence as OFL-pbd.txt:
        the copyright line, the OFL description (name ID 13) and
        https://openfontlicense.org (name ID 14). The accent marks keep a clear
        pixel row above the capitals from 17 px up in Edge on Windows, and
        fontbakery reports no failures (NOTES.md there).

Barlow  by Jeremy Tribby (the Barlow Project Authors), Version 1.408
        (fetched from github.com/google/fonts, main branch, on 2026-09-26)
        https://github.com/google/fonts/raw/main/ofl/barlow/Barlow-Regular.ttf
        SHA-256 95aa02c7c43096e0dd44d787ba6216864a67157e402adab59b35572e0c1577ea
        https://github.com/google/fonts/raw/main/ofl/barlow/Barlow-Medium.ttf
        SHA-256 f8906f762cb73dca441da034bc363b2d8e2e68bc10d5c05e58717646c20cc4b4
        https://github.com/google/fonts/raw/main/ofl/barlow/Barlow-SemiBold.ttf
        SHA-256 86577cb32f8abe3673db53ca0f4221e6856751a4f6730c867e00f720f8bb1fc5
        https://github.com/google/fonts/raw/main/ofl/barlow/Barlow-Bold.ttf
        SHA-256 84e6a4d61e7c3e21f3c50ea6a4f7e5303a3467864c038be6ea3759bab8d547f9
        https://github.com/google/fonts/raw/main/ofl/barlow/OFL.txt
        SHA-256 186d750eb496a4c17a76385f82be6aea2ac1cf2de074a811d63786cf374ea73f
        Project page: https://github.com/jpt/barlow

What was changed in Barlow (a Modified Version under the OFL)
-------------------------------------------------------------
Made with fontTools 4.60.1 by docs/brand/assets/build-fonts.py in the source
repository, on 2026-09-26:
- Subset to Basic Latin, Latin-1 Supplement, General Punctuation, Arrows
  (U+2190-21FF), a few maths signs (U+2212, U+2248, U+2264, U+2265), U+2122,
  and every other character the site's pages use.
- Kept OpenType features: kern, liga, locl, case, lnum, pnum, tnum, rvrn (where
  the source has them). Hinting instructions removed. Saved as WOFF2.
- Font names, copyright and licence entries are kept.

Saira, the former display face, is not used by the site's pages. Preview
builds carry it in /assets/brand/variants/ (saira-var.woff2, with
OFL-Saira.txt) for the font toggle only.
