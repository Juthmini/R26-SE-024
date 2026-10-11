import os
import json
import numpy as np
import pandas as pd
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ultralytics import YOLO
import shutil
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics.pairwise import cosine_similarity
import joblib

import cloudinary
import cloudinary.uploader
import cloudinary.api

cloudinary.config(
  cloud_name = "dc1x4qpjp",
  api_key = "223333656458116",
  api_secret = "eJgs0d77ubYRTTZgK_G6Y62Ic2U"
)

from PIL import Image
import torch
from torchvision import transforms


from PIL import Image
import torch
import torchvision.transforms as T
from torchvision.models import mobilenet_v2, MobileNet_V2_Weights
import torch.nn.functional as F
import numpy as np

# Load models once
try:
    from facenet_pytorch import MTCNN, InceptionResnetV1
    mtcnn = MTCNN(image_size=160, margin=0, keep_all=False)
    face_resnet = InceptionResnetV1(pretrained='vggface2').eval()
    FACENET_AVAILABLE = True
except:
    FACENET_AVAILABLE = False

# Load MobileNet for Object Embeddings
mobilenet = mobilenet_v2(weights=MobileNet_V2_Weights.IMAGENET1K_V1)
# Remove the last classification layer to get feature embeddings
mobilenet.classifier = torch.nn.Identity()
mobilenet.eval()

def extract_face_embedding(img_path):
    img = Image.open(img_path).convert('RGB')
    face_tensor = mtcnn(img)
    if face_tensor is not None:
        emb = face_resnet(face_tensor.unsqueeze(0))
        return emb.detach().numpy()[0].tolist()
    return None

