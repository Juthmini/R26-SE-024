const { MMSE_QUESTIONS } = require("../../../seeder/questions.seed");
const { rotateSample } = require("../games/contentRotation");
const { shuffle } = require("../games/gameContentUtils");
const { TIME_VARIANT_KEYS, buildTimeQuestion, buildPlaceQuestion } = require("./orientationBuilder");
const {
  WORD_LISTS,
  NAMING_OBJECTS,
  PHRASES,
  READ_OBEY,
  THREE_STAGE,
  DRAWING_FIGURES,
} = require("./questionPools");

// Builds the question set for ONE MMSE session: same slots, order, point values
// and scoring as the standard bank, but with equivalent content rotated per
// session (word list, naming objects, phrase, commands, live orientation) and
// MCQ options shuffled. Variants the patient saw in recent sessions are avoided.

// Unchanged items come straight from the standard bank.
const FIXED_IDS = ["attention_serial7", "language_writing"];
const fixedItem = (id) => {
  const q = MMSE_QUESTIONS.find((item) => item.id === id);
  const { id: questionId, ...rest } = q;
  return { questionId, variantKey: `${questionId}:standard`, ...rest };
};

const pickOne = (pool, recentKeys, keyOf = (v) => v.key) => rotateSample(pool, 1, recentKeys, keyOf)[0];

const letterOptions = (labels) => labels.map((label, i) => ({ id: String.fromCharCode(97 + i), label }));

function namingQuestion(questionId, obj) {
  return {
    questionId,
    variantKey: obj.key,
    section: "Language",
    type: "image_mcq",
    prompt: "What is this object called?",
    subPrompt: "Look at the picture carefully",
    image: obj.image || "",
    emoji: obj.emoji || "",
    imageDescription: obj.imageDescription || "",
    options: letterOptions(shuffle(obj.options)),
    expectedAnswers: [obj.answer],
    referenceAsset: obj.referenceAsset || "",
    timeLimit: 10,
    maxScore: 1,
  };
}

/**
 * @param {object} args
 * @param {object} [args.patient]     User doc (only `hometown` is used)
 * @param {string[]} [args.recentKeys] variantKeys from the patient's recent sessions, oldest -> newest
 * @param {Date} [args.now]           injectable clock (tests)
 */
function buildSessionQuestions({ patient = null, recentKeys = [], now = new Date() } = {}) {
  const recent = recentKeys.map((k) => String(k).toLowerCase());

  const timeKey = pickOne(TIME_VARIANT_KEYS, recent, (k) => k);
  const wordList = pickOne(WORD_LISTS, recent);
  const [namingA, namingB] = rotateSample(NAMING_OBJECTS, 2, recent, (v) => v.key);
  const phrase = pickOne(PHRASES, recent);
  const obey = pickOne(READ_OBEY, recent);
  const command = pickOne(THREE_STAGE, recent);
  const figure = pickOne(DRAWING_FIGURES, recent);

  const questions = [
    buildTimeQuestion(timeKey, now),
    buildPlaceQuestion(patient),
    {
      questionId: "registration",
      variantKey: wordList.key,
      section: "Registration",
      type: "word_recall_display",
      prompt: "Remember these three items",
      subPrompt: "I will say three words. Repeat them back to me.",
      words: [...wordList.words],
      timeLimit: 20,
      maxScore: 3,
      maxAttempts: 5,
    },
    fixedItem("attention_serial7"),
    {
      questionId: "recall",
      variantKey: wordList.key,
      section: "Recall",
      type: "word_recall_input",
      prompt: "What were the three words?",
      subPrompt: "Ask the patient to recall the three words shown earlier",
      words: [...wordList.words],
      timeLimit: 30,
      maxScore: 3,
    },
    namingQuestion("language_naming_watch", namingA),
    namingQuestion("language_naming_pencil", namingB),
    {
      questionId: "language_repeat",
      variantKey: phrase.key,
      section: "Language",
      type: "phrase_repeat",
      prompt: "Repeat this phrase exactly:",
      subPrompt: `"${phrase.phrase}"`,
      phrase: phrase.phrase,
      audioAsset: phrase.audioAsset || "",
      timeLimit: 20,
      maxScore: 1,
    },
    {
      questionId: "language_close_eyes",
      variantKey: obey.key,
      section: "Language",
      type: "instruction_action",
      prompt: "Read the instruction below and follow it",
      subPrompt: obey.instruction,
      timeLimit: 10,
      maxScore: 1,
    },
    {
      questionId: "language_three_stage",
      variantKey: command.key,
      section: "Language",
      type: "instruction_action",
      prompt: "Follow these three instructions:",
      instructionSteps: [...command.steps],
      timeLimit: 30,
      maxScore: 3,
    },
    fixedItem("language_writing"),
    {
      questionId: "language_drawing",
      variantKey: figure.key,
      section: "Language",
      type: "drawing_canvas",
      prompt: "Copy this drawing",
      subPrompt: "Draw the shapes as accurately as you can",
      referenceAsset: figure.referenceAsset,
      figureName: figure.figureName,
      criteria: [...figure.criteria],
      timeLimit: 60,
      maxScore: 1,
    },
  ];

  // Orientation MCQ options are already shuffled by the builder; give every
  // question a stable display order (the seed's `order` semantics).
  return questions.map((q, index) => ({ ...q, order: index + 1 }));
}

// variantKeys from recent sessions (oldest -> newest) for rotation.
function recentVariantKeys(assessments) {
  return [...(assessments || [])]
    .reverse()
    .flatMap((a) => (Array.isArray(a.questionSet) ? a.questionSet : []))
    .map((q) => q && q.variantKey)
    .filter(Boolean);
}

module.exports = {
  FIXED_IDS,
  buildSessionQuestions,
  recentVariantKeys,
};
