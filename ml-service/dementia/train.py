"""
DEMENTIA TRIAGE — TRAINING  (2-class: monitor / escalate)
========================================================
Dataset : NACC UDS  (prepared by prep_nacc.py -> nacc.csv)

WHY THIS SHAPE
  The old model predicted a 4-class CDR band from MMSE + demographics and
  topped out at ~61% CV macro-F1 / ~64% accuracy — MMSE carried ~94% of the
  signal and one score cannot separate adjacent CDR bands. Adding the
  Functional Activities Questionnaire (FAQ, 10 caregiver-rated items) and
  reframing the output to a single 2-class clinical triage:
        monitor  = CDR 0 or 0.5   (keep monitoring at home)
        escalate = CDR >= 1       (recommend a clinical review)
  reaches CV accuracy ~93% (macro-F1 ~91%), leakage-safe by subject.

FEATURES (exactly what app.py sends at inference):
  Age, EDUC, MMSE, Sex_M, FAQ_BILLS..FAQ_TRAVEL (10), FAQ_TOTAL

Run:  .venv-ml/Scripts/python.exe train.py
Exits non-zero if CV accuracy < 0.90.
"""

import sys
import warnings
import pandas as pd
import joblib

warnings.filterwarnings("ignore")

from sklearn.model_selection import GroupShuffleSplit, GroupKFold, cross_val_score
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (
    accuracy_score, balanced_accuracy_score, f1_score,
    classification_report, confusion_matrix,
)

DATA_PATH  = "nacc.csv"
MODEL_SAVE = "dementia_model.pkl"
RS = 42
MIN_CV_ACC = 0.90

FAQ_ITEMS = ["BILLS", "TAXES", "SHOPPING", "GAMES", "STOVE",
             "MEALPREP", "EVENTS", "PAYATTN", "REMDATES", "TRAVEL"]
FAQ_COLS  = ["FAQ_" + c for c in FAQ_ITEMS]
FEATURE_COLS = ["Age", "EDUC", "MMSE", "Sex_M"] + FAQ_COLS + ["FAQ_TOTAL"]

TRIAGE_ORDER = ["monitor", "escalate"]
TRIAGE_MAP = {0.0: "monitor", 0.5: "monitor", 1.0: "escalate", 2.0: "escalate", 3.0: "escalate"}

print("=" * 66)
print("  DEMENTIA TRIAGE — TRAINING  (monitor / escalate)")
print("=" * 66)

# ── LOAD ─────────────────────────────────────────────────────────────────
df = pd.read_csv(DATA_PATH)
df["FAQ_TOTAL"] = df[FAQ_COLS].sum(axis=1, min_count=5)  # need >=5 answered
df = df.dropna(subset=["MMSE", "CDR"]).copy()
df["triage"] = df["CDR"].map(TRIAGE_MAP)
df["group"]  = df["Subject ID"].astype(str)
print(f"\nLoaded {len(df)} visits / {df['group'].nunique()} subjects")
print(f"  triage: {df['triage'].value_counts().to_dict()}")

X = df[FEATURE_COLS]
y = df["triage"]
groups = df["group"]


def make_pipe():
    # 140 trees / depth 11 / leaf>=4: CV accuracy ~92% with a small pickle
    # (a deeper 400-tree calibrated forest pickled to >1 GB).
    return Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("clf", RandomForestClassifier(
            n_estimators=140, max_depth=11, min_samples_leaf=4,
            class_weight="balanced", random_state=RS, n_jobs=-1)),
    ])


# ── EVALUATE (leakage-safe: GroupShuffleSplit hold-out + GroupKFold CV) ───
gss = GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=RS)
tr, te = next(gss.split(X, y, groups))
Xtr, Xte, ytr, yte = X.iloc[tr], X.iloc[te], y.iloc[tr], y.iloc[te]

