import os
import base64
import io
from openai import OpenAI
from pydub import AudioSegment  # <--- Added for conversion
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURATION ---
API_KEY = os.getenv("OPENAI_API_KEY")
INPUT_FILE = "/Users/yuyu/Downloads/holan.m4a"

client = OpenAI(api_key=API_KEY)

def transcribe_whisper(file_path):
    """
    Method A: Standard Whisper API
    Best for: Clear audio, distinct speakers, lower cost ($0.006/min).
    """
    print("🔹 Method A: Sending to Whisper-1 model...")
    
    with open(file_path, "rb") as audio_file:
        transcript = client.audio.transcriptions.create(
            model="whisper-1", 
            file=audio_file, 
            prompt="This is a bilingual conversation that switches between English and Spanish frequently. Do not translate."
        )
    return transcript.text

def transcribe_gpt4o(file_path):
    """
    Method B: GPT-4o Audio Preview
    Best for: Complex code-switching (Spanglish), heavy accents.
    Handles large files by splitting into 10-minute segments.
    """
    print("🔸 Method B: Sending to GPT-4o Audio model (Best for code-switching)...")
    
    # Load audio
    print(f"   ↳ Loading audio file: {file_path}...")
    try:
        audio = AudioSegment.from_file(file_path) # Auto-detect format
    except Exception as e:
        print(f"   ❌ Error loading audio: {e}")
        return ""

    # Constants
    CHUNK_LENGTH_MS = 10 * 60 * 1000  # 10 minutes
    total_duration_ms = len(audio)
    
    full_transcript = []
    
    # Calculate number of chunks
    num_chunks = (total_duration_ms // CHUNK_LENGTH_MS) + (1 if total_duration_ms % CHUNK_LENGTH_MS > 0 else 0)
    print(f"   ↳ Audio duration: {total_duration_ms/1000/60:.2f} minutes. Processing in {num_chunks} chunks.")

    for i in range(num_chunks):
        start_ms = i * CHUNK_LENGTH_MS
        end_ms = min((i + 1) * CHUNK_LENGTH_MS, total_duration_ms)
        
        print(f"\n   [Chunk {i+1}/{num_chunks}] Processing segment {start_ms//1000}s to {end_ms//1000}s...")
        
        chunk = audio[start_ms:end_ms]
        
        # Use a temporary file for robust export
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as temp_mp3:
            temp_filename = temp_mp3.name
            
        try:
            # Export chunk to temp file
            chunk.export(temp_filename, format="mp3", bitrate="64k")
            
            # Read and encode
            with open(temp_filename, "rb") as f:
                encoded_string = base64.b64encode(f.read()).decode('utf-8')
                
            print(f"   ↳ Sending chunk {i+1} to OpenAI...")
            response = client.chat.completions.create(
                model="gpt-4o-audio-preview",
                modalities=["text"],
                messages=[
                    {
                        "role": "user",
                        "content": [
                            { 
                                "type": "text", 
                                "text": "Transcribe this audio exactly. The speakers mix English and Spanish within the same sentences. Capture the exact words spoken in the original languages." 
                            },
                            {
                                "type": "input_audio",
                                "input_audio": {
                                    "data": encoded_string,
                                    "format": "mp3"
                                }
                            }
                        ]
                    }
                ]
            )
            chunk_text = response.choices[0].message.content
            print(f"   ✅ Chunk {i+1} complete.")
            full_transcript.append(chunk_text)
            
        except Exception as e:
            print(f"   ❌ Error processing chunk {i+1}: {e}")
            # Optionally continue or break. For now, we continue to try next chunks.
            full_transcript.append(f"[Error in chunk {i+1}: {e}]")
            
        finally:
            # Cleanup temp file
            if os.path.exists(temp_filename):
                os.remove(temp_filename)

    return "\n\n".join(full_transcript)

# --- MAIN EXECUTION ---
if __name__ == "__main__":
    if not os.path.exists(INPUT_FILE):
        print(f"❌ Error: File '{INPUT_FILE}' not found.")
    else:
        # We are using Method B as per your request
        try:
            result = transcribe_gpt4o(INPUT_FILE)
            
            print("\n--- TRANSCRIPTION ---\n")
            print(result)
            
            # Save to file
            with open("openai_transcription.txt", "w", encoding="utf-8") as f:
                f.write(result)
                
        except Exception as e:
            print(f"\n❌ Error occurred: {e}")
            print("Tip: If you see 'ffprobe' or 'ffmpeg' errors, run 'brew install ffmpeg' in terminal.")