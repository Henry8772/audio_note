import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let activeOnProgress: ((p: number) => void) | null = null;
let ffmpeg: FFmpeg | null = null;

export const loadFfmpeg = async (onProgress?: (msg: string) => void): Promise<FFmpeg> => {
    if (ffmpeg) return ffmpeg;

    ffmpeg = new FFmpeg();

    ffmpeg.on('progress', ({ progress }: any) => {
        if (activeOnProgress) {
            activeOnProgress(Math.round(progress * 100));
        }
    });

    if (onProgress) onProgress('Loading FFmpeg core...');

    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

    await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    return ffmpeg;
};

export async function extractAndChunkAudio(
    file: File | string,
    onStatus: (msg: string) => void,
    onProgress: (progress: number) => void
): Promise<Blob[]> {
    try {
        const ff = await loadFfmpeg(onStatus);

        // Set the active progress callback
        activeOnProgress = onProgress;

        onStatus('Reading input file...');
        await ff.writeFile('input.mp4', await fetchFile(file));

        onStatus('Extracting audio from video...');
        onProgress(0);
        // Extract audio perfectly to mp3
        await ff.exec(['-i', 'input.mp4', '-q:a', '0', '-map', 'a', 'output.mp3']);

        onStatus('Segmenting audio into 10-minute chunks for processing safely...');
        onProgress(0);
        // 600 seconds = 10 minutes chunk size
        await ff.exec([
            '-i', 'output.mp3',
            '-f', 'segment',
            '-segment_time', '600',
            '-c', 'copy',
            'chunk_%03d.mp3'
        ]);

        onStatus('Reading chunks into memory...');
        const chunks: Blob[] = [];
        let i = 0;
        while (true) {
            const chunkName = `chunk_${i.toString().padStart(3, '0')}.mp3`;
            try {
                const cd = await ff.readFile(chunkName);
                chunks.push(new Blob([cd as unknown as BlobPart], { type: 'audio/mp3' }));
                // Clean up immediately
                await ff.deleteFile(chunkName);
                i++;
            } catch (e) {
                break; // No more chunks found
            }
        }

        // Cleanup remaining files
        await ff.deleteFile('input.mp4');
        await ff.deleteFile('output.mp3');

        return chunks;
    } catch (error) {
        console.error("FFmpeg error:", error);
        throw error;
    }
}
