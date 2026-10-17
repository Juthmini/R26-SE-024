# -*- coding: utf-8 -*-
"""
Adaptive reminders - learned from what the camera and the visits show, not
typed in by a caregiver.

1. Routine reminders. For every object that proves a daily activity (pill
   bottle = medicine, toothbrush = brushing, cup = tea; see memory_quiz.OBJECT_USE)
   the usual time is learned from the first sighting on each day (median over
   the last 14 days, at least 3 days). If the patient has not used it by
   usual time + a grace period today, a gentle Sinhala reminder is due. If it
   was already used, nothing is said - no nagging.
2. Visit reminders. Promises heard during visits ("I'll come again on
   Saturday") become a morning reminder on that day ("අද කමල් එනවා").
3. Adaptation. The grace period is shorter (15 min instead of 30) while the
   daily memory score is low; every reminder records whether the activity
   followed within an hour, and a routine that is still missed after its
   reminder on 3 of the last 5 days is flagged for the caregiver.
"""
import os
import json
import datetime
import statistics
import threading

from fastapi import APIRouter

import remember_moments as rm
import visit_talk
import memory_quiz

router = APIRouter()

DB_FILE = "reminders_db.json"
DELIVERED = {}   # pid -> {date: {reminder_id: iso_time}}
_lock = threading.Lock()

DAYS_EN = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
DAYS_SI = ["සඳුදා", "අඟහරුවාදා", "බදාදා", "බ්‍රහස්පතින්දා", "සිකුරාදා", "සෙනසුරාදා", "ඉරිදා"]


def _load():
    global DELIVERED
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, "r", encoding="utf-8") as f:
                DELIVERED = json.load(f).get("DELIVERED", {})
        except Exception as e:
            print("reminders_db load failed:", e)


def _save():
    with _lock:
        with open(DB_FILE, "w", encoding="utf-8") as f:
            json.dump({"DELIVERED": DELIVERED}, f, ensure_ascii=False)


_load()


def _mins(iso):
    t = datetime.datetime.fromisoformat(iso)
    return t.hour * 60 + t.minute


def _clock_si(minutes):
    h, m = divmod(int(minutes), 60)
    part = "උදේ" if h < 12 else "දවල්" if h < 15 else "හවස" if h < 19 else "රෑ"
    return f"{part} {h % 12 or 12}:{m:02d}"


def _first_use(pid, day, label):
    """Earliest time an object was used that day (interaction log, then moments)."""
    rec = rm.INTERACTIONS.get(pid, {}).get(day, {}).get(f"object:{label}")
    times = [rec["first"]] if rec and rec.get("first") else []
    times += [m["time"] for m in rm.MOMENTS.get(pid, []) if m["time"].startswith(day)
              and any(o["label"] == label for o in m["objects"])]
    return min(times) if times else None


def routines(pid, days=14):
    today = datetime.date.today()
    dates = [(today - datetime.timedelta(days=i)).isoformat() for i in range(days, 0, -1)]
    labels = set()
    for m in rm.MOMENTS.get(pid, []):
        labels |= {o["label"] for o in m["objects"]}
    for recs in rm.INTERACTIONS.get(pid, {}).values():
        labels |= {r["ref"] for r in recs.values() if r["kind"] == "object"}
    level_avg = memory_quiz._level(pid)[1]
    grace = 15 if level_avg is not None and level_avg < 50 else 30   # weaker memory -> earlier reminder
    out = []
    for label in sorted(labels):
        use = memory_quiz.object_use(label) or {}
        if not use.get("did_si"):
            continue
        firsts = [(d, _first_use(pid, d, label)) for d in dates]
        seen = [(d, _mins(t)) for d, t in firsts if t]
        usual = statistics.median([m for _, m in seen]) if len(seen) >= 3 else None
        done_at = _first_use(pid, today.isoformat(), label)
        # Did the reminder help? (activity within an hour after it was given)
        history = []
        for d in dates[-5:]:
            given = (DELIVERED.get(pid, {}).get(d) or {}).get(f"routine:{label}")
            if given:
                used = _first_use(pid, d, label)
                ok = bool(used and 0 <= (datetime.datetime.fromisoformat(used) -
                                         datetime.datetime.fromisoformat(given)).total_seconds() <= 3600)
                history.append(ok)
        out.append({
            "id": f"routine:{label}", "label": label, "label_si": rm.si_name(label),
            "activity_si": use["did_si"], "activity_en": use.get("did_en", ""),
            "usual_min": usual, "usual_si": _clock_si(usual) if usual is not None else None,
            "days_seen": len(seen), "days": days, "learned": usual is not None,
            "remind_at_min": usual + grace if usual is not None else None, "grace": grace,
            "done_today": bool(done_at), "done_at": done_at,
            "reminded_today": f"routine:{label}" in (DELIVERED.get(pid, {}).get(today.isoformat()) or {}),
            "helped": sum(history), "reminded": len(history),
            "flag": len(history) >= 3 and history.count(False) >= 3,
        })
    return out


