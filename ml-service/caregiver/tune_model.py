import pandas as pd
import numpy as np
import joblib
import warnings
warnings.filterwarnings('ignore')

from sklearn.ensemble import RandomForestClassifier, ExtraTreesClassifier
from sklearn.model_selection import (
    train_test_split, StratifiedKFold, RandomizedSearchCV
)
from sklearn.metrics import (
    classification_report, accuracy_score, confusion_matrix, f1_score
)
from sklearn.calibration import CalibratedClassifierCV
from imblearn.over_sampling import SMOTE
from imblearn.pipeline import Pipeline as ImbPipeline

RANDOM_STATE = 42

print("=" * 60)
print("CAREGIVER STRESS - REGULARIZED, LEAKAGE-CHECKED TUNING (v2)")
print("=" * 60)

# ── Load ───────────────────────────────────────────────────────────────────
df = pd.read_excel('MemoCare_Caregiver_Stress_Dataset.xlsx')
df.columns = df.columns.str.strip()
df = df.drop(columns=['Timestamp', 'Column 19'], errors='ignore')
print(f"Loaded: {df.shape[0]} rows")

# ── Duplicate / leakage sanity check (always run, always printed) ─────────
num_cols_check = [
    'How many patients do you currently care for?',
    'How many hours did you sleep last night?',
    'How physically tired do you feel today?',
    'How many hours did you spend caregiving today?',
    'How many caregiving tasks were assigned today?',
    'How many tasks did you complete today?',
    'How many tasks are still pending?',
    'How many difficult situations (e.g., patient confusion, agitation) occurred today?',
    'How would you describe your mood today?',
    'Did you feel emotionally overwhelmed today?',
    'How stressed did you feel today?',
    'I felt mentally exhausted today Question',
    'I had difficulty managing my caregiving tasks today',
    'I felt emotionally drained today',
    'How many breaks did you take today?',
]
_dupe_check = df[num_cols_check].apply(pd.to_numeric, errors='coerce')
n_dupes = _dupe_check.duplicated().sum()
print(f"Duplicate rows on raw survey columns: {n_dupes} ({n_dupes/len(df)*100:.1f}%)")
if n_dupes > 0:
    print("  ⚠ WARNING: duplicate rows found. These will be removed before the")
    print("  train/test split so the same row can never appear on both sides.")

# ── Encode ─────────────────────────────────────────────────────────────────
df['age_encoded']  = df['Age Group'].map(
    {'18-25':0,'18–25':0,'26-35':1,'26–35':1,'36-50':2,'36–50':2,'50+':3}
).fillna(1)

df['type_encoded'] = df['Caregiver Type'].map({
    'Family caregiver':0,
    'Professional caregiver':1,
    'Nursing staff':2,
}).fillna(0)

df['exp_encoded']  = df['How many years of caregiving experience do you have?'].map({
    'Less than 1 year':0,
    '1-3 years':1,'1–3 years':1,
    '3-5 years':2,'3–5 years':2,
    '5-10 years':3,'5–10 years':3,
    'More than 5 years':3,
    'More than 10 years':4,
}).fillna(1)

df['sup_encoded']  = df['Do you have support from others?'].map({'Yes':1,'No':0}).fillna(1)

for col in num_cols_check:
    df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

stress_col = 'How stressed did you feel today?'

# ── Feature engineering (unchanged from original) ──────────────────────────
df['task_completion_rate']     = df['How many tasks did you complete today?'] / df['How many caregiving tasks were assigned today?'].replace(0,1)
df['workload_score']           = df['How many tasks are still pending?'] + df['How many difficult situations (e.g., patient confusion, agitation) occurred today?']
df['wellbeing_score']          = df['Did you feel emotionally overwhelmed today?'] + df['I felt mentally exhausted today Question'] + df['I felt emotionally drained today']
df['sleep_deficit']            = 8 - df['How many hours did you sleep last night?']
df['task_pressure']            = df['How many caregiving tasks were assigned today?'] / df['How many hours did you spend caregiving today?'].replace(0,1)
df['emotional_burden']         = df['Did you feel emotionally overwhelmed today?'] + df['I had difficulty managing my caregiving tasks today']
df['physical_mental_combined'] = df['How physically tired do you feel today?'] + df['I felt mentally exhausted today Question']
df['recovery_score']           = df['How many hours did you sleep last night?'] + df['How many breaks did you take today?']
df['overwhelm_index']          = df['Did you feel emotionally overwhelmed today?'] * df['How many difficult situations (e.g., patient confusion, agitation) occurred today?']
df['pending_ratio']            = df['How many tasks are still pending?'] / df['How many caregiving tasks were assigned today?'].replace(0,1)
df['stress_load']              = df['How physically tired do you feel today?'] * df['How many hours did you spend caregiving today?']
df['emotional_physical_ratio'] = df['wellbeing_score'] / (df['How physically tired do you feel today?'] + 1)
df['break_efficiency']         = df['How many breaks did you take today?'] / df['How many hours did you spend caregiving today?'].replace(0,1)
df['mood_overwhelm_gap']       = df['How would you describe your mood today?'] - df['Did you feel emotionally overwhelmed today?']
df['total_stress_index']       = (df['How physically tired do you feel today?'] + df['wellbeing_score'] + df['workload_score']) / 3
df['high_risk_flag']           = ((df['How many hours did you sleep last night?'] < 6) & (df['wellbeing_score'] > 9)).astype(int)
df['task_stress_interaction']  = df['task_pressure'] * df['How physically tired do you feel today?']
df['recovery_deficit']         = df['workload_score'] / (df['recovery_score'] + 1)
df['emotional_collapse_risk']  = df['wellbeing_score'] * df['How physically tired do you feel today?']
df['workload_per_hour']        = df['How many caregiving tasks were assigned today?'] / df['How many hours did you spend caregiving today?'].replace(0,1)

