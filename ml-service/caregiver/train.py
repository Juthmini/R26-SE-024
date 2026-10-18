import pandas as pd
import numpy as np
import joblib
import warnings
warnings.filterwarnings('ignore')

from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
from sklearn.metrics import classification_report, accuracy_score
from imblearn.over_sampling import SMOTE

print("=" * 50)
print("CAREGIVER STRESS - FIXED LABELING")
print("=" * 50)

df = pd.read_excel('MemoCare_Caregiver_Stress_Dataset_Cleaned (1).xlsx')
df = df.drop(columns=['Timestamp'], errors='ignore')
print(f"Loaded: {df.shape[0]} rows")

# Encode
df['age_encoded']  = df['Age Group'].map({'18-25':0,'18–25':0,'26-35':1,'26–35':1,'36-50':2,'36–50':2,'50+':3}).fillna(1)
df['type_encoded'] = df['Caregiver Type'].map({'Professional caregiver':0,'Nursing staff':1}).fillna(0)
df['exp_encoded']  = df['How many years of caregiving experience do you have?'].map({'Less than 1 year':0,'1-3 years':1,'1–3 years':1,'3-5 years':2,'3–5 years':2,'5-10 years':3,'5–10 years':3,'More than 10 years':4}).fillna(1)
df['sup_encoded']  = df['Do you have support from others?'].map({'Yes':1,'No':0}).fillna(1)

num_cols = [
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
for col in num_cols:
    df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

# Feature engineering
df['task_completion_rate']     = df['How many tasks did you complete today?'] / df['How many caregiving tasks were assigned today?'].replace(0,1)
df['workload_score']           = df['How many tasks are still pending?'] + df['How many difficult situations (e.g., patient confusion, agitation) occurred today?']
df['wellbeing_score']          = df['Did you feel emotionally overwhelmed today?'] + df['I felt mentally exhausted today Question'] + df['I felt emotionally drained today']
df['sleep_deficit']            = 8 - df['How many hours did you sleep last night?']
df['task_pressure']            = df['How many caregiving tasks were assigned today?'] / df['How many hours did you spend caregiving today?'].replace(0,1)
df['emotional_burden']         = df['Did you feel emotionally overwhelmed today?'] + df['I had difficulty managing my caregiving tasks today']
df['physical_mental_combined'] = df['How physically tired do you feel today?'] + df['I felt mentally exhausted today Question']
df['recovery_score']           = df['How many hours did you sleep last night?'] + df['How many breaks did you take today?']
df['overwhelm_index']          = df['Did you feel emotionally overwhelmed today?'] * df['How many difficult situations (e.g., patient confusion, agitation) occurred today?']

# ── CORRECT LABELING ───────────────────────────────────────────────────────
# Use composite score from ALL stress indicators
# Not just the single stress score column
stress_col = 'How stressed did you feel today?'

def create_composite_label(row):
    # Normalize stress score (1-10) to 0-1
    stress_normalized = (row[stress_col] - 1) / 9

    # Normalize emotional burden (3-15) to 0-1
    emotional = (row['Did you feel emotionally overwhelmed today?'] +
                 row['I felt mentally exhausted today Question'] +
                 row['I felt emotionally drained today'])
    emotional_normalized = (emotional - 3) / 12

    # Normalize physical (1-5) to 0-1
    physical_normalized = (row['How physically tired do you feel today?'] - 1) / 4

    # Normalize recovery (lower = worse)
    sleep_norm  = row['How many hours did you sleep last night?'] / 9
    breaks_norm = row['How many breaks did you take today?'] / 5
    recovery    = (sleep_norm + breaks_norm) / 2

    # Composite: stress drives 50%, emotional 25%, physical 15%, recovery 10%
    composite = (stress_normalized * 0.50 +
                 emotional_normalized * 0.25 +
                 physical_normalized * 0.15 +
                 (1 - recovery) * 0.10)

    if composite <= 0.35:
        return 'Low'
    elif composite <= 0.60:
        return 'Moderate'
    else:
        return 'High'

df['Stress_Label'] = df.apply(create_composite_label, axis=1)
print(f"\nLabel distribution:")
print(df['Stress_Label'].value_counts())

# Verify the labels make sense
print(f"\nAvg stress score per label:")
for label in ['Low', 'Moderate', 'High']:
    sub = df[df['Stress_Label'] == label]
    print(f"  {label}: avg={sub[stress_col].mean():.2f}, n={len(sub)}")

# Features (NO stress score)
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
]

X = df[feature_cols].fillna(0)
y = df['Stress_Label']

mask = y.notna()
X    = X[mask]
y    = y[mask]

