// backend/src/services/caregiver/llmService.js
const API_KEY  = () => process.env.OPENAI_API_KEY;
const MODEL    = () => process.env.OPENAI_MODEL    || 'gpt-4o-mini';
const BASE_URL = () => process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const TIMEOUT_MS = 25000;

const SYSTEM_PROMPT = `You are the "Smart Care Coach" inside MemoCare, an app for family and professional caregivers of people with dementia.
Your ONLY job is to rewrite already-chosen recommendations in a warm, personal, calm tone.

STRICT RULES:
- Do NOT invent new medical advice, medicines, diagnoses or numbers. Use only the facts you are given.
- Do NOT contradict the given recommendations.
- Speak directly to the caregiver ("you"). Simple words, no jargon. Short sentences.
- Never blame the caregiver. Be encouraging and realistic.
- If stress level is High or burnout risk is High, gently encourage reaching out to a trusted person or a mental health professional.
- Reply with JSON ONLY in exactly this shape:
{"message": "<3-4 sentence personal message>", "notes": {"<recommendation id>": "<ONE short sentence that makes that action feel personal to today's situation>"}}`;

const buildUserPrompt = ({ stressLevel, stressScore, weekly, recs }) => {
  const lines = [];
  lines.push(`Today's stress level: ${stressLevel} (${stressScore}/10).`);
  if (weekly) {
    lines.push(
      `Weekly picture: burnout risk ${weekly.riskLevel}, trend ${weekly.trend}` +
      (weekly.avgSleep != null ? `, average sleep ${weekly.avgSleep}h` : '') +
      (weekly.consecutiveHigh ? `, ${weekly.consecutiveHigh} high-stress days in a row` : '') + '.'
    );
    const factors = (weekly.factors || []).map((f) => f.factor).filter(Boolean);
    if (factors.length) lines.push(`Main pressure points: ${factors.join(', ')}.`);
  }
  lines.push('Recommendations already chosen by the rule engine:');
  recs.forEach((r) => {
    lines.push(`- id="${r.id}" | ${r.title} | cause: ${r.primaryCause} | actions: ${(r.recommendations || []).slice(0, 3).join(' / ')}`);
  });
  return lines.join('\n');
};

const personalizeRecommendations = async (payload) => {
  if (!API_KEY()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL()}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY()}`,
      },
      body: JSON.stringify({
        model: MODEL(),
        temperature: 0.6,
        max_tokens: 1500,
        ...(process.env.OPENAI_JSON_MODE === 'off' ? {} : { response_format: { type: 'json_object' } }),
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: buildUserPrompt(payload) },
        ],
      }),
    });

    if (!res.ok) {
      console.log('LLM request failed:', res.status);
      return null;
    }

    const data = await res.json();
    const raw = (data.choices?.[0]?.message?.content || '{}')
      .replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(raw);

    if (typeof parsed.message !== 'string' || !parsed.message.trim()) return null;

    const validIds = new Set(payload.recs.map((r) => r.id));
    const notes = {};
    Object.entries(parsed.notes || {}).forEach(([id, text]) => {
      if (validIds.has(id) && typeof text === 'string') notes[id] = text.trim();
    });

    return { message: parsed.message.trim(), notes };
  } catch (err) {
    console.log('LLM error:', err.name === 'AbortError' ? 'timeout' : err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
};

module.exports = { personalizeRecommendations, buildUserPrompt };