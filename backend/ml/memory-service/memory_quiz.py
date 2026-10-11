# -*- coding: utf-8 -*-
"""
Daily memory quiz ("memory game") and the memory report built from it.

The quiz is a short spoken conversation about the patient's OWN day: the people
they met, where their things were, what time things happened. Questions are
built from what remember_moments already captured (moments, people, time spent
together), so nobody has to prepare anything.

Every question is asked with cues of increasing strength, and the score records
how much help was needed - not just right or wrong:

    free recall (no help)       3 points
    after a spoken hint         2 points
    picked from three choices   1 point
    not remembered              0 points

The daily score (0-100) and its trend, together with passive signals (how often
the patient asked "where is my ...?", repeated questions, visits), form the
memory report on the caregiver web portal. MMSE results from the cognitive
assessment component are read (never written) from the Node API so the daily
score can be compared with the clinical test.

The quiz adapts: recent scores choose how many questions are asked and whether
older (delayed recall) events are included, and the weakest memory areas are
asked about first.
"""
import os
import re
import json
import uuid
import random
import datetime
import threading

import requests
from fastapi import APIRouter, UploadFile, File, Form

import remember_moments as rm
import visit_talk

router = APIRouter()

DB_FILE = "memory_quiz_db.json"
NODE_API = os.environ.get("NODE_API_URL", "http://127.0.0.1:5000")

SESSIONS = {}   # pid -> [session]
PROFILE = {}    # pid -> {name, user_id, updated}
OBJECT_INFO = {}  # label -> what an object is for (learned once by the LLM for objects not in OBJECT_USE)
PREPARED = {}   # pid -> {day, questions, level, avg} - tonight's game, generated at STORY_HOUR
_lock = threading.Lock()

POINTS = {"free": 3, "hint": 2, "choice": 1}
STAGES = ["free", "hint", "choice"]

DOMAINS = {
    "people": "People",
    "places": "Places of things",
    "objects": "Objects",
    "time": "Time of events",
    "orientation": "Day orientation",
    "delayed": "Delayed recall",
    "conversation": "Conversations",
}


def _load():
    global SESSIONS, PROFILE, OBJECT_INFO, PREPARED
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            SESSIONS = data.get("SESSIONS", {})
            PROFILE = data.get("PROFILE", {})
            OBJECT_INFO = data.get("OBJECT_INFO", {})
            PREPARED = data.get("PREPARED", {})
        except Exception as e:
            print("memory_quiz_db load failed:", e)


def _save():
    with _lock:
        with open(DB_FILE, "w", encoding="utf-8") as f:
            json.dump({"SESSIONS": SESSIONS, "PROFILE": PROFILE, "OBJECT_INFO": OBJECT_INFO, "PREPARED": PREPARED},
                      f, ensure_ascii=False)


_load()

# ─── Words ───────────────────────────────────────────────────────────────────
DAYS_SI = ["සඳුදා", "අඟහරුවාදා", "බදාදා", "බ්‍රහස්පතින්දා", "සිකුරාදා", "සෙනසුරාදා", "ඉරිදා"]
DAYS_EN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
PERIODS = [("උදේ", "morning"), ("දවල්", "midday"), ("හවස", "afternoon"), ("රෑ", "night")]
COUNT_SI = {1: "එක්කෙනයි", 2: "දෙන්නයි", 3: "තුන්දෙනයි", 4: "හතර දෙනයි"}

# A gentle hint per object: what we use it for (doesn't give the word away).
USES_SI = {
    "cup": "අපි මේකෙන් තේ බොනවා", "bottle": "මේකේ වතුර දාගන්නවා",
    "glasses": "මේක දාගත්තම හොඳට පේනවා", "cell phone": "මේකෙන් කෝල් ගන්නවා",
    "book": "අපි මේක කියවනවා", "remote": "ටීවී චැනල් මාරු කරන්න පාවිච්චි කරනවා",
    "pill bottle": "මේකේ ඔයාගේ බෙහෙත් තියෙනවා", "wallet": "සල්ලි තියාගන්නේ මේකේ",
    "watch": "වෙලාව බලන්න අතේ දාගන්නවා", "drinking glass": "වතුර බොන්න පාවිච්චි කරනවා",
    "toothbrush": "උදේට දත් මදින්න ගන්නවා", "umbrella": "වැස්සට එළියට යනකොට ගන්නවා",
    "bowl": "කෑම බෙදාගන්න පාවිච්චි කරනවා", "handbag": "බඩු දාගෙන යන්න ගන්නවා",
    "laptop": "ලියන්න, වීඩියෝ බලන්න පාවිච්චි කරනවා", "spoon": "කෑම කන්න පාවිච්චි කරනවා",
    "scissors": "කපන්න පාවිච්චි කරනවා", "vase": "මල් දාලා තියන්නේ මේකේ",
}
EMOJI = {
    "cup": "☕", "bottle": "🍶", "glasses": "👓", "cell phone": "📱", "book": "📖", "remote": "📺",
    "pill bottle": "💊", "wallet": "👛", "watch": "⌚", "drinking glass": "🥛", "toothbrush": "🪥",
    "umbrella": "☂️", "bowl": "🥣", "handbag": "👜", "laptop": "💻", "spoon": "🥄", "scissors": "✂️",
    "vase": "🏺", "keys": "🔑", "banana": "🍌", "apple": "🍎", "orange": "🍊",
}
RELATION_GROUP_HINT = {
    "son": "එයා ඔයාගේ දරුවෙක්", "daughter": "එයා ඔයාගේ දරුවෙක්",
    "grandson": "එයා ඔයාගේ මුණුපුරෙක්", "granddaughter": "එයා ඔයාගේ මුණුපුරෙක්",
    "wife": "එයා ඔයාගේ ජීවිත සහකරු", "husband": "එයා ඔයාගේ ජීවිත සහකරු",
    "elder brother": "එයා ඔයාගේ සහෝදරයෙක්", "younger brother": "එයා ඔයාගේ සහෝදරයෙක්",
    "elder sister": "එයා ඔයාගේ සහෝදරියක්", "younger sister": "එයා ඔයාගේ සහෝදරියක්",
    "mother": "එයා ඔයාගේ දෙමව්පියන්ගෙන් කෙනෙක්", "father": "එයා ඔයාගේ දෙමව්පියන්ගෙන් කෙනෙක්",
    "friend": "එයා ඔයාගේ හොඳ යාළුවෙක්", "nurse": "එයා ඔයාව බලාගන්න කෙනෙක්",
    "doctor": "එයා ඔයාව බලාගන්න කෙනෙක්",
}
PRAISE = ["නියමයි! හරියටම හරි.", "ෂා! ඔයාගේ මතකය හරිම හොඳයි.", "හරි! මට හරිම සතුටුයි.",
          "අපූරුයි! ඒක හරි.", "හරි උත්තරේ! ඔයා දක්ෂයි."]
PRAISE_HELPED = ["හරි! ඉඟියෙන් පස්සේ ඔයාට මතක් වුණා.", "හොඳයි! දැන් ඔයාට මතකයි."]
COMFORT = ["කමක් නැහැ.", "ප්‍රශ්නයක් නැහැ, අපි එකට මතක් කරමු.", "කමක් නැහැ, ඒක අමාරු ප්‍රශ්නයක්."]


def _period(iso):
    h = datetime.datetime.fromisoformat(iso).hour
    return 0 if h < 12 else 1 if h < 15 else 2 if h < 19 else 3


def _day_word(day_iso):
    d = datetime.date.fromisoformat(day_iso)
    diff = (datetime.date.today() - d).days
    if diff == 0:
        return "අද", "today"
    if diff == 1:
        return "ඊයේ", "yesterday"
    return f"දවස් {diff}කට කලින්", f"{diff} days ago"


def _relation_words(rel_en):
    words = [rel_en] + [w for w, (en, _si) in rm.RELATIONS.items() if en == rel_en]
    words += [w for w, en in rm.DEVANAGARI_RELATIONS.items() if en == rel_en]
    return words


def _person_label(p):
    """'ඔයාගේ පුතා කමල්' / 'your son Kamal' - name only when it adds something."""
    name = p.get("name") or ""
    has_name = name and name != p.get("relation_si")
    si = f"ඔයාගේ {p['relation_si']}" + (f" {name}" if has_name else "")
    en = f"your {p['relation']}" + (f" {name}" if has_name else "")
    return si, en, (name if has_name else "")


def _choices(correct, pool, k=3):
    """correct / pool items are dicts {si, en, image?, icon?}. Returns (choices, index).
    Options that overlap the answer ("ඔයාගේ පුතා" vs "ඔයාගේ පුතා කමල්") are dropped -
    both would be right."""
    others, seen = [], set()
    for c in pool:
        if c["si"] in seen or c["si"] in correct["si"] or correct["si"] in c["si"]:
            continue
        seen.add(c["si"])
        others.append(c)
    random.shuffle(others)
    picked = others[: k - 1] + [correct]
    random.shuffle(picked)
    return picked, picked.index(correct)


ROOM_ICON = {"Kitchen": "🍳", "Bedroom": "🛏️", "Bathroom": "🛁", "Living room": "🛋️",
             "Dining room": "🍽️", "Hallway": "🚪"}
PERIOD_ICON = ["🌅", "☀️", "🌇", "🌙"]


def _rooms():
    return [{"si": v, "en": k, "icon": ROOM_ICON.get(k, "🏠")} for k, v in rm.ROOM_SI.items() if k != "Outside"]


def _periods():
    return [{"si": si, "en": en, "icon": PERIOD_ICON[i]} for i, (si, en) in enumerate(PERIODS)]


