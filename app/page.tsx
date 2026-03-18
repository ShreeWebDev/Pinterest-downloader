"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type ExtractResult = {
  title: string;
  thumbnail?: string | null;
  video_url?: string;
  stream_url?: string;
};

export default function Home() {
  const [url, setUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const isValidInput = useMemo(() => url.trim().length > 0, [url]);

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied("Copy failed");
      window.setTimeout(() => setCopied(null), 1500);
    }
  }

  async function handleDownload() {
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
            const streamUrl = (data as { stream_url?: unknown }).stream_url;
            const title = (data as { title?: unknown }).title;
            const thumbnail = (data as { thumbnail?: unknown }).thumbnail;
            if (typeof streamUrl === "string" && streamUrl.trim()) {
              setResult({
                title: typeof title === "string" && title.trim() ? title : "Pinterest Video",
                thumbnail: typeof thumbnail === "string" ? thumbnail : null,
                stream_url: streamUrl,
              });
            }
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
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="text-base font-semibold tracking-tight text-zinc-950"
          >
            Pinterest Downloader
          </Link>
          <div className="hidden items-center gap-6 text-sm text-zinc-600 sm:flex">
            <a href="#how-to" className="hover:text-zinc-900">
              How to
            </a>
            <a href="#faq" className="hover:text-zinc-900">
              FAQ
            </a>
            <a href="#blog" className="hover:text-zinc-900">
              Blog
            </a>
          </div>
        </nav>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(900px_circle_at_20%_0%,rgba(230,0,35,0.10),transparent_60%),radial-gradient(900px_circle_at_80%_20%,rgba(230,0,35,0.08),transparent_55%)]" />
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-2 lg:items-center">
            <div className="flex flex-col gap-5">
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                Pinterest Video Downloader
              </h1>
              <p className="text-lg leading-relaxed text-zinc-600">
                Download HD Pinterest Videos, Images, and GIFs for free in 1
                Click!
              </p>
              <div className="flex flex-wrap gap-2 text-sm text-zinc-600">
                <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">
                  Free
                </span>
                <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">
                  No login
                </span>
                <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">
                  Works on mobile
                </span>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleDownload();
                }}
              >
                <label className="text-sm font-medium text-zinc-900">
                  Paste Pinterest URL
                </label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://www.pinterest.com/pin/..."
                    className="h-14 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-base outline-none ring-[#E60023]/25 placeholder:text-zinc-400 focus:ring-4"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <button
                    type="submit"
                    disabled={!isValidInput || loading}
                    className="inline-flex h-14 shrink-0 items-center justify-center gap-3 rounded-2xl bg-[#E60023] px-7 font-semibold text-white shadow-sm transition-colors hover:bg-[#c7001f] disabled:cursor-not-allowed disabled:bg-zinc-300"
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
              </form>

              {error ? (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {error}
                </div>
              ) : null}
              {copied ? (
                <div className="mt-3 text-sm text-zinc-600">{copied}</div>
              ) : null}

              {result ? (
                <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
                    <div className="w-full sm:w-52">
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
                      <h2 className="text-lg font-semibold leading-snug">
                        {result.title}
                      </h2>
                      <div className="flex flex-col gap-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          {result.video_url ? (
                            <a
                              href={result.video_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#E60023] px-5 font-semibold text-white transition-colors hover:bg-[#c7001f]"
                            >
                              Direct MP4 Download
                            </a>
                          ) : result.stream_url ? (
                            <>
                              <a
                                href={`/api/hls?url=${encodeURIComponent(
                                  result.stream_url
                                )}&title=${encodeURIComponent(result.title)}`}
                                className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#E60023] px-5 font-semibold text-white transition-colors hover:bg-[#c7001f]"
                              >
                                Download HLS (.ts)
                              </a>
                              <a
                                href={result.stream_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex h-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 font-semibold text-zinc-900 transition-colors hover:bg-zinc-50"
                              >
                                Open HLS
                              </a>
                            </>
                          ) : null}
                          <a
                            href={url.trim()}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 font-semibold text-zinc-900 transition-colors hover:bg-zinc-50"
                          >
                            Open Pinterest
                          </a>
                          {result.stream_url ? (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  copyText(
                                    `ffmpeg -i "${result.stream_url}" -c copy "${result.title}.mp4"`,
                                    "FFmpeg command copied"
                                  )
                                }
                                className="inline-flex h-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 font-semibold text-zinc-900 transition-colors hover:bg-zinc-50"
                              >
                                Copy FFmpeg
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  copyText(
                                    `yt-dlp -o "%(title)s.%(ext)s" "${result.stream_url}"`,
                                    "yt-dlp command copied"
                                  )
                                }
                                className="inline-flex h-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 font-semibold text-zinc-900 transition-colors hover:bg-zinc-50"
                              >
                                Copy yt-dlp
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <p className="text-sm text-zinc-500">
                        {result.video_url
                          ? "If the download doesn’t start automatically, open the direct link and save the video from your browser."
                          : result.stream_url
                            ? "MP4 available नाही, पण app HLS (.m3u8) ला .ts म्हणून download करू शकतो. नंतर ffmpeg/yt-dlp ने MP4 मध्ये convert करा."
                            : ""}
                      </p>
                    </div>
                  </div>
                </section>
              ) : null}
            </div>
          </div>
        </section>

        <section aria-label="Advertisement" className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
          <div className="flex h-24 items-center justify-center rounded-3xl border border-zinc-200 bg-zinc-100 text-sm font-medium text-zinc-600">
            Advertisement Placeholder
          </div>
        </section>

        <section id="how-to" className="bg-zinc-100 py-12 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-[#E60023] shadow-sm">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M12 18V6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M7 11L12 6L17 11"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <h2 className="text-2xl font-semibold tracking-tight">
                How to Download
              </h2>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold">
                  Steps to Download from Mobile App
                </h3>
                <ul className="mt-4 list-disc space-y-2 pl-5 text-zinc-600">
                  <li>Open Pinterest app and tap Share on the post.</li>
                  <li>Copy link and paste it into the input above.</li>
                  <li>Tap Download to get the best available format.</li>
                </ul>
              </div>

              <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold">
                  Steps to Download from Desktop
                </h3>
                <ul className="mt-4 list-disc space-y-2 pl-5 text-zinc-600">
                  <li>Open a pin in your browser and copy the URL.</li>
                  <li>Paste the URL and click Download.</li>
                  <li>Open the direct link if your browser blocks auto-save.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="py-12 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight">
              Features
            </h2>
            <div className="mt-8 grid gap-6 lg:grid-cols-3">
              <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold">
                  Supported Video Quality &amp; Formats
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-zinc-600">
                  We attempt to extract the highest quality MP4 available. If a
                  pin is streaming-only, we provide an HLS download option.
                </p>
                <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-zinc-600">
                  <li>Best MP4 (when available)</li>
                  <li>HLS (.m3u8) download as .ts</li>
                  <li>Works with pin and share links</li>
                </ul>
              </div>

              <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold">Is it Safe to Use?</h3>
                <p className="mt-3 text-sm leading-relaxed text-zinc-600">
                  Yes. No account required. Paste a link and download. Always
                  respect copyright and only download content you have rights to
                  use.
                </p>
                <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-zinc-600">
                  <li>No login required</li>
                  <li>No tracking scripts added here</li>
                  <li>Runs on modern browsers</li>
                </ul>
              </div>

              <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold">Fast &amp; Simple</h3>
                <p className="mt-3 text-sm leading-relaxed text-zinc-600">
                  Clean UI, one-click download flow, and clear fallbacks when a
                  pin doesn’t provide a direct MP4 link.
                </p>
                <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-zinc-600">
                  <li>Mobile-first design</li>
                  <li>Clear error messages</li>
                  <li>Copy commands for power users</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-zinc-50 py-12 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight">
              What&apos;s New
            </h2>
            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              <div className="rounded-3xl border border-blue-200 bg-blue-50 p-6 text-blue-900">
                <h3 className="text-base font-semibold">Update</h3>
                <p className="mt-2 text-sm leading-relaxed">
                  Improved error handling and clearer messages for failed pins.
                </p>
              </div>
              <div className="rounded-3xl border border-green-200 bg-green-50 p-6 text-green-900">
                <h3 className="text-base font-semibold">Fix</h3>
                <p className="mt-2 text-sm leading-relaxed">
                  Fixed GIF downloading issues and improved extraction fallback.
                </p>
              </div>
              <div className="rounded-3xl border border-orange-200 bg-orange-50 p-6 text-orange-900">
                <h3 className="text-base font-semibold">New</h3>
                <p className="mt-2 text-sm leading-relaxed">
                  Added in-app HLS download when direct MP4 isn&apos;t available.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className="py-12 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight">FAQ</h2>
            <dl className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                <dt className="text-base font-semibold">Where are files saved?</dt>
                <dd className="mt-2 text-sm leading-relaxed text-zinc-600">
                  Downloads are saved to your browser’s default Downloads folder
                  unless you changed it.
                </dd>
              </div>
              <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                <dt className="text-base font-semibold">Can I download GIFs?</dt>
                <dd className="mt-2 text-sm leading-relaxed text-zinc-600">
                  If Pinterest provides a downloadable asset, we’ll attempt to
                  extract it. Some pins may only be streaming-only.
                </dd>
              </div>
              <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                <dt className="text-base font-semibold">
                  Why do I see HLS instead of MP4?
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-zinc-600">
                  Some videos are delivered as HLS streams (.m3u8). In that case
                  we provide an HLS download option.
                </dd>
              </div>
              <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                <dt className="text-base font-semibold">
                  Does it work on mobile?
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-zinc-600">
                  Yes. Use a share link from the Pinterest app for best results.
                </dd>
              </div>
              <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                <dt className="text-base font-semibold">Is this affiliated with Pinterest?</dt>
                <dd className="mt-2 text-sm leading-relaxed text-zinc-600">
                  No. This is an independent tool and not affiliated with
                  Pinterest.
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section id="blog" className="pb-12 sm:pb-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-semibold tracking-tight">Blog</h2>
              <p className="mt-3 text-sm leading-relaxed text-zinc-600">
                Coming soon. Tips, troubleshooting, and updates for the Pinterest
                Downloader.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-800 bg-zinc-950 text-zinc-200">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-2">
              <div className="text-base font-semibold">Pinterest Downloader</div>
              <div className="text-sm text-zinc-400">
                © 2026. All rights reserved.
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-zinc-300">
              <a href="#" className="hover:text-white">
                Privacy Policy
              </a>
              <a href="#" className="hover:text-white">
                Terms
              </a>
              <a href="#faq" className="hover:text-white">
                Disclaimer
              </a>
            </div>
          </div>
          <p className="mt-6 text-sm leading-relaxed text-zinc-400">
            This site is not affiliated with Pinterest. Use it only to download
            content you have rights to use.
          </p>
        </div>
      </footer>
    </div>
  );
}
