# -*- coding: utf-8 -*-
"""
Video diary ("වීඩියෝ දින සටහන") built from the patient's real day.

Scenes, in order:
  1. Title card - day and date (time orientation)
  2. Each remembered moment - its photo, time, room and things (repeats merged)
  3. Each visitor - photo, how long they stayed, what was talked about
     (summary only, consent-based; visit_talk.py) and any promise ("ඉරිදා එනවා")
  4. Tonight's memory game - stars earned, if played
  5. Closing card - good night

Narration: the evening story, read by the neural Sinhala voice. Every scene is
drawn as a small HTML page and photographed by headless Chrome, because Pillow
here cannot shape Sinhala letters correctly (no raqm); ffmpeg then adds a slow
zoom to each card and joins them under the narration.
"""
import os
import html
import uuid
import shutil
import datetime
import subprocess

import imageio_ffmpeg
from fastapi import APIRouter

import remember_moments as rm
import visit_talk
import memory_quiz

router = APIRouter()

VIDEO_DIR = "videos"
os.makedirs(VIDEO_DIR, exist_ok=True)
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
W, H, FPS = 1280, 720, 25
CHROME_CANDIDATES = [
    os.environ.get("CHROME_PATH", ""),
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
]
VIDEOS = {}  # (pid, day) -> url of the latest render

MONTHS_SI = ["ජනවාරි", "පෙබරවාරි", "මාර්තු", "අප්‍රේල්", "මැයි", "ජූනි", "ජූලි", "අගෝස්තු",
             "සැප්තැම්බර්", "ඔක්තෝබර්", "නොවැම්බර්", "දෙසැම්බර්"]


def _chrome():
    return next((c for c in CHROME_CANDIDATES if c and os.path.exists(c)), None)


CSS = """
*{margin:0;box-sizing:border-box}
body{width:1280px;height:720px;overflow:hidden;font-family:'Nirmala UI','Iskoola Pota','Noto Sans Sinhala',sans-serif;
  background:#13251F;color:#fff}
.photo{position:absolute;inset:0;background-size:cover;background-position:center}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(10,20,18,.88) 100%)}
.cap{position:absolute;left:64px;right:64px;bottom:56px}
.when{display:inline-block;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.3);border-radius:18px;
  padding:8px 18px;font-size:28px;font-weight:700;margin-bottom:16px}
.big{font-size:54px;font-weight:800;line-height:1.25;text-shadow:0 2px 12px rgba(0,0,0,.45)}
.small{font-size:30px;line-height:1.5;color:#E2E8F0;margin-top:12px}
.card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;
  background:radial-gradient(circle at 30% 20%,#2A6F6A 0%,#13251F 70%)}
.card .big{font-size:64px}
.card .small{font-size:34px}
.face{width:300px;height:300px;border-radius:50%;object-fit:cover;border:8px solid #fff;box-shadow:0 10px 40px rgba(0,0,0,.4)}
.row{display:flex;gap:60px;align-items:center;padding:0 90px;text-align:left}
.chip{display:inline-block;margin:14px 10px 0 0;background:#FBEFD9;color:#7A4E0E;border-radius:16px;padding:8px 18px;font-size:26px;font-weight:700}
.stars{font-size:80px;letter-spacing:8px}
"""


def _page(body):
    return f"<!doctype html><html><head><meta charset='utf-8'><style>{CSS}</style></head><body>{body}</body></html>"


def _e(t):
    return html.escape(str(t or ""))


def _scenes(pid, day):
    d = datetime.date.fromisoformat(day)
    day_si = memory_quiz.DAYS_SI[d.weekday()]
    head = "🌙 අද ඔයාගේ දවස" if day == rm._today() else "🌙 ඔයාගේ දවස"
    scenes = [_page(f"<div class='card'><div class='small'>{head}</div>"
                    f"<div class='big'>{day_si}</div><div class='small'>{MONTHS_SI[d.month - 1]} {d.day}, {d.year}</div></div>")]

    last_key = None
    for m in [m for m in rm.MOMENTS.get(pid, []) if m["time"].startswith(day)]:
        objs = [o for o in m["objects"] if o["label"] not in rm.FIXED_ANCHORS] or m["objects"]
        key = (tuple(sorted(o["label"] for o in objs)), m.get("room"))
        if key == last_key or not m.get("photo_urls"):
            continue
        last_key = key
        things = ", ".join(o["label_si"] for o in objs)
        when = rm.si_time(m["time"])
        if when.split(" ")[0] in ("අද", "ඊයේ"):
            when = when.split(" ", 1)[1]  # the video already shows the date - just the time of day
        where = f" · {m['room_si']}" if m.get("room_si") else ""
        scenes.append(_page(f"<div class='photo' style=\"background-image:url('{_e(m['photo_urls'][0])}')\"></div>"
                            f"<div class='shade'></div><div class='cap'><div class='when'>🕒 {_e(when)}{_e(where)}</div>"
                            f"<div class='big'>{_e(things)}</div></div>"))

    inter = rm.INTERACTIONS.get(pid, {}).get(day, {})
    by_id = {p["id"]: p for p in rm.PEOPLE.get(pid, [])}
    talks = {c["person_id"]: c for c in visit_talk.for_day(pid, day)}
    for rec in inter.values():
        p = by_id.get(rec["ref"]) if rec["kind"] == "person" else None
        if not p:
            continue
        name = p["name"] if p.get("name") and p["name"] != p["relation_si"] else ""
        mins = rm._minutes(rec["seconds"]) if rec.get("seconds") else 0
        c = talks.get(p["id"])
        said = f"<div class='small'>💬 {_e(c['summary_si'])}</div>" if c else ""
        chips = "".join(f"<span class='chip'>📅 {_e(pr['si'])}</span>" for pr in (c or {}).get("promises", []))
        face = f"<img class='face' src='{_e(p['photo_url'])}'>" if p.get("photo_url") else ""
        scenes.append(_page(f"<div class='card'><div class='row'>{face}<div><div class='small'>👋 ඔයාව බලන්න ආවා</div>"
                            f"<div class='big'>ඔයාගේ {_e(p['relation_si'])} {_e(name)}</div>"
                            f"<div class='small'>{'විනාඩි ' + str(mins) + 'ක් ඔයා එක්ක හිටියා' if mins > 1 else ''}</div>"
                            f"{said}<div>{chips}</div></div></div></div>"))

    games = [s for s in memory_quiz._finished(pid) if s["day"] == day]
    if games:
        g = games[-1]
        n = round(5 * g["stars"] / max(1, g["max_stars"]))
        scenes.append(_page(f"<div class='card'><div class='small'>🦉 අද මතක සෙල්ලම</div>"
                            f"<div class='stars'>{'⭐' * n}{'☆' * (5 - n)}</div>"
                            f"<div class='big'>තරු {g['stars']} / {g['max_stars']}</div></div>"))

    scenes.append(_page("<div class='card'><div class='big'>සුභ රාත්‍රියක්! 🌙</div>"
                        "<div class='small'>හෙටත් අපි එකට ලස්සන දවසක් ගත කරමු.</div></div>"))
    return scenes