def _crop(url, box, pad=0.15):
    """Cloudinary crops the object out of the saved frame on the fly (relative
    coordinates), so object choices are real photos of the patient's own things."""
    if not url or not box or "/upload/" not in url:
        return url
    x1, y1, x2, y2 = box
    w, h = x2 - x1, y2 - y1
    side = max(w, h) * (1 + 2 * pad)
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    x = min(max(cx - side / 2, 0), 0.98)
    y = min(max(cy - side / 2, 0), 0.98)
    cw, ch = min(side, 0.99 - x), min(side, 0.99 - y)
    return url.replace("/upload/", f"/upload/c_crop,w_{cw:.3f},h_{ch:.3f},x_{x:.3f},y_{y:.3f}/c_fill,w_360,h_360/", 1)


def _object_photos(pid):
    """label -> crop of its most recent sighting (any day)."""
    out = {}
    for m in rm.MOMENTS.get(pid, []):
        for o in m["objects"]:
            if o["label"] not in rm.FIXED_ANCHORS:
                out[o["label"]] = _crop(o.get("photo_url") or m["photo_urls"][0], o.get("box"))
    return out


def _object_choice(label, photos):
    c = {"si": rm.si_name(label), "en": label}
    if photos.get(label):
        c["image"] = photos[label]
    else:
        c["icon"] = EMOJI.get(label, "📦")
    return c


def _object_pool(pid, photos, exclude):
    labels = [l for l in photos if l != exclude]
    labels += [l for l in ["cup", "book", "remote", "cell phone", "bottle", "glasses", "wallet", "pill bottle"]
               if l != exclude and l not in labels]
    return [_object_choice(l, photos) for l in labels]


def _q(qtype, domain, prompt_si, prompt_en, answer, accept, hint_si, hint_en, choices, correct_idx,
       reveal_si, media=None, day=None):
    return {
        "id": f"q-{uuid.uuid4().hex[:6]}", "type": qtype, "domain": domain,
        "prompt_si": prompt_si, "prompt_en": prompt_en,
        "answer_si": answer["si"], "answer_en": answer["en"], "accept": [a for a in accept if a],
        "hint_si": hint_si, "hint_en": hint_en,
        "choices": choices, "correct_choice": correct_idx,
        "reveal_si": reveal_si, "media": media or {"kind": "none"}, "day": day,
    }


# ─── Question builders: every question is about something that really happened ──
def _people_met(pid, day):
    inter = rm.INTERACTIONS.get(pid, {}).get(day, {})
    by_id = {p["id"]: p for p in rm.PEOPLE.get(pid, [])}
    met = []
    for rec in inter.values():
        p = by_id.get(rec["ref"]) if rec["kind"] == "person" else None
        if p and p.get("relation_si") and p.get("status", "verified") != "rejected":
            met.append((p, rec))
    return met


def _person_choice(p, with_photo=True):
    si, en, _ = _person_label(p)
    c = {"si": si, "en": en}
    if with_photo and p.get("photo_url"):
        c["image"] = p["photo_url"]
    return c


def _person_choices(pid, p, photos=True):
    """Photo grid of the real visitor among the patient's other registered people.
    With fewer than 2 photographed people a grid would give the answer away,
    so it falls back to spoken-word choices."""
    others = [o for o in rm.PEOPLE.get(pid, []) if o["id"] != p["id"] and o.get("relation_si")
              and o.get("photo_url") and o.get("status", "verified") != "rejected"]
    if photos and p.get("photo_url") and others:
        return _choices(_person_choice(p), [_person_choice(o) for o in others], k=min(4, len(others) + 1))
    pool = [_person_choice(o, False) for o in rm.PEOPLE.get(pid, []) if o["id"] != p["id"] and o.get("relation_si")]
    for en, si in [("son", "පුතා"), ("daughter", "දුව"), ("friend", "යාළුවා"), ("nurse", "හෙදිය"),
                   ("grandson", "මුණුබුරා"), ("elder sister", "අක්කා")]:
        pool.append({"si": f"ඔයාගේ {si}", "en": f"your {en}"})
    return _choices(_person_choice(p, False), pool)


def _person_hint(p):
    name = _person_label(p)[2]
    hint = RELATION_GROUP_HINT.get(p["relation"], "එයා ඔයාගේ පවුලේ කෙනෙක්")
    if name:
        hint += f". එයාගේ නම '{name[0]}' අකුරෙන් පටන් ගන්නේ"
    return hint + "."


def _accept_person(p):
    return [_person_label(p)[2], p["relation_si"]] + _relation_words(p["relation"])


def q_who_came(pid, p, rec, day):
    dsi, den = _day_word(day)
    when = f" {PERIODS[_period(rec['first'])][0]}" if rec.get("first") else ""
    label_si, label_en, _ = _person_label(p)
    choices, idx = _person_choices(pid, p)
    mins = rm._minutes(rec["seconds"]) if rec.get("seconds") else 0
    return _q("who_came", "people" if dsi == "අද" else "delayed",
              f"{dsi}{when} කවුරුහරි ඔයාව බලන්න ආවා" + (f", විනාඩි {mins}ක් විතර ඔයා එක්ක හිටියා" if mins > 1 else "")
              + ". ඒ කවුද කියලා මතකද?",
              f"Someone came to see you {den}. Do you remember who?",
              {"si": label_si, "en": label_en}, _accept_person(p), _person_hint(p), "Hint: their family role.",
              choices, idx, f"{dsi} ආවේ {label_si}.", {"kind": "visit"}, day)


def q_person_photo(pid, p, rec, day):
    dsi, den = _day_word(day)
    label_si, label_en, _ = _person_label(p)
    choices, idx = _person_choices(pid, p, photos=False)
    return _q("person_photo", "people" if dsi == "අද" else "delayed",
              f"මේ {dsi} ඔයා එක්ක හිටපු කෙනෙක්. මේ කවුද?", f"This person was with you {den}. Who is this?",
              {"si": label_si, "en": label_en}, _accept_person(p), _person_hint(p), "Hint: their family role.",
              choices, idx, f"මේ {label_si}.", {"kind": "photo", "urls": [p["photo_url"]]}, day)


def q_visit_time(pid, p, rec, day):
    label_si, label_en, _ = _person_label(p)
    correct = _periods()[_period(rec["first"])]
    choices, idx = _choices(correct, _periods(), k=4)
    return _q("visit_time", "time", f"අද {label_si} ඔයාව බලන්න ආවේ උදේද, දවල්ද, හවසද, රෑද?",
              f"Did {label_en} come in the morning, midday, afternoon or night?",
              correct, [correct["si"], correct["en"]], "දවසේ මුල් කාලෙද අග කාලෙද කියලා හිතලා බලන්න.",
              "Hint: early or late in the day.", choices, idx, f"{label_si} ආවේ {correct['si']}.",
              {"kind": "photo", "urls": [p["photo_url"]]} if p.get("photo_url") else None, day)


def q_visit_count(pid, met, day):
    n = min(len(met), 4)
    correct = {"si": COUNT_SI[n], "en": str(n), "icon": "👥"}
    choices, idx = _choices(correct, [{"si": COUNT_SI[i], "en": str(i), "icon": "👥"} for i in range(1, 5)])
    return _q("visit_count", "people", "අද ඔයාව බලන්න කී දෙනෙක් ආවද?", "How many people came to see you today?",
              correct, [str(n), COUNT_SI[n]], "ඔයා අද කාත් කාත් එක්ක හිටියද කියලා හිතලා බලන්න.",
              "Think of who you were with today.", choices, idx, f"අද {COUNT_SI[n]} ආවේ.", {"kind": "visit"}, day)


def q_which_object(pid, m, obj, day, photos):
    dsi, den = _day_word(day)
    when = PERIODS[_period(m["time"])][0]
    where = f" {m['room_si']}ේ" if m.get("room_si") else ""
    # All options must look alike: one real photo among emoji would give the answer away.
    others = [l for l in photos if l != obj["label"]]
    if len(others) >= 2:
        correct = {"si": obj["label_si"], "en": obj["label"],
                   "image": _crop(obj.get("photo_url") or m["photo_urls"][0], obj.get("box"))}
        pool = [{"si": rm.si_name(l), "en": l, "image": photos[l]} for l in others]
    else:
        correct = {"si": obj["label_si"], "en": obj["label"], "icon": EMOJI.get(obj["label"], "📦")}
        pool = [{"si": rm.si_name(l), "en": l, "icon": EMOJI.get(l, "📦")}
                for l in ["cup", "book", "remote", "cell phone", "bottle", "glasses", "wallet", "pill bottle"] if l != obj["label"]]
    choices, idx = _choices(correct, pool, k=4)
    return _q("which_object", "objects" if dsi == "අද" else "delayed",
              random.choice([f"{dsi} {when}{where} ඔයා ටික වෙලාවක් එක දෙයක් පාවිච්චි කළා. ඒ මොකක්ද?",
                             f"{dsi} {when}{where} ඔයා ළඟ ටික වෙලාවක් තිබ්බ දේ මතකද?",
                             f"මතක් කරලා බලන්න: {dsi} {when}{where} ඔයා අතට ගත්තේ මොකක්ද?"]),
              f"{den.capitalize()} in the {PERIODS[_period(m['time'])][1]} you spent time with one thing. What was it?",
              correct, [obj["label_si"], obj["label"]] + [w for w, l in rm.SPOKEN_TO_LABEL.items() if l == obj["label"]],
              USES_SI.get(obj["label"], "ඔයා ඒක ළඟ ටික වෙලාවක් හිටියා") + ".", "Hint: what it is used for.",
              choices, idx, f"ඒ ඔයාගේ {obj['label_si']}.",
              {"kind": "scene", "icon": ROOM_ICON.get(m.get("room") or "", "🏠"), "label_si": m.get("room_si") or ""}, day)


