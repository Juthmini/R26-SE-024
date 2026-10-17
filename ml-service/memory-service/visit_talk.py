# -*- coding: utf-8 -*-
"""
Visit conversations: what a family member and the patient talked about.

Only for people the caregiver has marked "conversation can be summarised"
(PIN-protected consent per person). While such a person is recognised by the
live camera, the app records short audio clips (about 30 s). Each clip is
transcribed and the AUDIO IS DISCARDED immediately; when the visit ends, the
transcript is turned into a short summary (topics, plans/promises, mood plus
two quiz questions) and the transcript itself is dropped too. Only the summary
is kept - that's what the evening story and the memory game use
("කමල් කතා කළේ මොනවා ගැනද?").
"""
import os
import json
import uuid
import datetime
import threading

import requests
from fastapi import APIRouter, UploadFile, File, Form

import remember_moments as rm

router = APIRouter()

DB_FILE = "visit_talk_db.json"
CONVERSATIONS = {}   # pid -> [{id, person_id, day, time, seconds, summary_si, summary_en, topics, promises, mood,
                    #          visitor_asked, patient_said, questions}]
CONSENT_ALL = {}     # pid -> {on, at}: caregiver chose to summarise talks with ANY visitor, not only registered family
LIVE = {}            # visit_id -> {pid, person_id, texts: [..], started, clip_seconds} (memory only)
_lock = threading.Lock()


def _load():
    global CONVERSATIONS, CONSENT_ALL
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            CONVERSATIONS = data.get("CONVERSATIONS", {})
            CONSENT_ALL = data.get("CONSENT_ALL", {})
        except Exception as e:
            print("visit_talk_db load failed:", e)


def _save():
    with _lock:
        with open(DB_FILE, "w", encoding="utf-8") as f:
            json.dump({"CONVERSATIONS": CONVERSATIONS, "CONSENT_ALL": CONSENT_ALL}, f, ensure_ascii=False)


_load()


def _person(pid, person_id):
    return next((p for p in rm.PEOPLE.get(pid, []) if p["id"] == person_id), None)


def for_day(pid, day):
    return [c for c in CONVERSATIONS.get(pid, []) if c["day"] == day]


# The story (remember_moments.build_story) reads conversations through this hook,
# so remember_moments doesn't need to import this module.
rm._ctx["conversations_for"] = for_day


# ─── Consent (caregiver PIN) ─────────────────────────────────────────────────
@router.post("/family/consent")
async def set_consent(patient_id: str = Form(...), pin: str = Form(...), person_id: str = Form(...),
                      allow: bool = Form(...)):
    if not rm._pin_ok(patient_id, pin):
        return {"status": "error", "message": "Caregiver PIN is wrong"}
    p = _person(patient_id, person_id)
    if not p:
        return {"status": "error", "message": "Not found"}
    p["conversation_ok"] = bool(allow)
    p["conversation_consent_at"] = datetime.datetime.now().isoformat()
    rm._save()
    return {"status": "success", "person": rm._public_person(p)}


def all_visitors_ok(pid):
    return bool((CONSENT_ALL.get(pid) or {}).get("on"))


@router.post("/family/consent-all")
async def set_consent_all(patient_id: str = Form(...), pin: str = Form(...), allow: bool = Form(...)):
    """Caregiver setting: also summarise conversations with visitors who are not
    registered (neighbours, friends). The camera screen shows a visible
    'listening' badge the whole time, so visitors can see it."""
    if not rm._pin_ok(patient_id, pin):
        return {"status": "error", "message": "Caregiver PIN is wrong"}
    CONSENT_ALL[patient_id] = {"on": bool(allow), "at": datetime.datetime.now().isoformat()}
    _save()
    return {"status": "success", "on": bool(allow)}


@router.get("/family/consent-all/{patient_id}")
async def get_consent_all(patient_id: str):
    return {"status": "success", "on": all_visitors_ok(patient_id)}


# ─── During a visit ──────────────────────────────────────────────────────────
# Everyday Sinhala words of a home visit, written the way Whisper (Hindi mode)
# spells them - a hint that helps short, quiet clips come out as real words.
WHISPER_HINT = ("आयुबोवन अम्मे ताता आच्ची सीया पुते दुवे. ओया अद कैवद? मोनवद कैवे? बेहेत बिव्वद? "
                "बत कैवा. ते बिव्वा. कोहोमद? होंदिन्. मम हेट एनवा. इरिदा. गेदर. वेदनावयि.")
VISIT_DEBUG = os.environ.get("VISIT_DEBUG", "") == "1"


