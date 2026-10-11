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
CONVERSATIONS = {}   # pid -> [{id, person_id, day, time, seconds, summary_si, summary_en, topics, promises, mood, questions}]
LIVE = {}            # visit_id -> {pid, person_id, texts: [..], started, clip_seconds} (memory only)
_lock = threading.Lock()


def _load():
    global CONVERSATIONS
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, "r", encoding="utf-8") as f:
                CONVERSATIONS = json.load(f).get("CONVERSATIONS", {})
        except Exception as e:
            print("visit_talk_db load failed:", e)


def _save():
    with _lock:
        with open(DB_FILE, "w", encoding="utf-8") as f:
            json.dump({"CONVERSATIONS": CONVERSATIONS}, f, ensure_ascii=False)


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


# ─── During a visit ──────────────────────────────────────────────────────────
@router.post("/visit/audio")
async def visit_audio(patient_id: str = Form(...), person_id: str = Form(...), visit_id: str = Form(...),
                      seconds: int = Form(0), file: UploadFile = File(...)):
    p = _person(patient_id, person_id)
    if not p or not p.get("conversation_ok"):
        # Checked on the server too - the app alone is not trusted with consent.
        return {"status": "error", "message": "No consent to summarise conversations with this person"}
    if not rm.GROQ_API_KEY:
        return {"status": "error", "message": "GROQ_API_KEY is not set on the AI server"}
    audio = await file.read()   # kept in memory only; never written to disk
    try:
        r = requests.post(f"{rm.GROQ_BASE}/audio/transcriptions",
                          headers={"Authorization": f"Bearer {rm.GROQ_API_KEY}"},
                          files={"file": (file.filename or "clip.m4a", audio)},
                          data={"model": "whisper-large-v3", "response_format": "json", "temperature": "0",
                                "language": "hi"}, timeout=45)
        r.raise_for_status()
        text = r.json().get("text", "").strip()
    except Exception as e:
        return {"status": "error", "message": f"Transcription failed: {e}"}
    finally:
        del audio
    buf = LIVE.setdefault(visit_id, {"pid": patient_id, "person_id": person_id, "texts": [],
                                     "started": datetime.datetime.now().isoformat(), "clip_seconds": 0})
    if text:
        buf["texts"].append(text)
    buf["clip_seconds"] += max(0, seconds)
    return {"status": "success", "clips": len(buf["texts"])}


def _summarise(p, texts):
    name = p.get("name") if p.get("name") and p.get("name") != p.get("relation_si") else ""
    who = f"their {p['relation']}" + (f" {name}" if name else "")
    return rm._llm_json(
        "Below is a transcription of a home visit: an elderly Sri Lankan person with dementia talking with "
        f"{who}. The language is SINHALA, but it is written PHONETICALLY in Devanagari script (Whisper was set to "
        "Hindi), e.g. 'मता अलू प्रसावक लबुना' is the Sinhala 'මට අලුත් රස්සාවක් ලැබුණා' (I got a new job), "
        "'कोलम' is 'කොළඹ' (Colombo), 'अम्मी' is 'අම්මේ'. Common words: 'हिरिदा/इरिदा' = ඉරිදා (Sunday), "
        "'सन्दुदा' = සඳුදා, 'सेनसुरादा' = සෙනසුරාදා, 'लबन' = ලබන (next), 'आये/आयेत' = ආයෙත් (again), "
        "'एनवा/इनवा/तिनमा' ≈ එනවා (will come), 'गेनेन्नम/दिनिनना' ≈ ගෙනෙන්නම් / දෙන්නම් (will bring/give), "
        "'बिहित/बेहेत' = බෙහෙත් (medicine), 'बुन्ना/बोन्न' = බොන්න (drink/take). Speech recognition is imperfect: "
        "read the sounds back as Sinhala first, then summarise. Use only what is said; never invent topics, names, "
        "places or plans.\n"
        f"Speakers are not labelled. The VISITOR ({who}) is usually the one who says 'I' (මම/මට) while calling the "
        "other 'අම්මේ' / 'තාත්තේ'. Say clearly WHO did what - e.g. if the visitor got a job, write that the visitor got "
        f"it ('{name or p['relation_si']}ට අලුත් රස්සාවක් ලැබුණා'), never that the patient did.\n"
        "Reply ONLY with JSON (the fields in this order):\n"
        '{"sinhala_text": "the conversation rewritten in Sinhala script, as best you can",\n'
        ' "clear": true/false (false ONLY if almost nothing can be understood),\n'
        ' "summary_si": "1-2 short, simple spoken-Sinhala sentences in Sinhala script, in second person to the patient '
        '(e.g. \\"කමල් ඔයාට එයාගේ අලුත් රස්සාව ගැන කිව්වා\\")",\n'
        ' "summary_en": "the same in simple English",\n'
        ' "topics": [{"si": "...", "en": "..."}] (max 3 short topic phrases),\n'
        ' "promises": [{"si": "...", "en": "...", "when_si": "...", "when_en": "..."}] (plans or promises, e.g. coming '
        'again on Sunday; empty if none),\n'
        ' "mood": "happy|calm|sad|worried",\n'
        ' "questions": [ up to 2 memory questions for the patient about this talk - one about the main topic, one about a '
        'plan/promise if any. Each: {"question_si": "short Sinhala question (no answer inside)", "question_en": "...", '
        '"answer_si": "short answer", "answer_en": "...", "hint_si": "a gentle Sinhala clue that does not give the answer", '
        '"wrong_si": ["2 believable but WRONG short answers of the same kind, e.g. other Sri Lankan towns or other '
        'days"], "wrong_en": ["..."]} ]. Questions name the visitor (e.g. \\"කමල්ට රස්සාව ලැබුණේ කොහෙද?\\", '
        '\\"කමල් ආයෙත් එනවා කිව්වේ කවදද?\\") and are never yes/no questions - ask what, where or when.}\n\n'
        "Transcription:\n" + "\n".join(texts))


