import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
    title: "bix.bot — Solar System Editor",
    description: "Interactive solar system builder powered by bix.bot",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body style={{ margin: 0, padding: 0, background: "#0a0a0f" }}>
                {children}
            </body>
        </html>
    )
}