@router.post("/visit/audio")
async def visit_audio(patient_id: str = Form(...), person_id: str = Form(...), visit_id: str = Form(...),
                      seconds: int = Form(0), file: UploadFile = File(...)):
    p = _person(patient_id, person_id)
    if not ((p and p.get("conversation_ok")) or all_visitors_ok(patient_id)):
        # Checked on the server too - the app alone is not trusted with consent.
        return {"status": "error", "message": "No consent to summarise conversations with this person"}
    if not rm.GROQ_API_KEY:
        return {"status": "error", "message": "GROQ_API_KEY is not set on the AI server"}
    audio = await file.read()   # kept in memory only; never written to disk
    size = len(audio)
    try:
        r = requests.post(f"{rm.GROQ_BASE}/audio/transcriptions",
                          headers={"Authorization": f"Bearer {rm.GROQ_API_KEY}"},
                          files={"file": (file.filename or "clip.m4a", audio)},
                          data={"model": "whisper-large-v3", "response_format": "json", "temperature": "0",
                                "language": "hi", "prompt": WHISPER_HINT}, timeout=45)
        r.raise_for_status()
        text = r.json().get("text", "").strip()
        if VISIT_DEBUG:  # development only: what Whisper heard, in Sinhala letters
            print(f"[visit debug] heard: {rm.to_sinhala_script(text)[:160]}")
    except Exception as e:
        return {"status": "error", "message": f"Transcription failed: {e}"}
    finally:
        del audio
    buf = LIVE.setdefault(visit_id, {"pid": patient_id, "person_id": person_id, "texts": [],
                                     "started": datetime.datetime.now().isoformat(), "clip_seconds": 0})
    if text:
        buf["texts"].append(text)
    buf["clip_seconds"] += max(0, seconds)
    print(f"[visit] {visit_id} clip {len(buf['texts'])}: {size} bytes audio -> {len(text)} chars")
    return {"status": "success", "clips": len(buf["texts"])}


def _summarise(p, texts):
    """p is the registered person, or None for a visitor who is not registered."""
    p = p or {"relation": "visitor", "relation_si": "අමුත්තා"}
    name = p.get("name") if p.get("name") and p.get("name") != p.get("relation_si") else ""
    who = (f"their {p['relation']}" if p["relation"] != "visitor" else "a visitor") + (f" {name}" if name else "")
    return rm._llm_json(
        "Below is a transcription of a home visit: an elderly Sri Lankan person with dementia talking with "
        f"{who}. The language is SINHALA, but it is written PHONETICALLY in Devanagari script (Whisper was set to "
        "Hindi), e.g. 'मता अलू प्रसावक लबुना' is the Sinhala 'මට අලුත් රස්සාවක් ලැබුණා' (I got a new job), "
        "'कोलम' is 'කොළඹ' (Colombo), 'अम्मी' is 'අම්මේ'. Common words: 'हिरिदा/इरिदा' = ඉරිදා (Sunday), "
        "'सन्दुदा' = සඳුදා, 'सेनसुरादा' = සෙනසුරාදා, 'लबन' = ලබන (next), 'आये/आयेत' = ආයෙත් (again), "
        "'एनवा/इनवा/तिनमा' ≈ එනවා (will come), 'गेनेन्नम/दिनिनना' ≈ ගෙනෙන්නම් / දෙන්නම් (will bring/give), "
        "'बिहित/बेहेत' = බෙහෙත් (medicine), 'बुन्ना/बोन्न' = බොන්න (drink/take). Speech recognition is imperfect: "
        "read the sounds back as Sinhala first, then summarise. Fix obvious mishearings into the real everyday Sri "
        "Lankan word they sound like - foods: ඉඳි ආප්ප (heard as इबे आपहा / इदि आप्प), කිරිබත්, බත් කරි, පාන්, රොටි, "
        "කැවුම්, තේ, කෝපි, දොඩම්, කෙසෙල්; body: කකුල, බඩ, ඔළුව, රිදෙනවා. Use only what is said; never invent "
        "topics, names, places or plans.\n"
        f"Speakers are not labelled. The VISITOR ({who}) is usually the one who says 'I' (මම/මට) while calling the "
        "other 'අම්මේ' / 'තාත්තේ' / 'ආච්චි' / 'සීයා'. Those words (and 'හරි', 'පුතේ', 'දුවේ') are forms of address, "
        "NEVER a person's name - e.g. 'हरि आच्ची' is 'හරි ආච්චි' (okay, granny), not a name. Say clearly WHO did what - e.g. if the visitor got a job, write that the visitor got "
        f"it ('{name or p['relation_si']}ට අලුත් රස්සාවක් ලැබුණා'), never that the patient did. The summary talks TO "
        f"the patient ABOUT the visitor in the third person ('{(name or p['relation_si'])} ඔයාගෙන් ... ඇහුවා'), never 'මම' (I).\n"
        "Reply ONLY with JSON (the fields in this order):\n"
        '{"sinhala_text": "the conversation rewritten in Sinhala script, as best you can",\n'
        ' "clear": true/false (false ONLY if almost nothing can be understood),\n'
        ' "summary_si": "2-3 short, simple spoken-Sinhala sentences in Sinhala script that TELL what happened, in second '
        'person to the patient - not questions (e.g. \\"කමල් ඔයාට එයාගේ අලුත් රස්සාව ගැන කිව්වා. එයා ඔයාගෙන් කෑවද කියලා '
        'ඇහුවා, ඔයා ඉඳි ආප්ප කෑවා කිව්වා.\\")",\n'
        ' "summary_en": "the same in simple English",\n'
        ' "topics": [{"si": "...", "en": "..."}] (max 3 short topic phrases),\n'
        ' "promises": [{"si": "...", "en": "...", "when_si": "...", "when_en": "...", "date": "YYYY-MM-DD of that day if '
        f'one is said, else empty (today is {datetime.date.today().strftime("%A %Y-%m-%d")})"}}] (plans or promises, '
        'e.g. coming again on Sunday; empty if none),\n'
        ' "mood": "happy|calm|sad|worried",\n'
        ' "visitor_asked": [{"si": "...", "en": "..."}] (questions the VISITOR asked the patient, e.g. කෑවද? බෙහෙත් බිව්වද?),\n'
        ' "patient_said": [{"si": "...", "en": "..."}] (what the PATIENT said or answered, in short),\n'
        ' "questions": [ 2 to 4 memory questions for the patient about this talk, to ask one at a time - make one for '
        'EACH of these that exists: the main topic; the plan/promise; what the visitor ASKED the patient (e.g. '
        '\\"එයා ඔයාගෙන් ඇහුවේ මොනවද?\\"); what the PATIENT said (e.g. \\"ඔයා අද උදේ කෑවේ මොනවද?\\"). Each: {"question_si": "short Sinhala question (no answer inside)", "question_en": "...", '
        '"answer_si": "short answer", "answer_en": "...", "hint_si": "a gentle Sinhala clue that does not give the answer", '
        '"wrong_si": ["2 believable but WRONG short answers of the same kind, e.g. other Sri Lankan towns or other '
        'days"], "wrong_en": ["..."]} ]. Questions name the visitor (e.g. \\"කමල්ට රස්සාව ලැබුණේ කොහෙද?\\", '
        '\\"කමල් ආයෙත් එනවා කිව්වේ කවදද?\\") and are never yes/no questions - ask what, where or when.}\n\n'
        "Transcription:\n" + "\n".join(texts))