@router.post("/visit/end")
async def visit_end(patient_id: str = Form(...), visit_id: str = Form(...), seconds: int = Form(0)):
    buf = LIVE.pop(visit_id, None)
    if not buf or buf["pid"] != patient_id:
        return {"status": "success", "result": "nothing"}
    p = _person(patient_id, buf["person_id"])
    texts = buf["texts"]
    if not p or sum(len(t) for t in texts) < 25:
        return {"status": "success", "result": "too_short"}
    try:
        out = rm.no_hindi(_summarise(p, texts))  # every field shown to people: Sinhala letters only
    except Exception as e:
        return {"status": "error", "message": f"Summary failed: {e}"}
    finally:
        buf["texts"] = []   # the transcript is not kept once summarised
    if not out.get("clear") or not out.get("summary_si"):
        return {"status": "success", "result": "unclear"}
    now = datetime.datetime.now()
    conv = {"id": f"talk-{uuid.uuid4().hex[:8]}", "person_id": p["id"], "day": now.date().isoformat(),
            "time": buf["started"], "seconds": seconds or buf["clip_seconds"],
            "summary_si": out.get("summary_si", ""), "summary_en": out.get("summary_en", ""),
            "topics": out.get("topics") or [], "promises": out.get("promises") or [],
            "mood": out.get("mood", "calm"), "questions": (out.get("questions") or [])[:2]}
    CONVERSATIONS.setdefault(patient_id, []).append(conv)
    CONVERSATIONS[patient_id] = CONVERSATIONS[patient_id][-300:]
    _save()
    log = rm._ctx.get("log_diary_event")
    if log:
        log(patient_id, "conversation", detail=f"{p['relation']}: {conv['summary_en']}", photo_url=p.get("photo_url", ""))
    return {"status": "success", "result": "saved", "summary_si": conv["summary_si"], "topics": conv["topics"]}


@router.get("/conversations/{patient_id}")
async def list_conversations(patient_id: str, limit: int = 30):
    by_id = {p["id"]: p for p in rm.PEOPLE.get(patient_id, [])}
    out = []
    for c in reversed(CONVERSATIONS.get(patient_id, [])[-limit:]):
        p = by_id.get(c["person_id"], {})
        out.append({**{k: v for k, v in c.items() if k != "questions"},
                    "relation": p.get("relation"), "relation_si": p.get("relation_si"),
                    "name": p.get("name"), "photo_url": p.get("photo_url")})
    return {"status": "success", "conversations": out}
