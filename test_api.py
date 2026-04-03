import urllib.request
import urllib.error
import json
import base64

API_KEY = "YOUR_API_KEY_HERE"  # Google AI StudioでAPIキーを取得してください
MODEL = "gemini-2.5-flash"
url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={API_KEY}"

# Create a tiny 1x1 white pixel base64 image
tiny_img = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/wcAAgIBAh3vO2MAAAAASUVORK5CYII="

payload = {
    "contents": [
        {
            "parts": [
                {"text": "test"},
                {
                    "inline_data": {
                        "mime_type": "image/png",
                        "data": tiny_img
                    }
                }
            ]
        }
    ],
    "generationConfig": {
        "temperature": 0.1,
        "topK": 32,
        "topP": 1
    }
}

req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers={'Content-Type': 'application/json'})

try:
    with urllib.request.urlopen(req) as response:
        print("Status", response.status)
        print(response.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print(f"HTTPError {e.code}:")
    print(e.read().decode('utf-8'))
except Exception as e:
    print(f"Error: {e}")