def extract_object_embedding(img_path):
    img = Image.open(img_path).convert('RGB')
    transform = T.Compose([
        T.Resize(256),
        T.CenterCrop(224),
        T.ToTensor(),
        T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    input_tensor = transform(img).unsqueeze(0)
    with torch.no_grad():
        emb = mobilenet(input_tensor)
        emb = F.normalize(emb, p=2, dim=1) # L2 normalize
    return emb.numpy()[0].tolist()


from fastapi.staticfiles import StaticFiles

app = FastAPI()

import os
if not os.path.exists("uploads"):
    os.makedirs("uploads")
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

if not os.path.exists("videos"):
    os.makedirs("videos")
app.mount("/videos", StaticFiles(directory="videos"), name="videos")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

model = YOLO('yolov8n.pt')

MODELS_DIR = "behavior_models"
os.makedirs(MODELS_DIR, exist_ok=True)

# ─── Schemas ──────────────────────────────────────────────────────
class BehaviorLog(BaseModel):
    patientId: str
    activity: str
    timestamp: str

class BehaviorLogEntry(BaseModel):
    hour: int
    dayOfWeek: int
    activity: str
    duration: float = 0

class TrainRequest(BaseModel):
    patientId: str
    logs: list[BehaviorLogEntry]

class AlertRequest(BaseModel):
    patientId: str
    hour: int
    dayOfWeek: int
    patientName: str = "Patient"

class MatchRequest(BaseModel):
    target_embedding: list[float]
    known_patients: list[dict]

# ─── Activity Labels ──────────────────────────────────────────────
ACTIVITIES = ['eating', 'sleeping', 'walking', 'wandering', 'sitting',
              'medication', 'bathing', 'exercise', 'socializing', 'other']

# ─── Activity Alert Templates (natural language, patient name injected) ───────
def build_alert_message(name: str, activity: str, hour: int) -> str:
    period = "morning" if hour < 12 else ("afternoon" if hour < 17 else "evening")
    templates = {
        'eating':      f"{name}, it's {period} meal time. Please come to the dining area.",
        'sleeping':    f"{name}, it's time to rest now. Let's get you to bed.",
        'medication':  f"{name}, it's time for your {period} medication. Please take your pills.",
        'walking':     f"{name}, time for your {period} walk. A short walk will do you good.",
        'bathing':     f"{name}, it's bath time. Let's get you freshened up.",
        'exercise':    f"{name}, time for your {period} exercises. Let's keep moving.",
        'socializing': f"{name}, it's a good time to spend with family or friends.",
        'sitting':     f"{name}, take a comfortable seat and relax for a while.",
        'wandering':   f"{name}, please stay in a safe area. Your caregiver has been notified.",
    }
    return templates.get(activity.lower(), f"{name}, it's time for {activity}.")


# --- Memory Vault & Device Pairing Globals ---
ACTIVE_CAMERAS = {}  # Format: {"CAM-001": "PAT-2026-003"}
MEMORY_VAULT = {}    # Format: {"PAT-2026-003": [{"object": "bottle", "time": "10:30 AM", "type": "Object", ...}]}
OBJECT_FREQUENCIES = {} # Tracks how many times an object was seen
TRAINED_OBJECTS = {}    # Maps generic YOLO names to patient's custom names (e.g., "bottle" -> "My Water Bottle")
PATIENTS_DB = {}
ROUTINES_DB = {}
GEOFENCE_DB = {} # Format: {"PAT-2026-003": {"lat": 6.89, "lng": 79.85, "threshold": 50}}

# --- Memory Scrapbook / Daily Diary Globals ---
# Raw history logs (every ping/event, unfiltered) - the diary generator reads
# these and scores/filters them down; nothing here is shown to the patient
# directly.
LOCATION_HISTORY = {}  # {"PAT-...": [{"lat":, "lng":, "time": iso string}, ...]}
BEHAVIOR_HISTORY = {}  # {"PAT-...": [{"activity":, "time_of_day":, "is_anomaly":, "message":, "time": iso string}, ...]}
# Unified diary-candidate event log. Every event here already has a photo or
# a concrete patient interaction attached, so these are what the event-scoring
# step actually ranks (location/behavior history above is the noisy raw feed;
# this is the pre-filtered "interesting things happened" feed).
DIARY_EVENTS = {}      # {"PAT-...": [{"event":, "detail":, "photo_url":, "time": iso string, "channel": "diary"|"caregiver_alert"}, ...]}

import json
import os

DB_FILE = "vault_db.json"
GLOBAL_OWNERSHIP = {} # Maps "bottle" -> {"owner_id": "PAT-2026-001", "custom_name": "Pasindu's Bottle"}

def load_db():
    global MEMORY_VAULT, OBJECT_FREQUENCIES, TRAINED_OBJECTS, ACTIVE_CAMERAS, GLOBAL_OWNERSHIP, PATIENTS_DB, ROUTINES_DB, GEOFENCE_DB
    global LOCATION_HISTORY, BEHAVIOR_HISTORY, DIARY_EVENTS
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, "r") as f:
                data = json.load(f)
                MEMORY_VAULT = data.get("MEMORY_VAULT", {})
                OBJECT_FREQUENCIES = data.get("OBJECT_FREQUENCIES", {})
                TRAINED_OBJECTS = data.get("TRAINED_OBJECTS", {})
                ACTIVE_CAMERAS = data.get("ACTIVE_CAMERAS", {})
                GLOBAL_OWNERSHIP = data.get("GLOBAL_OWNERSHIP", {})
                PATIENTS_DB = data.get("PATIENTS_DB", {})
                ROUTINES_DB = data.get("ROUTINES_DB", {})
                GEOFENCE_DB = data.get("GEOFENCE_DB", {})
                LOCATION_HISTORY = data.get("LOCATION_HISTORY", {})
                BEHAVIOR_HISTORY = data.get("BEHAVIOR_HISTORY", {})
                DIARY_EVENTS = data.get("DIARY_EVENTS", {})
        except Exception as e:
            print("Could not load DB:", e)

def save_db():
    with open(DB_FILE, "w") as f:
        json.dump({
            "MEMORY_VAULT": MEMORY_VAULT,
            "OBJECT_FREQUENCIES": OBJECT_FREQUENCIES,
            "TRAINED_OBJECTS": TRAINED_OBJECTS,
            "ACTIVE_CAMERAS": ACTIVE_CAMERAS,
            "GLOBAL_OWNERSHIP": GLOBAL_OWNERSHIP,
            "PATIENTS_DB": PATIENTS_DB,
            "ROUTINES_DB": ROUTINES_DB,
            "GEOFENCE_DB": GEOFENCE_DB,
            "LOCATION_HISTORY": LOCATION_HISTORY,
            "BEHAVIOR_HISTORY": BEHAVIOR_HISTORY,
            "DIARY_EVENTS": DIARY_EVENTS
        }, f)

load_db()

def log_diary_event(patient_id, event, detail="", photo_url="", channel="diary"):
    """Append one candidate event for the daily diary (or a caregiver-only
    alert, via channel="caregiver_alert"). Called from wherever something
    diary-worthy happens - object found, anomaly detected, etc. - instead of
    patient activity being logged only as a side-effect of other endpoints.
    """
    if patient_id not in DIARY_EVENTS:
        DIARY_EVENTS[patient_id] = []
    DIARY_EVENTS[patient_id].append({
        "event": event,
        "detail": detail,
        "photo_url": photo_url,
        "time": datetime.datetime.now().isoformat(),
        "channel": channel,
    })

# Context-Aware AI: Misplaced Object Logic loaded from CSV
EXPECTED_LOCATIONS = {}
try:
    locations_df = pd.read_csv("dataset/expected_locations.csv")
    for _, row in locations_df.iterrows():
        EXPECTED_LOCATIONS[row['object_name']] = row['expected_location']
except Exception as e:
    print(f"Warning: Could not load dataset/expected_locations.csv - {e}")

import datetime
from fastapi import Form, File, UploadFile
from pydantic import BaseModel
import shutil
import os

class PairRequest(BaseModel):
    device_id: str
    patient_id: str

class TrainRequest(BaseModel):
    patient_id: str
    original_object: str
    custom_name: str

@app.post("/train-object")
async def train_object(req: TrainRequest):
    if req.patient_id not in TRAINED_OBJECTS:
        TRAINED_OBJECTS[req.patient_id] = {}
    
    TRAINED_OBJECTS[req.patient_id][req.original_object] = req.custom_name
    
    # Global Ownership Lock
    GLOBAL_OWNERSHIP[req.original_object] = {
        "owner_id": req.patient_id,
        "custom_name": req.custom_name
    }
    
    # Update existing vault items retroactively
    if req.patient_id in MEMORY_VAULT:
        for item in MEMORY_VAULT[req.patient_id]:
            if item["original_object"] == req.original_object:
                item["object"] = req.custom_name
                item["is_favorite"] = True
                item["type"] = "Favorite"
                
    save_db() # Persist the new trained names

    return {"status": "success", "message": f"Trained {req.original_object} as {req.custom_name}"}

@app.post("/pair-camera")
async def pair_camera(req: PairRequest):
    ACTIVE_CAMERAS[req.device_id] = req.patient_id
    if req.patient_id not in MEMORY_VAULT:
        MEMORY_VAULT[req.patient_id] = []
    save_db() # Persist the pairing
    return {"status": "success", "message": f"Camera {req.device_id} linked to {req.patient_id}"}

@app.post("/disconnect-camera")
async def disconnect_camera(req: PairRequest):
    if req.device_id in ACTIVE_CAMERAS:
        del ACTIVE_CAMERAS[req.device_id]
        save_db() # Persist the unpairing
    return {"status": "success", "message": f"Camera {req.device_id} disconnected successfully"}

class StrangerAlert(BaseModel):
    patient_id: str
    image_url: str

@app.post("/alert-stranger")
async def alert_stranger(req: StrangerAlert):
    # In a real system, this sends an SMS or Push Notification via Node Backend
    print(f"🚨 STRANGER ALERT! Patient {req.patient_id} saw unknown person at {req.image_url}")
    return {"status": "success", "message": "Caregiver notified!"}

# --- Background Location Sync ---
PATIENT_LOCATIONS = {}

class LocationUpdate(BaseModel):
    patient_id: str
    lat: float
    lng: float

@app.post("/update-location")
async def update_location(req: LocationUpdate):
    import datetime
    now = datetime.datetime.now().isoformat()
    PATIENT_LOCATIONS[req.patient_id] = {
        "lat": req.lat,
        "lng": req.lng,
        "last_updated": now
    }

    # Keep the raw ping history too (PATIENT_LOCATIONS above is overwritten
    # every call and only ever holds "right now" - the diary generator needs
    # the whole day's pings to find where the patient actually stopped).
    if req.patient_id not in LOCATION_HISTORY:
        LOCATION_HISTORY[req.patient_id] = []
    LOCATION_HISTORY[req.patient_id].append({"lat": req.lat, "lng": req.lng, "time": now})
    # Cap history so this stays memory/disk-safe on a long-running patient.
    LOCATION_HISTORY[req.patient_id] = LOCATION_HISTORY[req.patient_id][-2000:]
    save_db()

    return {"status": "success"}

import math
def calculate_distance(lat1, lon1, lat2, lon2):
    R = 6371000
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)
    a = math.sin(dLat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dLon/2)**2
    return R * (2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))

