import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import LabelEncoder
import joblib
import os

def train_anomaly_model():
    print("Loading dataset...")
    df = pd.read_csv('dataset/dementia_patients_behavior_data.csv')
    
    # We will train the model to understand the relationship between:
    # Age, Condition, Physical State, Time of Day, Activity, and Duration.
    
    # Encode categorical variables
    le_condition = LabelEncoder()
    le_physical = LabelEncoder()
    le_time = LabelEncoder()
    le_activity = LabelEncoder()
    
    df['condition_encoded'] = le_condition.fit_transform(df['condition'])
    df['physical_encoded'] = le_physical.fit_transform(df['physical_state'])
    df['time_encoded'] = le_time.fit_transform(df['time_of_day'])
    df['activity_encoded'] = le_activity.fit_transform(df['activity'])
    
    features = ['age', 'condition_encoded', 'physical_encoded', 'time_encoded', 'activity_encoded', 'duration_mins']
    X = df[features]
    
    print("Training Isolation Forest Model...")
    # Isolation Forest is great for unsupervised anomaly detection
    # We set contamination to 0.05 assuming ~5% of behaviors are truly anomalous
    model = IsolationForest(n_estimators=100, contamination=0.05, random_state=42)
    model.fit(X)
    
    # Save the model and encoders
    os.makedirs('models', exist_ok=True)
    joblib.dump(model, 'models/isolation_forest_model.pkl')
    joblib.dump(le_condition, 'models/le_condition.pkl')
    joblib.dump(le_physical, 'models/le_physical.pkl')
    joblib.dump(le_time, 'models/le_time.pkl')
    joblib.dump(le_activity, 'models/le_activity.pkl')
    
    print("Model and encoders saved successfully in 'models/' directory.")

if __name__ == "__main__":
    train_anomaly_model()
