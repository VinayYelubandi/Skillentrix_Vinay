import os
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix, roc_curve
import xgboost as xgb
import sklearn

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH = os.path.join(BASE_DIR, "data", "Telco-Customer-Churn.csv")
MODEL_DIR = os.path.join(BASE_DIR, "models")
METRICS_PATH = os.path.join(BASE_DIR, "models", "metrics.json")

def load_and_preprocess():
    if not os.path.exists(DATA_PATH):
        raise FileNotFoundError(f"Dataset not found at {DATA_PATH}. Please run download_data.py first.")
        
    df = pd.read_csv(DATA_PATH)
    
    # 1. Cleaning
    # TotalCharges contains empty strings ' ' which need to be converted to float
    df['TotalCharges'] = pd.to_numeric(df['TotalCharges'].replace(' ', np.nan), errors='coerce')
    # Fill missing TotalCharges with 0 (since tenure is likely 0)
    df['TotalCharges'] = df['TotalCharges'].fillna(0.0)
    
    # 2. Feature Engineering
    # Number of services customer signed up for (excluding phone and internet service headings)
    services = ['OnlineSecurity', 'OnlineBackup', 'DeviceProtection', 'TechSupport', 'StreamingTV', 'StreamingMovies']
    df['NumServices'] = (df[services] == 'Yes').sum(axis=1)
    
    # 3. Separate features and target
    X = df.drop(columns=['customerID', 'Churn'])
    y = df['Churn'].map({'Yes': 1, 'No': 0})
    
    return X, y, df

def train_and_evaluate():
    print("Loading and preprocessing data...")
    X, y, df = load_and_preprocess()
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    
    # Identify column types
    num_cols = ['tenure', 'MonthlyCharges', 'TotalCharges', 'NumServices']
    cat_cols = [col for col in X.columns if col not in num_cols]
    
    print(f"Numerical columns: {num_cols}")
    print(f"Categorical columns: {cat_cols}")
    
    # Set OneHotEncoder arguments based on sklearn version
    encoder_args = {'handle_unknown': 'ignore'}
    if hasattr(OneHotEncoder(), 'sparse_output'):
        encoder_args['sparse_output'] = False
    else:
        encoder_args['sparse'] = False
        
    # Preprocessing pipeline
    preprocessor = ColumnTransformer(
        transformers=[
            ('num', StandardScaler(), num_cols),
            ('cat', OneHotEncoder(**encoder_args), cat_cols)
        ]
    )
    
    # Fit and transform
    X_train_proc = preprocessor.fit_transform(X_train)
    X_test_proc = preprocessor.transform(X_test)
    
    # Get feature names after transformation
    cat_features = preprocessor.named_transformers_['cat'].get_feature_names_out(cat_cols).tolist()
    feature_names = num_cols + cat_features
    
    # Models to train
    models = {
        "LogisticRegression": LogisticRegression(max_iter=1000, random_state=42),
        "RandomForest": RandomForestClassifier(n_estimators=100, max_depth=10, random_state=42),
        "XGBoost": xgb.XGBClassifier(n_estimators=100, max_depth=5, learning_rate=0.1, random_state=42, eval_metric='logloss')
    }
    
    metrics_summary = {}
    trained_models = {}
    
    for name, model in models.items():
        print(f"Training {name}...")
        model.fit(X_train_proc, y_train)
        trained_models[name] = model
        
        # Predict
        y_pred = model.predict(X_test_proc)
        y_prob = model.predict_proba(X_test_proc)[:, 1]
        
        # Calculate evaluation metrics
        acc = accuracy_score(y_test, y_pred)
        prec = precision_score(y_test, y_pred)
        rec = recall_score(y_test, y_pred)
        f1 = f1_score(y_test, y_pred)
        auc = roc_auc_score(y_test, y_prob)
        cm = confusion_matrix(y_test, y_pred).tolist()
        
        # Generate ROC Curve coordinates (sampled to 40 points to avoid large payload)
        fpr, tpr, _ = roc_curve(y_test, y_prob)
        if len(fpr) > 40:
            indices = np.linspace(0, len(fpr) - 1, 40, dtype=int)
            fpr_sampled = fpr[indices].tolist()
            tpr_sampled = tpr[indices].tolist()
        else:
            fpr_sampled = fpr.tolist()
            tpr_sampled = tpr.tolist()
            
        metrics_summary[name] = {
            "accuracy": float(acc),
            "precision": float(prec),
            "recall": float(rec),
            "f1_score": float(f1),
            "roc_auc": float(auc),
            "confusion_matrix": cm,
            "roc_curve": {
                "fpr": fpr_sampled,
                "tpr": tpr_sampled
            }
        }
        print(f"{name} Results - ROC-AUC: {auc:.4f}, F1: {f1:.4f}, Accuracy: {acc:.4f}")
        
    # Choose best model based on ROC-AUC
    best_model_name = max(metrics_summary, key=lambda k: metrics_summary[k]["roc_auc"])
    best_model = trained_models[best_model_name]
    print(f"\nBest model selected: {best_model_name} with ROC-AUC {metrics_summary[best_model_name]['roc_auc']:.4f}")
    
    # Calculate Feature Importances for the best model
    # (If Random Forest or XGBoost, use feature_importances_; if Logistic Regression, use coef_)
    importances = []
    if hasattr(best_model, "feature_importances_"):
        importances = best_model.feature_importances_.tolist()
    elif hasattr(best_model, "coef_"):
        # Take absolute value of coefficients for importance ranking
        importances = np.abs(best_model.coef_[0]).tolist()
        
    feature_importance_list = sorted(
        [{"feature": f, "importance": float(imp)} for f, imp in zip(feature_names, importances)],
        key=lambda x: x["importance"],
        reverse=True
    )
    
    # Save directory
    if not os.path.exists(MODEL_DIR):
        os.makedirs(MODEL_DIR)
        
    # Save artifacts
    print("Saving artifacts...")
    joblib.dump(best_model, os.path.join(MODEL_DIR, "best_model.joblib"))
    joblib.dump(preprocessor, os.path.join(MODEL_DIR, "preprocessor.joblib"))
    
    # Save a small subset of processed training data to serve as SHAP background
    # 100 samples is ideal for speed and stability
    shap_background = X_train_proc[:100]
    joblib.dump(shap_background, os.path.join(MODEL_DIR, "shap_background.joblib"))
    joblib.dump(feature_names, os.path.join(MODEL_DIR, "feature_names.joblib"))
    
    # Store training statistics
    eda_summary = {
        "churn_rate": float(y.mean()),
        "total_customers": int(len(df)),
        "avg_tenure": float(df['tenure'].mean()),
        "avg_monthly_charges": float(df['MonthlyCharges'].mean()),
        "gender_split": df['gender'].value_counts(normalize=True).to_dict(),
        "contract_split": df['Contract'].value_counts(normalize=True).to_dict(),
        "internet_split": df['InternetService'].value_counts(normalize=True).to_dict()
    }
    
    with open(METRICS_PATH, "w") as f:
        json.dump({
            "best_model_name": best_model_name,
            "metrics": metrics_summary,
            "feature_importances": feature_importance_list[:15], # Top 15 features
            "eda_summary": eda_summary
        }, f, indent=4)
        
    print("All models trained and artifacts successfully saved!")

if __name__ == "__main__":
    train_and_evaluate()