@app.get("/admin/realtime-locations")
async def get_realtime_locations():
    results = []
    # Combine data from PATIENTS_DB (optional, but we use keys from GEOFENCE or LOCATIONS)
    # We will iterate over GEOFENCE_DB to see who is being monitored
    for pid, geo in GEOFENCE_DB.items():
        current_loc = PATIENT_LOCATIONS.get(pid)
        is_safe = True
        distance = 0
        if current_loc:
            distance = calculate_distance(geo["lat"], geo["lng"], current_loc["lat"], current_loc["lng"])
            is_safe = distance <= geo["threshold"]
        else:
            # Fallback for presentation: scatter them slightly around home if app hasn't pinged yet
            distance = 0
            is_safe = True
            
        # create a deterministic offset based on patient id so they are scattered nicely in the safe zone
        offset_lat = (hash(pid) % 100 - 50) * 0.00008
        offset_lng = (hash(pid[::-1]) % 100 - 50) * 0.00008
            
        results.append({
            "patientId": pid,
            "home_lat": geo["lat"],
            "home_lng": geo["lng"],
            "threshold": geo["threshold"],
            "current_lat": current_loc["lat"] if current_loc else geo["lat"] + offset_lat,
            "current_lng": current_loc["lng"] if current_loc else geo["lng"] + offset_lng,
            "distance": distance,
            "is_safe": is_safe,
            "last_updated": current_loc["last_updated"] if current_loc else "Offline (At Home)"
        })
    return {"status": "success", "data": results}


class GeofenceUpdateRequest(BaseModel):
    patient_ids: list[str]
    lat: float
    lng: float
    threshold: int

@app.post("/admin/geofence/update")
async def bulk_update_geofence(req: GeofenceUpdateRequest):
    for pid in req.patient_ids:
        GEOFENCE_DB[pid] = {
            "lat": req.lat,
            "lng": req.lng,
            "threshold": req.threshold
        }
    save_db()
    return {"status": "success", "message": f"Updated geofence for {len(req.patient_ids)} patients"}

@app.get("/geofence/{patient_id}")
async def get_geofence(patient_id: str):
    if patient_id in GEOFENCE_DB:
        return {"status": "success", "geofence": GEOFENCE_DB[patient_id]}
    return {"status": "not_found", "message": "No geofence configured"}

@app.get("/find-object/{patient_id}")
async def find_object(patient_id: str, q: str = ""):
    if patient_id not in MEMORY_VAULT:
        return {"status": "error", "message": "No memory vault for this patient."}
    
    # Enhanced search: search custom object name OR the original YOLO name
    results = [
        item for item in MEMORY_VAULT[patient_id] 
        if q.lower() in item.get("object", "").lower() or q.lower() in item.get("original_object", "").lower()
    ]
    if results:
        # Sort by latest time (since it's a sequential append, the last one is the latest)
        return {"status": "success", "found": True, "object": results[-1]}
    return {"status": "success", "found": False}

@app.get("/vault/{patient_id}")
async def get_vault(patient_id: str):
    return {"status": "success", "vault": MEMORY_VAULT.get(patient_id, [])}

@app.delete("/vault/{patient_id}/{item_id}")
async def delete_vault_item(patient_id: str, item_id: str):
    if patient_id in MEMORY_VAULT:
        MEMORY_VAULT[patient_id] = [item for item in MEMORY_VAULT[patient_id] if item.get("id") != item_id]
        save_db()
        return {"status": "success", "message": "Item deleted"}
    return {"status": "error", "message": "Patient not found"}

# ─── Object Detection (alias: /detect for mobile) ─────────────────────────────
@app.post("/detect")
@app.post("/detect-objects")
async def detect_objects(file: UploadFile = File(...), deviceId: str = Form(None), lat: float = Form(None), lng: float = Form(None)):
    temp_path = f"temp_{file.filename or 'scan.jpg'}"
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        results = model(temp_path)
        detections = []
        seen = {}

        # 2. Add Confidence Thresholding (fixes Vase/WineGlass jitter)
        CONFIDENCE_THRESHOLD = 0.60  

        for r in results:
            for box in r.boxes:
                cls_id = int(box.cls[0])
                conf = float(box.conf[0])
                name = model.names[cls_id]
                
                # Ignore low-confidence false positives
                if conf < CONFIDENCE_THRESHOLD:
                    continue
                    
                xyxy = box.xyxy[0].tolist() if box.xyxy is not None else []
                detections.append({
                    "label":      name,
                    "class":      name,
                    "class_id":   cls_id,
                    "class_name": name,
                    "confidence": round(conf, 4),
                    "bbox_xyxy":  [round(v, 1) for v in xyxy],
                })
                # Add to seen dictionary with highest confidence
                if name not in seen or conf > seen[name]:
                    seen[name] = conf

        # Skip completely empty frames to save Cloudinary bandwidth and speed up
        if len(seen) == 0:
            return {
                "status": "success",
                "message": "No objects detected (or low confidence), skipped save.",
                "detections": [],
                "is_hazard": False
            }

        # Hand-Object Interaction Check & Hazard Pre-emption
        interactions = []
        hazards_detected = []
        DANGEROUS_OBJECTS = ['knife', 'scissors', 'fire', 'bottle', 'lighter']

        persons = [d for d in detections if d['label'] == 'person']
        items = [d for d in detections if d['label'] != 'person']
        
        for p in persons:
            px1, py1, px2, py2 = p['bbox_xyxy']
            for item in items:
                ix1, iy1, ix2, iy2 = item['bbox_xyxy']
                if not (px2 < ix1 or px1 > ix2 or py2 < iy1 or py1 > iy2):
                    interactions.append(f"Person interacting with {item['label']}")
                    if item['label'] in DANGEROUS_OBJECTS:
                        hazards_detected.append(item['label'])

        is_hazard = len(hazards_detected) > 0

        # Memory Vault Logic
        patient_id = None
        if deviceId and deviceId in ACTIVE_CAMERAS:
            patient_id = ACTIVE_CAMERAS[deviceId]
        elif len(ACTIVE_CAMERAS) > 0:
            patient_id = list(ACTIVE_CAMERAS.values())[0]
        else:
            patient_id = "PAT-2026-001"
            
        duplicate_message = ""
            
        if patient_id:
            if patient_id not in MEMORY_VAULT:
                MEMORY_VAULT[patient_id] = []
            if patient_id not in OBJECT_FREQUENCIES:
                OBJECT_FREQUENCIES[patient_id] = {}
            if patient_id not in TRAINED_OBJECTS:
                TRAINED_OBJECTS[patient_id] = {}
            
            current_time = datetime.datetime.now().strftime("%I:%M %p")
            
            # Check if we have any completely NEW objects in this frame
            has_new_object = False
            for obj, conf_score in seen.items():
                display_name = TRAINED_OBJECTS[patient_id].get(obj, obj)
                existing_item = next((item for item in MEMORY_VAULT[patient_id] if item["object"] == display_name), None)
                if not existing_item:
                    has_new_object = True
                    break

            image_url = ""
            if has_new_object:
                try:
                    upload_res = cloudinary.uploader.upload(temp_path, folder="memocare_vault")
                    image_url = upload_res.get("secure_url")
                except Exception as e:
                    print("Cloudinary Upload Failed:", e)
                    image_url = f"https://via.placeholder.com/150/e0e0e0/808080?text=Upload+Failed"
            else:
                duplicate_message = "Skipped Cloudinary (Duplicate Object)"
            
            for obj, conf_score in seen.items():
                # Increment frequency
                OBJECT_FREQUENCIES[patient_id][obj] = OBJECT_FREQUENCIES[patient_id].get(obj, 0) + 1
                freq = OBJECT_FREQUENCIES[patient_id][obj]
                
                # Check if it needs training
                needs_training = (freq >= 3 and obj not in TRAINED_OBJECTS[patient_id])
                
                # Resolve name
                is_fav = False
                display_name = obj
                obj_type = "Object"
                
                if obj in TRAINED_OBJECTS[patient_id]:
                    display_name = TRAINED_OBJECTS[patient_id][obj]
                    is_fav = True
                    obj_type = "Favorite"
                
                # Check Global Ownership Conflict
                conflict_msg = None
                if obj in GLOBAL_OWNERSHIP:
                    owner_info = GLOBAL_OWNERSHIP[obj]
                    if owner_info["owner_id"] != patient_id:
                        conflict_msg = f"This belongs to {owner_info['owner_id']} ({owner_info['custom_name']})"

                # Use form GPS if provided, else fallback to synced Mobile GPS
                final_lat = lat
                final_lng = lng
                if final_lat is None and patient_id in PATIENT_LOCATIONS:
                    final_lat = PATIENT_LOCATIONS[patient_id]["lat"]
                    final_lng = PATIENT_LOCATIONS[patient_id]["lng"]

                # Check if this object already exists in the vault
                existing_item = next((item for item in MEMORY_VAULT[patient_id] if item["object"] == display_name), None)
                
                if existing_item:
                    # It's a duplicate. We do NOT overwrite the original image_url.
                    # We just update time and GPS if needed.
                    existing_item["time"] = current_time 
                    existing_item["needs_training"] = needs_training
                    existing_item["is_favorite"] = is_fav
                    existing_item["conflict"] = conflict_msg
                    if final_lat is not None: existing_item["lat"] = final_lat
                    if final_lng is not None: existing_item["lng"] = final_lng
                else:
                    # New Object! Add to vault
                    new_item = {
                        "id": f"mem-{len(MEMORY_VAULT[patient_id])}",
                        "original_object": obj,
                        "object": display_name,
                        "time": current_time,
                        "type": obj_type,
                        "image_url": image_url,
                        "needs_training": needs_training,
                        "is_favorite": is_fav,
                        "best_conf": conf_score,
                        "location": EXPECTED_LOCATIONS.get(obj, "Unknown Room"),
                        "conflict": conflict_msg
                    }
                    if final_lat is not None: new_item["lat"] = final_lat
                    if final_lng is not None: new_item["lng"] = final_lng
                    
                    MEMORY_VAULT[patient_id].append(new_item)
            
            save_db() # Save changes persistently to vault_db.json

        return {
            "status":     "success",
            "message":    "Stored with cloud mapping",
            "detections": detections,
            "objects":    list(seen),
            "interactions": interactions,
            "hazard_alert": is_hazard,
            "hazards": hazards_detected,
            "count":      len(detections),
            "saved_to_vault": bool(patient_id)
        }
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


