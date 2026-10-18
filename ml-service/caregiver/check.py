import pandas as pd

df = pd.read_excel('MemoCare_Caregiver_Stress_Dataset.xlsx')
df.columns = df.columns.str.strip()
print(f"Rows: {df.shape[0]}")

print("\nStress score distribution:")
print(df['How stressed did you feel today?'].value_counts().sort_index())

print("\nStress score sample values (first 20):")
print(df['How stressed did you feel today?'].head(20).tolist())

print("\nStress score data type:", df['How stressed did you feel today?'].dtype)
print("Min:", df['How stressed did you feel today?'].min())
print("Max:", df['How stressed did you feel today?'].max())
print("Mean:", df['How stressed did you feel today?'].mean())