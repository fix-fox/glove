# Voyager evaluation sandbox

This directory is a **one-off evaluation** of porting the Glove80 layout to a
ZSA Voyager — built while deliberating whether to buy one. It is NOT part of
the Glove80 firmware pipeline.

- **It is OK for this directory to go stale.** Normal Glove80 sessions must
  not spend time keeping it in sync with `config.json` — do not update, port,
  or even mention it when changing the Glove80 layout.
- Nothing here feeds `npm run generate-firmware` or `config/`.
- Only touch this directory when Harel explicitly asks about the Voyager.

Contents: `EVALUATION.md` (buy/don't-buy findings), `PORT.md` (layer mapping,
judgment calls, Oryx GraphQL API gotchas), `push_layout.py` (regenerates the
Oryx layout — https://configure.zsa.io/voyager/layouts/OwJw3/latest/0).
