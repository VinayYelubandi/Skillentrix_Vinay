import os
import urllib.request

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
DATA_PATH = os.path.join(DATA_DIR, "Telco-Customer-Churn.csv")
DATA_URL = "https://raw.githubusercontent.com/IBM/telco-customer-churn-on-icp4d/master/data/Telco-Customer-Churn.csv"

def download_dataset():
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
        print(f"Created data directory: {DATA_DIR}")
        
    if os.path.exists(DATA_PATH):
        print(f"Dataset already exists at: {DATA_PATH}")
        return
        
    print(f"Downloading dataset from {DATA_URL}...")
    try:
        urllib.request.urlretrieve(DATA_URL, DATA_PATH)
        print(f"Successfully downloaded dataset to {DATA_PATH}!")
    except Exception as e:
        print(f"Error downloading dataset: {e}")
        # In case the primary URL is down, let's try a backup GitHub URL
        backup_url = "https://raw.githubusercontent.com/datasets/telecom-churn-prediction/master/data/WA_Fn-UseC_-Telco-Customer-Churn.csv"
        print(f"Trying backup URL: {backup_url}...")
        try:
            urllib.request.urlretrieve(backup_url, DATA_PATH)
            print(f"Successfully downloaded dataset from backup to {DATA_PATH}!")
        except Exception as backup_e:
            print(f"Backup download also failed: {backup_e}")
            raise e

if __name__ == "__main__":
    download_dataset()
