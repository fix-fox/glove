// Shared native ZMK settings. Included once by glove80.keymap.
// Keep these layer numbers aligned with the keymap node order.
#define LAYER_DEFAULT 0
#define LAYER_MAGIC 1
#define LAYER_FACTORY_TEST 2
#define LAYER_HEBREW 3
#define LAYER_NUMBERS 4
#define LAYER_SYMBOLS 5
#define LAYER_HEBREW_SYMBOLS 6
#define LAYER_SYSTEM 7
#define LAYER_MOUSE 8
#define LAYER_ORIGINAL_DEFAULT 9
#define LAYER_MACROS 10
#define LAYER_MOUSE_SLOW 11
#define LAYER_MOD_ACTIVE 12
#define LAYER_ENGLISH_ALPHA 13
#define LAYER_CURSOR 14
#define LAYER_APPS 15
#define LAYER_KEY_INDEX 16
#define LAYER_TMUX 17

// Home-row settings are shared by plain-key and tmux variants.
// https://zmk.dev/docs/keymaps/behaviors/hold-tap
// These are the existing tuned values, not the documentation example defaults.
#define HRM_FLAVOR "balanced"
#define HRM_TAPPING_TERM_MS 280
#define HRM_QUICK_TAP_MS 0
#define HRM_PRIOR_IDLE_MS 100

#define HRM_PROPERTIES \
    flavor = HRM_FLAVOR; \
    tapping-term-ms = <HRM_TAPPING_TERM_MS>; \
    quick-tap-ms = <HRM_QUICK_TAP_MS>; \
    require-prior-idle-ms = <HRM_PRIOR_IDLE_MS>;

// Preserve the existing cross-hand trigger sets, including deliberate thumb keys.
#define HRM_LEFT_TRIGGER_POSITIONS 5 6 7 8 9 16 17 18 19 20 21 28 29 30 31 32 33 40 41 42 43 44 45 58 59 60 61 62 63 75 76 77 78 79 72 73 74 55 56 57 52 69
#define HRM_RIGHT_TRIGGER_POSITIONS 4 3 2 1 0 15 14 13 12 11 10 27 26 25 24 23 22 39 38 37 36 35 34 51 50 49 48 47 46 68 67 66 65 64 71 70 69 54 53 52 57 74

// Keep built-in layer-tap and the custom layer-taps in sync.
#define LT_FLAVOR "balanced"
#define LT_TAPPING_TERM_MS 200
#define LT_QUICK_TAP_MS 175

#define LT_PROPERTIES \
    flavor = LT_FLAVOR; \
    tapping-term-ms = <LT_TAPPING_TERM_MS>; \
    quick-tap-ms = <LT_QUICK_TAP_MS>;

// Pixels per second. The normal speed must be defined before pointing.h.
// https://zmk.dev/docs/keymaps/behaviors/mouse-emulation
#define ZMK_POINTING_DEFAULT_MOVE_VAL 900
#define MOUSE_PRECISION_SPEED 300
