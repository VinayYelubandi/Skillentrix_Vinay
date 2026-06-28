import os
import json
import joblib
import pandas as pd
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
import shap

app = Flask(__name__)
CORS(app) # Enable CORS for all routes

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_DIR = os.path.join(BASE_DIR, "models")
METRICS_PATH = os.path.join(MODEL_DIR, "metrics.json")

# Global variables for models and preprocessors
model = None
preprocessor = None
shap_background = None
feature_names = None
metrics_data = None

DEFAULT_PROFILE = {
    'gender': 'Male',
    'SeniorCitizen': 0,
    'Partner': 'No',
    'Dependents': 'No',
    'tenure': 1,
    'PhoneService': 'Yes',
    'MultipleLines': 'No',
    'InternetService': 'DSL',
    'OnlineSecurity': 'No',
    'OnlineBackup': 'No',
    'DeviceProtection': 'No',
    'TechSupport': 'No',
    'StreamingTV': 'No',
    'StreamingMovies': 'No',
    'Contract': 'Month-to-month',
    'PaperlessBilling': 'No',
    'PaymentMethod': 'Electronic check',
    'MonthlyCharges': 50.0,
    'TotalCharges': 50.0
}

def load_artifacts():
    global model, preprocessor, shap_background, feature_names, metrics_data
    
    # Load model & preprocessors
    model_path = os.path.join(MODEL_DIR, "best_model.joblib")
    prep_path = os.path.join(MODEL_DIR, "preprocessor.joblib")
    bg_path = os.path.join(MODEL_DIR, "shap_background.joblib")
    feat_path = os.path.join(MODEL_DIR, "feature_names.joblib")
    
    if os.path.exists(model_path):
        model = joblib.load(model_path)
        print("Model loaded successfully.")
    if os.path.exists(prep_path):
        preprocessor = joblib.load(prep_path)
        print("Preprocessor loaded successfully.")
    if os.path.exists(bg_path):
        shap_background = joblib.load(bg_path)
        print("SHAP background loaded successfully.")
    if os.path.exists(feat_path):
        feature_names = joblib.load(feat_path)
        print("Feature names loaded successfully.")
    if os.path.exists(METRICS_PATH):
        with open(METRICS_PATH, "r") as f:
            metrics_data = json.load(f)
        print("Metrics loaded successfully.")

# Initialize artifacts on startup
try:
    load_artifacts()
except Exception as e:
    print(f"Error loading artifacts during startup: {e}. If models are not trained yet, run train.py first.")

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "healthy",
        "artifacts_loaded": {
            "model": model is not None,
            "preprocessor": preprocessor is not None,
            "shap_background": shap_background is not None,
            "metrics": metrics_data is not None
        }
    })

@app.route("/api/metrics", methods=["GET"])
def get_metrics():
    # Return metrics summary (accuracy, precision, recall, confusion matrix, and feature importances)
    if not metrics_data:
        # Try loading again in case they were generated since startup
        try:
            load_artifacts()
        except:
            pass
            
    if not metrics_data:
        return jsonify({"error": "Metrics and model artifacts not found. Please train models first."}), 500
        
    return jsonify({
        "best_model_name": metrics_data.get("best_model_name"),
        "metrics": metrics_data.get("metrics"),
        "feature_importances": metrics_data.get("feature_importances")
    })

@app.route("/api/summary", methods=["GET"])
def get_summary():
    # Return EDA training dataset statistics
    if not metrics_data:
        try:
            load_artifacts()
        except:
            pass
            
    if not metrics_data or "eda_summary" not in metrics_data:
        return jsonify({"error": "EDA summary not found."}), 500
        
    return jsonify(metrics_data["eda_summary"])

def process_input(data):
    # Merge input with default profile to ensure all keys are present
    profile = DEFAULT_PROFILE.copy()
    profile.update(data)
    
    # Create DataFrame
    df = pd.DataFrame([profile])
    
    # Enforce data types
    df['tenure'] = df['tenure'].astype(int)
    df['MonthlyCharges'] = df['MonthlyCharges'].astype(float)
    df['TotalCharges'] = df['TotalCharges'].astype(float)
    df['SeniorCitizen'] = df['SeniorCitizen'].astype(int)
    
    # Feature Engineering
    services = ['OnlineSecurity', 'OnlineBackup', 'DeviceProtection', 'TechSupport', 'StreamingTV', 'StreamingMovies']
    df['NumServices'] = (df[services] == 'Yes').sum(axis=1)
    
    return df

