import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI();

export async function POST(request: Request) {
  try {
    const { transcript, previousSummary, targetLanguages } = await request.json();

    if (!transcript) {
      return NextResponse.json({ error: "Transcript is required" }, { status: 400 });
    }

    const targetList = targetLanguages && targetLanguages.length > 0 
      ? targetLanguages.join(", ") 
      : "en (English)";

    const systemPrompt = `You are a highly skilled meeting assistant specializing in consecutive translation and rolling context. 
Your task is to take the LATEST meeting transcript segment, intelligently merge it with the PREVIOUS summaries, and output beautifully formatted Markdown summaries in multiple target languages.

Target Languages Required: [${targetList}]

Output your response STRICTLY as a JSON object where the keys are the target language codes (e.g., 'en', 'es', 'zh') and the values are the full Markdown summaries for that language. Do not output anything else.

Example JSON:
{
  "en": "# Meeting Notes\\n- Point 1...",
  "es": "# Notas de la Reunión\\n- Punto 1..."
}`;

    const userPrompt = `
Previous Summaries (JSON mapping of language to previous summary):
${typeof previousSummary === 'object' ? JSON.stringify(previousSummary) : previousSummary || "{}"}

New Recent Transcript Segment:
${transcript}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const outputContent = response.choices[0].message.content;
    let newSummaries = {};
    if (outputContent) {
      try {
        newSummaries = JSON.parse(outputContent);
      } catch (e) {
        console.error("Failed to parse LLM JSON", e);
      }
    }

    return NextResponse.json({ summaries: newSummaries });
  } catch (error) {
    console.error("Summarization error:", error);
    return NextResponse.json({ error: "Failed to summarize" }, { status: 500 });
  }
}