# Train/test split
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# SMOTE
print("\nApplying SMOTE...")
smote = SMOTE(random_state=42, k_neighbors=3)
X_train_bal, y_train_bal = smote.fit_resample(X_train, y_train)
print(f"After SMOTE: {dict(pd.Series(y_train_bal).value_counts())}")

# Train
print("\nTraining Random Forest...")
rf = RandomForestClassifier(
    n_estimators=300,
    max_depth=12,
    min_samples_split=5,
    min_samples_leaf=2,
    class_weight='balanced',
    random_state=42,
)
rf.fit(X_train_bal, y_train_bal)

y_pred = rf.predict(X_test)
acc    = accuracy_score(y_test, y_pred)
cv     = cross_val_score(rf, X_train_bal, y_train_bal,
         cv=StratifiedKFold(n_splits=5, shuffle=True, random_state=42))

print(f"\n{'='*50}")
print(f"Test Accuracy:  {acc*100:.1f}%")
print(f"CV Accuracy:    {cv.mean()*100:.1f}% +/- {cv.std()*100:.1f}%")
print(f"{'='*50}")
print(classification_report(y_test, y_pred))

imp = pd.Series(rf.feature_importances_, index=feature_cols).nlargest(10)
print("Top 10 Features:")
for feat, val in imp.items():
    bar = '█' * int(val * 60)
    print(f"  {bar} {val:.4f} - {feat}")

joblib.dump({
    'model':        rf,
    'feature_cols': feature_cols,
    'accuracy':     acc,
    'model_name':   'Random Forest (Composite Labels)',
    'component':    'caregiver',
}, 'stress_model.pkl')

print(f"\n✅ stress_model.pkl saved!")
print(f"✅ Accuracy: {acc*100:.1f}%")
# import pandas as pd
# import numpy as np
# import joblib
# import warnings
# warnings.filterwarnings("ignore")

# from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier, ExtraTreesClassifier
# from sklearn.model_selection import train_test_split, RepeatedStratifiedKFold, cross_val_score
# from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

# DATA_PATH  = "Caregiver_Stress_Dataset_Realistic.xlsx"
# MODEL_SAVE = "stress_model.pkl"
# STRESS_COL = "How stressed did you feel today? (1=Not stressed, 10=Extremely stressed)"

# print("=" * 65)
# print("  CAREGIVER STRESS PREDICTION  (2-Class)")
# print("=" * 65)

# # STEP 1 - LOAD
# df = pd.read_excel(DATA_PATH)
# print(f"\nLoaded {len(df)} rows")

# # STEP 2 - CREATE 2-CLASS LABELS
# # Score 1-5  = Not Stressed
# # Score 6-10 = Stressed
# def assign_label(score):
#     return "Not Stressed" if score <= 5 else "Stressed"

# df["Stress_Label"] = pd.to_numeric(
#     df[STRESS_COL], errors="coerce"
# ).apply(assign_label)

# print("\nLabel distribution:")
# for label, count in df["Stress_Label"].value_counts().items():
#     print(f"  {label:<15} {count} rows  ({count/len(df)*100:.1f}%)")

# # STEP 3 - ENCODE CATEGORICALS
# df["age_encoded"] = df["Age Group"].map(
#     {"18-25":0,"18\u201325":0,"26-35":1,"26\u201335":1,
#      "36-50":2,"36\u201350":2,"50+":3}
# ).fillna(1)
# df["type_encoded"] = df["Caregiver Type"].map(
#     {"Professional caregiver":0,"Nursing staff":1}
# ).fillna(0)
# df["exp_encoded"] = df["How many years of caregiving experience do you have?"].map(
#     {"Less than 1 year":0,"1-3 years":1,"1\u20133 years":1,
#      "3-5 years":2,"3\u20135 years":2,
#      "5-10 years":3,"5\u201310 years":3,"More than 10 years":4}
# ).fillna(1)
# df["sup_encoded"] = df["Do you have support from others?"].map(
#     {"Yes":1,"No":0}
# ).fillna(1)

# # STEP 4 - NUMERIC COLUMNS
# num_cols = [
#     "How many patients do you currently care for?",
#     "How many hours did you sleep last night?",
#     "How physically tired do you feel today? (1=Not tired, 5=Extremely tired)",
#     "How many hours did you spend caregiving today?",
#     "How many caregiving tasks were assigned today?",
#     "How many tasks did you complete today?",
#     "How many tasks are still pending?",
#     "How many difficult situations occurred today? (e.g., patient confusion, agitation)",
#     "How would you describe your mood today? (1=Very bad, 5=Very good)",
#     "Did you feel emotionally overwhelmed today? (1=Not at all, 5=Extremely)",
#     "I felt mentally exhausted today (1=Strongly Disagree, 5=Strongly Agree)",
#     "I had difficulty managing my caregiving tasks today (1=Strongly Disagree, 5=Strongly Agree)",
#     "I felt emotionally drained today (1=Strongly Disagree, 5=Strongly Agree)",
#     "How many breaks did you take today?",
# ]
# for col in num_cols:
#     df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