@app.route("/api/predict", methods=["POST"])
def predict():
    if not model or not preprocessor:
        return jsonify({"error": "Model not loaded. Train model first."}), 500
        
    try:
        data = request.json or {}
        df = process_input(data)
        
        # Transform using preprocessor
        X_proc = preprocessor.transform(df)
        
        # Predict probability
        prob = float(model.predict_proba(X_proc)[0][1])
        prediction = int(model.predict(X_proc)[0])
        
        return jsonify({
            "churn_probability": prob,
            "prediction": prediction,
            "prediction_label": "Churn" if prediction == 1 else "Retain"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/explain", methods=["POST"])
def explain():
    if not model or not preprocessor or shap_background is None or not feature_names:
        return jsonify({"error": "Model, preprocessor or SHAP background not loaded."}), 500
        
    try:
        data = request.json or {}
        df = process_input(data)
        
        # Transform using preprocessor
        X_proc = preprocessor.transform(df)
        
        # Use KernelExplainer on model.predict_proba for direct probability impact explanation.
        # Slicing the first 50 samples is very fast and resolves the XGBoost TreeExplainer base_score float conversion bug.
        bg_sample = shap_background[:50]
        explainer = shap.KernelExplainer(model.predict_proba, bg_sample)
        
        # Compute SHAP values
        shap_vals = explainer.shap_values(X_proc)
        
        # Process SHAP values for output (Class 1)
        # KernelExplainer returns list for multi-class outputs or a 3D numpy array of shape (samples, features, classes)
        if isinstance(shap_vals, list) and len(shap_vals) > 1:
            vals = shap_vals[1][0]
        elif isinstance(shap_vals, list):
            vals = shap_vals[0][0]
        else:
            # NumPy array fallback
            if len(shap_vals.shape) == 3: # (samples, features, classes)
                vals = shap_vals[0, :, 1]
            elif len(shap_vals.shape) == 2: # (samples, features)
                vals = shap_vals[0]
            else:
                vals = shap_vals.flatten()
                
        # Handle expected value (base value)
        expected_val = explainer.expected_value
        if isinstance(expected_val, (list, np.ndarray)):
            if len(expected_val) > 1:
                expected_val = expected_val[1]
            else:
                expected_val = expected_val[0]
        expected_val = float(expected_val)
        
        # Map values back to their categorical/numerical names
        # We need to look up corresponding raw values for numerical columns and one-hot encoding columns
        # To make it simple and readable, we can find the active value for categorical columns
        contributions = []
        
        # Get raw feature values to show what value caused this effect
        # Create mapping of preprocessed feature names to their raw values
        for i, feat in enumerate(feature_names):
            shap_v = float(vals[i])
            
            # Find the original feature and original value
            raw_val = ""
            if "_" in feat:
                # One-hot encoded feature, e.g. "InternetService_Fiber optic"
                parts = feat.split("_", 1)
                orig_feat = parts[0]
                category = parts[1]
                
                # Check if this category is the active one in the input
                if orig_feat in df.columns:
                    current_val = str(df[orig_feat].iloc[0])
                    # If this specific binary dummy feature is 1, its raw value is 'Yes' (active), else 'No'
                    # Or show current_val
                    raw_val = current_val
            else:
                # Numeric feature
                if feat in df.columns:
                    raw_val = float(df[feat].iloc[0])
                    if raw_val.is_integer():
                        raw_val = int(raw_val)
                else:
                    raw_val = "N/A"
            
            contributions.append({
                "feature": feat,
                "shap_value": shap_v,
                "raw_value": raw_val
            })
            
        # Sort contributions by absolute SHAP value (most influential first)
        contributions = sorted(contributions, key=lambda x: abs(x["shap_value"]), reverse=True)
        
        # Filter out features with virtually zero contribution to make UI cleaner
        contributions = [c for c in contributions if abs(c["shap_value"]) > 0.0001]
        
        # Limit to top 12 contributors
        top_contributions = contributions[:12]
        
        # Calculate Churn Risk Prediction Value (approx sum of shap values + base value)
        # Note: raw TreeExplainer output is log-odds for LogisticRegression / XGBoost, and probability for RandomForest.
        # Let's check model type to explain scale.
        # If Random Forest, the values sum directly to probability.
        # If Logistic Regression or XGBoost, the raw values are in log-odds.
        # Let's convert values to probability scale for the user if it's in log-odds,
        # or we can keep it as impact on probability for a simpler visualization.
        # To make it easy for a business user, we will state: "Value represents contribution towards Churn probability score".
        scale = "probability"
        
        return jsonify({
            "base_value": expected_val,
            "scale": scale,
            "contributions": top_contributions
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400

if __name__ == "__main__":
    # Reload models on start
    load_artifacts()
    app.run(host="0.0.0.0", port=5000, debug=True)