# ── Labels (unchanged from original) ────────────────────────────────────────
def create_label(row):
    stress_n   = (row[stress_col] - 1) / 9
    emotional  = (row['Did you feel emotionally overwhelmed today?'] +
                  row['I felt mentally exhausted today Question'] +
                  row['I felt emotionally drained today'])
    emotion_n  = (emotional - 3) / 12
    physical_n = (row['How physically tired do you feel today?'] - 1) / 4
    sleep_n    = row['How many hours did you sleep last night?'] / 9
    breaks_n   = min(row['How many breaks did you take today?'] / 5, 1)
    recovery   = (sleep_n + breaks_n) / 2
    composite  = (stress_n * 0.50 + emotion_n * 0.25 +
                  physical_n * 0.15 + (1 - recovery) * 0.10)
    if composite <= 0.35:   return 'Low'
    elif composite <= 0.60: return 'Moderate'
    else:                   return 'High'

df['Stress_Label'] = df.apply(create_label, axis=1)

# ── Deduplicate BEFORE splitting (protects against train/test leakage even
#    if duplicates exist for innocent reasons, e.g. real caregivers giving
#    identical answers on coarse Likert scales) ─────────────────────────────
before = len(df)
df = df.drop_duplicates(subset=num_cols_check).reset_index(drop=True)
after = len(df)
if before != after:
    print(f"Removed {before-after} duplicate rows before splitting ({before} → {after})")

print(f"Labels: {dict(df['Stress_Label'].value_counts())}")

feature_cols = [
    'age_encoded','type_encoded','exp_encoded','sup_encoded',
    'How many patients do you currently care for?',
    'How many hours did you sleep last night?',
    'How physically tired do you feel today?',
    'How many hours did you spend caregiving today?',
    'How many caregiving tasks were assigned today?',
    'How many tasks did you complete today?',
    'How many tasks are still pending?',
    'How many difficult situations (e.g., patient confusion, agitation) occurred today?',
    'How would you describe your mood today?',
    'Did you feel emotionally overwhelmed today?',
    'I felt mentally exhausted today Question',
    'I had difficulty managing my caregiving tasks today',
    'I felt emotionally drained today',
    'How many breaks did you take today?',
    'task_completion_rate','workload_score','wellbeing_score',
    'sleep_deficit','task_pressure','emotional_burden',
    'physical_mental_combined','recovery_score','overwhelm_index',
    'pending_ratio','stress_load','emotional_physical_ratio',
    'break_efficiency','mood_overwhelm_gap','total_stress_index',
    'high_risk_flag','task_stress_interaction','recovery_deficit',
    'emotional_collapse_risk','workload_per_hour',
]

X = df[feature_cols].fillna(0)
y = df['Stress_Label']
print(f"Features: {len(feature_cols)} | Samples: {len(X)}")

# ── Split — touched exactly ONCE for final reporting ────────────────────────
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=RANDOM_STATE, stratify=y
)
print(f"Train: {len(X_train)} | Test: {len(X_test)}")

cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)

# ── Regularized search spaces ────────────────────────────────────────────
# Shallower trees + larger leaf sizes than the original (max_depth up to 15,
# min_samples_leaf=1) — this is the main lever for closing the train/test
# accuracy gap. Wrapped in an imblearn Pipeline so SMOTE is refit fresh on
# each CV fold's training portion only (never on the fold being validated).
et_pipe = ImbPipeline([
    ('sampler', SMOTE(random_state=RANDOM_STATE, k_neighbors=3)),
    ('clf', ExtraTreesClassifier(random_state=RANDOM_STATE, n_jobs=-1, class_weight='balanced')),
])
et_grid = {
    'clf__n_estimators':      [200, 300, 400],
    'clf__max_depth':         [4, 6, 8, 10],
    'clf__min_samples_leaf':  [2, 4, 8],
    'clf__min_samples_split': [4, 8, 12],
    'clf__max_features':      ['sqrt', 'log2'],
}

