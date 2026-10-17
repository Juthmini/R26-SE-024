# -*- coding: utf-8 -*-
"""
ESP32-CAM real-time video for the remember-moments flow.

1. EspStream - one background reader per camera that keeps pulling the
   camera's MJPEG video (port 81 /stream, see hardware/esp32cam firmware) and
   always holds the newest frame. /detect-live then analyses that frame
   immediately instead of asking the camera for a new photo every time.

2. PassiveWorker - the "phone can be closed" mode the panel's comment points
   at: the server watches the ESP32 video all day by itself and applies the
   same rules as the app (30s engagement -> remember, no duplicates, instant
   recognition of registered family, unknown visitors flagged for the
   caregiver). It stands down whenever the app's live screen is open for that
   patient, so the two never act on the same moment.
"""
import os
import io
import json
import time
import threading
import datetime
from collections import deque
from urllib.parse import urlparse

import requests
from fastapi import APIRouter, Form

import remember_moments as rm

router = APIRouter()

CONFIG_FILE = "esp32_passive.json"
FRESH_S = 1.5             # a buffered frame older than this is treated as stale
MAX_FPS = 10              # passive analysis cap - plenty for 30s dwell logic
DWELL_S = 30
PERSON_DWELL_S = 30
QUICK_CHECK_S = 3
PERSON_GONE_S = 3
OBJECT_GONE_S = 2.5
RESAVE_COOLDOWN_S = 120
CLIENT_ACTIVE_S = 5
MIN_CONF = 0.5
FIXED = rm.FIXED_ANCHORS


def _host(ip_or_url):
    s = (ip_or_url or "").strip()
    if "://" in s:
        return urlparse(s).hostname
    return s.split("/")[0].split(":")[0]


# ─── Continuous MJPEG reader ─────────────────────────────────────────────────
class EspStream(threading.Thread):
    def __init__(self, host):
        super().__init__(daemon=True, name=f"esp32-stream-{host}")
        self.host = host
        self.url = f"http://{host}:81/stream"
        self.latest = None        # newest complete JPEG
        self.latest_at = 0.0
        self.frame_no = 0
        self.fps = 0.0
        self.error = ""
        self.connected = False
        self.last_used = time.time()
        self.alive = True

    def _idle(self):
        # Nobody has asked for frames for a while and no passive worker uses
        # this camera -> let go of it (an ESP32 serves only one stream at a time,
        # so holding it would block e.g. the browser live view).
        return time.time() - self.last_used > 120 and not _worker_on(self.host)

    def run(self):
        window = deque(maxlen=30)
        while self.alive:
            if self._idle():
                break
            try:
                with requests.get(self.url, stream=True, timeout=(5, 10)) as r:
                    r.raise_for_status()
                    self.connected, self.error = True, ""
                    buf = b""
                    for chunk in r.iter_content(chunk_size=8192):
                        if not self.alive:
                            break
                        buf += chunk
                        # Frames are plain JPEGs between multipart headers -
                        # cutting on the JPEG start/end markers is enough.
                        while True:
                            a = buf.find(b"\xff\xd8")
                            b = buf.find(b"\xff\xd9", a + 2) if a != -1 else -1
                            if a == -1 or b == -1:
                                break
                            self.latest = buf[a:b + 2]
                            buf = buf[b + 2:]
                            now = time.time()
                            self.latest_at = now
                            self.frame_no += 1
                            window.append(now)
                            if len(window) > 1:
                                self.fps = round((len(window) - 1) / (window[-1] - window[0]), 1)
                        if len(buf) > 3_000_000:
                            buf = b""
                        if self._idle():
                            self.alive = False
            except Exception as e:
                self.connected = False
                self.error = str(e)[:200]
                time.sleep(2)
        self.connected = False
        STREAMS.pop(self.host, None)

    def frame(self):
        self.last_used = time.time()
        if self.latest is not None and time.time() - self.latest_at < FRESH_S:
            return self.latest
        return None


STREAMS = {}
_streams_lock = threading.Lock()


def ensure_stream(host):
    with _streams_lock:
        s = STREAMS.get(host)
        if s is None or not s.is_alive():
            s = EspStream(host)
            STREAMS[host] = s
            s.start()
        return s


