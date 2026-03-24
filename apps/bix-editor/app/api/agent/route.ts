import Anthropic from "@anthropic-ai/sdk"
import { generateToolDefinitions, generateGlossary } from "@bix/engine"
import solarSystemSchema from "../../../schema/index"

const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
})

const SYSTEM_PROMPT = `You are an AI assistant helping users build and explore an interactive solar system.
You have tools to create stars, planets, and moons, update their orbital properties, and query the system.

${generateGlossary(solarSystemSchema)}

When creating bodies:
- Stars go at the center (orbitRadius=0, orbitSpeed=0). Give them an emissive color.
- Planets must orbit a star. Set meaningful orbitRadius (3-50) and orbitSpeed (0.1-2.0).
- Moons must orbit a planet. Set smaller orbitRadius (1-5) and faster orbitSpeed (1.0-3.0).

Always provide a brief, enthusiastic response describing what you did. Be conversational.`

export async function POST(request: Request) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
        return Response.json(
            { error: "ANTHROPIC_API_KEY not configured" },
            { status: 500 },
        )
    }

    const body = await request.json()
    const { messages, worldSummary } = body as {
        messages: Anthropic.MessageParam[]
        worldSummary: string
    }

    const tools = generateToolDefinitions(solarSystemSchema)

    // Inject world summary into the last user message for context
    const messagesWithContext: Anthropic.MessageParam[] = messages.map((msg, i) => {
        if (i === messages.length - 1 && msg.role === "user") {
            const userText =
                typeof msg.content === "string"
                    ? msg.content
                    : (msg.content as Anthropic.TextBlockParam[])
                          .map((b) => b.text)
                          .join("")
            return {
                role: "user",
                content: `Current solar system:\n${worldSummary}\n\nUser request: ${userText}`,
            }
        }
        return msg
    })

    const response = await client.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: messagesWithContext,
        tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.parameters as Anthropic.Tool["input_schema"],
        })),
    })

    return Response.json(response)
}
