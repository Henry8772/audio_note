import os
import io
import base64
import logging
from pydub import AudioSegment

# Setup logging for pydub (it uses standard logging I think, or just writes to stderr)
logging.basicConfig(level=logging.DEBUG)

INPUT_FILE = "/Users/yuyu/Downloads/spartech_interview.mp4"

def test_conversion():
    print(f"Testing conversion for: {INPUT_FILE}")
    if not os.path.exists(INPUT_FILE):
        print("File not found!")
        return

    try:
        print("Attempting to load audio...")
        audio = AudioSegment.from_file(INPUT_FILE, format="m4a")
        print(f"Audio loaded. Duration: {len(audio)} ms")
        
        # Slice first 30 seconds to speed up test
        print("Slicing first 30 seconds...")
        short_audio = audio[:30000]
        
        # Test 1: Export to file directly
        print("Test 1: Export to 'debug_test.mp3' directly...")
        out_f = short_audio.export("debug_test.mp3", format="mp3", bitrate="64k")
        if out_f:
            print(f"Export returned: {out_f}")
            out_f.close() # export returns a file handle if successful? No, it returns the file handle passed or new one.
            # If filename passed, it opens it.
        
        if os.path.exists("debug_test.mp3"):
            size = os.path.getsize("debug_test.mp3")
            print(f"debug_test.mp3 size: {size}")
        else:
            print("debug_test.mp3 NOT created")

        # Test 2: Export to buffer
        print("Test 2: Export to BytesIO buffer...")
        buffer = io.BytesIO()
        short_audio.export(buffer, format="mp3", bitrate="64k")
        buffer.seek(0)
        content = buffer.read()
        print(f"Buffer content size: {len(content)}")
        
        if len(content) > 0:
            encoded = base64.b64encode(content).decode('utf-8')
            print(f"Base64 string start: {encoded[:50]}...")
        else:
            print("Buffer empty!")

    except Exception as e:
        print(f"Error during conversion: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_conversion()