# # STEP 5 - FEATURE ENGINEERING
# df["task_completion_rate"]     = df["How many tasks did you complete today?"] / df["How many caregiving tasks were assigned today?"].replace(0,1)
# df["workload_score"]           = df["How many tasks are still pending?"] + df["How many difficult situations occurred today? (e.g., patient confusion, agitation)"]
# df["wellbeing_score"]          = df["Did you feel emotionally overwhelmed today? (1=Not at all, 5=Extremely)"] + df["I felt mentally exhausted today (1=Strongly Disagree, 5=Strongly Agree)"] + df["I felt emotionally drained today (1=Strongly Disagree, 5=Strongly Agree)"]
# df["sleep_deficit"]            = 8 - df["How many hours did you sleep last night?"]
# df["task_pressure"]            = df["How many caregiving tasks were assigned today?"] / df["How many hours did you spend caregiving today?"].replace(0,1)
# df["emotional_burden"]         = df["Did you feel emotionally overwhelmed today? (1=Not at all, 5=Extremely)"] + df["I had difficulty managing my caregiving tasks today (1=Strongly Disagree, 5=Strongly Agree)"]
# df["physical_mental_combined"] = df["How physically tired do you feel today? (1=Not tired, 5=Extremely tired)"] + df["I felt mentally exhausted today (1=Strongly Disagree, 5=Strongly Agree)"]
# df["mood_vs_overwhelm"]        = df["How would you describe your mood today? (1=Very bad, 5=Very good)"] - df["Did you feel emotionally overwhelmed today? (1=Not at all, 5=Extremely)"]
# df["pending_ratio"]            = df["How many tasks are still pending?"] / df["How many caregiving tasks were assigned today?"].replace(0,1)
# df["break_ratio"]              = df["How many breaks did you take today?"] / df["How many hours did you spend caregiving today?"].replace(0,1)

# # STEP 6 - FEATURE LIST (stress score NOT included)
# feature_cols = [
#     "age_encoded","type_encoded","exp_encoded","sup_encoded",
#     "How many patients do you currently care for?",
#     "How many hours did you sleep last night?",
#     "How physically tired do you feel today? (1=Not tired, 5=Extremely tired)",
#     "How many hours did you spend caregiving today?",
#     "How many caregiving tasks were assigned today?",
#     "How many tasks did you complete today?",
#     "How many tasks are still pending?",
#     "How many difficult situations occurred today? (e.g., patient confusion, agitation)",
#     "How would you describe your mood today? (1=Very bad, 5=Very good)",
#     "Did you feel emotionally overwhelmed today? (1=Not at all, 5=Extremely)",
#     "I felt mentally exhausted today (1=Strongly Disagree, 5=Strongly Agree)",
#     "I had difficulty managing my caregiving tasks today (1=Strongly Disagree, 5=Strongly Agree)",
#     "I felt emotionally drained today (1=Strongly Disagree, 5=Strongly Agree)",
#     "How many breaks did you take today?",
#     "task_completion_rate","workload_score","wellbeing_score","sleep_deficit",
#     "task_pressure","emotional_burden","physical_mental_combined",
#     "mood_vs_overwhelm","pending_ratio","break_ratio",
# ]

# assert STRESS_COL not in feature_cols, "DATA LEAKAGE DETECTED"
# print("\nNo data leakage - stress score excluded from features")

# X = df[feature_cols].fillna(0)
# y = df["Stress_Label"]

# # STEP 7 - SPLIT  70% Train | 15% Validation | 15% Test
# print("\n[Step 1] Splitting dataset")
# X_temp, X_test,  y_temp, y_test  = train_test_split(
#     X, y, test_size=0.15, random_state=42, stratify=y)
# X_train, X_val,  y_train, y_val  = train_test_split(
#     X_temp, y_temp, test_size=0.176, random_state=42, stratify=y_temp)
# print(f"  Train: {len(X_train)}  |  Validation: {len(X_val)}  |  Test: {len(X_test)}")

# # STEP 8 - TRAIN MODELS
# print("\n[Step 2] Training models...\n")

# models = {
#     "Random Forest": RandomForestClassifier(
#         n_estimators=300, max_depth=3,
#         min_samples_leaf=3, random_state=42, n_jobs=-1),
#     "Extra Trees": ExtraTreesClassifier(
#         n_estimators=300, max_depth=3,
#         min_samples_leaf=3, random_state=42, n_jobs=-1),
#     "Gradient Boosting": GradientBoostingClassifier(
#         n_estimators=200, max_depth=3,
#         learning_rate=0.05, subsample=0.8, random_state=42),
# }

