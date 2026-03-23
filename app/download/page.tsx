"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type ExtractResult = {
  title: string;
  thumbnail?: string | null;
  video_url?: string;
  stream_url?: string;
};

type StoredData = ExtractResult & {
  source_url?: string;
};

function normalizeM3u8Url(baseUrl: string, maybeRelativeUrl: string) {
  try {
    return new URL(maybeRelativeUrl, baseUrl).toString();
  } catch {
    return maybeRelativeUrl;
  }
}

function pickBestVariantUrlFromMaster(masterText: string, masterUrl: string) {
  const lines = masterText.split(/\r?\n/);
  let best: { bandwidth: number; url: string } | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]?.trim() ?? "";
    if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;

    const attrs = line.slice("#EXT-X-STREAM-INF:".length);
    const m = attrs.match(/BANDWIDTH=(\d+)/i);
    const bandwidth = m ? Number(m[1]) : 0;

    let j = i + 1;
    while (j < lines.length) {
      const nextLine = lines[j]?.trim() ?? "";
      if (nextLine && !nextLine.startsWith("#")) {
        const url = normalizeM3u8Url(masterUrl, nextLine);
        if (!best || bandwidth > best.bandwidth) best = { bandwidth, url };
        break;
      }
      j += 1;
    }
  }

  return best?.url ?? masterUrl;
}

function absolutizePlaylistText(playlistText: string, playlistUrl: string) {
  const lines = playlistText.split(/\r?\n/);
  const out: string[] = [];

  for (const raw of lines) {
    const line = raw ?? "";
    const trimmed = line.trim();
    if (!trimmed) {
      out.push(line);
      continue;
    }

    if (trimmed.startsWith("#EXT-X-KEY:") || trimmed.startsWith("#EXT-X-MAP:")) {
      const updated = line.replace(/URI="([^"]+)"/g, (_, uri: string) => {
        const absolute = normalizeM3u8Url(playlistUrl, uri);
        return `URI="${absolute}"`;
      });
      out.push(updated);
      continue;
    }

    if (trimmed.startsWith("#")) {
      out.push(line);
      continue;
    }

    out.push(normalizeM3u8Url(playlistUrl, trimmed));
  }

  return out.join("\n");
}

