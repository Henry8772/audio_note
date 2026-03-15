import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI();

export async function POST(request: Request) {
  try {
    const { transcript, previousSummary } = await request.json();

    if (!transcript) {
      return NextResponse.json({ error: "Transcript is required" }, { status: 400 });
    }

    const systemPrompt = `You are a highly skilled meeting assistant. Your task is to summarize the provided meeting transcript.
You should generate a beautifully formatted Markdown summary.
If a previous summary exists, incorporate the new information logically and update the overall summary.

Structure your response with clear headings, bullet points for key takeaways, and action items if applicable. Do not just blindly append to the old summary; intelligently merge the new context.`;

    const userPrompt = `
Previous Summary:
${previousSummary || "None"}

Recent Transcript:
${transcript}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
    });

    const newSummary = response.choices[0].message.content;

    return NextResponse.json({ summary: newSummary });
  } catch (error) {
    console.error("Summarization error:", error);
    return NextResponse.json({ error: "Failed to summarize" }, { status: 500 });
  }
}
