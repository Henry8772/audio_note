import os
from faster_whisper import WhisperModel
from pydub import AudioSegment

# --- CONFIGURATION ---
INPUT_FILE = "/Users/yuyu/Downloads/flashlight_discussion.m4a"  # <--- REPLACE WITH YOUR FILE NAME
MODEL_SIZE = "large-v3"             # Best quality options: "large-v3", "medium", "small"
COMPUTE_TYPE = "float32"            # Use "float32" for best compatibility on Mac CPU/MPS

def convert_m4a_to_wav(m4a_path):
    """
    Converts m4a to 16kHz mono WAV for optimal AI transcription.
    Returns the path to the temporary wav file.
    """
    print(f"🔄 Converting '{m4a_path}' to 16kHz WAV...")
    try:
        audio = AudioSegment.from_file(m4a_path, format="m4a")
        audio = audio.set_frame_rate(16000).set_channels(1) # AI models love 16kHz Mono
        
        wav_path = m4a_path.replace(".m4a", ".wav")
        audio.export(wav_path, format="wav")
        return wav_path
    except Exception as e:
        print(f"❌ Error converting audio: {e}")
        print("Ensure ffmpeg is installed: 'brew install ffmpeg'")
        return None

def transcribe_audio(wav_path):
    print(f"🚀 Loading Whisper '{MODEL_SIZE}' model... (This takes a moment the first time)")
    
    # On Mac M1/M2/M3, standard CPU execution is actually very fast for inference
    # with faster-whisper.
    model = WhisperModel(MODEL_SIZE, device="cpu", compute_type=COMPUTE_TYPE)

    print("🎙️ Transcribing... (Grab a coffee if the file is long)")
    
    # 'initial_prompt' is the secret sauce for Bilingual files. 
    # It primes the model to expect mixed languages.
    prompt = "This is a bilingual conversation mixing English and Chinese sentences freely."

    segments, info = model.transcribe(
        wav_path,
        beam_size=5,          # Higher beam size = better quality, slightly slower
        initial_prompt=prompt,
        condition_on_previous_text=False # Prevents "loops" if the audio is silent or repetitive
    )

    print(f"✅ Detected language: {info.language} (Probability: {info.language_probability:.2f})")
    print("-" * 50)

    # Write to file and print
    with open("transcription.txt", "w", encoding="utf-8") as f:
        for segment in segments:
            # Format: [Start -> End] Text
            line = f"[{segment.start:.2f}s -> {segment.end:.2f}s] {segment.text}"
            print(line)
            f.write(line + "\n")

    print("-" * 50)
    print("🎉 Done! Saved to 'transcription.txt'")

# --- MAIN EXECUTION ---
if __name__ == "__main__":
    if not os.path.exists(INPUT_FILE):
        print(f"❌ Error: File '{INPUT_FILE}' not found.")
    else:
        # 1. Convert
        wav_file = convert_m4a_to_wav(INPUT_FILE)
        
        # 2. Transcribe
        if wav_file:
            transcribe_audio(wav_file)
            
            # Optional: Clean up the temporary wav file
            # os.remove(wav_file)