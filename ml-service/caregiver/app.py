from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import pandas as pd
import numpy as np

app  = Flask(__name__)
CORS(app)

# ── Load model ─────────────────────────────────────────────────────────────
try:
    saved        = joblib.load('stress_model.pkl')
    model        = saved['model']
    feature_cols = saved['feature_cols']
    model_name   = saved.get('model_name', 'Unknown')
    accuracy     = saved.get('accuracy', 0)
    print(f"✅ Model loaded - {model_name} - Accuracy: {accuracy*100:.1f}%")
    print(f"✅ Features required: {len(feature_cols)}")
except Exception as e:
    print(f"❌ Run tune_model.py first! Error: {e}")
    model = None
    saved = {}

TIPS = {
    'Low': [
        'You are doing great! Keep up your healthy habits.',
        'Maintain your current sleep schedule.',
        'Continue taking regular breaks throughout the day.',
    ],
    'Moderate': [
        'Take a short break every 2 hours.',
        'Try to delegate some tasks if possible.',
        'Drink more water and step outside briefly.',
        'Talk to a colleague about how you are feeling.',
    ],
    'High': [
        'Please take a break now - your wellbeing matters.',
        'Ask for help with some of your tasks today.',
        'Try a 5-minute breathing exercise right now.',
        'Speak to your supervisor about your workload.',
        'Make sure you eat and rest properly today.',
    ],
}

MESSAGES = {
    'Low':      'You are managing well today. Keep taking care of yourself!',
    'Moderate': 'You have had a busy day. Watch your energy levels carefully.',
    'High':     'High stress detected. Please take a break and seek support.',
}

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status':    'ok',
        'component': 'caregiver',
        'port':      5001,
        'model':     'loaded' if model else 'not loaded',
        'accuracy':  f"{saved.get('accuracy',0)*100:.1f}%" if model else 'N/A',
        'features':  len(feature_cols) if model else 0,
    })

