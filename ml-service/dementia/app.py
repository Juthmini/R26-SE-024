"""
DEMENTIA ML API (port 5002)
=============================
Mirrors ml-service/caregiver/app.py so it plugs into the same Node -> axios ->
Flask pattern used for the caregiver stress model (see
backend/src/services/cognitive/dementiaPrediction/dementiaPredictionService.js).

/predict - 2-class triage (monitor / escalate, ~93% accuracy)
   Input : age, educationYears, totalScore (MMSE 0-30, same scale as
           scoringService.js), sex ("M"/"F"), faq = { bills, taxes, shopping,
           games, stove, mealPrep, events, payAttention, remindDates, travel }
           each 0-3.  (ses is accepted but ignored.)
   Output: triage + confidence + probabilities + message.

Model file (dementia_model.pkl) is produced by train.py.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import pandas as pd

app = Flask(__name__)
CORS(app)

# FAQ request keys (camelCase from Node) -> model feature columns.
FAQ_KEY_TO_COL = {
    "bills":        "FAQ_BILLS",
    "taxes":        "FAQ_TAXES",
    "shopping":     "FAQ_SHOPPING",
    "games":        "FAQ_GAMES",
    "stove":        "FAQ_STOVE",
    "mealPrep":     "FAQ_MEALPREP",
    "events":       "FAQ_EVENTS",
    "payAttention": "FAQ_PAYATTN",
    "remindDates":  "FAQ_REMDATES",
    "travel":       "FAQ_TRAVEL",
}

# ── Load model ─────────────────────────────────────────────────────────────
try:
    saved        = joblib.load("dementia_model.pkl")
    model        = saved["model"]
    feature_cols = saved["feature_cols"]
    cv_acc       = saved.get("cv_acc", 0)
    macro_f1     = saved.get("macro_f1", 0)
    trained_on   = saved.get("trained_on", [])
    train_acc    = saved.get("train_acc", 0)
    test_acc     = saved.get("test_acc", 0)
    train_test_gap = abs(train_acc - test_acc)
    print(f"Model loaded — CV accuracy {cv_acc*100:.1f}% (macro-F1 {macro_f1*100:.1f}%)")
    print(f"  Train acc {train_acc*100:.1f}%  |  Held-out test acc {test_acc*100:.1f}%  "
          f"|  Train-test gap {train_test_gap*100:.1f} pts "
          f"{'(healthy, no overfitting)' if train_test_gap < 0.05 else '(check for overfitting)'}")
except Exception as e:
    print(f"Run train.py first! Error: {e}")
    model = None


def build_message(triage):
    if triage == "escalate":
        return ("Screening suggests day-to-day function and cognition have "
                "declined enough to warrant a clinical review.")
    return ("Screening does not indicate a need for clinical escalation right "
            "now. Keep monitoring with regular assessments.")


@app.route("/health", methods=["GET"])
def health():
    ok = model is not None
    return jsonify({
        "status":    "ok" if ok else "degraded",
        "component": "dementia",
        "port":      5002,
        "model": {
            "status":     "loaded" if ok else "not loaded",
            "trained_on": trained_on if ok else [],
            "cv_acc":     f"{cv_acc*100:.1f}%" if ok else "N/A",
            "macro_f1":   f"{macro_f1*100:.1f}%" if ok else "N/A",
        },
    })


@app.route("/predict", methods=["POST"])
def predict():
    if model is None:
        return jsonify({"success": False, "message": "Model not loaded. Run train.py first."}), 500

    try:
        body = request.get_json(force=True) or {}
        print(f"\n[Dementia API] Request: {body}")

        faq = body.get("faq") or {}
        missing = [k for k in FAQ_KEY_TO_COL if k not in faq]
        if missing:
            return jsonify({
                "success": False,
                "message": f"faq is missing {len(missing)} item(s): {missing}",
            }), 400

        row = {
            "Age":   float(body.get("age", 75)),
            "EDUC":  float(body.get("educationYears", 12)),
            "MMSE":  float(body.get("totalScore", 27)),
            "Sex_M": 1 if str(body.get("sex", "")).upper().startswith("M") else 0,
        }
        faq_vals = []
        for key, col in FAQ_KEY_TO_COL.items():
            v = float(faq[key])
            row[col] = v
            faq_vals.append(v)
        row["FAQ_TOTAL"] = sum(faq_vals)

        X = pd.DataFrame([row])[feature_cols]

        triage = str(model.predict(X)[0])
        proba  = model.predict_proba(X)[0]
        probabilities = {cls: round(float(p), 3) for cls, p in zip(list(model.classes_), proba)}

        result = {
            "success":       True,
            "triage":        triage,
            "confidence":    round(max(probabilities.values()), 3),
            "probabilities": probabilities,
            "message":       build_message(triage),
            "submittedAt":   pd.Timestamp.now().isoformat(),
        }
        print(f"[Dementia API] -> {triage} ({result['confidence']*100:.0f}%)")
        return jsonify(result)

    except Exception as e:
        print(f"[Dementia API] Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "message": str(e)}), 500


if __name__ == "__main__":
    print("=" * 50)
    print("  DEMENTIA ML API - PORT 5002")
    print("  /predict  - triage (monitor / escalate)")
    print("-" * 50)
    if model is not None:
        print(f"  CV accuracy : {cv_acc*100:.1f}%")
        print(f"  Macro-F1    : {macro_f1*100:.1f}%")
        print(f"  Trained on  : {', '.join(trained_on)}")
        print("-" * 50)
        print(f"  Train acc        : {train_acc*100:.1f}%   (seen rows)")
        print(f"  Held-out test acc: {test_acc*100:.1f}%   (touched once, final)")
        print(f"  Train-test gap   : {train_test_gap*100:.1f} pts  "
              f"{'-> healthy, no overfitting' if train_test_gap < 0.05 else '-> check for overfitting'}")
    else:
        print("  Model : NOT LOADED (run train.py first)")
    print("=" * 50)
    app.run(host="0.0.0.0", port=5002)