def _render_cards(pages, work):
    chrome = _chrome()
    if not chrome:
        raise RuntimeError("Chrome/Edge not found to draw the Sinhala cards (set CHROME_PATH)")
    paths = []
    for i, page in enumerate(pages):
        hp = os.path.abspath(os.path.join(work, f"s{i}.html"))
        png = os.path.abspath(os.path.join(work, f"s{i}.png"))
        with open(hp, "w", encoding="utf-8") as f:
            f.write(page)
        subprocess.run([chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--window-size={W},{H}",
                        "--virtual-time-budget=8000", f"--screenshot={png}", "file:///" + hp.replace("\\", "/")],
                       capture_output=True, timeout=60)
        if os.path.exists(png):
            paths.append(png)
    return paths


def _duration(path):
    out = subprocess.run([FFMPEG, "-i", path], capture_output=True, text=True).stderr
    for line in out.splitlines():
        if "Duration:" in line:
            h, m, s = line.split("Duration:")[1].split(",")[0].strip().split(":")
            return int(h) * 3600 + int(m) * 60 + float(s)
    return 30.0


async def build_video(pid, day):
    story = rm.STORIES.get(pid, {}).get(day, {}).get("si") or rm.build_story(pid, day, "si")
    if not story:
        return None, "Nothing was remembered on this day yet"
    work = f"video_tmp_{uuid.uuid4().hex[:8]}"
    os.makedirs(work, exist_ok=True)
    try:
        cards = _render_cards(_scenes(pid, day), work)
        if not cards:
            return None, "Could not draw the video cards"
        narration = os.path.join(work, "story.mp3")
        text = f"{story.get('title', '')}. {story['story']}".strip(". ")
        await rm.synthesize(text, "si", narration)
        total = _duration(narration) + 1.5
        each = max(3.0, total / len(cards))
        frames = int(each * FPS)

        inputs, filters = [], []
        for i, c in enumerate(cards):
            inputs += ["-i", c]  # one still frame; zoompan turns it into `frames` frames
            # slow Ken Burns zoom + short fade between scenes
            filters.append(f"[{i}:v]scale={W * 2}:{H * 2},zoompan=z='min(zoom+0.0007,1.08)':d={frames}:"
                           f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={W}x{H}:fps={FPS},"
                           f"fade=t=in:st=0:d=0.5,fade=t=out:st={each - 0.5:.2f}:d=0.5,setsar=1[v{i}]")
        concat = "".join(f"[v{i}]" for i in range(len(cards))) + f"concat=n={len(cards)}:v=1:a=0[vout]"
        name = f"story_{pid}_{day}_{uuid.uuid4().hex[:6]}.mp4"
        out = os.path.join(VIDEO_DIR, name)
        cmd = [FFMPEG, "-y", *inputs, "-i", narration,
               "-filter_complex", ";".join(filters + [concat]),
               "-map", "[vout]", "-map", f"{len(cards)}:a", "-c:v", "libx264", "-preset", "veryfast",
               "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-shortest", out]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if proc.returncode != 0:
            return None, f"Video rendering failed: {proc.stderr[-400:]}"
        return f"/videos/{name}", None
    finally:
        shutil.rmtree(work, ignore_errors=True)


@router.get("/memory-video/{patient_id}")
async def memory_video(patient_id: str, date: str = "", refresh: bool = False):
    day = date or rm._today()
    key = f"{patient_id}|{day}"
    if VIDEOS.get(key) and not refresh and os.path.exists(VIDEOS[key].lstrip("/")):
        return {"status": "success", "video_url": VIDEOS[key], "cached": True}
    url, err = await build_video(patient_id, day)
    if not url:
        return {"status": "error", "message": err}
    VIDEOS[key] = url
    return {"status": "success", "video_url": url, "cached": False}
