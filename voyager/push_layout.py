#!/usr/bin/env python3
"""Push a Voyager port of the Glove80 layout (config.json) to ZSA Oryx.

Uses Oryx's GraphQL API (the same one its web UI calls). Anonymous layouts
need no auth; anyone with the layout hashId can edit them.

Usage:
  python3 voyager/push_layout.py <layout-hashId>
  python3 voyager/push_layout.py --fork   # fork default Voyager layout first

The layer/key mapping and all Glove80->Voyager judgment calls live in
voyager/PORT.md.

Voyager key indices:
  LEFT:  0  1  2  3  4  5      RIGHT: 26 27 28 29 30 31
         6  7  8  9 10 11             32 33 34 35 36 37
        12 13 14 15 16 17             38 39 40 41 42 43
        18 19 20 21 22 23             44 45 46 47 48 49
        thumbs: 24 25                 thumbs: 50 51
  (left column 0/6/12/18 = outer; right column 31/37/43/49 = outer)
"""

import json
import sys
import urllib.request

API = "https://oryx.zsa.io/graphql"

# ---------------------------------------------------------------- GraphQL --

def gql(query, variables):
    req = urllib.request.Request(
        API,
        data=json.dumps({"query": query, "variables": variables}).encode(),
        headers={"Content-Type": "application/json",
                 "Origin": "https://configure.zsa.io"},
    )
    with urllib.request.urlopen(req) as r:
        out = json.loads(r.read())
    if out.get("errors"):
        raise RuntimeError(json.dumps(out["errors"], indent=2))
    return out["data"]


Q_LAYOUT = """
query ($hashId: String!, $geometry: String!, $revisionId: String!) {
  layout(hashId: $hashId, geometry: $geometry, revisionId: $revisionId) {
    hashId
    revision { hashId config layers { hashId position title keys } }
  }
}"""

M_CREATE_LAYOUT = """
mutation ($title: String!, $revisionHashId: String!, $geometry: String!, $parentHashId: String) {
  createLayout(title: $title, revisionHashId: $revisionHashId,
               parentHashId: $parentHashId, geometry: $geometry) {
    hashId
    revision { hashId layers { hashId position title } }
  }
}"""

M_UPDATE_LAYER = """
mutation ($hashId: String!, $newKeys: Json, $position: Int, $title: String) {
  updateLayer(hashId: $hashId, newKeys: $newKeys, position: $position, title: $title) {
    hashId
  }
}"""

M_CREATE_LAYER = """
mutation ($keys: Json!, $revisionHashId: String!, $position: Int!, $title: String) {
  createLayer(newKeys: $keys, revisionHashId: $revisionHashId,
              position: $position, title: $title) {
    hashId
  }
}"""

M_TITLE = """
mutation ($hashId: String!, $title: String!) {
  updateLayoutTitle(hashId: $hashId, title: $title) { hashId }
}"""

M_CONFIG = """
mutation ($hashId: String!, $config: Json!) {
  updateRevisionConfig(hashId: $hashId, config: $config) { hashId }
}"""

# ------------------------------------------------------------ key builders --

NO_MODS = {"leftShift": False, "rightShift": False, "leftCtrl": False,
           "rightCtrl": False, "leftAlt": False, "rightAlt": False,
           "leftGui": False, "rightGui": False}

MOD_KEYS = {"LS": "leftShift", "RS": "rightShift", "LC": "leftCtrl",
            "RC": "rightCtrl", "LA": "leftAlt", "RA": "rightAlt",
            "LG": "leftGui", "RG": "rightGui"}


def mods(*names):
    m = dict(NO_MODS)
    for n in names:
        m[MOD_KEYS[n]] = True
    return m


def action(code, layer=None, mod_list=(), macro=None):
    return {"code": code, "layer": layer,
            "modifiers": mods(*mod_list) if mod_list else None,
            "macro": macro,
            "color": None, "modifier": None, "description": None}


def key(tap=None, hold=None, label=None, tapping_term=None):
    return {"tap": tap, "hold": hold, "doubleTap": None, "tapHold": None,
            "icon": None, "about": None, "emoji": None, "glowColor": None,
            "customLabel": label, "aboutPosition": None,
            "tappingTerm": tapping_term}


TR = key(action("KC_TRANSPARENT"))


def k(code, *mod_list, label=None):
    return key(action(code, mod_list=mod_list), label=label)


def lt(layer, code, *mod_list):
    """layer-tap: tap code, hold momentary layer"""
    return key(action(code, mod_list=mod_list), action("MO", layer=layer))


