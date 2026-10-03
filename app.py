import os
import string
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
import openai

# Initialize the Flask application
app = Flask(__name__)
CORS(app)

# --- CONFIGURATION ---
# openai.api_key = (Uncomment and put your OpenAI API key here)

UPLOAD_FOLDER = 'uploads'

DB_FILE = 'users.json'

# Create uploads directory if it doesn't exist
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# --- DATABASE (Mock) ---
users_db = []

# --- HELPER FUNCTIONS ---
def check_accuracy(spoken_text, target_word):
    """
    Compares the spoken text with the target word.
    Removes punctuation and handles case sensitivity.
    """
    if not spoken_text or not target_word:
        return False

    # Remove punctuation and convert to lower case
    translator = str.maketrans('', '', string.punctuation)
    clean_spoken = spoken_text.translate(translator).lower().strip()
    clean_target = target_word.translate(translator).lower().strip()

    # check exact match or if the target word is clearly within the phrase
    if clean_spoken == clean_target:
        return True
    
    # Strict check: only return true if the single word was captured correctly
    return clean_spoken == clean_target

# --- ROUTES ---
# --- DATABASE HELPER FUNCTIONS ---

def load_users():
    """Loads users from the JSON file."""
    if not os.path.exists(DB_FILE):
        return []
    try:
        with open(DB_FILE, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return []

def save_users(users_list):
    """Saves the user list back to the JSON file."""
    try:
        with open(DB_FILE, 'w') as f:
            json.dump(users_list, f, indent=4)
    except IOError as e:
        print(f"Error saving to database: {e}")

# --- UPDATED ROUTES ---

@app.route('/signup', methods=['POST'])
def signup():
    data = request.get_json()
    if not data:
        return jsonify({"message": "No data provided"}), 400
    
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')

    if not all([username, email, password]):
        return jsonify({"message": "Missing fields"}), 400

    # Load current users from file
    users_db = load_users()

    if any(user['email'] == email for user in users_db):
        return jsonify({"message": "User exists"}), 409

    new_user = {
        "id": len(users_db) + 1,
        "username": username,
        "email": email,
        "password_mock_not_secure": password
    }
    
    # Append and Save
    users_db.append(new_user)
    save_users(users_db)
    
    return jsonify({"message": "User created", "user_id": new_user['id']}), 201

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data or 'email' not in data or 'password' not in data:
        return jsonify({"message": "Missing credentials"}), 400

    # Load from file to check credentials
    users_db = load_users()
    user = next((u for u in users_db if u['email'] == data['email']), None)

    if user and user['password_mock_not_secure'] == data['password']:
        return jsonify({"success": True, "message": "Login successful", "username": user['username']}), 200
    return jsonify({"success": False, "message": "Invalid credentials"}), 401

@app.route('/transcribe', methods=['POST'])
def transcribe_audio():
    if 'audio' not in request.files:
        return jsonify({"error": "No audio file provided"}), 400

    audio_file = request.files['audio']
    target_word = request.form.get('target_word', '')
    
    if audio_file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    # Save the file temporarily
    file_path = os.path.join(UPLOAD_FOLDER, "temp_audio.webm")
    audio_file.save(file_path)

    try:
        # Call OpenAI Whisper API
        with open(file_path, "rb") as audio:
            transcript_response = openai.Audio.transcribe(
                model="whisper-1", 
                file=audio,
                language="en"
            )
        
        spoken_text = transcript_response["text"]
        
        # Grade the result
        is_correct = check_accuracy(spoken_text, target_word)

        # Clean up: remove the temp file
        if os.path.exists(file_path):
            os.remove(file_path)

        return jsonify({
            "success": True, 
            "transcription": spoken_text,
            "target_word": target_word,
            "is_correct": is_correct
        })

    except Exception as e:
        # Clean up even if error
        if os.path.exists(file_path):
            os.remove(file_path)
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/')
def home():
    return "Server is running!"

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)