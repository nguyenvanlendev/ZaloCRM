import requests
import os
import sys

# Define variables
API_URL = "http://localhost:8000/api/v1/knowledge/upload"
FILE_PATH = "/Volumes/DATA/YOOT/YOEDU_ERP/ZaloCRM/AIKnowlageGrap/knowledge_base.md"
ORG_ID = "default_org"
DOC_ID = "teachers_kb"

def main():
    if not os.path.exists(FILE_PATH):
        print(f"Error: File not found at {FILE_PATH}")
        sys.exit(1)

    print(f"Uploading {FILE_PATH} to AI Service ({API_URL})...")
    
    with open(FILE_PATH, "rb") as f:
        files = {
            "file": (os.path.basename(FILE_PATH), f, "text/markdown")
        }
        data = {
            "orgId": ORG_ID,
            "docId": DOC_ID
        }
        
        try:
            response = requests.post(API_URL, files=files, data=data)
            
            if response.status_code == 200:
                print("✅ Upload successful!")
                print("Response:", response.json())
            else:
                print(f"❌ Upload failed with status code {response.status_code}")
                print("Error details:", response.text)
                
        except Exception as e:
            print(f"❌ Connection error: {e}")

if __name__ == "__main__":
    main()