def _visitor_si(p):
    """How the summary names the visitor: 'මුණුබුරා ලසාන්', or 'අමුත්තා' for someone not registered."""
    if not p:
        return "අමුත්තා"
    name = p.get("name") if p.get("name") and p.get("name") != p.get("relation_si") else ""
    return f"{p['relation_si']} {name}".strip()


def _simple_summary(p, texts):
    """Fallback for short or noisy visits: one or two sentences of whatever is clear."""
    who = f"their {p['relation']}" if p else "a visitor"
    return rm._llm_json(
        f"A short, partly unclear recording of an elderly Sri Lankan person talking with {who}. It is Sinhala written "
        "phonetically in Devanagari letters (Whisper in Hindi mode), so read the sounds back as Sinhala. Some words may "
        "be wrong - skip those, and summarise ONLY what you can understand, even if it is just a greeting or one topic. "
        "Never invent anything.\n"
        f"Write the summary TO the patient ABOUT the visitor in the third person, calling them '{_visitor_si(p)}' - e.g. "
        f"'{_visitor_si(p)} ඔයාගෙන් කෑවද කියලා ඇහුවා' - never 'මම' (I).\n"
        'Reply ONLY JSON {"sinhala_text": "...", "summary_si": "1-2 short spoken-Sinhala sentences telling what was '
        'said (Sinhala script)", "summary_en": "...", "topics": [{"si": "...", "en": "..."}], "visitor_asked": '
        '[{"si": "...", "en": "..."}], "patient_said": [{"si": "...", "en": "..."}], "promises": [], "mood": "calm"}\n\n'
        "Transcription:\n" + "\n".join(texts))