def _promise_date(p, conv_day):
    """'2026-10-17' if the LLM gave one, else the next weekday named in the promise."""
    if p.get("date"):
        try:
            return datetime.date.fromisoformat(p["date"][:10]).isoformat()
        except ValueError:
            pass
    text = f"{p.get('when_en', '')} {p.get('en', '')}".lower() + f" {p.get('when_si', '')} {p.get('si', '')}"
    base = datetime.date.fromisoformat(conv_day)
    if "tomorrow" in text or "හෙට" in text:
        return (base + datetime.timedelta(days=1)).isoformat()
    for i, (en, si) in enumerate(zip(DAYS_EN, DAYS_SI)):
        if en in text or si in text:
            ahead = (i - base.weekday()) % 7 or 7
            return (base + datetime.timedelta(days=ahead)).isoformat()
    return None


def visits(pid):
    by_id = {p["id"]: p for p in rm.PEOPLE.get(pid, [])}
    out, today = [], rm._today()
    for c in visit_talk.CONVERSATIONS.get(pid, []):
        p = by_id.get(c["person_id"])
        who = (f"ඔයාගේ {p['relation_si']}" + (f" {p['name']}" if p.get("name") and p["name"] != p["relation_si"] else "")) \
            if p else "ඔයාව බලන්න ආපු කෙනා"
        for i, pr in enumerate(c.get("promises") or []):
            day = _promise_date(pr, c["day"])
            if day and day >= today:
                out.append({"id": f"visit:{c['id']}:{i}", "date": day, "who_si": who, "promise_si": pr.get("si", ""),
                            "photo_url": (p or {}).get("photo_url"),
                            "say_si": f"සුභ උදෑසනක්! අද {who} ඔයාව බලන්න එනවා කිව්වා. {pr.get('si', '')}"})
    return sorted(out, key=lambda x: x["date"])


@router.get("/reminders/{patient_id}")
async def reminder_overview(patient_id: str):
    return {"status": "success", "routines": routines(patient_id), "visits": visits(patient_id)}


@router.get("/reminders/due/{patient_id}")
async def reminders_due(patient_id: str):
    """What should be said right now. Each reminder is given once a day; the app
    calls this every few minutes while open (the room camera is usually on)."""
    now = datetime.datetime.now()
    today = now.date().isoformat()
    given = DELIVERED.setdefault(patient_id, {}).setdefault(today, {})
    due = []
    for r in routines(patient_id):
        if r["learned"] and not r["done_today"] and r["id"] not in given \
                and now.hour * 60 + now.minute >= r["remind_at_min"]:
            due.append({"id": r["id"], "kind": "routine",
                        "say_si": f"පොඩි මතක් කිරීමක්. ඔයා සාමාන්‍යයෙන් {r['usual_si']}ට විතර {r['label_si']} පාවිච්චි "
                                  f"කරනවා. අද තවම මම ඒක දැක්කේ නැහැ. ඔයා අද {r['activity_si']}ද?",
                        "label": r["label"]})
    if now.hour >= 7:
        for v in visits(patient_id):
            if v["date"] == today and v["id"] not in given:
                due.append({"id": v["id"], "kind": "visit", "say_si": v["say_si"], "photo_url": v["photo_url"]})
    for d in due:
        given[d["id"]] = now.isoformat()
    if due:
        _save()
    return {"status": "success", "due": due}