# ─── Train Behavior Pattern Model ─────────────────────────────────
@app.post("/train-behavior")
async def train_behavior(req: TrainRequest):
    try:
        if len(req.logs) < 5:
            return {"status": "error", "message": "Need at least 5 log entries"}

        df = pd.DataFrame([l.model_dump() for l in req.logs])

        le = LabelEncoder()
        known_activities = ACTIVITIES + list(df['activity'].unique())
        le.fit(known_activities)
        df['activity_enc'] = le.transform(df['activity'].str.lower().str.strip().apply(
            lambda x: x if x in le.classes_ else 'other'
        ))

        X = df[['hour', 'dayOfWeek', 'activity_enc', 'duration']].values

        iso = IsolationForest(contamination=0.1, random_state=42)
        iso.fit(X)

        clf = RandomForestClassifier(n_estimators=50, random_state=42)
        clf.fit(df[['hour', 'dayOfWeek']].values, df['activity_enc'].values)

        # Build routine: most common activity per hour (from real data)
        routine = {}
        for hour in range(24):
            hour_data = df[df['hour'] == hour]
            if not hour_data.empty:
                most_common = hour_data['activity'].value_counts().index[0]
                routine[str(hour)] = most_common

        patient_dir = os.path.join(MODELS_DIR, req.patientId)
        os.makedirs(patient_dir, exist_ok=True)
        joblib.dump(iso, os.path.join(patient_dir, 'anomaly.pkl'))
        joblib.dump(clf, os.path.join(patient_dir, 'classifier.pkl'))
        joblib.dump(le, os.path.join(patient_dir, 'encoder.pkl'))
        with open(os.path.join(patient_dir, 'routine.json'), 'w') as f:
            json.dump(routine, f)

        return {
            "status": "success",
            "patientId": req.patientId,
            "samples_trained": len(df),
            "routine": routine,
            "activities_learned": list(df['activity'].unique())
        }

    except Exception as e:
        return {"status": "error", "message": str(e)}


# ─── Get Behavior Pattern Summary ─────────────────────────────────
@app.get("/behavior-pattern/{patientId}")
async def get_pattern(patientId: str):
    routine_path = os.path.join(MODELS_DIR, patientId, 'routine.json')
    if not os.path.exists(routine_path):
        return {"status": "not_trained", "message": "No model trained for this patient"}
    with open(routine_path) as f:
        routine = json.load(f)
    return {"status": "success", "patientId": patientId, "routine": routine}


# ─── Predict Voice Alert (from real trained routine) ──────────────
@app.post("/predict-alert")
async def predict_alert(req: AlertRequest):
    routine_path = os.path.join(MODELS_DIR, req.patientId, 'routine.json')
    name = req.patientName

    # ── Use trained routine.json (real patient data) ──
    if os.path.exists(routine_path):
        with open(routine_path) as f:
            routine = json.load(f)

        expected = routine.get(str(req.hour))

        if expected:
            message = build_alert_message(name, expected, req.hour)
            return {
                "status": "alert",
                "activity": expected,
                "message": message,
                "hour": req.hour,
                "routine": routine,   # send full routine back to mobile
                "speak": True
            }
        else:
            # Hour not in routine — no scheduled activity
            return {
                "status": "no_alert",
                "message": "",
                "routine": routine,
                "speak": False
            }

    # ── No model trained yet — tell the user ──
    return {
        "status": "not_trained",
        "message": f"{name}, your routine model has not been trained yet. Please contact your caregiver.",
        "speak": False
    }


