"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "https://pinterest-downloader-production-5d58.up.railway.app/")
  .trim()
  .replace(/\/+$/, "");

function apiUrl(path: string) {
  if (!API_BASE) return path;
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

type ExtractResult = {
  title: string;
  thumbnail?: string | null;
  video_url?: string;
  stream_url?: string;
};

type StoredData = ExtractResult & {
  source_url?: string;
};

export type DownloaderLandingProps = {
  heroTitle?: string;
  heroDescription?: string;
};

export function DownloaderLanding({
  heroTitle = "Pinterest Video Downloader",
  heroDescription = "Our Pinterest Video Downloader allows you to download videos from Pinterest in HD quality instantly. No login required, no watermark, and completely free.",
}: DownloaderLandingProps) {
  const [url, setUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StoredData | null>(null);

  const isValidInput = useMemo(() => url.trim().length > 0, [url]);
  const faqItems = useMemo(
    () => [
      {
        question: "Can I download Pinterest videos in MP4?",
        answer: "Yes, our tool converts Pinterest videos to MP4 format automatically.",
      },
      {
        question: "Where are files saved?",
        answer: "Downloads are saved to your browser’s default Downloads folder unless you changed it.",
      },
      {
        question: "Can I download GIFs?",
        answer: "If Pinterest provides a downloadable asset, we’ll attempt to extract it. Some pins may only be streaming-only.",
      },
      {
        question: "Why do I see HLS instead of MP4?",
        answer: "Some videos are delivered as HLS streams (.m3u8). In that case we provide an HLS download option.",
      },
      {
        question: "Does it work on mobile?",
        answer: "Yes. Use a share link from the Pinterest app for best results.",
      },
      {
        question: "Is this affiliated with Pinterest?",
        answer: "No. This is an independent tool and not affiliated with Pinterest.",
      },
    ],
    [],
  );
  const faqSchema = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqItems.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    }),
    [faqItems],
  );

  async function handleFetch() {
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Please paste a Pinterest link.");
      return;
    }

    if (loading) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(apiUrl("/extract"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });

      const contentType = res.headers.get("content-type") || "";
      const isJson = contentType.toLowerCase().includes("application/json");
      const rawBody = await res.text();
      const payload = isJson ? (JSON.parse(rawBody) as unknown) : rawBody;

      if (!res.ok) {
        const msg = typeof payload === "object" && payload !== null ? (payload as { message?: unknown }).message : null;
        setError(typeof msg === "string" && msg.trim() ? msg : "Request failed.");
        return;
      }

      if (typeof payload !== "object" || payload === null) {
        setError("Unexpected response from the server.");
        return;
      }

      const title = (payload as { title?: unknown }).title;
      if (typeof title !== "string" || !title.trim()) {
        setError("Unexpected response from the server.");
        return;
      }

      const extracted: StoredData = {
        title,
        thumbnail: typeof (payload as { thumbnail?: unknown }).thumbnail === "string" ? ((payload as { thumbnail?: unknown }).thumbnail as string) : null,
        video_url: typeof (payload as { video_url?: unknown }).video_url === "string" ? ((payload as { video_url?: unknown }).video_url as string) : undefined,
        stream_url: typeof (payload as { stream_url?: unknown }).stream_url === "string" ? ((payload as { stream_url?: unknown }).stream_url as string) : undefined,
        source_url: trimmed,
      };

      setResult(extracted);
    } catch {
      setError("Request failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload() {
    const sourceUrl = (result?.source_url || url).trim();
    if (!sourceUrl) {
      setError("Please paste a Pinterest link.");
      return;
    }
    if (downloadLoading) return;

    setDownloadLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/download"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sourceUrl }),
      });

      const contentType = res.headers.get("content-type") || "";
      if (contentType.toLowerCase().includes("video")) {
        const blob = await res.blob();
        const downloadUrl = window.URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = "video.mp4";
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);
        return;
      }

      const json = (await res.json()) as unknown;
      const videoUrl = (json as { video_url?: unknown }).video_url;
      if (typeof videoUrl === "string" && videoUrl.trim()) {
        window.open(videoUrl, "_blank", "noopener,noreferrer");
        return;
      }

      const msg = (json as { message?: unknown }).message;
      setError(typeof msg === "string" && msg.trim() ? msg : "Download failed.");
    } catch {
      setError("Download failed.");
    } finally {
      setDownloadLoading(false);
    }
  }

  function reset() {
    setUrl("");
    setResult(null);
    setError(null);
    setLoading(false);
    setDownloadLoading(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 font-sans text-zinc-950">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="text-base font-semibold tracking-tight text-zinc-950"
          >
            Pinterest Downloader
          </Link>
          <div className="hidden items-center gap-6 text-sm text-zinc-600 sm:flex">
            <a href="#how-to" className="hover:text-[#E60023]">
              How to
            </a>
            <a href="#faq" className="hover:text-[#E60023]">
              FAQ
            </a>
            <a href="#blog" className="hover:text-[#E60023]">
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
              <h1 className="text-4xl font-semibold tracking-tight text-[#E60023] sm:text-5xl">
                {heroTitle}
              </h1>
              <p className="text-lg leading-relaxed text-zinc-600">
                {heroDescription}
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

            <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-lg shadow-red-100 sm:p-7">
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleFetch();
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
                    type="button"
                    onClick={handleFetch}
                    disabled={!isValidInput || loading}
                    className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[#E60023] px-7 font-semibold text-white shadow-sm transition-colors hover:bg-[#d0001f] disabled:cursor-not-allowed disabled:bg-zinc-300 sm:w-auto"
                  >
                    {loading ? (
                      <>
                        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/90 border-t-transparent" />
                        Processing...
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
            </div>
          </div>
        </section>

        {result ? (
          <section className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
            <div className="grid gap-6 rounded-3xl border border-zinc-200 bg-white p-5 shadow-lg shadow-red-100 sm:p-7 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <h2 className="mb-4 text-lg font-semibold text-zinc-950">
                  {result.title}
                </h2>
                {result.video_url ? (
                  <video
                    src={result.video_url}
                    controls
                    playsInline
                    className="aspect-video w-full rounded-2xl border border-zinc-200 bg-black"
                    poster={result.thumbnail || undefined}
                  />
                ) : result.thumbnail ? (
                  <img
                    src={result.thumbnail}
                    alt={result.title}
                    className="aspect-video w-full rounded-2xl border border-zinc-200 object-cover"
                  />
                ) : (
                  <div className="aspect-video w-full rounded-2xl border border-zinc-200 bg-zinc-100" />
                )}
              </div>

              <div className="flex flex-col gap-3 lg:justify-center">
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloadLoading}
                  className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#E60023] px-5 font-semibold text-white transition-colors hover:bg-[#d0001f] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {downloadLoading ? "Processing..." : "Download"}
                </button>

                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 font-semibold text-zinc-900 transition-colors hover:bg-zinc-50 hover:text-[#E60023]"
                >
                  Download More Video
                </button>

                <a
                  href={result.source_url || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 font-semibold text-zinc-900 transition-colors hover:bg-zinc-50 hover:text-[#E60023]"
                >
                  Go To Pinterest
                </a>

                {error ? (
                  <div className="mt-1 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {error}
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        <section
          aria-label="Advertisement"
          className="mx-auto max-w-6xl px-4 pb-10 sm:px-6"
        >
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
              <h2 className="text-2xl font-semibold tracking-tight text-[#E60023]">
                How to Download Pinterest Videos
              </h2>
            </div>

            <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <ol className="list-decimal space-y-2 pl-5 text-zinc-600">
                <li>Copy the Pinterest video link</li>
                <li>Paste it into the input box</li>
                <li>Click the Download button</li>
                <li>Your video will be downloaded in MP4 format</li>
              </ol>
            </div>
          </div>
        </section>

        <section className="py-12 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="rounded-3xl bg-gray-100 p-6 sm:p-10">
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
                      d="M12 6V18"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M6 12H18"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <h2 className="text-2xl font-semibold tracking-tight text-[#E60023]">
                  Features
                </h2>
              </div>

            <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <ul className="list-disc space-y-2 pl-5 text-zinc-600">
                <li>Download videos in HD quality</li>
                <li>Supports MP4 format</li>
                <li>No login required</li>
                <li>Fast and secure processing</li>
                <li>Works on mobile and desktop</li>
              </ul>
            </div>
            </div>
          </div>
        </section>

        <section className="bg-[#FFF5F5] py-12 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="rounded-3xl bg-white/70 p-6 sm:p-10">
              <h2 className="text-2xl font-semibold tracking-tight text-[#E60023]">
                Why Use Our Pinterest Downloader?
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-zinc-700">
                Unlike other tools, our downloader automatically converts streaming
                videos into MP4 format, ensuring you always get a downloadable
                file.
              </p>
            </div>
          </div>
        </section>

        <section id="faq" className="py-12 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="rounded-3xl bg-[#FFF5F5] p-6 sm:p-10">
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
                      d="M12 18H12.01"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M10 9C10 7.89543 10.8954 7 12 7C13.1046 7 14 7.89543 14 9C14 10.5 12 11 12 12.5V14"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <h2 className="text-2xl font-semibold tracking-tight text-[#E60023]">
                  FAQ
                </h2>
              </div>

              <div className="mt-8 grid gap-6 lg:grid-cols-2">
                {faqItems.map((item, index) => (
                  <div
                    key={item.question}
                    className={`rounded-3xl border border-zinc-200 p-6 shadow-sm transition-colors hover:border-[#E60023]/40 ${
                      index % 2 === 0 ? "bg-white" : "bg-gray-50"
                    } ${index === faqItems.length - 1 ? "lg:col-span-2" : ""}`}
                  >
                    <h3 className="text-lg font-semibold">{item.question}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                      {item.answer}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="blog" className="pb-12 sm:pb-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-semibold tracking-tight text-[#E60023]">
                Blog
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-zinc-600">
                Coming soon. Tips, troubleshooting, and updates for the Pinterest
                Downloader.
              </p>
            </div>
          </div>
        </section>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      </main>

      <footer className="border-t border-zinc-700 bg-gradient-to-b from-gray-800 to-gray-900 text-zinc-100">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-2">
              <div className="text-base font-semibold">Pinterest Downloader</div>
              <div className="text-sm text-zinc-400">
                © 2026. All rights reserved.
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-zinc-300">
              <Link href="/privacy-policy" className="hover:text-white">
                Privacy Policy
              </Link>
              <Link href="/terms-of-service" className="hover:text-white">
                Terms of Service
              </Link>
              <a href="#faq" className="hover:text-white">
                Disclaimer
              </a>
            </div>
          </div>
          <p className="mt-6 text-sm leading-relaxed text-zinc-200/80">
            This site is not affiliated with Pinterest. Use it only to download
            content you have rights to use.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default function Home() {
  return <DownloaderLanding />;
}