def mt(code, hold_code, *tap_mods, tapping_term=None):
    """mod-tap: tap code (opt. modified), hold modifier"""
    return key(action(code, mod_list=tap_mods), action(hold_code),
               tapping_term=tapping_term)


def hrm(code, hold_code):
    """home-row mod with the Glove80's longer 280ms tapping term"""
    return mt(code, hold_code, tapping_term=280)


def tg(layer):
    return key(action("TG", layer=layer))


def to(layer):
    """TO: go to layer. Unlike TG/MO, allowed to point backwards — Oryx
    flags forward-only layer keys that reference their own or a lower layer
    as invalid ('Invalid key assignments detected')."""
    return key(action("TO", layer=layer))


def th(tap_code, tap_mods, hold_code, hold_mods, label=None):
    """tap/hold with two (possibly modified) plain keys"""
    return key(action(tap_code, mod_list=tap_mods),
               action(hold_code, mod_list=hold_mods), label=label)


def mstep(code, *mod_list, delay=100):
    return {"code": code, "delay": delay, "modifiers": mods(*mod_list)}


def macro(steps, label=None):
    return key({"code": "KC_TRANSPARENT", "layer": None, "modifiers": None,
                "color": None, "modifier": None, "description": None,
                "macro": {"keys": steps, "name": None,
                          "applyAlt": False, "endEnter": False}},
               label=label)


# ------------------------------------------------------- layer definitions --
# Layer order: 0 Base, 1 Hebrew, 2 Numbers, 3 Symbols, 4 HebSym,
#              5 System, 6 Mouse, 7 Macros, 8 Cursor, 9 Apps

L_BASE, L_HEB, L_NUM, L_SYM, L_HEBSYM, L_SYS, L_MOUSE, L_MACRO, L_CURSOR, L_APPS = range(10)

COLON = ("KC_SCLN", ("LS",))  # ':' = shift+;


def colon_key():
    return key(action("KC_SCLN", mod_list=("LS",)))


VIM = lambda *letters: macro(
    [mstep("KC_ESCAPE"), mstep("KC_SCLN", "LS")] +
    [mstep(f"KC_{ch.upper()}") for ch in letters] +
    [mstep("KC_ENTER")],
    label=":" + "".join(letters))


def app_alt(letter):
    """tap Ctrl+Shift+Cmd+letter, hold +Alt (their app_alt behavior)"""
    return th(f"KC_{letter}", ("LC", "LS", "LG"),
              f"KC_{letter}", ("LC", "LS", "LG", "LA"))