def q_object_place(pid, m, obj, day):
    dsi, den = _day_word(day)
    correct = {"si": m["room_si"], "en": m["room"], "icon": ROOM_ICON.get(m["room"], "🏠")}
    choices, idx = _choices(correct, _rooms(), k=4)
    when = rm.si_time(m["time"]).replace("අද ", "").replace("ඊයේ ", "")
    hint = f"ඒක {rm.si_name(m['anchors'][0])} ළඟ තිබ්බේ." if m.get("anchors") else "ඔයා ඒක ළඟ ටික වෙලාවක් හිටියා."
    return _q("object_place", "places" if dsi == "අද" else "delayed",
              f"මේ ඔයාගේ {obj['label_si']}. {dsi} {when} මේක තිබ්බේ ගෙදර කොයි කාමරේද?",
              f"This is your {obj['label']}. Which room was it in {den}?",
              correct, [m["room_si"], m["room"], m["room"].lower()], hint, "Hint: what it was near.",
              choices, idx, f"ඔයාගේ {obj['label_si']} තිබ්බේ {m['room_si']}ේ.",
              {"kind": "photo", "urls": [_crop(obj.get("photo_url") or m["photo_urls"][0], obj.get("box"))]}, day)


def q_reveal(pid, m, obj, day):
    """Fun: the photo starts zoomed into the object and slowly zooms out."""
    lbl = obj["label"]
    correct = {"si": obj["label_si"], "en": lbl, "icon": EMOJI.get(lbl, "📦")}
    pool = [{"si": rm.si_name(l), "en": l, "icon": EMOJI.get(l, "📦")}
            for l in ["book", "remote", "cell phone", "bottle", "cup", "glasses", "wallet", "pill bottle"] if l != lbl]
    choices, idx = _choices(correct, pool, k=4)
    return _q("reveal", "objects", "පොඩි සෙල්ලමක්! මේ පින්තූරේ හැංගිලා ඉන්නේ ඔයා අද පාවිච්චි කරපු දෙයක්. ඒ මොකක්ද?",
              "A little game: something you used today is hiding in this picture. What is it?",
              correct, [obj["label_si"], lbl] + [w for w, l in rm.SPOKEN_TO_LABEL.items() if l == lbl],
              USES_SI.get(lbl, "ඔයා අද ඒක එක්ක ටික වෙලාවක් හිටියා") + ".", "Hint: what it is used for.",
              choices, idx, f"ඒ ඔයාගේ {obj['label_si']}!",
              {"kind": "reveal", "urls": [obj.get("photo_url") or m["photo_urls"][0]], "box": obj.get("box")}, day)


def q_replay(pid, m, day):
    """'Video' question: the moment's saved frames are replayed as a short clip."""
    dsi, den = _day_word(day)
    objs = [o for o in m["objects"] if o["label"] not in rm.FIXED_ANCHORS] or m["objects"]
    main = objs[0]
    correct = {"si": m["room_si"], "en": m["room"], "icon": ROOM_ICON.get(m["room"], "🏠")}
    choices, idx = _choices(correct, _rooms(), k=4)
    return _q("replay", "places" if dsi == "අද" else "delayed",
              random.choice([f"මේ {dsi} ඔයාගේ දවසේ පොඩි වීඩියෝ එකක්. මේ වුණේ ගෙදර කොයි කාමරේද?",
                             f"හොඳට බලන්න! මේ {dsi} ගත්ත වීඩියෝ එකක්. ඔයා මේ වෙලාවේ හිටියේ කොයි කාමරේද?"]),
              f"A short clip from your day ({den}). Which room was this in?",
              correct, [m["room_si"], m["room"], m["room"].lower()],
              f"එතන ඔයාගේ {main['label_si']} තිබ්බා.", "Hint: an object in the clip.", choices, idx,
              f"ඒ {m['room_si']}.", {"kind": "slideshow", "urls": m["photo_urls"][:3]}, day)


def q_time_of_day(pid, m, obj, day):
    correct = _periods()[_period(m["time"])]
    choices, idx = _choices(correct, _periods(), k=4)
    return _q("time_of_day", "time", f"ඔයා අද මේ {obj['label_si']} පාවිච්චි කළේ උදේද, දවල්ද, හවසද, රෑද?",
              f"When did you use this {obj['label']} today?", correct, [correct["si"], correct["en"]],
              f"ඒ වෙලාවේ ඔයා හිටියේ {m['room_si']}ේ." if m.get("room_si") else "දවසේ මුල් කාලෙද අග කාලෙද කියලා හිතන්න.",
              "Hint: where you were then.", choices, idx, f"ඒ {correct['si']}.",
              {"kind": "photo", "urls": [_crop(obj.get("photo_url") or m["photo_urls"][0], obj.get("box"))]}, day)


def q_talk(pid, conv, item, day):
    """About what a visitor talked about (summary made with consent, visit_talk.py)."""
    p = next((x for x in rm.PEOPLE.get(pid, []) if x["id"] == conv["person_id"]), None)
    if not item.get("question_si") or not item.get("answer_si"):
        return None
    dsi, den = _day_word(day)
    if p:
        label_si, label_en, _ = _person_label(p)
    else:  # a visitor who is not registered (caregiver allowed all visitors)
        p, label_si, label_en = {}, "ඔයාව බලන්න ආපු අමුත්තා", "your visitor"
    # Plain sentence choices (shown as a list) - the same icon on every tile helped nobody.
    correct = {"si": item["answer_si"].rstrip("."), "en": item.get("answer_en", "")}
    wrong_si, wrong_en = item.get("wrong_si") or [], item.get("wrong_en") or []
    pool = [{"si": w.rstrip("."), "en": wrong_en[i] if i < len(wrong_en) else ""} for i, w in enumerate(wrong_si) if w]
    if not pool:
        return None
    choices, idx = _choices(correct, pool, k=3)
    accept = [item["answer_si"], item.get("answer_en", "")] + [t.get("si", "") for t in conv.get("topics", [])[:1]]
    q = _q("talk", "conversation" if dsi == "අද" else "delayed",
           item["question_si"], item.get("question_en", ""),
           correct, accept, item.get("hint_si") or "කතා කරපු වෙලාව මතක් කරලා බලන්න.", "Hint about the talk.",
           choices, idx, f"ඒ {item['answer_si']}.",
           {"kind": "photo", "urls": [p["photo_url"]]} if p.get("photo_url") else {"kind": "visit"}, day)
    # Asked one after another; the first one of a talk introduces it (see _add_leads).
    q["talk_id"], q["talk_intro_si"] = conv["id"], f"{dsi} {label_si} ඔයා එක්ක කතා කළා. ඒ කතාව ගැන අහන්නම්."
    return q


def q_which_first(pid, a, b, day):
    """Order of two real events from the day (a happened before b)."""
    first = {**a["choice"]}
    pool = [{**b["choice"]}]
    choices, idx = _choices(first, pool, k=2)
    return _q("which_first", "time", f"අද මුලින්ම වුණේ මොකක්ද? {a['say']}ද, නැත්නම් {b['say']}ද?",
              f"What happened first today: {a['en']} or {b['en']}?",
              first, [a["key_si"], a["key_en"]] + a.get("accept", []),
              f"{a['say']} {PERIODS[_period(a['time'])][0]}.", "Hint: the time of the first event.",
              choices, idx, f"මුලින්ම වුණේ {a['say']}. ඊට පස්සේ {b['say']}.", {"kind": "sequence"}, day)


def _events_today(pid, day, photos):
    """Visits and object moments of the day, for the 'what came first' question."""
    ev = []
    for p, rec in _people_met(pid, day):
        if rec.get("first"):
            si, en, _ = _person_label(p)
            ev.append({"time": rec["first"], "say": f"{si} ආපු එක", "en": f"{en} came", "key_si": p["relation_si"],
                       "key_en": p["relation"], "accept": _accept_person(p), "target": f"person:{p['id']}",
                       "choice": {"si": f"{si} ආවා", "en": f"{en} came", **({"image": p["photo_url"]} if p.get("photo_url") else {"icon": "🚪"})}})
    seen = set()
    for m in rm.MOMENTS.get(pid, []):
        if not m["time"].startswith(day):
            continue
        for o in m["objects"]:
            if o["label"] in rm.FIXED_ANCHORS or o["label"] in seen:
                continue
            seen.add(o["label"])
            ev.append({"time": m["time"], "say": f"{o['label_si']} පාවිච්චි කරපු එක", "en": f"you used the {o['label']}",
                       "key_si": o["label_si"], "key_en": o["label"], "target": f"object:{o['label']}",
                       "choice": {"si": f"{o['label_si']} පාවිච්චි කළා", "en": f"used the {o['label']}",
                                  "image": _crop(o.get("photo_url") or m["photo_urls"][0], o.get("box"))}})
    ev.sort(key=lambda e: e["time"])
    return ev


# ─── Practical questions: what each thing is FOR ────────────────────────────
# "You spent a while near something" is not useful to a patient. What matters
# in daily life is: did I take my medicine / drink tea / brush my teeth, and
# where are the things I need right now. Each object therefore carries what it
# is used for. Common objects are listed here; anything new the camera saves is
# looked up once by the LLM (learn_object) and remembered.
#   use_si      what it is for                  ("තේ, කෝපි බොන්න")
#   did_si      the daily activity it proves     ("තේ බිව්වේ")  -> "when did you ...?"
#   need        True = a thing people misplace   -> "where is your ... now?"
OBJECT_USE = {
    "cup":            {"use_si": "තේ, කෝපි බොන්න", "use_en": "drinking tea or coffee", "did_si": "තේ බිව්වේ", "did_en": "have your tea"},
    "pill bottle":    {"use_si": "බෙහෙත් බොන්න", "use_en": "taking medicine", "did_si": "බෙහෙත් බිව්වේ", "did_en": "take your medicine", "need": True},
    "toothbrush":     {"use_si": "දත් මදින්න", "use_en": "brushing teeth", "did_si": "දත් මැද්දේ", "did_en": "brush your teeth"},
    "bottle":         {"use_si": "වතුර බොන්න", "use_en": "drinking water", "did_si": "වතුර බිව්වේ", "did_en": "drink water"},
    "drinking glass": {"use_si": "වතුර බොන්න", "use_en": "drinking water", "did_si": "වතුර බිව්වේ", "did_en": "drink water"},
    "bowl":           {"use_si": "කෑම කන්න", "use_en": "eating", "did_si": "කෑම කෑවේ", "did_en": "eat"},
    "spoon":          {"use_si": "කෑම කන්න", "use_en": "eating", "did_si": "කෑම කෑවේ", "did_en": "eat"},
    "book":           {"use_si": "කියවන්න", "use_en": "reading", "did_si": "පොත කියෙව්වේ", "did_en": "read"},
    "remote":         {"use_si": "ටීවී බලන්න", "use_en": "watching TV", "did_si": "ටීවී බැලුවේ", "did_en": "watch TV", "need": True},
    "glasses":        {"use_si": "හොඳට බලන්න, කියවන්න", "use_en": "seeing clearly", "need": True},
    "cell phone":     {"use_si": "කෝල් ගන්න", "use_en": "calling family", "need": True},
    "wallet":         {"use_si": "සල්ලි තියාගන්න", "use_en": "keeping money", "need": True},
    "keys":           {"use_si": "දොර අරින්න", "use_en": "opening the door", "need": True},
    "watch":          {"use_si": "වෙලාව බලන්න", "use_en": "telling the time", "need": True},
    "hearing aid":    {"use_si": "හොඳට අහන්න", "use_en": "hearing", "need": True},
    "umbrella":       {"use_si": "වැස්සට යන්න", "use_en": "going out in rain", "need": True},
    "handbag":        {"use_si": "බඩු දාගෙන යන්න", "use_en": "carrying things", "need": True},
    "laptop":         {"use_si": "වැඩ කරන්න, වීඩියෝ බලන්න", "use_en": "work and videos"},
    "scissors":       {"use_si": "කපන්න", "use_en": "cutting", "need": True},
}


