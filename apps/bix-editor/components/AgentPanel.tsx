"use client"

import { useState, useRef, useEffect } from "react"
import type { StoreApi, UseBoundStore } from "zustand"
import type { WorldStoreState } from "@bix/editor"
import { executeAgentTool } from "@bix/engine"
import type { World } from "@bix/engine"
import solarSystemSchema from "../schema/index"

interface Message {
    role: "user" | "assistant" | "tool_result"
    content: string
    toolCalls?: ToolCallRecord[]
    isLoading?: boolean
}

interface ToolCallRecord {
    name: string
    input: Record<string, unknown>
    result: string
    success: boolean
}

function buildWorldSummary(
    entities: readonly ReturnType<typeof executeAgentTool>[],
): string {
    return "see store"
}

export interface AgentPanelProps {
    store: UseBoundStore<StoreApi<WorldStoreState>>
    world: World
    onViolation?: (message: string) => void
}

export default function AgentPanel({ store, world, onViolation }: AgentPanelProps) {
    const [messages, setMessages] = useState<Message[]>([
        {
            role: "assistant",
            content:
                'Hello! I can help you build and explore your solar system. Try: "Add a gas giant at orbit radius 40" or "Make Earth orbit faster" or "What\'s currently in the system?"',
        },
    ])
    const [input, setInput] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [hasApiKey, setHasApiKey] = useState(true)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const entities = store((s) => s.entities)

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages])

    function getWorldSummary(): string {
        if (entities.length === 0) return "The solar system is empty."
        return entities
            .map((e) => {
                const orbital = e.traits["orbital"] as any
                const meta = e.traits["metadata"] as any
                const name = meta?.name ?? e.id
                return `- ${name} (${e.type}, id="${e.id}"): orbit_radius=${orbital?.orbitRadius?.toFixed(1) ?? 0}, orbit_speed=${orbital?.orbitSpeed?.toFixed(2) ?? 0}, parent="${e.parent ?? "none"}"`
            })
            .join("\n")
    }

    async function handleSend() {
        if (!input.trim() || isLoading) return

        const userMessage = input.trim()
        setInput("")

        setMessages((prev) => [...prev, { role: "user", content: userMessage }])
        setIsLoading(true)

        const apiMessages: { role: "user" | "assistant"; content: string }[] = [
            { role: "user", content: userMessage },
        ]

        try {
            // Round 1: get Claude's response (may include tool calls)
            const res1 = await fetch("/api/agent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: apiMessages,
                    worldSummary: getWorldSummary(),
                }),
            })

            if (!res1.ok) {
                const err = await res1.json()
                if (err.error?.includes("ANTHROPIC_API_KEY")) {
                    setHasApiKey(false)
                }
                throw new Error(err.error ?? "API error")
            }

            const response1 = await res1.json()

            // Execute any tool calls
            const toolCalls: ToolCallRecord[] = []
            const toolResults: { type: string; tool_use_id: string; content: string }[] =
                []

            for (const block of response1.content) {
                if (block.type === "tool_use") {
                    const toolResult = executeAgentTool(
                        world,
                        solarSystemSchema,
                        block.name,
                        block.input as Record<string, unknown>,
                    )
                    const resultText = toolResult.success
                        ? JSON.stringify(toolResult.data)
                        : `Error: ${toolResult.error}`

                    if (!toolResult.success && toolResult.prevented) {
                        onViolation?.(toolResult.error ?? "Constraint prevented action")
                    }

                    toolCalls.push({
                        name: block.name,
                        input: block.input as Record<string, unknown>,
                        result: resultText,
                        success: toolResult.success,
                    })
                    toolResults.push({
                        type: "tool_result",
                        tool_use_id: block.id,
                        content: resultText,
                    })
                }
            }

            // If there were tool calls, do a second round to get Claude's summary
            let finalText = ""
            if (toolCalls.length > 0) {
                const res2 = await fetch("/api/agent", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        messages: [
                            { role: "user", content: userMessage },
                            { role: "assistant", content: response1.content },
                            { role: "user", content: toolResults },
                        ],
                        worldSummary: getWorldSummary(),
                    }),
                })
                const response2 = await res2.json()
                finalText =
                    response2.content
                        ?.filter((b: any) => b.type === "text")
                        .map((b: any) => b.text)
                        .join("") ?? ""
            } else {
                finalText =
                    response1.content
                        ?.filter((b: any) => b.type === "text")
                        .map((b: any) => b.text)
                        .join("") ?? ""
            }

            setMessages((prev) => [
                ...prev,
                {
                    role: "assistant",
                    content: finalText || "Done.",
                    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                },
            ])
        } catch (err) {
            setMessages((prev) => [
                ...prev,
                {
                    role: "assistant",
                    content: `Error: ${err instanceof Error ? err.message : "Something went wrong"}`,
                },
            ])
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                background: "#0d1117",
            }}
        >
            {/* Header */}
            <div
                style={{
                    padding: "8px 12px",
                    borderBottom: "1px solid #21262d",
                    fontSize: 12,
                    color: "#7d8590",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                }}
            >
                <span style={{ color: "#58a6ff" }}>✦</span>
                <span>AI Agent</span>
                {!hasApiKey && (
                    <span style={{ color: "#f85149", marginLeft: "auto" }}>
                        Set ANTHROPIC_API_KEY to enable
                    </span>
                )}
            </div>

            {/* Messages */}
            <div
                style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "8px 12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                }}
            >
                {messages.map((msg, i) => (
                    <div key={i}>
                        {msg.role === "user" ? (
                            <div
                                style={{
                                    alignSelf: "flex-end",
                                    background: "#1f6feb",
                                    color: "#fff",
                                    padding: "6px 10px",
                                    borderRadius: 8,
                                    fontSize: 13,
                                    maxWidth: "85%",
                                    marginLeft: "auto",
                                }}
                            >
                                {msg.content}
                            </div>
                        ) : (
                            <div style={{ fontSize: 13, color: "#c9d1d9" }}>
                                {msg.toolCalls && (
                                    <div style={{ marginBottom: 6 }}>
                                        {msg.toolCalls.map((tc, j) => (
                                            <div
                                                key={j}
                                                style={{
                                                    background: tc.success
                                                        ? "#161b22"
                                                        : "#2d1b1b",
                                                    border: `1px solid ${tc.success ? "#30363d" : "#f85149"}`,
                                                    borderRadius: 6,
                                                    padding: "4px 8px",
                                                    marginBottom: 4,
                                                    fontSize: 11,
                                                    color: "#7d8590",
                                                    fontFamily: "monospace",
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        color: tc.success
                                                            ? "#3fb950"
                                                            : "#f85149",
                                                    }}
                                                >
                                                    {tc.success ? "✓" : "✗"}
                                                </span>{" "}
                                                {tc.name}(
                                                {Object.entries(tc.input)
                                                    .slice(0, 3)
                                                    .map(
                                                        ([k, v]) =>
                                                            `${k}=${JSON.stringify(v)}`,
                                                    )
                                                    .join(", ")}
                                                )
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {msg.content}
                            </div>
                        )}
                    </div>
                ))}
                {isLoading && (
                    <div style={{ fontSize: 13, color: "#7d8590" }}>
                        <span style={{ color: "#58a6ff" }}>✦</span> Thinking…
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div
                style={{
                    padding: "8px 12px",
                    borderTop: "1px solid #21262d",
                    display: "flex",
                    gap: 8,
                }}
            >
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                    placeholder={
                        hasApiKey
                            ? "Ask the agent anything…"
                            : "Set ANTHROPIC_API_KEY to use agent"
                    }
                    disabled={isLoading || !hasApiKey}
                    style={{
                        flex: 1,
                        background: "#161b22",
                        border: "1px solid #30363d",
                        borderRadius: 6,
                        padding: "6px 10px",
                        color: "#c9d1d9",
                        fontSize: 13,
                        outline: "none",
                    }}
                />
                <button
                    onClick={handleSend}
                    disabled={isLoading || !input.trim() || !hasApiKey}
                    style={{
                        background: "#1f6feb",
                        color: "#fff",
                        border: "none",
                        borderRadius: 6,
                        padding: "6px 14px",
                        fontSize: 13,
                        cursor: "pointer",
                        opacity: isLoading || !input.trim() ? 0.5 : 1,
                    }}
                >
                    Send
                </button>
            </div>
        </div>
    )
}
