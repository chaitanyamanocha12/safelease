"use client";
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui", padding: 40, textAlign: "center" }}>
        <h1>SafeLease is temporarily unavailable</h1>
        <p>Please try again in a moment.</p>
        <button onClick={reset}>Try again</button>
      </body>
    </html>
  );
}