rf_pipe = ImbPipeline([
    ('sampler', SMOTE(random_state=RANDOM_STATE, k_neighbors=3)),
    ('clf', RandomForestClassifier(random_state=RANDOM_STATE, n_jobs=-1, class_weight='balanced')),
])
rf_grid = {
    'clf__n_estimators':      [200, 300, 500],
    'clf__max_depth':         [4, 6, 8, 10],
    'clf__min_samples_leaf':  [2, 4, 8],
    'clf__min_samples_split': [4, 8, 12],
    'clf__max_features':      ['sqrt', 'log2'],
}

print("\nSearching hyperparameters via CV on the TRAINING set only")
print("(test set is not touched during this step)...")

candidates = {}
for name, pipe, grid in [('ExtraTrees', et_pipe, et_grid), ('RandomForest', rf_pipe, rf_grid)]:
    search = RandomizedSearchCV(
        pipe, grid, n_iter=25, scoring='f1_macro',
        cv=cv, random_state=RANDOM_STATE, n_jobs=-1, refit=True,
    )
    search.fit(X_train, y_train)
    candidates[name] = search
    print(f"  {name}: best CV f1_macro = {search.best_score_*100:.2f}%  "
          f"(params: {search.best_params_})")

# ── Pick the winner by CV score ONLY — test set not involved yet ──────────
best_name = max(candidates, key=lambda k: candidates[k].best_score_)
best_search = candidates[best_name]
best_pipe = best_search.best_estimator_
print(f"\nSelected model: {best_name} (chosen by CV, before ever touching test set)")

# ── Honest overfitting diagnostic ──────────────────────────────────────────
# Train accuracy is measured on the ORIGINAL (non-resampled) training data —
# this is the number that should be compared against test accuracy to see
# real overfitting; comparing against the SMOTE-balanced fit accuracy would
# be misleading, since that data was partially synthetic.
train_acc = accuracy_score(y_train, best_pipe.predict(X_train))
test_acc  = accuracy_score(y_test,  best_pipe.predict(X_test))
cv_f1     = best_search.best_score_

print("\n" + "=" * 60)
print("OVERFITTING DIAGNOSTIC")
print("=" * 60)
print(f"Train accuracy (real, non-resampled data): {train_acc*100:.2f}%")
print(f"CV f1_macro (on train, proper SMOTE-in-fold pipeline): {cv_f1*100:.2f}%")
print(f"Held-out TEST accuracy (touched once, final): {test_acc*100:.2f}%")
print(f"Train vs Test gap: {abs(train_acc-test_acc)*100:.2f} points "
      f"{'(healthy)' if abs(train_acc-test_acc) < 0.05 else '(still some overfitting — consider shallower trees)'}")

print(f"\nClassification Report (test set, evaluated once):")
test_pred = best_pipe.predict(X_test)
print(classification_report(y_test, test_pred))

print("Confusion Matrix:")
cm = confusion_matrix(y_test, test_pred, labels=['Low', 'Moderate', 'High'])
print("              Predicted")
print("              Low  Mod  High")
for i, rl in enumerate(['Low  ', 'Mod  ', 'High ']):
    print(f"Actual {rl}  {cm[i]}")

# ── Calibrate probabilities (app.py relies on predict_proba thresholds) ────
# Tree ensembles fit on SMOTE-resampled data tend to have skewed, poorly
# calibrated probabilities. This wraps the already-chosen pipeline so
# predict_proba outputs are closer to true likelihoods, without changing
# predict()'s class labels or requiring any change to app.py (it still
# exposes .predict, .predict_proba, and .classes_).
print("\nCalibrating probabilities...")
calibrated_model = CalibratedClassifierCV(best_pipe, method='isotonic', cv=5)
calibrated_model.fit(X_train, y_train)

# Recheck accuracy after calibration (should be very close to before)
calibrated_test_acc = accuracy_score(y_test, calibrated_model.predict(X_test))
print(f"Test accuracy after calibration: {calibrated_test_acc*100:.2f}% "
      f"(should be close to {test_acc*100:.2f}%)")

# ── Save ───────────────────────────────────────────────────────────────────
joblib.dump({
    'model':          calibrated_model,
    'feature_cols':   feature_cols,
    'accuracy':       calibrated_test_acc,
    'train_accuracy': train_acc,
    'cv_f1_macro':    cv_f1,
    'model_name':     f'{best_name} (regularized, calibrated)',
    'component':      'caregiver',
    'tuning_method':  'RandomizedSearchCV on train-only CV, test touched once, isotonic calibration',
    'best_params':    best_search.best_params_,
}, 'stress_model.pkl')

print(f"\n✅ stress_model.pkl saved!")
print(f"✅ Model:          {best_name}")
print(f"✅ Train accuracy:  {train_acc*100:.2f}%")
print(f"✅ Test accuracy:   {calibrated_test_acc*100:.2f}%")
print(f"✅ Train/Test gap:  {abs(train_acc-calibrated_test_acc)*100:.2f} points")
print("\n" + "=" * 60)
print("COMPLETE")
print("=" * 60)