def _second_pass(out, who):
    """The one-shot summary sometimes leaves out the question list or who-asked /
    who-said. A short, focused second call fills them in from the summary."""
    try:
        extra = rm._llm_json(
            f"A home visit of an elderly Sri Lankan person with dementia and {who} was summarised like this:\n"
            f"Conversation (Sinhala): {out.get('sinhala_text', '')}\nSummary: {out.get('summary_si', '')}\n"
            f"Plans: {[p.get('si') for p in out.get('promises') or []]}\n"
            "Reply ONLY JSON {\"visitor_asked\": [{\"si\":\"...\",\"en\":\"...\"}], \"patient_said\": [{\"si\":\"...\",\"en\":\"...\"}], "
            "\"questions\": [2 to 4 items {\"question_si\", \"question_en\", \"answer_si\", \"answer_en\", \"hint_si\", "
            "\"wrong_si\": [2 believable wrong answers of the same kind], \"wrong_en\": [...]}]}. Questions are short, in "
            "simple spoken Sinhala, one fact each, never yes/no (ask what, when or where), e.g. "
            "\"ඔයා අද උදේ කෑවේ මොනවද?\", \"එයා ආයෙත් එනවා කිව්වේ කවදද?\", \"එයා ඔයාගෙන් ඇහුවේ මොනවද?\". "
            "Use only facts in the conversation.")
        for k in ("visitor_asked", "patient_said"):
            if not out.get(k):
                out[k] = extra.get(k) or []
        if len(out.get("questions") or []) < 2:
            out["questions"] = extra.get("questions") or out.get("questions") or []
    except Exception as e:
        print("visit questions second pass failed:", e)
    return out


@router.post("/visit/end")
async def visit_end(patient_id: str = Form(...), visit_id: str = Form(...), seconds: int = Form(0)):
    buf = LIVE.pop(visit_id, None)
    if not buf or buf["pid"] != patient_id:
        print(f"[visit] {visit_id} end: no clips arrived")
        return {"status": "success", "result": "nothing"}
    p = _person(patient_id, buf["person_id"])  # None = a visitor who is not registered
    texts = buf["texts"]
    chars = sum(len(t) for t in texts)
    print(f"[visit] {visit_id} end: {len(texts)} clips, {chars} chars of speech")
    if chars < 15:
        return {"status": "success", "result": "too_short", "chars": chars}
    try:
        out = rm.no_hindi(_summarise(p, texts))  # every field shown to people: Sinhala letters only
    except Exception as e:
        return {"status": "error", "message": f"Summary failed: {e}"}
    finally:
        buf["texts"] = []   # the transcript is not kept once summarised
    if not out.get("summary_si"):
        # Never throw a visit away just because it was short or a little unclear:
        # a simpler prompt keeps whatever can be understood.
        print(f"[visit] {visit_id} end: first summary empty (clear={out.get('clear')}), trying the simple summary")
        try:
            out = {**out, **rm.no_hindi(_simple_summary(p, texts))}
        except Exception as e:
            print("simple summary failed:", e)
    if not out.get("summary_si"):
        print(f"[visit] {visit_id} end: nothing understandable")
        return {"status": "success", "result": "unclear"}
    if len(out.get("questions") or []) < 2 or not out.get("visitor_asked") or not out.get("patient_said"):
        who = f"their {p['relation']}" if p else "a visitor"
        out = rm.no_hindi(_second_pass(out, who))
    now = datetime.datetime.now()
    conv = {"id": f"talk-{uuid.uuid4().hex[:8]}", "person_id": p["id"] if p else "visitor", "day": now.date().isoformat(),
            "time": buf["started"], "seconds": seconds or buf["clip_seconds"],
            "summary_si": out.get("summary_si", ""), "summary_en": out.get("summary_en", ""),
            "topics": out.get("topics") or [], "promises": out.get("promises") or [],
            "mood": out.get("mood", "calm"), "visitor_asked": out.get("visitor_asked") or [],
            "patient_said": out.get("patient_said") or [], "questions": (out.get("questions") or [])[:4]}
    CONVERSATIONS.setdefault(patient_id, []).append(conv)
    CONVERSATIONS[patient_id] = CONVERSATIONS[patient_id][-300:]
    _save()
    log = rm._ctx.get("log_diary_event")
    if log:
        log(patient_id, "conversation", detail=f"{(p or {}).get('relation', 'visitor')}: {conv['summary_en']}",
            photo_url=(p or {}).get("photo_url", ""))
    return {"status": "success", "result": "saved", "summary_si": conv["summary_si"], "topics": conv["topics"]}


@router.get("/conversations/{patient_id}")
async def list_conversations(patient_id: str, limit: int = 30):
    by_id = {p["id"]: p for p in rm.PEOPLE.get(patient_id, [])}
    out = []
    for c in reversed(CONVERSATIONS.get(patient_id, [])[-limit:]):
        p = by_id.get(c["person_id"]) or {"relation": "visitor", "relation_si": "අමුත්තා"}
        out.append({**{k: v for k, v in c.items() if k != "questions"},
                    "relation": p.get("relation"), "relation_si": p.get("relation_si"),
                    "name": p.get("name"), "photo_url": p.get("photo_url")})
    return {"status": "success", "conversations": out}