def object_use(label):
    return OBJECT_USE.get(label) or OBJECT_INFO.get(label)


def learn_object(label):
    """First time a new kind of object is saved: ask the LLM what it is for, once."""
    if label in OBJECT_USE or label in OBJECT_INFO or label in rm.FIXED_ANCHORS or not rm.GROQ_API_KEY:
        return
    try:
        out = rm.no_hindi(rm._llm_json(
            f"An elderly Sri Lankan person with dementia has a '{label}' ({rm.si_name(label)}) at home. "
            "In very simple spoken Sinhala, what is it used for, and which daily activity does using it show? "
            'Reply ONLY JSON {"use_si": "short purpose, e.g. තේ බොන්න", "use_en": "...", '
            '"did_si": "past-tense activity for the question \'ඔයා අද ___ කීයටද?\', e.g. තේ බිව්වේ, or empty if none", '
            '"did_en": "...", "need": true/false (true if people often misplace it and need to find it)}'))
        if out.get("use_si"):
            OBJECT_INFO[label] = {k: out[k] for k in ("use_si", "use_en", "did_si", "did_en", "need") if out.get(k) not in (None, "")}
            _save()
    except Exception as e:
        print("learn_object failed:", e)


def _latest_sighting(pid, label):
    return rm.LAST_SEEN.get(pid, {}).get(label)


def q_where_now(pid, obj_label, day, photos):
    """'Where is your glasses now?' - from the newest sighting (practical: finding it)."""
    seen = _latest_sighting(pid, obj_label)
    use = object_use(obj_label) or {}
    if not seen or not seen.get("room_si"):
        return None
    name = rm.si_name(obj_label)
    correct = {"si": seen["room_si"], "en": seen["room"], "icon": ROOM_ICON.get(seen["room"], "🏠")}
    choices, idx = _choices(correct, _rooms(), k=4)
    need = f" {use['use_si']} ඕනේ වුණාම එතනින් ගන්න." if use.get("use_si") else ""
    hint = f"ඒක {rm.si_name(seen['anchors'][0])} ළඟ තිබ්බේ." if seen.get("anchors") else "ඔයා ඒක අන්තිමට පාවිච්චි කරපු තැන හිතන්න."
    return _q("where_now", "places", f"ඔයාගේ {name} දැන් තියෙන්නේ ගෙදර කොයි කාමරේද?",
              f"Where is your {obj_label} now?", correct, [seen["room_si"], seen["room"], seen["room"].lower()],
              hint, "Hint: what it is near.", choices, idx,
              f"ඔයාගේ {name} තියෙන්නේ {seen['room_si']}ේ.{need}",
              {"kind": "photo", "urls": [photos.get(obj_label) or seen.get("photo_url")]}, day)


def q_did_when(pid, m, obj, day):
    """'When did you take your medicine today?' - the camera saw the pill bottle in use."""
    use = object_use(obj["label"]) or {}
    if not use.get("did_si"):
        return None
    correct = _periods()[_period(m["time"])]
    choices, idx = _choices(correct, _periods(), k=4)
    where = f"ඒ වෙලාවේ ඔයා හිටියේ {m['room_si']}ේ." if m.get("room_si") else f"ඔයා ඒකට {obj['label_si']} පාවිච්චි කළා."
    return _q("did_when", "time", f"ඔයා අද {use['did_si']} කීයටද? උදේද, දවල්ද, හවසද, රෑද?",
              f"When did you {use.get('did_en', 'use it')} today?", correct, [correct["si"], correct["en"]],
              where, "Hint: where you were.", choices, idx,
              f"ඔයා අද {use['did_si']} {correct['si']}. කැමරාවෙන් මම දැක්කා.",
              {"kind": "photo", "urls": [_crop(obj.get("photo_url") or m["photo_urls"][0], obj.get("box"))]}, day)


def q_used_for(pid, obj_label, day, photos):
    """'What do we use this for?' - knowing what everyday objects are for (semantic memory)."""
    use = object_use(obj_label)
    if not use or not photos.get(obj_label):
        return None
    correct = {"si": use["use_si"], "en": use.get("use_en", "")}
    pool = [{"si": u["use_si"], "en": u.get("use_en", "")} for l, u in {**OBJECT_USE, **OBJECT_INFO}.items()
            if l != obj_label and u["use_si"] != use["use_si"]]
    choices, idx = _choices(correct, pool, k=3)
    dsi, _ = _day_word(day)
    return _q("used_for", "objects", f"මේ ඔයා {dsi} පාවිච්චි කරපු {rm.si_name(obj_label)}. මේක අපි පාවිච්චි කරන්නේ මොකටද?",
              f"This is your {obj_label}. What do we use it for?", correct,
              [use["use_si"], use.get("use_en", "")] + use["use_si"].replace(",", " ").split(),
              "ඔයා අද ඒක පාවිච්චි කරපු වෙලාව මතක් කරලා බලන්න.", "Hint: when you used it.", choices, idx,
              f"ඔව්, {rm.si_name(obj_label)} පාවිච්චි කරන්නේ {use['use_si']}.",
              {"kind": "photo", "urls": [photos[obj_label]]}, day)


def q_which_for(pid, m, obj, day, photos):
    """'What did you drink your tea from today?' - pick the real object photo."""
    use = object_use(obj["label"]) or {}
    others = [l for l in photos if l != obj["label"] and (object_use(l) or {}).get("use_si") != use.get("use_si")]
    if not use.get("did_si") or len(others) < 2:
        return None
    correct = {"si": obj["label_si"], "en": obj["label"],
               "image": _crop(obj.get("photo_url") or m["photo_urls"][0], obj.get("box"))}
    choices, idx = _choices(correct, [{"si": rm.si_name(l), "en": l, "image": photos[l]} for l in others], k=4)
    return _q("which_for", "objects", f"ඔයා අද {use['did_si']} මොකෙන්ද? මේ පින්තූර වලින් තෝරන්න නැත්නම් කියන්න.",
              f"What did you use to {use.get('did_en', 'do it')} today?", correct,
              [obj["label_si"], obj["label"]] + [w for w, l in rm.SPOKEN_TO_LABEL.items() if l == obj["label"]],
              f"ඒක {use['use_si']} පාවිච්චි කරන දෙයක්.", "Hint: what it is for.", choices, idx,
              f"ඒ ඔයාගේ {obj['label_si']}.", {"kind": "scene",
              "icon": ROOM_ICON.get(m.get("room") or "", "🏠"), "label_si": m.get("room_si") or ""}, day)


# ─── Adaptive selection ──────────────────────────────────────────────────────
def _finished(pid):
    return [s for s in SESSIONS.get(pid, []) if s.get("finished")]


def _level(pid):
    recent = _finished(pid)[-5:]
    if not recent:
        return "normal", None
    avg = sum(s["score"] for s in recent) / len(recent)
    return ("gentle" if avg < 40 else "challenge" if avg >= 75 else "normal"), round(avg, 1)


def _domain_scores(sessions):
    tot, got = {}, {}
    for s in sessions:
        for a in s.get("answers", []):
            d = a["domain"]
            tot[d] = tot.get(d, 0) + 3
            got[d] = got.get(d, 0) + a["points"]
    return {d: round(100 * got[d] / tot[d], 1) for d in tot}


def _missed_targets(pid):
    """Things the patient could not recall in recent games. Asking about them
    again on a later day is spaced retrieval - a memory practice that works
    in dementia - so these come first."""
    out = set()
    for s in _finished(pid)[-3:]:
        for a in s["answers"]:
            if a.get("target") and a["points"] <= 1:
                out.add(a["target"])
    return out


