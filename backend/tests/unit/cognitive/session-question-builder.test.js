const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildSessionQuestions,
  recentVariantKeys,
} = require("../../../src/services/cognitive/mmse/sessionQuestionBuilder");
const { datePartsInZone } = require("../../../src/services/cognitive/mmse/orientationBuilder");
const {
  WORD_LISTS,
  NAMING_OBJECTS,
  PHRASES,
  DRAWING_FIGURES,
} = require("../../../src/services/cognitive/mmse/questionPools");
const { MMSE_QUESTIONS } = require("../../../src/seeder/questions.seed");
const { buildScoreSnapshot } = require("../../../src/services/cognitive/scoringService");

const NOW = new Date("2027-03-17T06:00:00Z"); // Wed 17 Mar 2027, Sri Lanka time

test("keeps every standard MMSE slot, in order, with the standard points (30 total)", () => {
  const set = buildSessionQuestions({ now: NOW });
  assert.deepEqual(
    set.map((q) => q.questionId),
    MMSE_QUESTIONS.map((q) => q.id)
  );
  set.forEach((q, i) => {
    assert.equal(q.maxScore, MMSE_QUESTIONS[i].maxScore, q.questionId);
    assert.equal(q.section, MMSE_QUESTIONS[i].section, q.questionId);
    assert.equal(q.type, MMSE_QUESTIONS[i].type, q.questionId);
    assert.ok(q.variantKey, `${q.questionId} has a variantKey`);
  });
  assert.equal(set.reduce((sum, q) => sum + q.maxScore, 0), 30);
});

test("registration and recall share the same word list", () => {
  for (let i = 0; i < 20; i += 1) {
    const set = buildSessionQuestions({ now: NOW });
    const reg = set.find((q) => q.questionId === "registration");
    const rec = set.find((q) => q.questionId === "recall");
    assert.deepEqual(reg.words, rec.words);
    assert.equal(reg.words.length, 3);
    assert.ok(WORD_LISTS.some((l) => l.key === reg.variantKey));
  }
});

test("orientation time answer is correct for the injected date", () => {
  const d = datePartsInZone(NOW);
  const expectedByKey = {
    "orientation_time:year": "2027",
    "orientation_time:month": "March",
    "orientation_time:weekday": "Wednesday",
    "orientation_time:date": "17",
  };
  assert.equal(d.year, 2027);
  for (let i = 0; i < 30; i += 1) {
    const q = buildSessionQuestions({ now: NOW })[0];
    assert.equal(q.questionId, "orientation_time");
    assert.deepEqual(q.expectedAnswers, [expectedByKey[q.variantKey]]);
    const labels = q.options.map((o) => o.label);
    assert.equal(labels.length, 4);
    assert.equal(new Set(labels).size, 4, "options are distinct");
    assert.ok(labels.includes(q.expectedAnswers[0]));
  }
});

test("place question uses the patient's hometown when known, else the country", () => {
  const withHome = buildSessionQuestions({ patient: { hometown: "Kandy" }, now: NOW })[1];
  assert.equal(withHome.variantKey, "orientation_place:hometown");
  assert.deepEqual(withHome.expectedAnswers, ["Kandy"]);
  assert.ok(withHome.options.some((o) => o.label === "Kandy"));
  assert.equal(withHome.options.filter((o) => o.label.toLowerCase() === "kandy").length, 1);

  const noHome = buildSessionQuestions({ patient: {}, now: NOW })[1];
  assert.equal(noHome.variantKey, "orientation_place:country");
  assert.deepEqual(noHome.expectedAnswers, ["Sri Lanka"]);
});

test("naming items are two different objects whose options include the answer", () => {
  for (let i = 0; i < 20; i += 1) {
    const set = buildSessionQuestions({ now: NOW });
    const naming = set.filter((q) => q.type === "image_mcq");
    assert.equal(naming.length, 2);
    assert.notEqual(naming[0].variantKey, naming[1].variantKey);
    naming.forEach((q) => {
      const source = NAMING_OBJECTS.find((o) => o.key === q.variantKey);
      assert.deepEqual(
        q.options.map((o) => o.label).sort(),
        [...source.options].sort(),
        "options are a permutation of the pool entry"
      );
      assert.ok(q.image || q.emoji, "has a picture");
    });
  }
});

test("avoids variants the patient saw recently", () => {
  const seen = WORD_LISTS.slice(0, WORD_LISTS.length - 1).map((l) => l.key);
  const recentKeys = [...seen, ...PHRASES.slice(0, PHRASES.length - 1).map((p) => p.key)];
  const set = buildSessionQuestions({ recentKeys, now: NOW });
  assert.equal(set.find((q) => q.questionId === "registration").variantKey, WORD_LISTS.at(-1).key);
  assert.equal(set.find((q) => q.questionId === "language_repeat").variantKey, PHRASES.at(-1).key);
});

test("still builds a full set when every variant was seen recently", () => {
  const recentKeys = [...WORD_LISTS, ...NAMING_OBJECTS, ...PHRASES].map((v) => v.key);
  const set = buildSessionQuestions({ recentKeys, now: NOW });
  assert.equal(set.length, MMSE_QUESTIONS.length);
});

test("recentVariantKeys flattens sessions newest-first into oldest-first keys", () => {
  const keys = recentVariantKeys([
    { questionSet: [{ variantKey: "new" }] },
    { questionSet: [{ variantKey: "old" }] },
    { questionSet: [] },
  ]);
  assert.deepEqual(keys, ["old", "new"]);
});

test("a built set scores with the standard scoring rules", () => {
  const set = buildSessionQuestions({ now: NOW });
  const answers = {};
  set.forEach((q) => {
    if (q.type === "mcq" || q.type === "image_mcq") answers[q.questionId] = q.expectedAnswers[0];
    if (q.type.startsWith("word_recall")) answers[q.questionId] = q.words;
    if (q.type === "serial_subtraction") answers[q.questionId] = ["93", "86", "79", "72", "65"];
    if (q.type === "instruction_action" || q.type === "phrase_repeat") answers[q.questionId] = "correct";
    if (q.type === "text_input") answers[q.questionId] = "I like tea";
    if (q.type === "drawing_canvas") answers[q.questionId] = true;
  });
  const snapshot = buildScoreSnapshot(set, { answers, registrationWords: set[2].words });
  assert.equal(snapshot.totalScore, 30);
});

test("drawing item rotates between figures, each with its own caregiver checklist", () => {
  const seenFigures = new Set();
  for (let i = 0; i < 40; i += 1) {
    const q = buildSessionQuestions({ now: NOW }).find((x) => x.questionId === "language_drawing");
    const source = DRAWING_FIGURES.find((f) => f.key === q.variantKey);
    assert.ok(source, "variant comes from the figure pool");
    assert.equal(q.referenceAsset, source.referenceAsset);
    assert.deepEqual(q.criteria, source.criteria);
    assert.equal(q.maxScore, 1);
    seenFigures.add(q.referenceAsset);
  }
  assert.ok(seenFigures.size > 1, "more than one figure appears across sessions");

  const recentKeys = DRAWING_FIGURES.slice(0, -1).map((f) => f.key);
  const fresh = buildSessionQuestions({ recentKeys, now: NOW }).find((x) => x.questionId === "language_drawing");
  assert.equal(fresh.variantKey, DRAWING_FIGURES.at(-1).key);
});
