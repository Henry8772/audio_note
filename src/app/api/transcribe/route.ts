import { NextRequest, NextResponse } from "next/server";
import { OpenAI } from "openai";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export const maxDuration = 60; // Allow 60 seconds on Vercel Hobby tier

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const audio = formData.get("audio") as File;

        if (!audio) {
            return NextResponse.json({ error: "No audio blob provided" }, { status: 400 });
        }

        const arrayBuffer = await audio.arrayBuffer();
        const base64Data = Buffer.from(arrayBuffer).toString("base64");

        const response = await openai.chat.completions.create({
            model: "gpt-4o-audio-preview",
            modalities: ["text"],
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: "Transcribe this audio exactly. The speakers mix English and Spanish within the same sentences. Capture the exact words spoken in the original languages."
                        },
                        {
                            type: "input_audio",
                            input_audio: {
                                data: base64Data,
                                format: "mp3"
                            }
                        }
                    ]
                }
            ]
        });

        const text = response.choices[0].message.content;
        return NextResponse.json({ text });

    } catch (error: any) {
        console.error("Transcription API Error:", error);
        return NextResponse.json({ error: error.message || "Unknown API error" }, { status: 500 });
    }
}