@app.route('/predict', methods=['POST'])
def predict():
    if model is None:
        return jsonify({
            'success': False,
            'message': 'Model not loaded. Run tune_model.py first.',
        }), 500

    try:
        body = request.get_json()
        print(f"\n[Caregiver API] Request received")

        # ── Extract values from frontend form ──────────────────────────────
        sleep          = float(body.get('sleepHours', 7))
        tired          = float(body.get('physicalTiredness', 3))
        mood           = float(body.get('mood', 3))
        overwhelm      = float(body.get('emotionalOverwhelm', 3))
        hours_care     = float(body.get('hoursCaregiving', 8))
        tasks_assigned = float(body.get('tasksAssigned', 10))
        tasks_done     = float(body.get('tasksCompleted', 8))
        difficult      = float(body.get('difficultSituations', 2))
        breaks         = float(body.get('breaksTaken', 1))
        exhausted      = float(body.get('mentallyExhausted', 3))
        diff_managing  = float(body.get('difficultyManaging', 3))
        drained        = float(body.get('emotionallyDrained', 3))
        patients_count = float(body.get('patientsAssigned', 5))

        # ── Derived features (original) ────────────────────────────────────
        tasks_pending            = max(0, tasks_assigned - tasks_done)
        task_completion_rate     = tasks_done / max(tasks_assigned, 1)
        workload_score           = tasks_pending + difficult
        wellbeing_score          = overwhelm + exhausted + drained
        sleep_deficit            = 8 - sleep
        task_pressure            = tasks_assigned / max(hours_care, 1)
        emotional_burden         = overwhelm + diff_managing
        physical_mental_combined = tired + exhausted
        recovery_score           = sleep + breaks
        overwhelm_index          = overwhelm * difficult

        # ── New derived features (added in tune_model.py) ─────────────────
        pending_ratio            = tasks_pending / max(tasks_assigned, 1)
        stress_load              = tired * hours_care
        emotional_physical_ratio = wellbeing_score / (tired + 1)
        break_efficiency         = breaks / max(hours_care, 1)
        mood_overwhelm_gap       = mood - overwhelm
        total_stress_index       = (tired + wellbeing_score + workload_score) / 3
        high_risk_flag           = 1 if (sleep < 6 and wellbeing_score > 9) else 0
        task_stress_interaction  = task_pressure * tired
        recovery_deficit         = workload_score / (recovery_score + 1)
        emotional_collapse_risk  = wellbeing_score * tired
        workload_per_hour        = tasks_assigned / max(hours_care, 1)

        # ── Build ALL features ─────────────────────────────────────────────
        all_features = {
            # Encoded categorical - age/type/experience/support aren't
            # collected anywhere in the app yet (no registration field for
            # them), so these stay as neutral fixed defaults until that's
            # added. Patient count IS real data your Caregiver profile
            # already tracks, so it's passed in from the caller now instead.
            'age_encoded':    1,
            'type_encoded':   0,
            'exp_encoded':    1,
            'sup_encoded':    1,

            # Raw numeric
            'How many patients do you currently care for?':                                                           patients_count,
            'How many hours did you sleep last night?':                                                               sleep,
            'How physically tired do you feel today?':                                                                tired,
            'How many hours did you spend caregiving today?':                                                         hours_care,
            'How many caregiving tasks were assigned today?':                                                         tasks_assigned,
            'How many tasks did you complete today?':                                                                 tasks_done,
            'How many tasks are still pending?':                                                                      tasks_pending,
            'How many difficult situations (e.g., patient confusion, agitation) occurred today?':                     difficult,
            'How would you describe your mood today?':                                                                mood,
            'Did you feel emotionally overwhelmed today?':                                                            overwhelm,
            'I felt mentally exhausted today Question':                                                               exhausted,
            'I had difficulty managing my caregiving tasks today':                                                    diff_managing,
            'I felt emotionally drained today':                                                                       drained,
            'How many breaks did you take today?':                                                                    breaks,

            # Engineered features (original)
            'task_completion_rate':      task_completion_rate,
            'workload_score':            workload_score,
            'wellbeing_score':           wellbeing_score,
            'sleep_deficit':             sleep_deficit,
            'task_pressure':             task_pressure,
            'emotional_burden':          emotional_burden,
            'physical_mental_combined':  physical_mental_combined,
            'recovery_score':            recovery_score,
            'overwhelm_index':           overwhelm_index,

            # Engineered features (new)
            'pending_ratio':             pending_ratio,
            'stress_load':               stress_load,
            'emotional_physical_ratio':  emotional_physical_ratio,
            'break_efficiency':          break_efficiency,
            'mood_overwhelm_gap':        mood_overwhelm_gap,
            'total_stress_index':        total_stress_index,
            'high_risk_flag':            high_risk_flag,
            'task_stress_interaction':   task_stress_interaction,
            'recovery_deficit':          recovery_deficit,
            'emotional_collapse_risk':   emotional_collapse_risk,
            'workload_per_hour':         workload_per_hour,
        }

        # ── Predict using only features the model was trained on ───────────
        X = pd.DataFrame([all_features])[feature_cols]

        # Get class probabilities
        try:
            proba   = model.predict_proba(X)[0]
            classes = list(model.classes_)
            prob_map = dict(zip(classes, proba))
        except Exception:
            prob_map = None

        prediction = model.predict(X)[0]

        # ── High-risk override ──────────────────────────────────────────────
        # The model correctly assigns meaningful probability to 'High' even on
        # genuinely bad check-ins (empirically ~0.30-0.40 on extreme cases),
        # but 'Moderate' often still wins the plain argmax by a small margin.
        # Since under-flagging a genuinely High-stress caregiver is worse than
        # occasionally over-flagging one, treat 'High' as the prediction
        # whenever its own probability crosses this bar - even if it isn't
        # technically the single highest of the three.
        HIGH_RISK_THRESHOLD = 0.35
        if prob_map and prob_map.get('High', 0) >= HIGH_RISK_THRESHOLD:
            prediction = 'High'

        # Confidence should reflect the probability of whichever class is
        # actually being returned, not just whichever was highest overall -
        # otherwise an overridden 'High' would misleadingly report Moderate's
        # (higher) probability as its own confidence.
        if prob_map:
            confidence = float(prob_map.get(prediction, max(proba)))
        else:
            confidence = 0.80

        score_map    = {'Low': 3, 'Moderate': 6, 'High': 9}
        stress_score = score_map.get(prediction, 5)

        print(f"[Caregiver API] → {prediction} ({confidence*100:.1f}% confidence)")

        return jsonify({
            'success':     True,
            'stressLevel': prediction,
            'stressScore': stress_score,
            'confidence':  round(confidence, 2),
            'message':     MESSAGES[prediction],
            'tips':        TIPS[prediction],
            'submittedAt': pd.Timestamp.now().isoformat(),
        })

    except Exception as e:
        print(f"[Caregiver API] Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500


if __name__ == '__main__':
    print("=" * 50)
    print("CAREGIVER ML API - PORT 5001")
    print("=" * 50)
    app.run(host='0.0.0.0', port=5001, debug=True)
    
# from flask import Flask, request, jsonify
# from flask_cors import CORS
# import joblib
# import pandas as pd

# app  = Flask(__name__)
# CORS(app)

# # ── Load model ─────────────────────────────────────────────────────────────
# try:
#     saved        = joblib.load('stress_model.pkl')
#     model        = saved['model']
#     feature_cols = saved['feature_cols']
#     model_name   = saved.get('model_name', 'Random Forest')
#     train_acc    = saved.get('train_acc', 0)
#     val_acc      = saved.get('val_acc',   0)
#     test_acc     = saved.get('test_acc',  0)
#     cv_acc       = saved.get('cv_acc',    0)
#     print(f"Model loaded - {model_name}")
#     print(f"Train: {train_acc*100:.1f}%  Val: {val_acc*100:.1f}%  Test: {test_acc*100:.1f}%  CV: {cv_acc*100:.1f}%")
# except Exception as e:
#     print(f"Run train.py first! Error: {e}")
#     model = None

# # ── Normalize old 3-class labels → new 2-class labels ─────────────────────
# # Safety net in case old stress_model.pkl is still loaded
# def normalize_prediction(pred: str) -> str:
#     mapping = {
#         'High':     'Stressed',
#         'Moderate': 'Stressed',
#         'Low':      'Not Stressed',
#     }
#     return mapping.get(pred, pred)  # if already 'Stressed'/'Not Stressed' returns as-is

# # ── Tips and messages ──────────────────────────────────────────────────────
# TIPS = {
#     'Not Stressed': [
#         'You are managing well today. Keep up your healthy habits.',
#         'Maintain your current sleep schedule.',
#         'Continue taking regular breaks throughout the day.',
#         'Your balance today is good - well done.',
#     ],
#     'Stressed': [
#         'Please take a short break now - your wellbeing matters.',
#         'Try a 5-minute breathing exercise right now.',
#         'Ask for help with some of your tasks today.',
#         'Drink water and step outside briefly.',
#         'Talk to a colleague or supervisor about your workload.',
#         'Make sure you eat and rest properly today.',
#     ],
# }

# MESSAGES = {
#     'Not Stressed': 'You are coping well today. Keep taking care of yourself!',
#     'Stressed':     'Elevated stress detected. Please take a break and seek support.',
# }

# # ── Rule-based override ────────────────────────────────────────────────────
# def apply_stress_rules(prediction, confidence, inputs):
#     """
#     Override model prediction when situation is objectively stressful.
#     Returns (prediction, confidence, rules_triggered)
#     """
#     tasks_assigned  = inputs['tasks_assigned']
#     tasks_done      = inputs['tasks_done']
#     tasks_pending   = inputs['tasks_pending']
#     hours_care      = inputs['hours_care']
#     breaks          = inputs['breaks']
#     overwhelm       = inputs['overwhelm']
#     exhausted       = inputs['exhausted']
#     drained         = inputs['drained']
#     completion_rate = tasks_done / max(tasks_assigned, 1)
#     pending_ratio   = tasks_pending / max(tasks_assigned, 1)

#     rules_triggered = []

#     # Rule 1: >60% tasks unfinished on a long shift
#     if pending_ratio >= 0.6 and hours_care >= 8:
#         rules_triggered.append(
#             f"Rule 1: {int(pending_ratio*100)}% tasks unfinished on a {hours_care}h shift"
#         )

#     # Rule 2: <30% completion with many tasks assigned
#     if completion_rate < 0.30 and tasks_assigned >= 10:
#         rules_triggered.append(
#             f"Rule 2: Only {int(completion_rate*100)}% of {int(tasks_assigned)} tasks done"
#         )

#     # Rule 3: No breaks on a long shift
#     if breaks == 0 and hours_care >= 8:
#         rules_triggered.append(
#             f"Rule 3: 0 breaks taken on a {hours_care}h shift"
#         )

#     # Rule 4: High emotional indicators
#     emotional_total = overwhelm + exhausted + drained
#     if emotional_total >= 10:
#         rules_triggered.append(
#             f"Rule 4: High emotional load ({emotional_total}/15)"
#         )

#     # Rule 5: Many pending tasks and no breaks
#     if tasks_pending >= 15 and breaks == 0:
#         rules_triggered.append(
#             f"Rule 5: {int(tasks_pending)} tasks pending with 0 breaks"
#         )

#     if rules_triggered:
#         return 'Stressed', 0.85, rules_triggered

#     return prediction, confidence, []

# # ── Health check ───────────────────────────────────────────────────────────
# @app.route('/health', methods=['GET'])
# def health():
#     return jsonify({
#         'status':     'ok',
#         'component':  'caregiver',
#         'port':       5001,
#         'model':      'loaded' if model else 'not loaded',
#         'model_name': model_name if model else 'N/A',
#         'train_acc':  f"{train_acc*100:.1f}%" if model else 'N/A',
#         'val_acc':    f"{val_acc*100:.1f}%"   if model else 'N/A',
#         'test_acc':   f"{test_acc*100:.1f}%"  if model else 'N/A',
#         'cv_acc':     f"{cv_acc*100:.1f}%"    if model else 'N/A',
#         'labels':     '1-5=Not Stressed, 6-10=Stressed',
#     })

# # ── Predict ────────────────────────────────────────────────────────────────
# @app.route('/predict', methods=['POST'])
# def predict():
#     if model is None:
#         return jsonify({
#             'success': False,
#             'message': 'Model not loaded. Run train.py first.',
#         }), 500

#     try:
#         body = request.get_json()
#         print(f"\n[Caregiver API] Request: {body}")

#         # ── Extract values ─────────────────────────────────────────────────
#         sleep          = float(body.get('sleepHours',          7))
#         tired          = float(body.get('physicalTiredness',   3))
#         mood           = float(body.get('mood',                3))
#         overwhelm      = float(body.get('emotionalOverwhelm',  3))
#         hours_care     = float(body.get('hoursCaregiving',     8))
#         tasks_assigned = float(body.get('tasksAssigned',      10))
#         tasks_done     = float(body.get('tasksCompleted',      8))
#         difficult      = float(body.get('difficultSituations', 2))
#         breaks         = float(body.get('breaksTaken',         1))
#         exhausted      = float(body.get('mentallyExhausted',   3))
#         diff_managing  = float(body.get('difficultyManaging',  3))
#         drained        = float(body.get('emotionallyDrained',  3))
#         patients       = float(body.get('patients',            5))
#         age_encoded    = float(body.get('ageEncoded',          1))
#         type_encoded   = float(body.get('typeEncoded',         0))
#         exp_encoded    = float(body.get('expEncoded',          1))
#         sup_encoded    = float(body.get('supEncoded',          1))

#         # ── Engineered features ────────────────────────────────────────────
#         tasks_pending            = max(0, tasks_assigned - tasks_done)
#         task_completion_rate     = tasks_done / max(tasks_assigned, 1)
#         workload_score           = tasks_pending + difficult
#         wellbeing_score          = overwhelm + exhausted + drained
#         sleep_deficit            = 8 - sleep
#         task_pressure            = tasks_assigned / max(hours_care, 1)
#         emotional_burden         = overwhelm + diff_managing
#         physical_mental_combined = tired + exhausted
#         mood_vs_overwhelm        = mood - overwhelm
#         pending_ratio            = tasks_pending / max(tasks_assigned, 1)
#         break_ratio              = breaks / max(hours_care, 1)

#         # ── Build feature dict ─────────────────────────────────────────────
#         all_features = {
#             'age_encoded':  age_encoded,
#             'type_encoded': type_encoded,
#             'exp_encoded':  exp_encoded,
#             'sup_encoded':  sup_encoded,
#             'How many patients do you currently care for?':                                                     patients,
#             'How many hours did you sleep last night?':                                                         sleep,
#             'How physically tired do you feel today? (1=Not tired, 5=Extremely tired)':                        tired,
#             'How many hours did you spend caregiving today?':                                                   hours_care,
#             'How many caregiving tasks were assigned today?':                                                   tasks_assigned,
#             'How many tasks did you complete today?':                                                           tasks_done,
#             'How many tasks are still pending?':                                                                tasks_pending,
#             'How many difficult situations occurred today? (e.g., patient confusion, agitation)':               difficult,
#             'How would you describe your mood today? (1=Very bad, 5=Very good)':                               mood,
#             'Did you feel emotionally overwhelmed today? (1=Not at all, 5=Extremely)':                         overwhelm,
#             'I felt mentally exhausted today (1=Strongly Disagree, 5=Strongly Agree)':                         exhausted,
#             'I had difficulty managing my caregiving tasks today (1=Strongly Disagree, 5=Strongly Agree)':     diff_managing,
#             'I felt emotionally drained today (1=Strongly Disagree, 5=Strongly Agree)':                        drained,
#             'How many breaks did you take today?':                                                              breaks,
#             'task_completion_rate':     task_completion_rate,
#             'workload_score':           workload_score,
#             'wellbeing_score':          wellbeing_score,
#             'sleep_deficit':            sleep_deficit,
#             'task_pressure':            task_pressure,
#             'emotional_burden':         emotional_burden,
#             'physical_mental_combined': physical_mental_combined,
#             'mood_vs_overwhelm':        mood_vs_overwhelm,
#             'pending_ratio':            pending_ratio,
#             'break_ratio':              break_ratio,
#         }

#         # ── Select only features model was trained on ──────────────────────
#         X = pd.DataFrame([all_features])[feature_cols]

#         # ── Model prediction ───────────────────────────────────────────────
#         ml_prediction = model.predict(X)[0]
#         proba         = model.predict_proba(X)[0]
#         ml_confidence = float(max(proba))
#         classes       = list(model.classes_)
#         proba_dict    = {cls: round(float(p), 3) for cls, p in zip(classes, proba)}

#         # Normalize old 3-class → 2-class (safety net for old model)
#         ml_prediction = normalize_prediction(ml_prediction)

#         print(f"[Caregiver API] ML model → {ml_prediction} ({ml_confidence*100:.1f}%)")

#         # ── Rule-based override ────────────────────────────────────────────
#         inputs = {
#             'tasks_assigned': tasks_assigned,
#             'tasks_done':     tasks_done,
#             'tasks_pending':  tasks_pending,
#             'hours_care':     hours_care,
#             'breaks':         breaks,
#             'overwhelm':      overwhelm,
#             'exhausted':      exhausted,
#             'drained':        drained,
#         }
#         final_prediction, final_confidence, rules = apply_stress_rules(
#             ml_prediction, ml_confidence, inputs
#         )

#         # Normalize again after rules (extra safety)
#         final_prediction = normalize_prediction(final_prediction)

#         if rules:
#             print(f"[Caregiver API] Rules overrode to → {final_prediction}")
#             for r in rules:
#                 print(f"  {r}")

#         # Score map for frontend
#         score_map    = {'Not Stressed': 3, 'Stressed': 8}
#         stress_score = score_map.get(final_prediction, 5)

#         # Safe message/tips lookup with fallback
#         message = MESSAGES.get(final_prediction, MESSAGES['Stressed'])
#         tips    = TIPS.get(final_prediction, TIPS['Stressed'])

#         print(f"[Caregiver API] Final → {final_prediction} ({final_confidence*100:.1f}%)")

#         return jsonify({
#             'success':        True,
#             'stressLevel':    final_prediction,
#             'stressScore':    stress_score,
#             'confidence':     round(final_confidence, 3),
#             'probabilities':  proba_dict,
#             'message':        message,
#             'tips':           tips,
#             'mlPrediction':   ml_prediction,
#             'rulesTriggered': rules,
#             'submittedAt':    pd.Timestamp.now().isoformat(),
#         })

#     except Exception as e:
#         print(f"[Caregiver API] Error: {e}")
#         import traceback
#         traceback.print_exc()
#         return jsonify({'success': False, 'message': str(e)}), 500


# if __name__ == '__main__':
#     print("=" * 50)
#     print("  CAREGIVER ML API - PORT 5001")
#     print("  Labels: Not Stressed / Stressed")
#     print("  Rule-based override: enabled")
#     print("=" * 50)
#     app.run(host='0.0.0.0', port=5001, debug=True)