def latest_for_url(esp32_url):
    """Hook used by /detect-live: newest streamed frame, or None (caller then
    falls back to a single /capture while the stream is still starting)."""
    host = _host(esp32_url)
    if not host:
        return None
    return ensure_stream(host).frame()


rm._ctx["esp32_latest"] = latest_for_url


# ─── Passive worker ──────────────────────────────────────────────────────────
WORKERS = {}  # pid -> PassiveWorker


def _worker_on(host):
    return any(w.alive and w.host == host for w in WORKERS.values())


class PassiveWorker(threading.Thread):
    def __init__(self, pid, host, room):
        super().__init__(daemon=True, name=f"esp32-passive-{pid}")
        self.pid, self.host, self.room = pid, host, room or None
        self.alive = True
        self.state = "starting"
        self.frames = 0
        self.fps = 0.0
        self.started = datetime.datetime.now().isoformat()
        self.events = deque(maxlen=25)
        self.dwell = None          # {start, counts, frames, last_hit}
        self.visit = None          # {start, last_seen, checked_at, person_id, done, alerted}
        self.last_saved = {}       # label-set key -> epoch
        self.lost_since = None     # when the camera stopped answering
        self.last_search = 0.0

    def _maybe_rediscover(self, stream):
        """The hotspot hands out a new IP after a reconnect. If the camera has
        been unreachable for 30s, look for it again and follow it."""
        now = time.time()
        if self.lost_since is None:
            self.lost_since = now
            return stream
        if now - self.lost_since < 30 or now - self.last_search < 30:
            return stream
        self.last_search = now
        self.state = "camera lost - searching the network"
        cams, _ = discover()
        if cams and cams[0]["ip"] != self.host:
            self.host = cams[0]["ip"]
            self.log("rediscovered", f"Camera found again at {self.host}")
            _save_config()
            self.lost_since = None
            return ensure_stream(self.host)
        return stream

    def log(self, kind, text, photo=""):
        self.events.appendleft({"time": datetime.datetime.now().isoformat(), "kind": kind, "text": text, "photo_url": photo})

    def run(self):
        stream = ensure_stream(self.host)
        last_frame_no = -1
        window = deque(maxlen=30)
        while self.alive:
            now = time.time()
            if now - rm.LAST_CLIENT.get(self.pid, 0) < CLIENT_ACTIVE_S:
                self.state = "paused - app live screen is open"
                time.sleep(0.5)
                continue
            jpeg = stream.frame()
            if jpeg is None or stream.frame_no == last_frame_no:
                self.state = "waiting for camera" if not stream.connected else "running"
                if not stream.connected:
                    stream = self._maybe_rediscover(stream)
                time.sleep(0.05)
                continue
            self.lost_since = None
            last_frame_no = stream.frame_no
            self.state = "running"
            try:
                img, small = rm._prepare(jpeg)
                dets = rm._detect(img)
                rm._remember_frame(self.pid, small, dets)
                self.frames += 1
                window.append(now)
                if len(window) > 1:
                    self.fps = round((len(window) - 1) / (window[-1] - window[0] + 1e-6), 1)
                self._people(dets, now)
                self._objects(dets, now)
            except Exception as e:
                self.state = f"error: {str(e)[:120]}"
                time.sleep(1)
            spare = (1.0 / MAX_FPS) - (time.time() - now)
            if spare > 0:
                time.sleep(spare)
        self.state = "stopped"

    # Same 30-second engagement rule the app uses.
    def _objects(self, dets, now):
        movable = [d for d in dets if d["confidence"] >= MIN_CONF and d["label"] != "person" and d["label"] not in FIXED]
        labels = {d["label"] for d in movable}
        d = self.dwell
        if labels and d and labels & set(d["counts"]):
            d["last_hit"] = now
        elif labels and not d:
            d = self.dwell = {"start": now, "counts": {}, "frames": 0, "last_hit": now}
        elif d and now - d["last_hit"] > OBJECT_GONE_S:
            d = self.dwell = ({"start": now, "counts": {}, "frames": 0, "last_hit": now} if labels else None)
        if not d or not labels:
            return
        d["frames"] += 1
        for l in labels:
            d["counts"][l] = d["counts"].get(l, 0) + 1
        if now - d["start"] < DWELL_S:
            return
        steady = sorted(l for l, c in d["counts"].items() if c >= max(1, d["frames"] * 0.4))
        self.dwell = None
        if not steady:
            return
        key = "|".join(steady)
        if now - self.last_saved.get(key, 0) < RESAVE_COOLDOWN_S:
            return
        self.last_saved[key] = now
        res = rm.save_moment_core(self.pid, json.dumps(steady), room=self.room, source="esp32-passive", dwell_seconds=DWELL_S)
        if res.get("result") == "saved":
            self.log("saved", res.get("say_si", ""), (res.get("moment") or {}).get("photo_urls", [""])[0])

    # Instant recognition of registered family; unknown visitors are flagged
    # to the caregiver after 30s (nobody is there to answer "who is this?").
    def _people(self, dets, now):
        person = next((d for d in dets if d["label"] == "person" and d["confidence"] >= 0.6
                       and (d["box"][2] - d["box"][0]) * (d["box"][3] - d["box"][1]) >= 0.06), None)
        v = self.visit
        if person:
            if v is None:
                v = self.visit = {"start": now, "last_seen": now, "checked_at": 0, "person_id": None,
                                  "name": "", "done": False, "alerted": False}
            v["last_seen"] = now
            if not v["done"] and now - v["checked_at"] > QUICK_CHECK_S:
                v["checked_at"] = now
                r = rm.identify_core(self.pid, ask=False)
                if r["status"] == "known":
                    v.update(done=True, person_id=r["person"]["id"], name=r["person"]["relation_si"])
                    self.log("known_person", r["say_si"], r["person"].get("photo_url", ""))
                elif r["status"] == "pending_known":
                    v["done"] = True
                    self.log("pending_person", r["say_si"], r["person"].get("photo_url", ""))
                elif r["status"] == "unknown_silent" and now - v["start"] >= PERSON_DWELL_S and not v["alerted"]:
                    v.update(done=True, alerted=True)
                    self._unknown_visitor()
        elif v and now - v["last_seen"] > PERSON_GONE_S:
            if v["person_id"]:
                rm._add_interaction(self.pid, "person", v["person_id"], v["name"], v["last_seen"] - v["start"])
                rm._save()
            self.visit = None

    def _unknown_visitor(self):
        frames = [fr for fr in rm.LIVE_FRAMES.get(self.pid, []) if any(d["label"] == "person" for d in fr["detections"])]
        photo = rm._upload(frames[-1]["jpeg"], "memocare_alerts") if frames else ""
        rm.FAMILY_ALERTS.setdefault(self.pid, []).append({
            "id": f"al-{os.urandom(4).hex()}", "kind": "unknown_visitor", "claimed_si": "", "photo_url": photo,
            "time": datetime.datetime.now().isoformat(), "seen": False,
            "said": f"{self.room or 'ESP32'} camera - stayed 30s+",
        })
        rm._save()
        self.log("unknown_visitor", "නොදන්නා කෙනෙක් තත්පර 30කට වඩා හිටියා - caregiver ට දැනුම් දුන්නා.", photo)

    def status(self):
        return {"running": self.alive, "ip": self.host, "room": self.room, "state": self.state,
                "fps": self.fps, "frames": self.frames, "started": self.started, "events": list(self.events)}