def build_questions(pid):
    level, avg = _level(pid)
    n_target = {"gentle": 5, "normal": 6, "challenge": 6}[level]
    # Only TODAY's events: every night brings a new set of questions, and what was
    # asked today is never asked again tomorrow.
    day = datetime.date.today().isoformat()
    photos = _object_photos(pid)

    # Each candidate carries a "target" (the person / thing it is about), so two
    # questions never give each other's answer away.
    cands = []
    def add(q, target):
        q["target"] = target
        cands.append(q)

    met = sorted(_people_met(pid, day), key=lambda m: -m[1].get("seconds", 0))
    for p, rec in met:
        add(q_who_came(pid, p, rec, day), f"person:{p['id']}")
        if p.get("photo_url"):
            add(q_person_photo(pid, p, rec, day), f"person:{p['id']}")
        if rec.get("first"):
            add(q_visit_time(pid, p, rec, day), f"person:{p['id']}")
    if len(met) >= 2:
        add(q_visit_count(pid, met, day), f"count:{day}")
    talk_qs = []  # what was said during visits - every question is kept, asked one by one
    for conv in visit_talk.for_day(pid, day):
        for i, item in enumerate(conv.get("questions") or []):
            q = q_talk(pid, conv, item, day)
            if q:
                q["target"] = f"talk:{conv['id']}:{i}"
                talk_qs.append(q)
    moments = [m for m in rm.MOMENTS.get(pid, []) if m["time"].startswith(day)]
    seen_obj = set()
    for m in reversed(moments):
        objs = [o for o in m["objects"] if o["label"] not in rm.FIXED_ANCHORS]
        for o in objs:
            if o["label"] in seen_obj:
                continue
            seen_obj.add(o["label"])
            # Practical: did you take your medicine / when, where is it now,
            # what do we use it for, what did you drink your tea from.
            for q in (q_did_when(pid, m, o, day),
                      q_where_now(pid, o["label"], day, photos) if (object_use(o["label"]) or {}).get("need") else None,
                      q_which_for(pid, m, o, day, photos),
                      q_used_for(pid, o["label"], day, photos)):
                if q:
                    add(q, f"object:{o['label']}")
            filler = q_object_place(pid, m, o, day) if m.get("room_si") else None
            if filler:  # only if the practical ones run out
                filler["filler"] = True
                add(filler, f"object:{o['label']}")
        if len(m.get("photo_urls", [])) >= 2 and objs and m.get("room_si"):
            q = q_replay(pid, m, day)
            q["filler"] = True
            add(q, f"object:{objs[0]['label']}")
    ev = _events_today(pid, day, photos)
    pairs = [(a, b) for i, a in enumerate(ev) for b in ev[i + 1:]
             if a["target"] != b["target"] and
             (datetime.datetime.fromisoformat(b["time"]) - datetime.datetime.fromisoformat(a["time"])).total_seconds() >= 1200]
    if pairs:
        a, b = random.choice(pairs)
        add(q_which_first(pid, a, b, day), f"order:{a['target']}|{b['target']}")

    if not cands and not talk_qs:
        return [], level, avg

    # Adaptive: the weakest memory areas first, keeping variety (one per type and
    # per target, then at most two of a type). Conversation questions are all kept.
    weak = _domain_scores(_finished(pid)[-10:])
    random.shuffle(cands)
    cands.sort(key=lambda q: (bool(q.get("filler")), weak.get(q["domain"], 50)))
    picked, used_targets, type_count = [], set(), {}
    room = max(2, n_target - len(talk_qs))
    for max_per_type in (1, 2):
        for q in cands:
            if len(picked) >= room:
                break
            if q in picked or q["target"] in used_targets or type_count.get(q["type"], 0) >= max_per_type:
                continue
            picked.append(q)
            type_count[q["type"]] = type_count.get(q["type"], 0) + 1
            used_targets.add(q["target"])
    # Order like a conversation: who came -> what we talked about -> my things.
    visit_first = [q for q in picked if q["type"] in ("who_came", "person_photo", "visit_time", "visit_count")]
    rest = [q for q in picked if q not in visit_first]
    rest.sort(key=lambda q: bool(q.get("filler")))
    ordered = visit_first[:1] + talk_qs[:8] + visit_first[1:] + rest
    _add_leads(ordered)
    return ordered, level, avg


def _add_leads(qs):
    """A short spoken bridge before each question, so the game flows like a
    conversation instead of a list of questions."""
    talk_seen, objects_started = set(), False
    for i, q in enumerate(qs):
        lead = ""
        if q["type"] == "talk":
            lead = q["talk_intro_si"] if q["talk_id"] not in talk_seen else "ඒ කතාව ගැනම තව එකක්."
            talk_seen.add(q["talk_id"])
        elif i == 0 and q["type"] == "who_came":
            lead = "මුලින්ම, අද දවසේ වැදගත්ම දේ ගැන."
        elif q["domain"] in ("objects", "places", "time") and not objects_started:
            objects_started = True
            lead = "දැන් ඔයාගේ බඩු ගැනයි, අද කරපු දේවල් ගැනයි කතා කරමු." if i else ""
        if i == len(qs) - 1 and len(qs) > 2:
            lead = (lead + " " if lead else "") + "මේ අන්තිම ප්‍රශ්නය!"
        q["lead_si"] = lead.strip()


def _public(q):
    return {k: q.get(k) for k in ("id", "type", "domain", "lead_si", "prompt_si", "prompt_en", "hint_si", "choices", "media")}


# ─── Judging spoken answers ──────────────────────────────────────────────────
def _transcribe(audio, filename):
    r = requests.post(f"{rm.GROQ_BASE}/audio/transcriptions",
                      headers={"Authorization": f"Bearer {rm.GROQ_API_KEY}"},
                      files={"file": (filename or "answer.m4a", audio)},
                      data={"model": "whisper-large-v3", "response_format": "json", "temperature": "0",
                            "language": "hi"}, timeout=30)
    r.raise_for_status()
    return r.json().get("text", "").strip()


def judge(q, heard, stage):
    """-> (verdict 'correct'|'wrong'|'dont_know'|'unclear', sinhala_text)."""
    if not heard:
        return "unclear", ""
    low = heard.lower()
    def said_word(a):
        a = a.lower()
        if a.isascii():  # whole words only: "son" must not match "grandson"
            return re.search(rf"\b{re.escape(a)}\b", low) is not None
        return a in low
    # Fast path only outside the choice step: there the patient may read several options aloud.
    if stage != "choice" and any(said_word(a) for a in q["accept"] if len(a) >= 2):
        return "correct", rm.to_sinhala_script(heard)
    if not rm.GROQ_API_KEY:
        return "wrong", rm.to_sinhala_script(heard)
    options = ""
    if stage == "choice":
        options = " The patient was choosing one of: " + "; ".join(f"{c['si']} ({c['en']})" for c in q["choices"]) + "."
    try:
        out = rm._llm_json(
            "An elderly Sri Lankan patient with memory problems answered a question by voice in SINHALA "
            "(sometimes mixed with English). Below is a phonetic transcription written in Devanagari script "
            "(it shows Sinhala sounds, not Hindi). "
            f"Question: {q['prompt_si']} ({q['prompt_en']}). Correct answer: {q['answer_si']} ({q['answer_en']}). "
            f"Other acceptable words: {q['accept']}.{options} "
            "Decide whether the answer means the correct answer. Be lenient with pronunciation, word endings and "
            "short answers; a family role alone (e.g. 'my son') is correct even without the name. If they say they "
            "do not know or cannot remember, the verdict is dont_know. "
            'Reply ONLY JSON {"sinhala": "<what they said, in Sinhala script>", "verdict": "correct|wrong|dont_know"}.\n\n'
            f"Transcription: {heard}")
        v = out.get("verdict", "wrong")
        return (v if v in ("correct", "wrong", "dont_know") else "wrong"), rm.to_sinhala_script(out.get("sinhala") or heard)
    except Exception as e:
        print("quiz judge LLM failed:", e)
        return "wrong", rm.to_sinhala_script(heard)


# ─── Endpoints ───────────────────────────────────────────────────────────────
def _find_session(session_id):
    for plist in SESSIONS.values():
        for s in plist:
            if s["id"] == session_id:
                return s
    return None


@router.post("/quiz/start")
async def quiz_start(patient_id: str = Form(...), user_id: str = Form(""), name: str = Form("")):
    prof = PROFILE.setdefault(patient_id, {})
    if name:
        prof["name"] = name
    if user_id:
        prof["user_id"] = user_id
    prof["updated"] = datetime.datetime.now().isoformat()

    # Tonight's game was prepared at STORY_HOUR (see _nightly_quiz_loop); played
    # earlier in the day, or a second time, it is built fresh from what is known now.
    prep = PREPARED.pop(patient_id, None)
    if prep and prep["day"] == rm._today() and prep["questions"]:
        questions, level, avg = prep["questions"], prep["level"], prep["avg"]
    else:
        questions, level, avg = build_questions(patient_id)
    who = f"{name}, " if name else ""
    if not questions:
        # No made-up questions: with nothing captured, there is nothing to ask about.
        _save()
        return {"status": "empty", "say_si": f"{who}අද තවම ඔයාගේ දවසේ මතක සටහන් නැහැ. කැමරාව ඔයාගේ දවස "
                                              "දැක්කට පස්සේ, රෑට අපි ඒ ගැන සෙල්ලම් කරමු."}
    # A warm start before any question: greet, then ask how they feel (check-in).
    intro = f"ආයුබෝවන් {name}! " if name else "ආයුබෝවන්! "
    intro += "ඔයාව දකින්න ලැබුණු එක මට හරිම සතුටුයි. අපි ටිකක් කතා කරමු. අද ඔයාට කොහොමද දැනුණේ?"

    session = {"id": f"qz-{uuid.uuid4().hex[:8]}", "pid": patient_id, "created": datetime.datetime.now().isoformat(),
               "day": rm._today(), "level": level, "recent_avg": avg, "questions": questions,
               "answers": [], "finished": False, "score": None}
    SESSIONS.setdefault(patient_id, []).append(session)
    SESSIONS[patient_id] = SESSIONS[patient_id][-400:]
    _save()
    return {"status": "success", "session_id": session["id"], "level": level, "intro_si": intro,
            "moods": MOODS, "questions": [_public(q) for q in questions]}


# The check-in: how the patient feels sets the tone (and length) of tonight's game.
MOODS = [{"key": "happy", "emoji": "😊", "si": "සතුටින්"}, {"key": "ok", "emoji": "🙂", "si": "හොඳින්"},
         {"key": "tired", "emoji": "😴", "si": "මහන්සියි"}, {"key": "sad", "emoji": "😢", "si": "දුකෙන්"}]