# ─── Analyze Behavior Logs ────────────────────────────────────────
@app.post("/analyze-behavior")
async def analyze_behavior(logs: list[BehaviorLog]):
    df = pd.DataFrame([log.dict() for log in logs])
    patterns = df['activity'].value_counts().to_dict()
    return {"status": "success", "patterns": patterns, "anomalies": []}


# NOTE: a second, duplicate "/predict-behavior" route used to be defined here
# - a placeholder that just string-matched activity == "wandering". FastAPI
# only ever matches the FIRST registered route for a given path, so that
# placeholder silently shadowed the REAL trained Isolation Forest model
# defined further below in this file, which has been dead code ever since.
# Removed here so the real model is the only "/predict-behavior" handler.


# ─── Free Local Face Recognition (100% Offline / PyTorch / No API Keys) ───────
# NOTE: dedicated face-embedding logic now lives inside the unified /extract-embedding
# handler below (type="person"). A second, duplicate "/extract-embedding" route used to be
# defined further down in this file; FastAPI only ever matches the FIRST registered route
# for a given path, so the old duplicate silently swallowed every object-embedding request
# (personalObjectRoutes.js's `?type=object` calls) and ran face detection on them instead.
# Removed here so the real type-aware handler (further below) is the only one registered.


@app.post("/match-face")
async def match_face(req: MatchRequest):
    if not req.known_patients or len(req.known_patients) == 0:
        return {"status": "no_match", "message": "No registered face embeddings in database"}

    target = np.array(req.target_embedding).reshape(1, -1)
    best_match = None
    highest_score = -1.0

    for patient in req.known_patients:
        emb = patient.get("embedding")
        if not emb or len(emb) == 0:
            continue
        known = np.array(emb).reshape(1, -1)
        score = float(cosine_similarity(target, known)[0][0])
        if score > highest_score:
            highest_score = score
            best_match = patient.get("patientId")

    # Semantic Memory DB (Feature 3: Deep Context for Research Proposal)
    SEMANTIC_MEMORY_DB = {
        "PAT-2026-003": "මේ ඔයාගේ පුතා කමල්. එයා ගිය සතියේ ඔයාව බලන්න ඇවිත් ඇපල් ගෙනාවේ.",
        "PAT-2026-004": "මේ ඔයාගේ දුව නයෝමි. එයා ඊයේ ඔයාට කෑම හැදුවා.",
        "DEFAULT": "මේ ඔයාගේ පවුලේ කෙනෙක්. එයා ඔයාට ගොඩක් ආදරෙයි."
    }

    # Cosine similarity >= 0.65 is standard high-confidence match threshold for Facenet PyTorch
    if highest_score >= 0.65 and best_match:
        semantic_text = SEMANTIC_MEMORY_DB.get(best_match, SEMANTIC_MEMORY_DB["DEFAULT"])
        return {
            "status": "match",
            "patientId": best_match,
            "confidence": round(highest_score * 100, 1),
            "semantic_context": semantic_text
        }
    return {
        "status": "no_match",
        "confidence": round(highest_score * 100, 1) if highest_score >= 0 else 0
    }





@app.post("/extract-embedding")
async def extract_embedding(type: str = "person", file: UploadFile = File(...)):
    temp_path = f"emb_temp_{file.filename or 'scan.jpg'}"
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    try:
        embedding = None
        if type == 'person' and FACENET_AVAILABLE:
            embedding = extract_face_embedding(temp_path)
            if not embedding:
                return {"success": False, "message": "No face detected"}
        else:
            embedding = extract_object_embedding(temp_path)
            
        return {"success": True, "embedding": embedding}
    except Exception as e:
        return {"success": False, "message": str(e)}
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

class MatchCustomRequest(BaseModel):
    query_embedding: list[float]
    database: list[dict] # [{"id": "...", "name": "...", "type": "...", "embedding": [...]}]
    threshold: float = 0.75

@app.post("/recognize-custom")
async def recognize_custom(req: MatchCustomRequest):
    if not req.database or not req.query_embedding:
        return {"success": False, "message": "Missing database or query"}
        
    query_vec = np.array(req.query_embedding).reshape(1, -1)
    
    best_match = None
    highest_sim = 0.0
    
    for item in req.database:
        if not item.get("embedding"): continue
        db_vec = np.array(item["embedding"]).reshape(1, -1)
        sim = cosine_similarity(query_vec, db_vec)[0][0]
        
        if sim > highest_sim:
            highest_sim = sim
            best_match = item
            
    if highest_sim >= req.threshold:
        return {"success": True, "match": best_match["name"], "type": best_match.get("type", "object"), "similarity": float(highest_sim)}
    
    return {"success": False, "message": "No strong match found", "similarity": float(highest_sim)}


# ─── Find My Things: open-vocabulary localization + personal-instance match ───
# Stage A (category): YOLO-World finds *where* an object of the requested category
# (e.g. "glasses") is in the live frame - unlike the COCO-only `model` above, it is
# not limited to 80 fixed classes, so it works for dementia-relevant items that were
# never in COCO (glasses, wallet, pill box, hearing aid case, keys).
# Stage B (instance): the matched region is cropped and compared via MobileNet
# embedding (extract_object_embedding) against the embeddings captured at this
# patient's registration, so the app confirms it is THIS patient's own item, not
# just any object of that category.
_yolo_world_model = None

def get_yolo_world():
    global _yolo_world_model
    if _yolo_world_model is None:
        _yolo_world_model = YOLO('yolov8s-worldv2.pt')
    return _yolo_world_model

# NOTE: MobileNet-embedding cosine similarity for this match step has not yet been
# calibrated against real registered-item photos. 0.55 is a starting guess (lower
# than the 0.65 used for Facenet face matches, since MobileNet ImageNet features are
# less discriminative for arbitrary objects) - tune this once real test photos exist.
ITEM_MATCH_THRESHOLD = 0.55
YOLO_WORLD_CONF = 0.15  # open-vocab confidence is naturally lower/spread than closed-set COCO