def _load_config():
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save_config():
    cfg = {pid: {"ip": w.host, "room": w.room} for pid, w in WORKERS.items() if w.alive}
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f)


def start_worker(pid, ip, room=None):
    stop_worker(pid, persist=False)
    w = PassiveWorker(pid, _host(ip), room)
    WORKERS[pid] = w
    w.start()
    _save_config()
    return w


def stop_worker(pid, persist=True):
    w = WORKERS.pop(pid, None)
    if w:
        w.alive = False
    if persist:
        _save_config()


# Resume passive cameras after a server restart.
for _pid, _cfg in _load_config().items():
    try:
        start_worker(_pid, _cfg["ip"], _cfg.get("room"))
    except Exception as _e:
        print("could not resume ESP32 passive worker:", _e)


# ─── Auto-discovery (nobody should have to type an IP address) ───────────────
import socket
from concurrent.futures import ThreadPoolExecutor

MDNS_NAME = "memocare-cam.local"  # advertised by the firmware


def _laptop_ip():
    # The address this machine uses to reach the network (no packet is sent).
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return None
    finally:
        s.close()


def _is_memocare_cam(ip):
    try:
        r = requests.get(f"http://{ip}/status", timeout=0.8)
        d = r.json()
        if d.get("device") == "memocare-cam":
            return {"ip": ip, "rssi": d.get("rssi"), "uptime_s": d.get("uptime_s")}
    except Exception:
        pass
    return None