LAYERS = [
    ("Base", [
        # number row
        tg(L_HEB), k("KC_1"), k("KC_2"), k("KC_3"), k("KC_4"), k("KC_5"),
        # top row
        k("KC_ESCAPE"), k("KC_Q"), k("KC_W"), k("KC_F"), k("KC_P"), k("KC_B"),
        # home row
        mt("KC_CAPS_LOCK", "KC_LEFT_SHIFT"),
        hrm("KC_A", "KC_LEFT_CTRL"), hrm("KC_R", "KC_LEFT_ALT"),
        hrm("KC_S", "KC_LEFT_GUI"), hrm("KC_T", "KC_LEFT_SHIFT"),
        # Apps layer access: the Glove80 reaches it via the LA(SPACE) thumb,
        # which didn't survive the 12->4 thumb cut. Mirror the Hebrew layer's
        # G/H apps-holds on the same physical keys (here G/M).
        lt(L_APPS, "KC_G"),
        # bottom row
        k("KC_GRAVE"),
        k("KC_Z"), k("KC_X"), k("KC_C"), lt(L_MACRO, "KC_D"), k("KC_V"),
        # thumbs
        lt(L_NUM, "KC_TAB"), lt(L_CURSOR, "KC_BSPC"),
        # right: number row
        k("KC_6"), k("KC_7"), k("KC_8"), k("KC_9"), k("KC_0"), k("KC_MINUS"),
        # top row
        k("KC_J"), k("KC_L"), k("KC_U"), k("KC_Y"),
        k("KC_SPACE", "LC", "LG", label="Lang/emoji"), tg(L_MOUSE),
        # home row
        lt(L_APPS, "KC_M"), hrm("KC_N", "KC_RIGHT_SHIFT"), hrm("KC_E", "KC_RIGHT_GUI"),
        hrm("KC_I", "KC_RIGHT_ALT"), hrm("KC_O", "KC_RIGHT_CTRL"), k("KC_QUOTE"),
        # bottom row
        k("KC_K"), lt(L_MACRO, "KC_H"), k("KC_COMMA"), k("KC_DOT"), k("KC_SLASH"),
        th("KC_4", ("LG", "LS"), "KC_5", ("LG", "LS"), label="Shot"),
        # thumbs
        lt(L_SYM, "KC_SPACE"), lt(L_SYS, "KC_ENTER"),
    ]),
    ("Hebrew", [
        TR, TR, TR, TR, TR, TR,
        TR, k("KC_DOT"), k("KC_COMMA"), k("KC_E"), k("KC_R"), k("KC_T"),
        TR, hrm("KC_A", "KC_LEFT_CTRL"), hrm("KC_S", "KC_LEFT_ALT"),
        hrm("KC_D", "KC_LEFT_GUI"), hrm("KC_F", "KC_LEFT_SHIFT"), lt(L_APPS, "KC_G"),
        TR, k("KC_Z"), k("KC_X"), k("KC_C"), lt(L_MACRO, "KC_V"), k("KC_B"),
        TR, TR,
        TR, TR, TR, TR, TR, TR,
        k("KC_Y"), k("KC_U"), k("KC_I"), k("KC_O"), k("KC_P"), TR,
        lt(L_APPS, "KC_H"), hrm("KC_J", "KC_RIGHT_SHIFT"), hrm("KC_K", "KC_RIGHT_GUI"),
        hrm("KC_L", "KC_RIGHT_ALT"), hrm("KC_SCLN", "KC_RIGHT_CTRL"), k("KC_QUOTE"),
        k("KC_N"), lt(L_MACRO, "KC_M"), k("KC_QUOTE"), k("KC_SLASH"), k("KC_Q"), TR,
        lt(L_HEBSYM, "KC_SPACE"), TR,
    ]),
    ("Numbers", [
        TR, TR, TR, TR, TR, TR,
        TR, TR, TR, TR, TR, TR,
        TR, TR, k("KC_LEFT_ALT"), k("KC_LEFT_CTRL"), k("KC_LEFT_SHIFT"), TR,
        TR, TR, TR, TR, TR, TR,
        TR, TR,
        TR, TR, TR, TR, TR, TR,
        TR, k("KC_7"), k("KC_8"), k("KC_9"), k("KC_F10"), TR,
        TR, k("KC_4"), k("KC_5"), k("KC_6"), k("KC_F11"), TR,
        TR, k("KC_1"), k("KC_2"), k("KC_3"), k("KC_SLASH"), TR,
        k("KC_0"), k("KC_DOT"),
    ]),
    ("Symbols", [
        TR, TR, TR, TR, TR, TR,
        TR, TR, TR, colon_key(), k("KC_ESCAPE"), TR,
        TR, k("KC_BSLS"), k("KC_EQUAL"), mt("KC_MINUS", "KC_LEFT_GUI"),
        k("KC_UNDS"), k("KC_GRAVE"),
        TR, k("KC_LABK"), k("KC_LCBR"), k("KC_LBRC"), k("KC_LPRN"), k("KC_SCLN"),
        TR, TR,
        TR, TR, TR, TR, TR, TR,
        k("KC_CIRC"), k("KC_AMPR"), k("KC_ASTR"), k("KC_PIPE"), TR, TR,
        k("KC_QUOTE"), k("KC_DQUO"), mt("KC_PLUS", "KC_RIGHT_GUI"),
        k("KC_TILD"), k("KC_SLASH"), TR,
        colon_key(), k("KC_RPRN"), k("KC_RBRC"), k("KC_RCBR"), k("KC_RABK"), TR,
        TR, TR,
    ]),
    ("HebSym", [
        TR, TR, TR, TR, TR, TR,
        TR, TR, TR, TR, TR, TR,
        TR, TR, TR, TR, TR, TR,
        TR, TR, TR, TR, TR, k("KC_GRAVE"),
        TR, TR,
        TR, TR, TR, TR, TR, TR,
        TR, TR, TR, TR, TR, TR,
        k("KC_W"), TR, TR, TR, TR, TR,
        TR, TR, TR, TR, TR, TR,
        TR, TR,
    ]),
    ("System", [
        TR, TR, TR, TR, TR, TR,
        TR, TR, k("KC_AUDIO_VOL_DOWN"), k("KC_AUDIO_MUTE"),
        k("KC_AUDIO_VOL_UP"), k("KC_BRIGHTNESS_UP"),
        TR, TR, k("KC_MEDIA_PREV_TRACK"), k("KC_MEDIA_PLAY_PAUSE"),
        k("KC_MEDIA_NEXT_TRACK"), k("KC_BRIGHTNESS_DOWN"),
        TR, TR, TR, TR, TR, TR,
        TR, TR,
        TR, TR, TR, TR, TR, TR,
        TR, k("KC_F7"), k("KC_F8"), k("KC_F9"), k("KC_F10"),
        k("KC_Q", "LC", "LG", label="Lock"),
        TR, k("KC_F4"), k("KC_F5"), k("KC_F6"), k("KC_F11"), TR,
        TR, k("KC_F1"), k("KC_F2"), k("KC_F3"), k("KC_F12"),
        k("KC_5", "LG", "LS", label="Rec"),
        TR, TR,
    ]),
    ("Mouse", [
        TR, TR, TR, TR, TR, TR,
        TR, TR, TR, TR, TR, TR,
        TR, TR, TR, k("KC_LEFT_CTRL"), k("KC_LEFT_SHIFT"), TR,
        TR, TR, k("KC_X", "LG"), k("KC_C", "LG"), TR, k("KC_V", "LG"),
        TR, TR,
        TR, TR, TR, TR, TR, TR,
        TR, k("KC_MS_WH_UP"), k("KC_MS_UP"), k("KC_MS_WH_DOWN"), TR, TR,
        TR, k("KC_MS_LEFT"), k("KC_MS_DOWN"), k("KC_MS_RIGHT"), TR, TR,
        TR, k("KC_MS_WH_LEFT"), to(L_BASE), k("KC_MS_WH_RIGHT"), TR, k("KC_MS_BTN3"),
        k("KC_MS_BTN1"), k("KC_MS_BTN2"),
    ]),
    ("Macros", [
        TR, TR, TR, TR, TR, TR,
        TR, VIM("q"), VIM("w"), TR,
        macro([mstep("KC_V"), mstep("KC_SPACE"), mstep("KC_T", "LC")], label="v ^T"),
        macro([mstep("KC_SPACE", "LA"), mstep("KC_B"), mstep("KC_SPACE")],
              label="FlowBkmk"),
        TR, TR, TR, TR, TR,
        macro([mstep("KC_SLASH"), mstep("KC_C"), mstep("KC_O"), mstep("KC_P"),
               mstep("KC_Y"), mstep("KC_ENTER", delay=300), mstep("KC_G", "LC"),
               mstep("KC_I", delay=30), mstep("KC_V", "LG"), mstep("KC_ESCAPE"),
               mstep("KC_G"), mstep("KC_G")], label="ClaudeCp"),
        TR, VIM("c", "q"), VIM("x"),
        macro([mstep("KC_L", "LG"), mstep("KC_C", "LG")], label="CopyURL"),
        # Ctrl+Space as a plain modified key: Oryx's server silently strips
        # single-step macros (stores {}), and a one-chord macro is pointless
        # anyway. The ZMK lang_toggle's `&tog hebrew` half can't ride along
        # on the same key in Oryx — the layer toggle stays on Base key 0.
        k("KC_SPACE", "LC", label="Lang"),
        TR,
        k("KC_BSPC", "LG", label="DelToBOL"), k("KC_K", "LC", label="DelToEOL"),
        TR, TR, TR, TR, TR, TR,
        TR, TR, TR, TR, TR, TR,
        TR, TR, TR, TR, TR, TR,
        TR, k("KC_SPACE", "LC", label="Lang"), TR, TR, TR, TR,
        TR, TR,
    ]),
    ("Cursor", [
        TR, TR, TR, TR, TR, TR,
        TR, k("KC_Q", "LG"), k("KC_W", "LG"), k("KC_F", "LG"),
        k("KC_P", "LG"), k("KC_B", "LG"),
        TR, mt("KC_A", "KC_LEFT_CTRL", "LG"), mt("KC_R", "KC_LEFT_ALT", "LG"),
        mt("KC_S", "KC_LEFT_GUI", "LG"), mt("KC_T", "KC_LEFT_SHIFT", "LG"),
        k("KC_G", "LG"),
        k("KC_Y", "LG"), k("KC_Z", "LG"), k("KC_X", "LG"), k("KC_C", "LG"),
        k("KC_D", "LG"), k("KC_V", "LG"),
        k("KC_DELETE"), TR,
        TR, TR, TR, TR, TR, TR,
        TR, k("KC_PAGE_UP"), k("KC_UP"), k("KC_PGDN"), TR, TR,
        TR, k("KC_LEFT"), k("KC_DOWN"), k("KC_RIGHT"), TR, TR,
        TR, k("KC_LEFT", "LG"), k("KC_ESCAPE"), k("KC_RIGHT", "LG"), TR,
        k("KC_V", "LA", "LS", label="ClipHist"),
        k("KC_ENTER"), TR,
    ]),
    ("Apps", [
        TR, k("KC_1", "LG"), k("KC_2", "LG"), k("KC_3", "LG"),
        k("KC_4", "LG"), k("KC_5", "LG"),
        TR, app_alt("Q"), app_alt("W"), app_alt("F"), app_alt("P"),
        macro([mstep("KC_SPACE", "LA"), mstep("KC_B"), mstep("KC_SPACE")],
              label="FlowBkmk"),
        TR, app_alt("A"), app_alt("R"), app_alt("S"), app_alt("T"), app_alt("G"),
        TR, app_alt("Z"), app_alt("X"), app_alt("C"), app_alt("D"), app_alt("V"),
        TR, macro([mstep("KC_LEFT_CTRL"), mstep("KC_LEFT_CTRL")], label="Dictate"),
        k("KC_6", "LG"), k("KC_7", "LG"), k("KC_8", "LG"),
        k("KC_9", "LG"), k("KC_0", "LG"), TR,
        app_alt("J"), app_alt("L"), app_alt("U"), app_alt("Y"), TR, TR,
        app_alt("M"), app_alt("N"), app_alt("E"), app_alt("I"), app_alt("O"), TR,
        app_alt("K"), app_alt("H"), TR, TR, TR, TR,
        TR, TR,
    ]),
]

