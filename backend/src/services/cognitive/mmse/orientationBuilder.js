const { shuffle } = require("../games/gameContentUtils");

// Orientation questions built from the real date (and the patient's profile),
// so the correct answer is always right for "today" - no hardcoded year.
// Dates are read in the patient's time zone (Sri Lanka by default).
const ORIENTATION_TZ = process.env.MMSE_TIMEZONE || "Asia/Colombo";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const COUNTRIES = ["Sri Lanka", "India", "Maldives", "Bangladesh", "Thailand", "Malaysia", "Pakistan", "Nepal"];
const HOME_COUNTRY = "Sri Lanka";

const SRI_LANKA_CITIES = [
  "Colombo", "Kandy", "Galle", "Jaffna", "Negombo", "Matara", "Kurunegala", "Anuradhapura",
  "Batticaloa", "Trincomalee", "Ratnapura", "Badulla", "Nuwara Eliya", "Kalutara", "Gampaha",
  "Polonnaruwa", "Hambantota", "Kegalle", "Matale", "Puttalam",
];

function datePartsInZone(now, timeZone = ORIENTATION_TZ) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "long",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return {
    year: Number(parts.year),
    monthIndex: Number(parts.month) - 1,
    day: Number(parts.day),
    weekday: parts.weekday,
  };
}

// 3 distinct distractors from `candidates` (never the answer), shuffled in
// with the answer to give 4 options.
function withDistractors(answer, candidates) {
  const others = [...new Set(candidates.map(String))].filter((c) => c !== String(answer));
  const picked = shuffle(others).slice(0, 3);
  return shuffle([String(answer), ...picked]);
}

function cycle(list, index, offset) {
  return list[(index + offset + list.length) % list.length];
}

// The four interchangeable "time" prompts. Each keeps the original slot's
// 5 points so the Orientation section still totals 10.
const TIME_VARIANTS = {
  "orientation_time:year": (d) => ({
    prompt: "What year is it?",
    answer: String(d.year),
    options: withDistractors(d.year, [d.year - 1, d.year + 1, d.year - 2, d.year + 2]),
  }),
  "orientation_time:month": (d) => {
    const answer = MONTHS[d.monthIndex];
    return {
      prompt: "What month is it?",
      answer,
      options: withDistractors(answer, [
        cycle(MONTHS, d.monthIndex, -1),
        cycle(MONTHS, d.monthIndex, 1),
        cycle(MONTHS, d.monthIndex, 6),
        cycle(MONTHS, d.monthIndex, -4),
      ]),
    };
  },
  "orientation_time:weekday": (d) => {
    const index = WEEKDAYS.indexOf(d.weekday);
    return {
      prompt: "What day of the week is it today?",
      answer: d.weekday,
      options: withDistractors(d.weekday, [
        cycle(WEEKDAYS, index, -1),
        cycle(WEEKDAYS, index, 1),
        cycle(WEEKDAYS, index, 3),
      ]),
    };
  },
  "orientation_time:date": (d) => {
    const candidates = [d.day - 3, d.day + 3, d.day - 7, d.day + 7, d.day + 10, d.day - 10]
      .filter((n) => n >= 1 && n <= 31);
    return {
      prompt: "What is today's date (day of the month)?",
      answer: String(d.day),
      options: withDistractors(d.day, candidates),
    };
  },
};

const TIME_VARIANT_KEYS = Object.keys(TIME_VARIANTS);

function buildTimeQuestion(variantKey, now) {
  const built = TIME_VARIANTS[variantKey](datePartsInZone(now));
  return {
    questionId: "orientation_time",
    variantKey,
    section: "Orientation",
    type: "mcq",
    prompt: built.prompt,
    subPrompt: "Select the correct answer",
    options: built.options.map((label, i) => ({ id: String.fromCharCode(97 + i), label })),
    expectedAnswers: [built.answer],
    timeLimit: 10,
    maxScore: 5,
  };
}

function buildPlaceQuestion(patient) {
  const hometown = String((patient && patient.hometown) || "").trim();

  if (hometown) {
    const others = SRI_LANKA_CITIES.filter((c) => c.toLowerCase() !== hometown.toLowerCase());
    const options = withDistractors(hometown, others);
    return {
      questionId: "orientation_place",
      variantKey: "orientation_place:hometown",
      section: "Orientation",
      type: "mcq",
      prompt: "Which town or city is your home?",
      subPrompt: "Select the correct answer",
      options: options.map((label, i) => ({ id: String.fromCharCode(97 + i), label })),
      expectedAnswers: [hometown],
      timeLimit: 10,
      maxScore: 5,
    };
  }

  const options = withDistractors(HOME_COUNTRY, COUNTRIES);
  return {
    questionId: "orientation_place",
    variantKey: "orientation_place:country",
    section: "Orientation",
    type: "mcq",
    prompt: "What country are we in?",
    subPrompt: "Select the correct answer",
    options: options.map((label, i) => ({ id: String.fromCharCode(97 + i), label })),
    expectedAnswers: [HOME_COUNTRY],
    timeLimit: 10,
    maxScore: 5,
  };
}

module.exports = {
  ORIENTATION_TZ,
  TIME_VARIANT_KEYS,
  datePartsInZone,
  buildTimeQuestion,
  buildPlaceQuestion,
};