def discover():
    """Find MemoCare cameras on the laptop's network: mDNS name first, then a
    parallel sweep of the subnet (an iPhone hotspot is only 172.20.10.1-14,
    so that takes about a second)."""
    found = {}
    try:
        ip = socket.gethostbyname(MDNS_NAME)
        hit = _is_memocare_cam(ip)
        if hit:
            found[ip] = hit
    except Exception:
        pass

    me = _laptop_ip()
    if me:
        a, b, c, _ = me.split(".")
        hosts = range(1, 15) if (a, b, c) == ("172", "20", "10") else range(1, 255)
        candidates = [f"{a}.{b}.{c}.{h}" for h in hosts if f"{a}.{b}.{c}.{h}" != me]
        with ThreadPoolExecutor(max_workers=64) as pool:
            for hit in pool.map(_is_memocare_cam, candidates):
                if hit:
                    found[hit["ip"]] = hit
    # Strongest signal first - that's the one nearest the laptop/hotspot.
    return sorted(found.values(), key=lambda h: -(h.get("rssi") or -100)), me


# ─── Endpoints ───────────────────────────────────────────────────────────────
@router.get("/esp32/discover")
async def esp32_discover():
    cams, me = discover()
    return {"status": "success", "cameras": cams, "laptop_ip": me}


@router.get("/esp32/snapshot")
async def esp32_snapshot(ip: str):
    """Latest frame as an image, for the app's live preview (the phone can't
    open the camera's stream directly as easily as an <Image> can load this)."""
    from fastapi.responses import Response
    host = _host(ip)
    jpeg = ensure_stream(host).frame()
    if jpeg is None:
        try:
            r = requests.get(f"http://{host}/capture", timeout=5)
            jpeg = r.content if r.ok else None
        except Exception:
            jpeg = None
    if jpeg is None:
        return Response(status_code=503)
    return Response(content=jpeg, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


@router.get("/esp32/probe")
async def probe(ip: str):
    """Is the camera reachable, and how fast does its live video arrive?"""
    host = _host(ip)
    out = {"ip": host, "capture_ok": False, "stream_ok": False, "stream_fps": 0.0}
    try:
        r = requests.get(f"http://{host}/capture", timeout=5)
        out["capture_ok"] = r.ok and r.content[:2] == b"\xff\xd8"
        out["frame_kb"] = round(len(r.content) / 1024, 1)
    except Exception as e:
        out["capture_error"] = str(e)[:150]
    s = ensure_stream(host)
    for _ in range(30):  # up to 3s for the stream to start and settle
        time.sleep(0.1)
        if s.frame_no > 8:
            break
    out["stream_ok"] = s.connected and s.latest is not None
    out["stream_fps"] = s.fps
    if s.error:
        out["stream_error"] = s.error
    return {"status": "success", **out}


@router.post("/esp32/passive/start")
async def passive_start(patient_id: str = Form(...), ip: str = Form(...), room: str = Form("")):
    w = start_worker(patient_id, ip, room)
    return {"status": "success", "passive": w.status()}


@router.post("/esp32/passive/stop")
async def passive_stop(patient_id: str = Form(...)):
    stop_worker(patient_id)
    return {"status": "success"}


@router.get("/esp32/status/{patient_id}")
async def esp32_status(patient_id: str):
    w = WORKERS.get(patient_id)
    passive = w.status() if w else {"running": False}
    stream = None
    if w and w.host in STREAMS:
        s = STREAMS[w.host]
        stream = {"ip": s.host, "connected": s.connected, "fps": s.fps, "error": s.error}
    return {"status": "success", "passive": passive, "stream": stream}
