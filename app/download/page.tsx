"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type ExtractResult = {
  title: string;
  thumbnail?: string | null;
  video_url?: string;
  stream_url?: string;
};

type StoredData = ExtractResult & {
  source_url?: string;
};

export default function DownloadPage() {
  const router = useRouter();
  const [data] = useState<StoredData | null>(() => {
    try {
      const raw = sessionStorage.getItem("pinterest_video_data");
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed !== "object" || parsed === null) return null;
      const title = (parsed as { title?: unknown }).title;
      const videoUrl = (parsed as { video_url?: unknown }).video_url;
      const streamUrl = (parsed as { stream_url?: unknown }).stream_url;
      if (typeof title !== "string" || !title.trim()) return null;
      if ((videoUrl && typeof videoUrl !== "string") || (streamUrl && typeof streamUrl !== "string")) {
        return null;
      }
      return parsed as StoredData;
    } catch {
      return null;
    }
  });
  const [copied, setCopied] = useState<string | null>(null);

  const canRender = useMemo(() => Boolean(data && data.title), [data]);

  useEffect(() => {
    if (data) return;
    sessionStorage.removeItem("pinterest_video_data");
    router.replace("/");
  }, [router, data]);

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

  function downloadAnother() {
    sessionStorage.removeItem("pinterest_video_data");
    router.push("/");
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
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={downloadAnother}
              className="inline-flex h-10 items-center justify-center rounded-2xl bg-[#E60023] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#c7001f]"
            >
              Download Another
            </button>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <section className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Your download is ready
          </h1>
          <p className="mt-2 text-zinc-600">
            Choose the best option below. If MP4 isn’t available, use HLS tools.
          </p>
        </section>

        {copied ? (
          <div className="mb-5 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
            {copied}
          </div>
        ) : null}

        {canRender && data ? (
          <section className="grid gap-8 lg:grid-cols-2">
            <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
              {data.thumbnail ? (
                <img
                  src={data.thumbnail}
                  alt={data.title}
                  className="aspect-[4/3] w-full rounded-2xl border border-zinc-200 object-cover"
                />
              ) : (
                <div className="aspect-[4/3] w-full rounded-2xl border border-zinc-200 bg-zinc-100" />
              )}
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
              <h2 className="text-xl font-semibold leading-snug sm:text-2xl">
                {data.title}
              </h2>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {data.video_url ? (
                  <a
                    href={data.video_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#E60023] px-5 font-semibold text-white transition-colors hover:bg-[#c7001f]"
                  >
                    Direct MP4 Download
                  </a>
                ) : data.stream_url ? (
                  <a
                    href={`/api/hls?url=${encodeURIComponent(
                      data.stream_url
                    )}&title=${encodeURIComponent(data.title)}`}
                    className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#E60023] px-5 font-semibold text-white transition-colors hover:bg-[#c7001f]"
                  >
                    Download HLS (.ts)
                  </a>
                ) : null}

                {data.stream_url ? (
                  <a
                    href={data.stream_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 font-semibold text-zinc-900 transition-colors hover:bg-zinc-50"
                  >
                    Open HLS
                  </a>
                ) : null}

                {data.source_url ? (
                  <a
                    href={data.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 font-semibold text-zinc-900 transition-colors hover:bg-zinc-50"
                  >
                    Open Pinterest
                  </a>
                ) : null}

                {data.stream_url ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        copyText(
                          `ffmpeg -i "${data.stream_url}" -c copy "${data.title}.mp4"`,
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
                          `yt-dlp -o "%(title)s.%(ext)s" "${data.stream_url}"`,
                          "yt-dlp command copied"
                        )
                      }
                      className="inline-flex h-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 font-semibold text-zinc-900 transition-colors hover:bg-zinc-50"
                    >
                      Copy yt-dlp
                    </button>
                  </>
                ) : null}

                <button
                  type="button"
                  onClick={downloadAnother}
                  className="inline-flex h-12 items-center justify-center rounded-2xl bg-zinc-950 px-5 font-semibold text-white transition-colors hover:bg-zinc-900 sm:col-span-2"
                >
                  Download Another Video
                </button>
              </div>

              <p className="mt-5 text-sm text-zinc-500">
                {data.video_url
                  ? "If the download doesn’t start automatically, open the direct link and save the video from your browser."
                  : data.stream_url
                    ? "MP4 available नाही, पण app HLS (.m3u8) ला .ts म्हणून download करू शकतो. नंतर ffmpeg/yt-dlp ने MP4 मध्ये convert करा."
                    : ""}
              </p>
            </div>
          </section>
        ) : (
          <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-transparent" />
              <p className="text-sm text-zinc-700">Loading your result...</p>
            </div>
          </section>
        )}
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
              <Link href="/" className="hover:text-white">
                Home
              </Link>
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