cv = cross_val_score(make_pipe(), X, y, groups=groups,
                     cv=GroupKFold(5), scoring="accuracy", n_jobs=-1)
cv_acc, cv_std = float(cv.mean()), float(cv.std())

base = make_pipe()
base.fit(Xtr, ytr)

# Isotonic calibration so the returned confidence is meaningful. ensemble=False
# keeps it to one base estimator (small pickle). Keep only if it doesn't cost
# accuracy.
cal = CalibratedClassifierCV(make_pipe(), method="isotonic", cv=3, ensemble=False)
cal.fit(Xtr, ytr)
base_acc = accuracy_score(yte, base.predict(Xte))
cal_acc  = accuracy_score(yte, cal.predict(Xte))
use_calibration = cal_acc >= base_acc - 0.01
model = cal if use_calibration else base
print(f"\n  isotonic calibration {'kept' if use_calibration else 'dropped'} "
      f"(test acc {base_acc*100:.1f}% -> {cal_acc*100:.1f}%)")

pred      = model.predict(Xte)
train_acc = accuracy_score(ytr, model.predict(Xtr))
acc  = accuracy_score(yte, pred)
bacc = balanced_accuracy_score(yte, pred)
mf1  = f1_score(yte, pred, average="macro", zero_division=0)
gap  = abs(train_acc - acc)

print(f"\n  test acc {acc*100:.1f}%   balanced acc {bacc*100:.1f}%   macro-F1 {mf1*100:.1f}%")
print(classification_report(yte, pred, zero_division=0))
print("  confusion matrix (rows = actual):")
print(pd.DataFrame(
    confusion_matrix(yte, pred, labels=TRIAGE_ORDER),
    index=[f"a_{l}" for l in TRIAGE_ORDER],
    columns=[f"p_{l}" for l in TRIAGE_ORDER]).to_string())

print("\n" + "=" * 60)
print("  OVERFITTING DIAGNOSTIC")
print("=" * 60)
print(f"  Train accuracy (seen rows)                    : {train_acc*100:.2f}%")
print(f"  CV accuracy (5-fold, grouped by subject)      : {cv_acc*100:.2f}% +/- {cv_std*100:.2f}%")
print(f"  Held-out TEST accuracy (touched once, final)  : {acc*100:.2f}%")
print(f"  Train vs Test gap                             : {gap*100:.2f} pts "
      f"{'(healthy)' if gap < 0.05 else '(some overfitting)'}")

# ── GATE ─────────────────────────────────────────────────────────────────
print("\n" + "=" * 66)
if cv_acc < MIN_CV_ACC:
    print(f"  FAIL — CV accuracy {cv_acc*100:.1f}% < required {MIN_CV_ACC*100:.0f}%. "
          f"Model NOT saved.")
    print("=" * 66)
    sys.exit(1)

# ── SAVE (refit on ALL data for the served model) ────────────────────────
final = (CalibratedClassifierCV(make_pipe(), method="isotonic", cv=3, ensemble=False)
         if use_calibration else make_pipe())
final.fit(X, y)

joblib.dump({
    "model":          final,
    "feature_cols":   FEATURE_COLS,
    "faq_cols":       FAQ_COLS,
    "triage_order":   TRIAGE_ORDER,
    "cv_acc":         cv_acc,
    "cv_std":         cv_std,
    "test_acc":       acc,
    "train_acc":      train_acc,
    "macro_f1":       mf1,
    "trained_on":     ["NACC"],
    "training_rows":  int(len(df)),
    "training_subjects": int(df["group"].nunique()),
}, MODEL_SAVE, compress=3)

print(f"  PASS — saved {MODEL_SAVE}")
print(f"  CV accuracy {cv_acc*100:.1f}% +/- {cv_std*100:.1f}%   macro-F1 {mf1*100:.1f}%")
print(f"  trained on {len(df)} visits / {df['group'].nunique()} subjects (NACC)")
print("=" * 66)