@app.post("/scan-for-item")
async def scan_for_item(
    file: UploadFile = File(...),
    item_name: str = Form(...),
    known_items: str = Form(...),  # JSON string: [{"id": "...", "embedding": [...]}, ...]
    patient_id: str = Form("PAT-2026-001"),
):
    temp_path = f"scan_temp_{file.filename or 'frame.jpg'}"
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        try:
            items = json.loads(known_items) if known_items else []
        except Exception:
            items = []

        if not items:
            return {"status": "error", "message": "No registered reference photo for this item yet"}

        yw = get_yolo_world()
        yw.set_classes([item_name])
        results = yw.predict(temp_path, conf=YOLO_WORLD_CONF, verbose=False)

        img = Image.open(temp_path).convert('RGB')
        img_w, img_h = img.size

        candidates = []
        for r in results:
            for box in r.boxes:
                candidates.append({
                    "conf": float(box.conf[0]),
                    "bbox": box.xyxy[0].tolist(),
                })

        if not candidates:
            return {"status": "success", "found": False, "message": f"No {item_name}-like object visible in this frame"}

        candidates.sort(key=lambda c: c["conf"], reverse=True)

        best = None
        for cand in candidates[:3]:
            x1, y1, x2, y2 = cand["bbox"]
            crop = img.crop((max(0, x1), max(0, y1), min(img_w, x2), min(img_h, y2)))
            crop_path = f"crop_{temp_path}"
            crop.save(crop_path)
            try:
                crop_emb = extract_object_embedding(crop_path)
            finally:
                if os.path.exists(crop_path):
                    os.remove(crop_path)

            crop_vec = np.array(crop_emb).reshape(1, -1)
            for item in items:
                emb = item.get("embedding")
                if not emb:
                    continue
                known_vec = np.array(emb).reshape(1, -1)
                sim = float(cosine_similarity(crop_vec, known_vec)[0][0])
                if best is None or sim > best["similarity"]:
                    best = {"similarity": sim, "item_id": item.get("id"), "bbox": cand["bbox"]}

        if best and best["similarity"] >= ITEM_MATCH_THRESHOLD:
            x1, y1, x2, y2 = best["bbox"]
            cx = (x1 + x2) / 2
            direction = "left" if cx < img_w / 3 else "right" if cx > img_w * 2 / 3 else "center"

            # The frame that found the item IS the photo - no separate
            # capture step needed. Save it (same Cloudinary pattern as
            # /detect-objects) and log it as a diary-candidate event, so
            # "found my glasses" shows up in the evening diary for free.
            photo_url = ""
            try:
                upload_res = cloudinary.uploader.upload(temp_path, folder="memocare_vault")
                photo_url = upload_res.get("secure_url", "")
            except Exception as e:
                print("Cloudinary upload failed for found-item photo:", e)

            log_diary_event(
                patient_id,
                "object_found",
                detail=f"Found {item_name} ({round(best['similarity'] * 100, 1)}% match)",
                photo_url=photo_url,
                channel="diary",
            )
            save_db()

            return {
                "status": "success",
                "found": True,
                "item_id": best["item_id"],
                "confidence": round(best["similarity"] * 100, 1),
                "bbox_xyxy": [round(v, 1) for v in best["bbox"]],
                "direction": direction,
                "frame_width": img_w,
                "frame_height": img_h,
                "photo_url": photo_url,
            }

        return {
            "status": "success",
            "found": False,
            "message": f"Saw something that might be {item_name}-shaped, but it didn't match closely enough",
            "best_similarity": round(best["similarity"] * 100, 1) if best else 0,
        }
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


# ─── Memory Scrapbook: Event Scoring + Daily Diary Generation ─────────
# GROQ_API_KEY must be set as a real environment variable before starting
# this service (e.g. `$env:GROQ_API_KEY="..."` in PowerShell) - it is NOT
# read from backend/.env (that file is only loaded by the Node process).
# Without it, the diary still works but falls back to plain concatenated
# event text instead of an LLM-written paragraph.
import requests as _requests

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")
GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"


def score_diary_events(patient_id: str, target_date: str = None):
    """Collect today's (or `target_date`'s, ISO yyyy-mm-dd) diary-candidate
    events for a patient and rank them by diary-worthiness. Returns a list of
    {summary, photo_url, time, score}, highest score first. This is the
    research-contribution part: the LLM never sees raw, unfiltered logs - it
    only sees whatever this function decided was worth telling the family.
    """
    import datetime as _dt
    target_date = target_date or _dt.date.today().isoformat()

    candidates = []

    # DIARY_EVENTS: only the "diary" channel - caregiver_alert events
    # (e.g. anomaly_detected) are intentionally excluded from the diary text.
    for ev in DIARY_EVENTS.get(patient_id, []):
        if ev.get("channel") != "diary":
            continue
        if not ev.get("time", "").startswith(target_date):
            continue
        score = 2  # base: a concrete, named event
        if ev.get("photo_url"):
            score += 2
        candidates.append({
            "summary": f"{ev['event'].replace('_', ' ')}: {ev.get('detail', '')}".strip(": "),
            "photo_url": ev.get("photo_url", ""),
            "time": ev["time"],
            "score": score,
        })

    # MEMORY_VAULT: objects seen/photographed. NOTE: vault entries store time
    # as "%I:%M %p" only (no date), so these can't be precisely filtered to
    # `target_date` yet - they're included as general context until vault
    # entries also carry a full ISO timestamp.
    for item in MEMORY_VAULT.get(patient_id, []):
        score = 1
        if item.get("image_url") and "placeholder" not in item.get("image_url", ""):
            score += 2
        if item.get("is_favorite"):
            score += 1
        candidates.append({
            "summary": f"Saw {item.get('object')} in {item.get('location', 'the house')}",
            "photo_url": item.get("image_url", ""),
            "time": item.get("time", ""),
            "score": score,
        })

    candidates.sort(key=lambda c: c["score"], reverse=True)
    return candidates


def build_diary_text(top_events):
    """Shared by /generate-diary and /generate-diary-video. Returns (diary_text, note)."""
    plain_fallback = " ".join(f"{e['summary']}." for e in top_events)

    if not GROQ_API_KEY:
        return plain_fallback, "GROQ_API_KEY not set - showing raw events instead of an LLM-written story."

    event_lines = "\n".join(f"- {e['summary']} (around {e['time']})" for e in top_events)
    prompt = (
        "Write a short, warm diary paragraph (3-5 sentences) for a dementia patient's family, "
        "summarizing ONLY these real events from today. Do not invent any detail not listed below. "
        "Use simple, gentle, second-person language (\"You...\").\n\n"
        f"Today's events:\n{event_lines}"
    )

    try:
        resp = _requests.post(
            GROQ_CHAT_URL,
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": GROQ_MODEL,
                "messages": [
                    {"role": "system", "content": "You are a gentle, factual diary writer for a dementia care app. Never invent facts not given to you."},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.6,
            },
            timeout=20,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip(), None
    except Exception as exc:
        return plain_fallback, f"LLM call failed ({exc}); showing raw events instead."


@app.get("/generate-diary/{patient_id}")
async def generate_diary(patient_id: str):
    top_events = score_diary_events(patient_id)[:5]

    if not top_events:
        return {"status": "success", "diary": "Nothing notable was logged today yet.", "events_used": []}

    diary_text, note = build_diary_text(top_events)
    result = {"status": "success", "diary": diary_text, "events_used": top_events}
    if note:
        result["note"] = note
    return result


# ─── Daily Diary Video: real slideshow-with-narration .mp4 ────────────
# Downloads the day's photos (from scored diary events), narrates the same
# diary text via gTTS (English or Sinhala), and composites both into an
# actual video file with ffmpeg - not a mock, a real playable .mp4 saved to
# disk and served back over /videos/<file>.
import uuid
import imageio_ffmpeg
import subprocess
from gtts import gTTS
from PIL import ImageDraw, ImageFont

FFMPEG_BIN = imageio_ffmpeg.get_ffmpeg_exe()
SECONDS_PER_IMAGE = 4

def make_title_card(path, text="MemoCare Daily Summary"):
    """Fallback background when there are no photos for the day yet, so the
    video still has something to show, not just blank/black frames."""
    img = Image.new('RGB', (1280, 720), color=(59, 130, 246))
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("arial.ttf", 54)
    except Exception:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((1280 - w) / 2, (720 - h) / 2), text, fill="white", font=font)
    img.save(path)