MOOD_REPLY = {
    "happy": "ඒක අහන්න මට හරිම සතුටුයි! එහෙනම් අද දවස ගැන සතුටින් මතක් කරමු.",
    "ok": "හොඳයි! අපි එකට අද දවස මතක් කරමු.",
    "tired": "අනේ, ඔයා මහන්සියි නේද? කමක් නැහැ, අපි ප්‍රශ්න ටිකයි අහන්නේ, හෙමින් කරමු.",
    "sad": "අනේ, ඔයාට දුකද? මම ඔයා ළඟ ඉන්නවා. අපි හෙමින්, ප්‍රශ්න ටිකක් විතරක් කරමු.",
}


@router.post("/quiz/mood")
async def quiz_mood(session_id: str = Form(...), mood: str = Form(...)):
    s = _find_session(session_id)
    if not s:
        return {"status": "error", "message": "Quiz session not found"}
    mood = mood if mood in MOOD_REPLY else "ok"
    s["mood"] = mood
    # Tired or sad -> a shorter game today; unasked questions don't count against the score.
    limit = 4 if mood in ("tired", "sad") else len(s["questions"])
    if limit < len(s["questions"]):
        s["questions"] = s["questions"][:limit]
        _add_leads(s["questions"])
    _save()
    n = len(s["questions"])
    return {"status": "success", "say_si": f"{MOOD_REPLY[mood]} මම ප්‍රශ්න {n}ක් අහන්නම්. උත්තරේ කියන්න මයික් බොත්තම ඔබන්න.",
            "questions": [_public(q) for q in s["questions"]]}


@router.get("/day-record/{patient_id}")
async def day_record(patient_id: str, date: str = ""):
    """Everything about one day, kept day by day: story, visits and what was talked
    about, every memory game with each question, the patient's answer and how
    much help they needed, mood, and the day's numbers."""
    day = date or rm._today()
    story = rm.STORIES.get(patient_id, {}).get(day, {}).get("si")
    by_id = {p["id"]: p for p in rm.PEOPLE.get(patient_id, [])}
    talks = []
    for c in visit_talk.for_day(patient_id, day):
        p = by_id.get(c["person_id"]) or {"relation_si": "අමුත්තා"}
        talks.append({k: c.get(k) for k in ("id", "time", "seconds", "summary_si", "topics", "promises", "mood",
                                             "visitor_asked", "patient_said")} |
                     {"relation_si": p.get("relation_si"), "name": p.get("name"), "photo_url": p.get("photo_url")})
    games = []
    for s in [x for x in _finished(patient_id) if x["day"] == day]:
        by_idx = {a["q_index"]: a for a in s["answers"]}
        qs = []
        for i, q in enumerate(s["questions"]):
            a = by_idx.get(i, {})
            last = (a.get("attempts") or [{}])[-1]
            qs.append({"prompt_si": q["prompt_si"], "answer_si": q["answer_si"], "said": last.get("said") or "",
                       "points": a.get("points", 0), "stage": a.get("stage_reached", "skipped"),
                       "image": (q.get("media") or {}).get("urls", [None])[0] if (q.get("media") or {}).get("urls") else None})
        games.append({"time": s.get("finished_at", s["created"])[11:16], "score": s["score"], "stars": s.get("stars"),
                      "max_stars": s.get("max_stars"), "mood": s.get("mood"), "questions": qs})
    inter = rm.INTERACTIONS.get(patient_id, {}).get(day, {})
    return {"status": "success", "date": day,
            "story": {"title": story.get("title"), "story": story.get("story")} if story else None,
            "conversations": talks, "games": games,
            "counts": {"moments": sum(1 for m in rm.MOMENTS.get(patient_id, []) if m["time"].startswith(day)),
                       "visits": sum(r["count"] for r in inter.values() if r["kind"] == "person"),
                       "finds": sum(1 for f in rm.FIND_LOG.get(patient_id, []) if f["time"].startswith(day))}}


@router.post("/quiz/answer")
async def quiz_answer(session_id: str = Form(...), q_index: int = Form(...), stage: str = Form("free"),
                      choice: int = Form(-1), dont_know: bool = Form(False), response_ms: int = Form(0),
                      file: UploadFile = File(None)):
    s = _find_session(session_id)
    if not s or s["finished"]:
        return {"status": "error", "message": "Quiz session not found or already finished"}
    if not 0 <= q_index < len(s["questions"]) or stage not in STAGES:
        return {"status": "error", "message": "Bad question index or stage"}
    q = s["questions"][q_index]

    heard, said = "", ""
    if dont_know:
        verdict = "dont_know"
    elif choice >= 0:
        verdict = "correct" if choice == q["correct_choice"] else "wrong"
        said = q["choices"][choice]["si"] if choice < len(q["choices"]) else ""
    elif file is not None:
        if not rm.GROQ_API_KEY:
            return {"status": "error", "message": "GROQ_API_KEY is not set on the AI server"}
        try:
            heard = _transcribe(await file.read(), file.filename)
        except Exception as e:
            return {"status": "error", "message": f"Transcription failed: {e}"}
        verdict, said = judge(q, heard, stage)
    else:
        return {"status": "error", "message": "Send an audio file, a choice, or dont_know"}

    if verdict == "unclear":
        return {"status": "success", "verdict": "unclear", "next": stage,
                "say_si": "සමාවෙන්න, මට හරියට ඇහුණේ නැහැ. ආයෙත් ටිකක් ලොකුවට කියන්න."}

    attempt = {"stage": stage, "verdict": verdict, "heard": heard, "said": said, "ms": response_ms,
               "via": "choice" if choice >= 0 else "voice" if file is not None else "skip"}
    rec = next((a for a in s["answers"] if a["q_index"] == q_index), None)
    if rec is None:
        rec = {"q_index": q_index, "q_id": q["id"], "type": q["type"], "domain": q["domain"],
               "target": q.get("target"), "retry": bool(q.get("retry")),
               "attempts": [], "points": 0, "stage_reached": stage, "done": False,
               "first_ms": response_ms}
        s["answers"].append(rec)
    rec["attempts"].append(attempt)
    rec["stage_reached"] = stage

    if verdict == "correct":
        rec["points"] = POINTS[stage]
        rec["done"] = True
        praise = random.choice(PRAISE if stage == "free" else PRAISE_HELPED)
        out = {"verdict": "correct", "next": "next", "points": rec["points"], "say_si": f"{praise} {q['reveal_si']}"}
    elif stage == "free":
        out = {"verdict": verdict, "next": "hint", "points": 0,
               "say_si": f"{random.choice(COMFORT)} පොඩි ඉඟියක් දෙන්නම්. {q['hint_si']} දැන් ආයෙත් කියන්න."}
    elif stage == "hint":
        opts = ", ".join(c["si"] for c in q["choices"])
        n = {2: "දෙකෙන්", 3: "තුනෙන්", 4: "හතරෙන්"}.get(len(q["choices"]), "")
        if q["choices"] and q["choices"][0].get("image") and q["type"] in ("who_came",):
            ask = "මේ ෆොටෝ වලින් ඔයාව බලන්න ආපු කෙනාව තෝරන්න."
        elif q["choices"] and q["choices"][0].get("image"):
            ask = f"මේ පින්තූර {n} හරි එක තෝරන්න: {opts}."
        else:
            ask = f"මේ {n} එකක් තෝරන්න: {opts}."
        out = {"verdict": verdict, "next": "choice", "points": 0, "say_si": f"කමක් නැහැ. {ask}"}
    else:
        rec["done"] = True
        out = {"verdict": verdict, "next": "next", "points": 0,
               "say_si": f"{random.choice(COMFORT)} {q['reveal_si']} හෙට අපි ආයෙත් බලමු."}
    if rec["done"]:
        out["correct_choice"] = q["correct_choice"]
    _save()
    return {"status": "success", "said": said, **out}


def _score(s):
    n = len(s["questions"])
    got = sum(a["points"] for a in s["answers"])
    return round(100 * got / (3 * n), 1) if n else 0.0, got, 3 * n


@router.post("/quiz/finish")
async def quiz_finish(session_id: str = Form(...)):
    s = _find_session(session_id)
    if not s:
        return {"status": "error", "message": "Quiz session not found"}
    answered = {a["q_index"] for a in s["answers"]}
    for i, q in enumerate(s["questions"]):  # questions left unanswered count as not remembered
        if i not in answered:
            s["answers"].append({"q_index": i, "q_id": q["id"], "type": q["type"], "domain": q["domain"],
                                 "target": q.get("target"), "retry": bool(q.get("retry")),
                                 "attempts": [], "points": 0, "stage_reached": "skipped", "done": True, "first_ms": 0})
    pct, got, mx = _score(s)
    s.update(finished=True, score=pct, stars=got, max_stars=mx, finished_at=datetime.datetime.now().isoformat())
    _save()
    if pct >= 75:
        msg = f"අද ඔයාට තරු {got}ක් ලැබුණා! ඔයාගේ මතකය අද හරිම හොඳයි. හෙටත් අපි සෙල්ලම් කරමු."
    elif pct >= 40:
        msg = f"අද ඔයාට තරු {got}ක් ලැබුණා! හොඳ වැඩක්. හෙටත් අපි එකට මතක් කරමු."
    else:
        msg = f"අද ඔයාට තරු {got}ක් ලැබුණා. සෙල්ලම් කළාට හරිම ස්තූතියි! හෙට අපි ආයෙත් එකට කරමු."
    return {"status": "success", "score": pct, "stars": got, "max_stars": mx, "say_si": msg}


@router.get("/quiz/today/{patient_id}")
async def quiz_today(patient_id: str):
    """For the app's menu card: is tonight's game ready, and was it played today?"""
    today = rm._today()
    played = [s for s in _finished(patient_id) if s["day"] == today]
    prep = PREPARED.get(patient_id)
    ready = bool(prep and prep["day"] == today and prep["questions"])
    return {"status": "success", "ready": ready, "count": len(prep["questions"]) if ready else 0,
            "played": bool(played), "last_score": played[-1]["score"] if played else None,
            "story_hour": rm.STORY_HOUR}