# # Repeated Stratified CV (3 repeats x 5 folds = 15 splits)
# # More stable than single 5-fold, reduces variance from small dataset
# rcv = RepeatedStratifiedKFold(n_splits=5, n_repeats=3, random_state=42)

# print(f"{'Model':<22} {'Train':>8} {'Val':>8} {'Test':>8} {'CV (3x5)':>10} {'Std':>6} {'Gap':>8}")
# print("-" * 72)

# all_results = {}
# for name, m in models.items():
#     m.fit(X_train, y_train)
#     tr   = accuracy_score(y_train, m.predict(X_train))
#     va   = accuracy_score(y_val,   m.predict(X_val))
#     te   = accuracy_score(y_test,  m.predict(X_test))
#     cv   = cross_val_score(m, X, y, cv=rcv)
#     gap  = tr - te
#     print(f"{name:<22} {tr*100:>7.1f}% {va*100:>7.1f}% {te*100:>7.1f}%"
#           f" {cv.mean()*100:>9.1f}% {cv.std()*100:>5.1f}% {gap*100:>7.1f}%")
#     all_results[name] = {
#         "model":m,"train":tr,"val":va,"test":te,
#         "cv":cv.mean(),"cv_std":cv.std(),"gap":gap
#     }

# # STEP 9 - BEST MODEL
# best_name  = max(all_results, key=lambda k: all_results[k]["val"])
# best       = all_results[best_name]
# best_model = best["model"]
# best_pred  = best_model.predict(X_test)

# print(f"\n{'='*65}")
# print(f"  BEST MODEL : {best_name}")
# print(f"{'='*65}")
# print(f"  Training   Accuracy : {best['train']*100:.1f}%")
# print(f"  Validation Accuracy : {best['val']*100:.1f}%")
# print(f"  Test       Accuracy : {best['test']*100:.1f}%")
# print(f"  CV         Accuracy : {best['cv']*100:.1f}% +/- {best['cv_std']*100:.1f}%")
# print(f"  Train-Test Gap      : {best['gap']*100:.1f}%")
# print(f"  Test-CV    Gap      : {(best['test']-best['cv'])*100:.1f}%")

# # STEP 10 - CLASSIFICATION REPORT
# print(f"\n{'-'*65}")
# print("  CLASSIFICATION REPORT")
# print(f"{'-'*65}")
# print(classification_report(y_test, best_pred, zero_division=0))

# # STEP 11 - CONFUSION MATRIX
# print(f"{'-'*65}")
# print("  CONFUSION MATRIX (rows=actual, cols=predicted)")
# print(f"{'-'*65}")
# labels = ["Not Stressed","Stressed"]
# cm = confusion_matrix(y_test, best_pred, labels=labels)
# cm_df = pd.DataFrame(cm,
#     index   = [f"Actual {l}" for l in labels],
#     columns = [f"Pred {l}"   for l in labels])
# print(cm_df.to_string())

# # STEP 12 - FEATURE IMPORTANCE
# print(f"\n{'-'*65}")
# print("  TOP 10 IMPORTANT FEATURES")
# print(f"{'-'*65}")
# imp = pd.Series(best_model.feature_importances_, index=feature_cols).nlargest(10)
# for feat, val in imp.items():
#     bar = "#" * int(val * 60)
#     print(f"  {bar:<20} {val:.4f}  {feat}")

# # STEP 13 - SAVE MODEL
# joblib.dump({
#     "model":        best_model,
#     "feature_cols": feature_cols,
#     "model_name":   best_name,
#     "train_acc":    best["train"],
#     "val_acc":      best["val"],
#     "test_acc":     best["test"],
#     "cv_acc":       best["cv"],
#     "cv_std":       best["cv_std"],
#     "label_bins":   "1-5=Not Stressed, 6-10=Stressed",
# }, MODEL_SAVE)

# print(f"\n{'='*65}")
# print(f"  Model saved -> {MODEL_SAVE}")
# print(f"  Training   Accuracy : {best['train']*100:.1f}%")
# print(f"  Validation Accuracy : {best['val']*100:.1f}%")
# print(f"  Test       Accuracy : {best['test']*100:.1f}%")
# print(f"  CV         Accuracy : {best['cv']*100:.1f}% +/- {best['cv_std']*100:.1f}%")
# print(f"  Test-CV    Gap      : {(best['test']-best['cv'])*100:.1f}%")
# print(f"{'='*65}")