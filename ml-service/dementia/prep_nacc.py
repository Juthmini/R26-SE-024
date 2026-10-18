"""
PREP NACC UDS  ->  nacc.csv   (training table for train.py)
==========================================================
NACC's Uniform Data Set (UDS) is a large, real, longitudinal Alzheimer's
Disease Research Center cohort. It is the only source we train on now: it is
~140x larger than OASIS-1+2 combined, has real `severe` cases, AND carries the
Functional Activities Questionnaire (FAQ) — the feature that lifts the model
from ~64% to ~93% (see train.py header).

Source file: a commercial/full NACC UDS export (e.g. commercial_nacc74.csv),
~1,700 columns wide. We read ONLY the columns the model needs.

Columns used (NACC Researcher's Data Dictionary,
https://www.naccdata.org/data-forms-and-documentation/ ):
    NACCID    subject id                                 -> Subject ID  (group key)
    NACCAGE   age at visit                               -> Age
    NACCSEX   1 = Male, 2 = Female                        -> Sex_M
    EDUC      years of education (0-36; 99 = unknown)     -> EDUC
    NACCMMSE  MMSE total (0-30; -4/88/95-98 = missing)    -> MMSE
    CDRGLOB   global CDR (0, 0.5, 1, 2, 3; 99 = missing)  -> CDR  (label source)

    FAQ (form B7, Functional Activities Questionnaire) — 10 items, each 0-3:
      BILLS TAXES SHOPPING GAMES STOVE MEALPREP EVENTS PAYATTN REMDATES TRAVEL
    NACC item codes: 0-3 real score, 8 = "never did / not applicable",
    9 = "unknown", -4 = "not available this packet".

Missing-value handling:
    NACCMMSE : keep 0-30                        (drop -4, 88, 95-98)
    CDRGLOB  : keep 0, 0.5, 1, 2, 3             (drop 99)
    NACCSEX  : keep 1, 2                        (drop 8, 9)
    EDUC     : keep 0-36                        (drop 99)
    NACCAGE  : keep 1-110
    FAQ item : keep 0-3; map 8 -> 0 (never did an activity is not impairment);
               map -4 / 9 -> blank (median-imputed downstream in train.py)

Run:  .venv-ml/Scripts/python.exe prep_nacc.py "D:/research/commercial_nacc74.csv"
"""

import sys
import pandas as pd

DEFAULT_SRC = "D:/research/commercial_nacc74.csv"
OUT = "nacc.csv"

FAQ_ITEMS = ["BILLS", "TAXES", "SHOPPING", "GAMES", "STOVE",
             "MEALPREP", "EVENTS", "PAYATTN", "REMDATES", "TRAVEL"]
BASE_COLS = ["NACCID", "NACCAGE", "NACCSEX", "EDUC", "NACCMMSE", "CDRGLOB"]
USECOLS = BASE_COLS + FAQ_ITEMS

src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC
print(f"Reading NACC UDS from: {src}")
print(f"  (reading only {len(USECOLS)} of ~1,700 columns for speed)")
df = pd.read_csv(src, usecols=USECOLS, low_memory=False)
print(f"  {len(df)} raw rows, {df['NACCID'].nunique()} unique subjects")

# ── base-column validity ──────────────────────────────────────────────────
valid_mmse = df["NACCMMSE"].between(0, 30)
valid_cdr  = df["CDRGLOB"].isin([0, 0.5, 1.0, 2.0, 3.0])
valid_sex  = df["NACCSEX"].isin([1, 2])
valid_educ = df["EDUC"].between(0, 36)
valid_age  = df["NACCAGE"].between(1, 110)

before = len(df)
df = df[valid_mmse & valid_cdr & valid_sex & valid_educ & valid_age].copy()
print(f"  kept {len(df)} rows with valid MMSE+CDR+sex+educ+age "
      f"(dropped {before - len(df)} with missing/invalid codes)")
print(f"  unique subjects: {df['NACCID'].nunique()}")

out = pd.DataFrame()
out["Subject ID"] = df["NACCID"]
out["Sex_M"] = (df["NACCSEX"] == 1).astype(int)
out["Age"]   = df["NACCAGE"]
out["EDUC"]  = df["EDUC"]
out["MMSE"]  = df["NACCMMSE"]
out["CDR"]   = df["CDRGLOB"]

# ── FAQ items: 0-3 kept, 8 -> 0, everything else -> blank ─────────────────
for col in FAQ_ITEMS:
    s = pd.to_numeric(df[col], errors="coerce")
    s = s.where(s.isin([0, 1, 2, 3, 8]))   # -4, 9, NaN -> missing
    out["FAQ_" + col] = s.replace(8, 0)

faq_cols = ["FAQ_" + c for c in FAQ_ITEMS]
coverage = out[faq_cols].notna().mean().mean() * 100
n_any_faq = out[faq_cols].notna().any(axis=1).sum()
print(f"\n  FAQ mean cell coverage: {coverage:.1f}%  |  rows with >=1 FAQ answer: "
      f"{n_any_faq} ({n_any_faq / len(out) * 100:.1f}%)")

triage = out["CDR"].map({0.0: "monitor", 0.5: "monitor",
                         1.0: "escalate", 2.0: "escalate", 3.0: "escalate"})
print("\n  Triage label distribution (CDR<=0.5 monitor / CDR>=1 escalate):")
for lab, n in triage.value_counts().items():
    print(f"    {lab:<10} {n:>6}  ({n / len(out) * 100:4.1f}%)")

sev = out["CDR"].map({0.0: "none", 0.5: "mild", 1.0: "moderate",
                      2.0: "severe", 3.0: "severe"})
print("\n  4-class stage distribution (secondary label):")
for lab in ["none", "mild", "moderate", "severe"]:
    n = int((sev == lab).sum())
    print(f"    {lab:<10} {n:>6}  ({n / len(out) * 100:4.1f}%)")

out.to_csv(OUT, index=False)
print(f"\nWrote -> {OUT}  ({len(out)} rows, {len(out.columns)} cols)  — now run train.py")
