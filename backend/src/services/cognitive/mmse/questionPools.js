// Equivalent-content variant pools for the MMSE item slots.
//
// Each pool entry keeps the slot's structure and point value identical - only
// the content changes - so a returning patient doesn't see (and learn) the same
// words, objects, phrase and commands every session, while the test stays a
// standard 30-point MMSE. Every variant has a stable `key` used for "avoid
// recent repeats" rotation.

// ── Registration + Recall (linked: recall must use the session's list) ─────
// Original MMSE list plus published alternates (MMSE alternate forms and the
// Mini-Cog word lists): concrete, unrelated, common nouns.
const WORD_LISTS = [
  { key: "words:apple-table-penny", words: ["Apple", "Table", "Penny"] },
  { key: "words:ball-flag-tree", words: ["Ball", "Flag", "Tree"] },
  { key: "words:pony-quarter-orange", words: ["Pony", "Quarter", "Orange"] },
  { key: "words:banana-sunrise-chair", words: ["Banana", "Sunrise", "Chair"] },
  { key: "words:leader-season-table", words: ["Leader", "Season", "Table"] },
  { key: "words:village-kitchen-baby", words: ["Village", "Kitchen", "Baby"] },
  { key: "words:river-nation-finger", words: ["River", "Nation", "Finger"] },
  { key: "words:captain-garden-picture", words: ["Captain", "Garden", "Picture"] },
];

// ── Naming (two objects per session) ──────────────────────────────────────
// `image` = photo URL (the two original items); `emoji` = on-device picture,
// so the new items never depend on a remote image loading.
const NAMING_OBJECTS = [
  {
    key: "naming:clock",
    answer: "Clock",
    options: ["Clock", "Watch", "Timer", "Bracelet"],
    image: "https://images.unsplash.com/photo-1563861826100-9cb868fdbe1c?w=400",
    referenceAsset: "clock",
  },
  {
    key: "naming:pencil",
    answer: "Pencil",
    options: ["Pen", "Marker", "Pencil", "Crayon"],
    image:
      "https://as1.ftcdn.net/v2/jpg/15/10/94/14/1000_F_1510941409_fLVGkWuGHlGROcYdMVXJHmnvDmQZm3rm.webp",
    imageDescription: "A writing instrument",
    referenceAsset: "pencil",
  },
  { key: "naming:watch", answer: "Watch", options: ["Watch", "Clock", "Ring", "Compass"], emoji: "⌚" },
  { key: "naming:key", answer: "Key", options: ["Key", "Lock", "Nail", "Coin"], emoji: "🔑" },
  { key: "naming:spoon", answer: "Spoon", options: ["Spoon", "Fork", "Knife", "Ladle"], emoji: "🥄" },
  { key: "naming:book", answer: "Book", options: ["Book", "Box", "Letter", "Map"], emoji: "📖" },
  { key: "naming:glasses", answer: "Glasses", options: ["Glasses", "Mask", "Goggles", "Mirror"], emoji: "👓" },
  { key: "naming:umbrella", answer: "Umbrella", options: ["Umbrella", "Hat", "Fan", "Kite"], emoji: "☂️" },
  { key: "naming:scissors", answer: "Scissors", options: ["Scissors", "Pliers", "Knife", "Tweezers"], emoji: "✂️" },
  { key: "naming:cup", answer: "Cup", options: ["Cup", "Bowl", "Jug", "Vase"], emoji: "☕" },
];

// ── Repetition ─────────────────────────────────────────────────────────────
// The original phrase has a recorded audio clip; the others are read aloud on
// the device with text-to-speech.
const PHRASES = [
  { key: "phrase:no-ifs", phrase: "No ifs, ands, or buts", audioAsset: "patient-assessment" },
  { key: "phrase:went-out", phrase: "We all went out together" },
  { key: "phrase:dog-garden", phrase: "The dog ran into the garden" },
  { key: "phrase:cup-table", phrase: "Please put the cup on the table" },
  { key: "phrase:lights-on", phrase: "Leave the lights on tonight" },
];

// ── Read and obey (single written instruction, caregiver-verified) ────────
const READ_OBEY = [
  { key: "obey:close-eyes", instruction: "CLOSE YOUR EYES" },
  { key: "obey:raise-hand", instruction: "RAISE YOUR HAND" },
  { key: "obey:touch-nose", instruction: "TOUCH YOUR NOSE" },
  { key: "obey:open-mouth", instruction: "OPEN YOUR MOUTH" },
];

// ── Three-stage command (always 3 steps, 3 points) ────────────────────────
const THREE_STAGE = [
  {
    key: "command:paper",
    steps: ["Take the paper in your right hand", "Fold the paper in half", "Put the paper on your lap"],
  },
  {
    key: "command:pen",
    steps: ["Pick up the pen with your left hand", "Tap it on the table twice", "Give it to the caregiver"],
  },
  {
    key: "command:stand",
    steps: ["Stand up from your chair", "Turn around once", "Sit back down"],
  },
  {
    key: "command:cup",
    steps: ["Pick up the cup", "Lift it above your head", "Put it back on the table"],
  },
  {
    key: "command:ear-knee",
    steps: ["Touch your left ear", "Then touch your right knee", "Then clap your hands"],
  },
];

// ── Copy a drawing (1 point, caregiver-verified) ──────────────────────────
// Equivalent visuo-constructional figures. `referenceAsset` tells the app which
// figure to draw; `criteria` is the caregiver's checklist for that figure.
const DRAWING_FIGURES = [
  {
    key: "drawing:pentagons",
    referenceAsset: "pentagons",
    figureName: "Two overlapping five-sided shapes",
    criteria: [
      "Both figures have five sides",
      "Both figures are convex",
      "Figures overlap each other",
      "Overlap creates a four-sided shape",
    ],
  },
  {
    key: "drawing:cube",
    referenceAsset: "cube",
    figureName: "A 3D cube",
    criteria: [
      "It looks three-dimensional",
      "All 12 edges are drawn",
      "Opposite edges are roughly parallel",
      "Front and back faces are similar squares",
    ],
  },
  {
    key: "drawing:overlapping-squares",
    referenceAsset: "overlapping_squares",
    figureName: "Two overlapping squares",
    criteria: [
      "Two figures, each with four sides",
      "Sides are straight and roughly equal",
      "The squares overlap each other",
      "Overlap forms a four-sided shape",
    ],
  },
  {
    key: "drawing:diamond-in-square",
    referenceAsset: "diamond_in_square",
    figureName: "A diamond inside a square",
    criteria: [
      "An outer square with four sides",
      "A four-sided diamond inside it",
      "Diamond corners touch the square's sides",
      "The figure is roughly symmetric",
    ],
  },
];

module.exports = {
  DRAWING_FIGURES,
  WORD_LISTS,
  NAMING_OBJECTS,
  PHRASES,
  READ_OBEY,
  THREE_STAGE,
};