def prepare_tonight(pid):
    questions, level, avg = build_questions(pid)
    if questions:
        PREPARED[pid] = {"day": rm._today(), "questions": questions, "level": level, "avg": avg,
                         "created": datetime.datetime.now().isoformat()}
        _save()
    return len(questions)


def _nightly_quiz_loop():
    """At STORY_HOUR (8 PM) - together with the story - build tonight's memory
    game for every patient who had a day worth asking about."""
    import time
    while True:
        try:
            if datetime.datetime.now().hour >= rm.STORY_HOUR:
                today = rm._today()
                pids = set(rm.MOMENTS) | set(rm.INTERACTIONS) | set(visit_talk.CONVERSATIONS)
                for pid in pids:
                    if pid.endswith("-TEST") or (PREPARED.get(pid) or {}).get("day") == today:
                        continue
                    if any(s["day"] == today for s in _finished(pid)):
                        continue
                    n = prepare_tonight(pid)
                    if n:
                        print(f"[nightly quiz] prepared {n} questions for {pid}")
        except Exception as e:
            print("nightly quiz loop error:", e)
        time.sleep(300)


threading.Thread(target=_nightly_quiz_loop, daemon=True, name="nightly-quiz").start()
# New kinds of objects get their "what is it for" looked up once, in the background.
rm._ctx["on_new_object"] = lambda label: threading.Thread(target=learn_object, args=(label,), daemon=True).start()


@router.get("/quiz/history/{patient_id}")
async def quiz_history(patient_id: str, limit: int = 30):
    out = [{"id": s["id"], "date": s["day"], "score": s["score"], "stars": s.get("stars"),
            "max_stars": s.get("max_stars"), "level": s["level"]} for s in _finished(patient_id)[-limit:]]
    return {"status": "success", "sessions": list(reversed(out))}


# ─── MMSE from the cognitive-assessment component (read-only) ────────────────
_mmse_cache = {}


def fetch_mmse(pid):
    prof = PROFILE.get(pid, {})
    if prof.get("demo_mmse") is not None:
        return prof["demo_mmse"]
    ids = [i for i in (prof.get("user_id"), pid) if i]
    key = tuple(ids)
    hit = _mmse_cache.get(key)
    if hit and (datetime.datetime.now() - hit[0]).seconds < 120:
        return hit[1]
    results = []
    for uid in ids:
        try:
            r = requests.get(f"{NODE_API}/api/cognitive/assessments/patient/{uid}/history", timeout=4)
            sessions = (r.json().get("data") or {}).get("sessions") or []
        except Exception:
            continue
        for a in sessions:
            if a.get("status") != "done":
                continue
            total = a.get("adjustedScore") if a.get("adjustedScore") is not None else a.get("totalScore")
            when = a.get("completedAt") or a.get("updatedAt") or a.get("createdAt")
            if total is None or not when:
                continue
            results.append({"date": when[:10], "at": when, "total": total, "max": 30, "severity": a.get("severity"),
                            "sections": a.get("sectionScores") or {}})
        if results:
            break
    results.sort(key=lambda x: x["at"])  # full timestamp: several tests can share a day
    _mmse_cache[key] = (datetime.datetime.now(), results)
    return results


def _pearson(xs, ys):
    n = len(xs)
    if n < 3:
        return None
    mx, my = sum(xs) / n, sum(ys) / n
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sx = sum((x - mx) ** 2 for x in xs) ** 0.5
    sy = sum((y - my) ** 2 for y in ys) ** 0.5
    return round(sxy / (sx * sy), 2) if sx and sy else None


# ─── Memory report ───────────────────────────────────────────────────────────
def _slope_per_week(points):
    """points = [(day_index, score)] -> least-squares slope * 7."""
    if len(points) < 3:
        return None
    n = len(points)
    mx = sum(p[0] for p in points) / n
    my = sum(p[1] for p in points) / n
    den = sum((p[0] - mx) ** 2 for p in points)
    if not den:
        return None
    return round(7 * sum((p[0] - mx) * (p[1] - my) for p in points) / den, 1)


def build_report(pid, days=30):
    today = datetime.date.today()
    dates = [(today - datetime.timedelta(days=i)).isoformat() for i in range(days - 1, -1, -1)]
    sessions = [s for s in _finished(pid) if s["day"] >= dates[0]]
    finds = [f for f in rm.FIND_LOG.get(pid, []) if f["time"][:10] >= dates[0]]
    inter = rm.INTERACTIONS.get(pid, {})
    moments = rm.MOMENTS.get(pid, [])

    # repeated question = same thing asked again within 30 minutes
    repeats_by_day = {}
    last_ask = {}
    for f in finds:
        t = datetime.datetime.fromisoformat(f["time"])
        prev = last_ask.get(f["label"])
        if prev and (t - prev).total_seconds() <= 1800:
            repeats_by_day[f["time"][:10]] = repeats_by_day.get(f["time"][:10], 0) + 1
        last_ask[f["label"]] = t

    daily = []
    for i, d in enumerate(dates):
        ss = [s for s in sessions if s["day"] == d]
        ans = [a for s in ss for a in s["answers"]]
        cues = {"free": 0, "hint": 0, "choice": 0, "missed": 0}
        for a in ans:
            if a["points"] == 3:
                cues["free"] += 1
            elif a["points"] == 2:
                cues["hint"] += 1
            elif a["points"] == 1:
                cues["choice"] += 1
            else:
                cues["missed"] += 1
        ms = [a["first_ms"] for a in ans if a.get("first_ms")]
        day_inter = inter.get(d, {})
        people_recs = [r for r in day_inter.values() if r["kind"] == "person"]
        daily.append({
            "date": d, "index": i,
            "score": round(sum(s["score"] for s in ss) / len(ss), 1) if ss else None,
            "sessions": len(ss), **cues,
            "avg_response_s": round(sum(ms) / len(ms) / 1000, 1) if ms else None,
            "finds": sum(1 for f in finds if f["time"][:10] == d),
            "repeats": repeats_by_day.get(d, 0),
            "visits": sum(r["count"] for r in people_recs),
            "minutes_with_people": sum(rm._minutes(r["seconds"]) for r in people_recs if r["seconds"]),
            "moments": sum(1 for m in moments if m["time"].startswith(d)),
        })

    scored = [x for x in daily if x["score"] is not None]
    last7 = [x["score"] for x in daily[-7:] if x["score"] is not None]
    prev7 = [x["score"] for x in daily[-14:-7] if x["score"] is not None]
    slope = _slope_per_week([(x["index"], x["score"]) for x in scored])
    trend = None if slope is None else "improving" if slope > 3 else "declining" if slope < -3 else "stable"

    week_start = (today - datetime.timedelta(days=6)).isoformat()
    dom_now = _domain_scores([s for s in sessions if s["day"] >= week_start])
    dom_before = _domain_scores([s for s in sessions if s["day"] < week_start])
    domains = [{"key": k, "label": v, "now": dom_now.get(k), "before": dom_before.get(k)}
               for k, v in DOMAINS.items() if k in dom_now or k in dom_before]

    # MMSE (other component) and its agreement with the daily score
    mmse = fetch_mmse(pid)
    pairs = []
    for m in mmse:
        md = datetime.date.fromisoformat(m["date"])
        near = [s["score"] for s in _finished(pid)
                if -14 <= (datetime.date.fromisoformat(s["day"]) - md).days <= 3]
        if near:
            pairs.append((m["total"], sum(near) / len(near)))
    corr = _pearson([p[0] for p in pairs], [p[1] for p in pairs])

    item_counts = {}
    for f in finds:
        item_counts[f["label"]] = item_counts.get(f["label"], 0) + 1
    top_items = sorted(({"label": k, "label_si": rm.si_name(k), "count": v} for k, v in item_counts.items()),
                       key=lambda x: -x["count"])[:6]

    people_time = {}
    by_id = {p["id"]: p for p in rm.PEOPLE.get(pid, [])}
    for d in dates:
        for r in inter.get(d, {}).values():
            if r["kind"] == "person" and r["ref"] in by_id:
                p = by_id[r["ref"]]
                k = r["ref"]
                e = people_time.setdefault(k, {"name": p.get("name"), "relation": p.get("relation"),
                                               "photo_url": p.get("photo_url"), "minutes": 0, "visits": 0})
                e["minutes"] += rm._minutes(r["seconds"]) if r["seconds"] else 0
                e["visits"] += r["count"]

    totals = {k: sum(x[k] for x in daily) for k in ("free", "hint", "choice", "missed")}
    level, _ = _level(pid)
    report = {
        "status": "success", "patient_id": pid, "name": PROFILE.get(pid, {}).get("name") or "Patient",
        "simulated": bool(PROFILE.get(pid, {}).get("simulated")),
        "generated": datetime.datetime.now().isoformat(), "days": days,
        "summary": {
            "latest_score": scored[-1]["score"] if scored else None,
            "latest_date": scored[-1]["date"] if scored else None,
            "avg_7": round(sum(last7) / len(last7), 1) if last7 else None,
            "avg_prev_7": round(sum(prev7) / len(prev7), 1) if prev7 else None,
            "slope_per_week": slope, "trend": trend,
            "sessions": len(sessions), "days_played_7": sum(1 for x in daily[-7:] if x["sessions"]),
            "streak": _streak(daily), "level": level,
            "finds_7": sum(x["finds"] for x in daily[-7:]), "finds_prev_7": sum(x["finds"] for x in daily[-14:-7]),
            "unaided_pct": round(100 * totals["free"] / max(1, sum(totals.values())), 1) if sum(totals.values()) else None,
            "retry_total": sum(1 for x in sessions for a in x["answers"] if a.get("retry")),
            "retry_recovered": sum(1 for x in sessions for a in x["answers"] if a.get("retry") and a["points"] >= 2),
        },
        "daily": daily, "domains": domains, "cue_totals": totals,
        "mmse": mmse, "mmse_correlation": {"r": corr, "n": len(pairs)},
        "top_items": top_items, "people": sorted(people_time.values(), key=lambda x: -x["minutes"]),
        "recent_sessions": [_session_view(s) for s in reversed(sessions[-8:])],
        "conversations": [
            {"date": c["day"], "time": c["time"][11:16], "minutes": rm._minutes(c["seconds"]) if c.get("seconds") else None,
             "person": (by_id.get(c["person_id"]) or {}).get("name"), "relation": (by_id.get(c["person_id"]) or {}).get("relation"),
             "photo_url": (by_id.get(c["person_id"]) or {}).get("photo_url"),
             "summary_si": c["summary_si"], "summary_en": c["summary_en"], "topics": c.get("topics", []),
             "promises": c.get("promises", []), "mood": c.get("mood"),
             "visitor_asked": c.get("visitor_asked", []), "patient_said": c.get("patient_said", [])}
            for c in reversed(visit_talk.CONVERSATIONS.get(pid, [])) if c["day"] >= dates[0]][:10],
    }
    try:
        import reminders  # lazy: reminders imports this module
        report["routines"] = reminders.routines(pid)
        report["visit_reminders"] = reminders.visits(pid)
    except Exception as e:
        print("report reminders failed:", e)
        report["routines"], report["visit_reminders"] = [], []
    report["insights"] = _insights(report)
    return report