TITLE = "Harel Glove80 port"

# NOTE: value types must match Oryx's settings schema exactly (toggle=bool,
# slider=int) — a wrong type (e.g. flowTap: true) crashes the Oryx web app
# into an infinite "Loading" state for everyone opening the layout.
CONFIG = {"qmkCanary": True, "tappingTerm": 200, "permissiveHold": True,
          "chordalHold": True, "chordalHoldExcludeThumbs": True,
          "flowTap": 100, "perKeyTappingTerm": True}

# ------------------------------------------------------------------- main --

def main():
    for title, keys in LAYERS:
        assert len(keys) == 52, f"layer {title}: {len(keys)} keys"

    if "--fork" in sys.argv:
        default = gql(Q_LAYOUT, {"hashId": "default", "geometry": "voyager",
                                 "revisionId": "latest"})["layout"]
        data = gql(M_CREATE_LAYOUT, {
            "title": TITLE, "geometry": "voyager",
            "revisionHashId": default["revision"]["hashId"],
            "parentHashId": default["hashId"]})["createLayout"]
        layout_id = data["hashId"]
        print(f"forked -> {layout_id}")
    else:
        layout_id = sys.argv[1]

    layout = gql(Q_LAYOUT, {"hashId": layout_id, "geometry": "voyager",
                            "revisionId": "latest"})["layout"]
    rev = layout["revision"]
    existing = sorted(rev["layers"], key=lambda l: l["position"])

    gql(M_TITLE, {"hashId": layout_id, "title": TITLE})
    gql(M_CONFIG, {"hashId": rev["hashId"], "config": CONFIG})

    for i, (title, keys) in enumerate(LAYERS):
        if i < len(existing):
            gql(M_UPDATE_LAYER, {"hashId": existing[i]["hashId"],
                                 "newKeys": keys, "position": i, "title": title})
        else:
            gql(M_CREATE_LAYER, {"keys": keys, "revisionHashId": rev["hashId"],
                                 "position": i, "title": title})
        print(f"layer {i} '{title}' pushed")

    # read back and verify
    check = gql(Q_LAYOUT, {"hashId": layout_id, "geometry": "voyager",
                           "revisionId": "latest"})["layout"]["revision"]
    got = sorted(check["layers"], key=lambda l: l["position"])
    ok = True
    for i, (title, keys) in enumerate(LAYERS):
        if i >= len(got) or got[i]["title"] != title:
            print(f"MISMATCH layer {i}: expected '{title}', got "
                  f"{got[i]['title'] if i < len(got) else 'MISSING'}")
            ok = False
            continue
        for j, want in enumerate(keys):
            have = got[i]["keys"][j]
            for part in ("tap", "hold"):
                w, h = want.get(part), have.get(part)
                w_code = w and w["code"]
                h_code = h and h["code"]
                w_layer = w and w.get("layer")
                h_layer = h and h.get("layer")
                if w_code != h_code or w_layer != h_layer:
                    print(f"MISMATCH L{i} key{j} {part}: sent {w_code}/{w_layer} "
                          f"got {h_code}/{h_layer}")
                    ok = False
    print("VERIFIED OK" if ok else "VERIFICATION FAILED")
    print(f"open: https://configure.zsa.io/voyager/layouts/{layout_id}/latest/0")


if __name__ == "__main__":
    main()
