"use client";

import { useMemo, useState } from "react";

type ExtractResult = {
  title: string;
  thumbnail?: string | null;
  video_url: string;
};

export default function Home() {
  const [url, setUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractResult | null>(null);

  const isValidInput = useMemo(() => url.trim().length > 0, [url]);

  async function onDownload() {
    const trimmed = url.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });

      const contentType = res.headers.get("content-type") || "";
      const isJson = contentType.toLowerCase().includes("application/json");
      const rawBody = await res.text();
      const data = isJson ? (JSON.parse(rawBody) as unknown) : rawBody;

      if (!res.ok) {
        if (typeof data === "object" && data !== null) {
          const maybeMessage = (data as { message?: unknown }).message;
          if (typeof maybeMessage === "string" && maybeMessage.trim()) {
            setError(maybeMessage);
            return;
          }
        }

        if (!isJson && res.status === 404) {
          setError(
            "Local dev मध्ये /api/download चालत नाही. Vercel Python Function test करण्यासाठी 'vercel dev' वापरा, नंतर पुन्हा try करा."
          );
          return;
        }

        setError("Request failed. Please try a different Pinterest link.");
        return;
      }

      if (
        typeof data !== "object" ||
        data === null ||
        !("video_url" in data) ||
        typeof (data as { video_url: unknown }).video_url !== "string"
      ) {
        setError("Unexpected response from the server.");
        return;
      }

      setResult(data as ExtractResult);
    } catch {
      setError(
        "Response parse error. Local dev मध्ये Python API serve होत नाही. 'vercel dev' वापरून try करा."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-950">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-12 sm:py-16">
        <header className="flex flex-col gap-3">
          <div className="inline-flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-red-600" />
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Pinterest Video Downloader
            </h1>
          </div>
          <p className="text-zinc-600">
            Paste a Pinterest link, extract the highest-quality MP4, then download
            it directly.
          </p>
        </header>

        <main className="mt-10 flex flex-col gap-6">
          <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.pinterest.com/pin/..."
                className="h-14 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-base outline-none ring-red-600/25 placeholder:text-zinc-400 focus:ring-4"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={onDownload}
                disabled={!isValidInput || loading}
                className="inline-flex h-14 shrink-0 items-center justify-center gap-3 rounded-2xl bg-red-600 px-6 font-semibold text-white shadow-sm transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {loading ? (
                  <>
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/90 border-t-transparent" />
                    Loading...
                  </>
                ) : (
                  "Download"
                )}
              </button>
            </div>

            {error ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            ) : null}
          </div>

          {result ? (
            <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
                <div className="w-full sm:w-56">
                  {result.thumbnail ? (
                    <img
                      src={result.thumbnail}
                      alt={result.title}
                      className="aspect-[4/3] w-full rounded-2xl border border-zinc-200 object-cover"
                    />
                  ) : (
                    <div className="aspect-[4/3] w-full rounded-2xl border border-zinc-200 bg-zinc-100" />
                  )}
                </div>

                <div className="flex w-full flex-col gap-3">
                  <h2 className="text-xl font-semibold leading-snug">
                    {result.title}
                  </h2>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <a
                      href={result.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-12 items-center justify-center rounded-2xl bg-red-600 px-5 font-semibold text-white transition-colors hover:bg-red-700"
                    >
                      Direct MP4 Download
                    </a>
                    <a
                      href={url.trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 font-semibold text-zinc-900 transition-colors hover:bg-zinc-50"
                    >
                      Open Pinterest
                    </a>
                  </div>
                  <p className="text-sm text-zinc-500">
                    If the download doesn’t start automatically, open the direct
                    link and save the video from your browser.
                  </p>
                </div>
              </div>
            </section>
          ) : null}
        </main>

        <footer className="mt-auto pt-10 text-sm text-zinc-500">
          This tool extracts a direct video URL. Use it only for content you have
          rights to download.
        </footer>
      </div>
    </div>
  );
}