@app.get("/generate-diary-video/{patient_id}")
async def generate_diary_video(patient_id: str, lang: str = "en"):
    top_events = score_diary_events(patient_id)[:5]
    if not top_events:
        return {"status": "success", "diary": "Nothing notable was logged today yet.", "video_url": None}

    diary_text, note = build_diary_text(top_events)

    work_id = uuid.uuid4().hex[:10]
    work_dir = f"video_tmp_{work_id}"
    os.makedirs(work_dir, exist_ok=True)

    try:
        # 1. Gather this run's images - download each event's photo, in score
        # order, skipping any that fail to fetch.
        image_paths = []
        for i, ev in enumerate(top_events):
            url = ev.get("photo_url")
            if not url:
                continue
            try:
                img_resp = _requests.get(url, timeout=10)
                img_resp.raise_for_status()
                img_path = os.path.join(work_dir, f"img_{i}.jpg")
                with open(img_path, "wb") as f:
                    f.write(img_resp.content)
                # Re-save through PIL to normalize format/mode - ffmpeg's
                # concat demuxer is picky about mixed/odd image encodings.
                Image.open(img_path).convert("RGB").save(img_path, "JPEG")
                image_paths.append(img_path)
            except Exception:
                continue

        if not image_paths:
            title_path = os.path.join(work_dir, "title.jpg")
            make_title_card(title_path)
            image_paths = [title_path]

        # 2. Narration audio (English or Sinhala)
        tts_lang = "si" if lang == "si" else "en"
        audio_path = os.path.join(work_dir, "narration.mp3")
        gTTS(text=diary_text, lang=tts_lang).save(audio_path)

        # 3. ffmpeg concat list - the image list is looped indefinitely
        # (-stream_loop -1) and -shortest trims the final video to the
        # narration's actual length, so this works regardless of how many
        # photos there are or how long the narration ends up being.
        concat_path = os.path.join(work_dir, "images.txt")
        with open(concat_path, "w") as f:
            for p in image_paths:
                f.write(f"file '{os.path.abspath(p)}'\n")
                f.write(f"duration {SECONDS_PER_IMAGE}\n")
            f.write(f"file '{os.path.abspath(image_paths[-1])}'\n")  # concat quirk: repeat last entry

        output_name = f"diary_{patient_id}_{work_id}.mp4"
        output_path = os.path.join("videos", output_name)

        cmd = [
            FFMPEG_BIN, "-y",
            "-stream_loop", "-1", "-f", "concat", "-safe", "0", "-i", concat_path,
            "-i", audio_path,
            "-map", "0:v", "-map", "1:a",
            "-c:v", "libx264", "-tune", "stillimage",
            "-c:a", "aac", "-b:a", "192k",
            "-pix_fmt", "yuv420p", "-shortest",
            output_path,
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if proc.returncode != 0:
            return {"status": "error", "message": f"Video rendering failed: {proc.stderr[-500:]}"}

        result = {
            "status": "success",
            "diary": diary_text,
            "video_url": f"/videos/{output_name}",
            "photos_used": len(image_paths),
            "events_used": top_events,
        }
        if note:
            result["note"] = note
        return result
    finally:
        import shutil
        shutil.rmtree(work_dir, ignore_errors=True)


# ─── Feature 1: Reminiscence Therapy (Agitation Check) ────────────
class AgitationRequest(BaseModel):
    recent_activities: list[str]

@app.post("/trigger-reminiscence")
async def trigger_reminiscence(req: AgitationRequest):
    # Count wandering or pacing to detect Sundowning/Anxiety
    wandering_count = sum(1 for act in req.recent_activities if act.lower() in ['wandering', 'pacing', 'shouting'])
    if wandering_count >= 3:
        return {
            "trigger": True, 
            "action": "PLAY_MUSIC_AND_PHOTOS", 
            "message": "රෝගියා කලබල වී ඇත. මතකයන් අවදි කිරීම ආරම්භ කෙරේ."
        }
    return {"trigger": False}


# ─── Feature 2: Contextual Indoor Navigation ──────────────────────
class NavRequest(BaseModel):
    target: str
    visible_objects: list[str]

@app.post("/contextual-nav")
async def contextual_nav(req: NavRequest):
    landmarks = [obj for obj in req.visible_objects if obj in ['chair', 'sofa', 'tv', 'bed', 'dining table', 'door', 'refrigerator']]
    if landmarks:
        landmark = landmarks[0]
        # Basic Sinhala translation mapping
        translations = {'chair': 'පුටුව', 'sofa': 'සෝෆා එක', 'tv': 'ටීවී එක', 'bed': 'ඇඳ', 'door': 'දොර', 'refrigerator': 'ෆ්‍රිජ් එක'}
        sinhala_landmark = translations.get(landmark.lower(), landmark)
        return {"status": "success", "instruction": f"අර ඉස්සරහ තියෙන {sinhala_landmark} ගාවින් හැරෙන්න."}
    return {"status": "success", "instruction": "කරුණාකර ඉස්සරහට යන්න."}


# ─── Feature 5: Daily Cognitive Health Score ──────────────────────
class ScoreRequest(BaseModel):
    successful_routines: int
    total_routines: int
    wandering_incidents: int
    hazard_interactions: int

@app.post("/cognitive-score")
async def cognitive_score(req: ScoreRequest):
    # Base score is 100. Deduct for hazards and wandering, add for successful independent routines.
    score = 100
    
    if req.total_routines > 0:
        routine_penalty = ((req.total_routines - req.successful_routines) / req.total_routines) * 30
        score -= routine_penalty
        
    score -= (req.wandering_incidents * 5)
    score -= (req.hazard_interactions * 10)
    
    score = max(0, min(100, score)) # Clamp between 0 and 100
    
    status_text = "Good" if score >= 80 else ("Needs Attention" if score >= 50 else "Critical")
    
    return {
        "status": "success",
        "score": round(score, 1),
        "health_status": status_text,
        "summary_sinhala": f"අද දවසේ රෝගියාගේ මතක ශක්ති මට්ටම {round(score, 1)}% කි. තත්වය: {status_text}."
    }

@app.post("/bulk-upload-csv")
async def bulk_upload_csv(file: UploadFile = File(...)):
    import pandas as pd
    from io import BytesIO
    
    content = await file.read()
    df = pd.read_csv(BytesIO(content))
    
    count = 0
    for _, row in df.iterrows():
        pid = f"PAT-2026-{int(row['Patient_ID']):03d}"
        
        # Save Patient Profile
        PATIENTS_DB[pid] = {
            "name": row['Name'],
            "age": row['Age'],
            "years_in_home": row['Years_in_Home'],
            "behaviors": row['Behaviors_English'],
            "categories": [c.strip() for c in row['Key_Categories'].split(",")]
        }
        
        # Generate Adaptive Routine based on behaviors
        routine = []
        cats = PATIENTS_DB[pid]["categories"]
        
        routine.append({"time": "07:00 AM", "task": "Wake up & Morning Tea", "type": "General"})
        
        if "Medicine" in cats or "Parkinson's" in cats:
            routine.append({"time": "08:00 AM", "task": "Take Morning Medicine", "type": "Health", "alert": True})
            routine.append({"time": "02:00 PM", "task": "Take Afternoon Medicine", "type": "Health", "alert": True})
            
        if "Mobility" in cats:
            routine.append({"time": "09:00 AM", "task": "Assisted Physiotherapy", "type": "Therapy"})
        else:
            routine.append({"time": "09:00 AM", "task": "Garden Walk", "type": "Activity"})
            
        if "Memory" in cats:
            routine.append({"time": "10:30 AM", "task": "Cognitive Puzzle / Memory Game", "type": "Therapy"})
            routine.append({"time": "05:00 PM", "task": "Family Video Call (Reminiscing)", "type": "Social"})
            
        if "Incontinence" in cats:
            # Frequent washroom reminders
            routine.append({"time": "10:00 AM", "task": "Washroom Break", "type": "Care", "alert": True})
            routine.append({"time": "01:00 PM", "task": "Washroom Break", "type": "Care", "alert": True})
            routine.append({"time": "04:00 PM", "task": "Washroom Break", "type": "Care", "alert": True})
            routine.append({"time": "08:00 PM", "task": "Washroom Break", "type": "Care", "alert": True})
            
        routine.append({"time": "01:00 PM", "task": "Lunch", "type": "General"})
        routine.append({"time": "09:00 PM", "task": "Sleep", "type": "General"})
        
        ROUTINES_DB[pid] = sorted(routine, key=lambda x: datetime.datetime.strptime(x["time"], "%I:%M %p").strftime("%H:%M"))
        count += 1
        
    save_db()
    return {"status": "success", "message": f"Processed {count} patients and generated adaptive routines."}

@app.get("/patient/{patient_id}/routine")
async def get_patient_routine(patient_id: str):
    if patient_id not in ROUTINES_DB:
        return {"status": "error", "message": "No routine found for this patient."}
    return {"status": "success", "patient": PATIENTS_DB.get(patient_id, {}), "routine": ROUTINES_DB[patient_id]}

import joblib
from pydantic import BaseModel

class BehaviorLog(BaseModel):
    age: int
    condition: str
    physical_state: str
    time_of_day: str
    activity: str
    duration_mins: int
    patient_id: str = "PAT-2026-001"  # caller didn't send one before; default keeps old calls working

@app.post("/predict-behavior")
async def predict_behavior(log: BehaviorLog):
    try:
        # Load model and encoders lazily
        model = joblib.load("models/isolation_forest_model.pkl")
        le_condition = joblib.load("models/le_condition.pkl")
        le_physical = joblib.load("models/le_physical.pkl")
        le_time = joblib.load("models/le_time.pkl")
        le_activity = joblib.load("models/le_activity.pkl")

        # Encode inputs safely (handle unseen labels by defaulting to 0 or a known class)
        def safe_encode(encoder, value):
            if value in encoder.classes_:
                return encoder.transform([value])[0]
            return 0

        cond_enc = safe_encode(le_condition, log.condition)
        phys_enc = safe_encode(le_physical, log.physical_state)
        time_enc = safe_encode(le_time, log.time_of_day)
        act_enc = safe_encode(le_activity, log.activity)

        features = [[log.age, cond_enc, phys_enc, time_enc, act_enc, log.duration_mins]]

        # Predict: -1 is anomaly, 1 is normal
        prediction = model.predict(features)[0]
        is_anomaly = True if prediction == -1 else False
        message = "Anomaly detected! Immediate intervention required." if is_anomaly else "Behavior is normal."

        # Keep the full history (diary generator looks at the whole day, not
        # just "right now"), capped so this stays memory/disk-safe long-term.
        if log.patient_id not in BEHAVIOR_HISTORY:
            BEHAVIOR_HISTORY[log.patient_id] = []
        BEHAVIOR_HISTORY[log.patient_id].append({
            "activity": log.activity,
            "time_of_day": log.time_of_day,
            "is_anomaly": is_anomaly,
            "message": message,
            "time": datetime.datetime.now().isoformat(),
        })
        BEHAVIOR_HISTORY[log.patient_id] = BEHAVIOR_HISTORY[log.patient_id][-1000:]

        # Anomalies go to the caregiver alert channel, NOT the warm diary -
        # a wandering flag shouldn't show up as a cheerful diary sentence.
        if is_anomaly:
            log_diary_event(log.patient_id, "anomaly_detected", detail=message, channel="caregiver_alert")

        save_db()

        return {
            "status": "success",
            "is_anomaly": is_anomaly,
            "message": message
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


import remember_moments
remember_moments.init(
    coco_model=model,
    face_fn=extract_face_embedding,
    face_detector=mtcnn if FACENET_AVAILABLE else None,
    object_emb_fn=extract_object_embedding,
    facenet_ok=FACENET_AVAILABLE,
    log_diary_event=log_diary_event,
    save_db=save_db,
)
app.include_router(remember_moments.router)

import esp32_live  # after init(): its passive workers use the shared models
app.include_router(esp32_live.router)
import visit_talk  # visit conversation summaries (consent-based); before memory_quiz, which asks about them
app.include_router(visit_talk.router)
import memory_quiz  # daily memory game + memory report (reads remember_moments' stores)
app.include_router(memory_quiz.router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
