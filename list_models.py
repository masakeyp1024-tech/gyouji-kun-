import urllib.request
import urllib.error
import json

API_KEY = "AIzaSyAP3DjG6auTdJ69HvbeNGJwkKB6dsoIpsk"
url = f"https://generativelanguage.googleapis.com/v1beta/models?key={API_KEY}"

try:
    with urllib.request.urlopen(url) as response:
        data = json.loads(response.read().decode('utf-8'))
        for model in data.get('models', []):
            if 'generateContent' in model.get('supportedGenerationMethods', []):
                print(f"Model: {model['name']}")
except urllib.error.HTTPError as e:
    print(f"HTTPError {e.code}:")
    print(e.read().decode('utf-8'))
except Exception as e:
    print(f"Error: {e}")