def _streak(daily):
    """Consecutive days played, ending today (or yesterday - today may not be played yet)."""
    days = daily if daily[-1]["sessions"] else daily[:-1]
    n = 0
    for x in reversed(days):
        if not x["sessions"]:
            break
        n += 1
    return n


def _session_view(s):
    out = []
    by_idx = {a["q_index"]: a for a in s["answers"]}
    for i, q in enumerate(s["questions"]):
        a = by_idx.get(i, {})
        last = (a.get("attempts") or [{}])[-1]
        out.append({"type": q["type"], "domain": q["domain"], "prompt_si": q["prompt_si"], "prompt_en": q["prompt_en"],
                    "answer_si": q["answer_si"], "answer_en": q["answer_en"], "media": q["media"],
                    "answer_image": (q.get("choices") or [{}])[q["correct_choice"]].get("image") if q.get("choices") else None,
                    "retry": bool(q.get("retry")),
                    "points": a.get("points", 0), "stage": a.get("stage_reached", "skipped"),
                    "said": last.get("said") or "", "response_s": round(a.get("first_ms", 0) / 1000, 1) if a.get("first_ms") else None})
    return {"id": s["id"], "date": s["day"], "time": s.get("finished_at", s["created"])[11:16], "mood": s.get("mood"),
            "score": s["score"], "stars": s.get("stars"), "max_stars": s.get("max_stars"), "level": s["level"],
            "questions": out}


def _insights(r):
    s, out = r["summary"], []
    if s["trend"]:
        word = {"improving": "is improving", "stable": "is stable", "declining": "is going down"}[s["trend"]]
        out.append({"tone": {"improving": "good", "stable": "neutral", "declining": "warn"}[s["trend"]],
                    "text": f"Daily memory score {word} ({s['slope_per_week']:+} points per week over the period)."})
    elif s["sessions"]:
        out.append({"tone": "neutral", "text": "At least 3 days of memory games are needed to show a trend."})
    if s["avg_7"] is not None and s["avg_prev_7"] is not None:
        diff = round(s["avg_7"] - s["avg_prev_7"], 1)
        out.append({"tone": "good" if diff >= 0 else "warn",
                    "text": f"This week's average is {s['avg_7']} ({diff:+} compared with the week before)."})
    weak = [d for d in r["domains"] if d["now"] is not None]
    if len(weak) >= 2:
        w = min(weak, key=lambda d: d["now"])
        out.append({"tone": "warn" if w["now"] < 50 else "neutral",
                    "text": f"Weakest area this week: {w['label'].lower()} ({w['now']}%). The game asks about it more often."})
    if s["unaided_pct"] is not None:
        out.append({"tone": "neutral", "text": f"{s['unaided_pct']}% of answers were given without any hint."})
    if s["finds_7"] or s["finds_prev_7"]:
        top = r["top_items"][0]["label"] if r["top_items"] else ""
        out.append({"tone": "warn" if s["finds_7"] > s["finds_prev_7"] + 3 else "neutral",
                    "text": f"Asked where things are {s['finds_7']} times this week (week before: {s['finds_prev_7']})"
                            + (f"; most often the {top}." if top else ".")})
    if s.get("retry_total"):
        out.append({"tone": "good" if s["retry_recovered"] * 2 >= s["retry_total"] else "neutral",
                    "text": f"Practice of forgotten things: {s['retry_recovered']} of {s['retry_total']} items missed earlier "
                            "were remembered when asked again on a later game."})
    reps = sum(x["repeats"] for x in r["daily"][-7:])
    if reps:
        out.append({"tone": "warn", "text": f"{reps} repeated question(s) this week (same item asked again within 30 minutes)."})
    missed = 7 - s["days_played_7"]
    if s["sessions"] and missed >= 3:
        out.append({"tone": "neutral", "text": f"No memory game on {missed} of the last 7 days; daily play gives a clearer picture."})
    if r["mmse"]:
        m = r["mmse"][-1]
        sev = f", {m['severity']}" if m.get("severity") else ""
        out.append({"tone": "neutral", "text": f"Latest MMSE (cognitive assessment): {m['total']}/30{sev}, on {m['date']}."})
    c = r["mmse_correlation"]
    if c["r"] is not None:
        strength = "strong" if abs(c["r"]) >= 0.7 else "moderate" if abs(c["r"]) >= 0.4 else "weak"
        out.append({"tone": "neutral", "text": f"Daily score and MMSE agree with a {strength} correlation (r = {c['r']}, n = {c['n']})."})
    out.append({"tone": "muted", "text": "This report supports monitoring only. It is not a diagnosis; clinical decisions stay with the doctor."})
    return out


@router.get("/memory-report/{patient_id}")
async def memory_report(patient_id: str, days: int = 30):
    return build_report(patient_id, max(7, min(days, 120)))


@router.get("/memory-report-patients")
async def report_patients():
    pids = set(SESSIONS) | {p for p in rm.MOMENTS if not p.endswith("-TEST")} | set(PROFILE)
    out = []
    for pid in pids:
        fin = _finished(pid)
        out.append({"patient_id": pid, "name": PROFILE.get(pid, {}).get("name") or f"Patient …{pid[-6:]}",
                    "simulated": bool(PROFILE.get(pid, {}).get("simulated")),
                    "sessions": len(fin), "last_score": fin[-1]["score"] if fin else None,
                    "last_played": fin[-1]["day"] if fin else None,
                    "moments": len(rm.MOMENTS.get(pid, []))})
    out.sort(key=lambda x: (x["simulated"], -(x["sessions"]), x["name"]))
    return {"status": "success", "patients": out}


# ─── Demo data (clearly marked as simulated) ─────────────────────────────────
@router.post("/memory-report/demo-seed")
async def demo_seed():
    """Fills a separate DEMO patient with 30 days of simulated games so the web
    report can be shown before real patients have a month of data. The report
    and patient list flag it as simulated."""
    pid = "DEMO-PATIENT"
    random.seed(7)
    PROFILE[pid] = {"name": "Demo patient (simulated)", "simulated": True,
                    "demo_mmse": [{"date": (datetime.date.today() - datetime.timedelta(days=d)).isoformat(),
                                   "total": t, "max": 30, "severity": "mild", "sections": {}}
                                  for d, t in ((88, 23), (58, 22), (28, 21), (2, 20))]}
    SESSIONS[pid] = []
    rm.FIND_LOG[pid] = []
    today = datetime.date.today()
    types = [("weekday", "orientation"), ("person_photo", "people"), ("object_place", "places"),
             ("reveal", "objects"), ("time_of_day", "time"), ("who_visited", "delayed")]
    for back in range(89, -1, -1):
        d = today - datetime.timedelta(days=back)
        if random.random() < 0.18:
            continue  # some days not played
        base = 72 - (89 - back) * 0.12  # slow decline
        qs, ans = [], []
        for i, (t, dom) in enumerate(types[: random.choice([5, 5, 6])]):
            p_ok = (base + {"orientation": 15, "people": 5, "places": -12, "objects": 8, "time": -6, "delayed": -18}[dom]) / 100
            r = random.random()
            pts = 3 if r < p_ok * 0.75 else 2 if r < p_ok else 1 if r < p_ok + 0.18 else 0
            qs.append({"id": f"d{i}", "type": t, "domain": dom, "prompt_si": "", "prompt_en": f"(simulated {DOMAINS[dom].lower()} question)",
                       "answer_si": "", "answer_en": "", "media": {"kind": "none"}})
            ans.append({"q_index": i, "q_id": f"d{i}", "type": t, "domain": dom, "attempts": [], "points": pts,
                        "stage_reached": ["choice", "choice", "hint", "free"][pts], "done": True,
                        "first_ms": int(random.uniform(2500, 7000) + (89 - back) * 25)})
        s = {"id": f"qz-demo{back}", "pid": pid, "created": f"{d.isoformat()}T20:15:00", "day": d.isoformat(),
             "level": "normal", "questions": qs, "answers": ans, "finished": True,
             "finished_at": f"{d.isoformat()}T20:19:00"}
        s["score"], s["stars"], s["max_stars"] = _score(s)
        SESSIONS[pid].append(s)
        for _ in range(int(random.uniform(1, 3) + (89 - back) / 30)):
            lbl = random.choice(["glasses", "glasses", "cell phone", "remote", "wallet", "pill bottle"])
            hh = random.randint(7, 20)
            rm.FIND_LOG[pid].append({"time": f"{d.isoformat()}T{hh:02d}:{random.randint(0, 59):02d}:00",
                                     "label": lbl, "found": True, "q": "(simulated)"})
    rm.FIND_LOG[pid].sort(key=lambda f: f["time"])
    _save()
    rm._save()
    return {"status": "success", "patient_id": pid, "sessions": len(SESSIONS[pid])}