function safeFileStem(title: string) {
  const cleaned = (title || "pinterest-video")
    .replace(/[\/\\?%*:|"<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || "pinterest-video";
}

function proxiedUrl(url: string) {
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

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
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [converting, setConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState<number>(0);
  const [finalMp4Url, setFinalMp4Url] = useState<string | null>(null);
  const [conversionError, setConversionError] = useState<string | null>(null);
  const ffmpegRef = useRef<unknown>(null);

  const canRender = useMemo(() => Boolean(data && data.title), [data]);
  const isHls = useMemo(() => Boolean(data?.stream_url), [data?.stream_url]);

  useEffect(() => {
    if (data) return;
    sessionStorage.removeItem("pinterest_video_data");
    router.replace("/");
  }, [router, data]);

  useEffect(() => {
    if (!isHls) return;

    let cancelled = false;

    async function loadFFmpeg() {
      try {
        const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
          import("@ffmpeg/ffmpeg"),
          import("@ffmpeg/util"),
        ]);

        if (cancelled) return;
        if (ffmpegRef.current) {
          setFfmpegLoaded(true);
          return;
        }

        const baseURL =
          "https://unpkg.com/@ffmpeg/core-mt@0.12.2/dist/esm";

        const ffmpeg = new FFmpeg();
        ffmpeg.on("progress", ({ progress }: { progress?: number }) => {
          const p = typeof progress === "number" ? progress : 0;
          if (cancelled) return;
          setConversionProgress(Math.max(0, Math.min(100, Math.round(p * 100))));
        });

        const [coreURL, wasmURL, workerURL] = await Promise.all([
          toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
          toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
          toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, "text/javascript"),
        ]);

        await ffmpeg.load({ coreURL, wasmURL, workerURL });

        if (cancelled) return;
        ffmpegRef.current = ffmpeg;
        setFfmpegLoaded(true);
      } catch {
        if (cancelled) return;
        setConversionError(
          "Converter load failed. Your browser may block SharedArrayBuffer or cross-origin resources."
        );
      }
    }

    void loadFFmpeg();

    return () => {
      cancelled = true;
    };
  }, [isHls]);

  useEffect(() => {
    if (!finalMp4Url) return;
    return () => {
      URL.revokeObjectURL(finalMp4Url);
    };
  }, [finalMp4Url]);

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

  async function handleHlsToMp4Conversion() {
    if (!data?.stream_url) return;
    if (!ffmpegRef.current) return;
    if (converting) return;

    setConversionError(null);
    setFinalMp4Url(null);
    setConversionProgress(0);
    setConverting(true);

    try {
      const ffmpeg = ffmpegRef.current as {
        writeFile: (path: string, data: Uint8Array) => Promise<void>;
        exec: (args: string[]) => Promise<void>;
        readFile: (path: string) => Promise<Uint8Array>;
      };

      const masterUrl = data.stream_url;
      const masterRes = await fetch(proxiedUrl(masterUrl), { cache: "no-store" });
      if (!masterRes.ok) {
        throw new Error("Failed to fetch master playlist.");
      }
      const masterText = await masterRes.text();
      const bestVariantUrl = pickBestVariantUrlFromMaster(masterText, masterUrl);

      const streamRes = await fetch(proxiedUrl(bestVariantUrl), { cache: "no-store" });
      if (!streamRes.ok) {
        throw new Error("Failed to fetch stream playlist.");
      }
      const streamText = await streamRes.text();
      const absolutePlaylist = absolutizePlaylistText(streamText, bestVariantUrl);
      const localPlaylist = absolutePlaylist.replace(
        /^(?!#)(.+)$/gm,
        (m) => proxiedUrl(m.trim())
      );
      const localPlaylistFinal = localPlaylist.replace(
        /URI="([^"]+)"/g,
        (_, uri: string) => `URI="${proxiedUrl(uri)}"`
      );

      const enc = new TextEncoder();
      await ffmpeg.writeFile("playlist.m3u8", enc.encode(localPlaylistFinal));

      await ffmpeg.exec([
        "-protocol_whitelist",
        "file,http,https,tcp,tls,crypto",
        "-i",
        "playlist.m3u8",
        "-c",
        "copy",
        "-bsf:a",
        "aac_adtstoasc",
        "output.mp4",
      ]);

      const output = await ffmpeg.readFile("output.mp4");
      const copy = new Uint8Array(output.length);
      copy.set(output);
      const blob = new Blob([copy.buffer], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      setFinalMp4Url(url);
    } catch (e) {
      const msg =
        e instanceof Error && e.message
          ? e.message
          : "Conversion failed. Try the server-side HLS download or FFmpeg on desktop.";
      setConversionError(msg);
    } finally {
      setConverting(false);
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
                  src={proxiedUrl(data.thumbnail)}
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
                    {finalMp4Url ? (
                      <a
                        href={finalMp4Url}
                        download={`${safeFileStem(data.title)}.mp4`}
                        className="inline-flex h-12 items-center justify-center rounded-2xl bg-gradient-to-r from-[#E60023] to-rose-500 px-5 font-semibold text-white transition-opacity hover:opacity-95 sm:col-span-2"
                      >
                        Download Converted MP4
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleHlsToMp4Conversion()}
                        disabled={!ffmpegLoaded || converting}
                        className="inline-flex h-12 items-center justify-center rounded-2xl bg-gradient-to-r from-[#E60023] to-rose-500 px-5 font-semibold text-white transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2"
                      >
                        Convert &amp; Download MP4 (Beta)
                      </button>
                    )}

                    {!ffmpegLoaded && !conversionError ? (
                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 sm:col-span-2">
                        Loading converter...
                      </div>
                    ) : null}

                    {converting ? (
                      <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 sm:col-span-2">
                        <div className="flex items-center justify-between text-sm text-zinc-700">
                          <span>Converting...</span>
                          <span>{conversionProgress}%</span>
                        </div>
                        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                          <div
                            className="h-full rounded-full bg-[#E60023] transition-[width]"
                            style={{ width: `${conversionProgress}%` }}
                          />
                        </div>
                      </div>
                    ) : null}

                    {conversionError ? (
                      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:col-span-2">
                        {conversionError}
                      </div>
                    ) : null}

                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 sm:col-span-2">
                      Desktop वर हे best चालतं. Conversion data-heavy आणि
                      mobile वर slow होऊ शकतं.
                    </div>

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
              <Link href="/privacy-policy" className="hover:text-white">
                Privacy Policy
              </Link>
              <Link href="/terms-of-service" className="hover:text-white">
                Terms of Service
              </Link>
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
