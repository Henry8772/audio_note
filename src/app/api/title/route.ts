import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI();

export async function POST(request: Request) {
  try {
    const { transcript } = await request.json();

    if (!transcript || !transcript.trim()) {
      return NextResponse.json({ title: null });
    }

    const systemPrompt =
      "You generate a very short title that summarizes a meeting transcript. " +
      "Respond with the title only — at most 6 words, plain text, no quotes, no punctuation at the end, no markdown.";

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-nano",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: transcript.slice(0, 6000) },
      ],
      temperature: 0.3,
    });

    let title = response.choices[0]?.message?.content?.trim() || "";
    // Strip surrounding quotes/markdown and clamp length
    title = title.replace(/^["'#\s]+|["'\s]+$/g, "").slice(0, 50).trim();

    return NextResponse.json({ title: title || null });
  } catch (error) {
    console.error("Title generation error:", error);
    // Non-fatal: let the client fall back to a generic title
    return NextResponse.json({ title: null });
  }
}
