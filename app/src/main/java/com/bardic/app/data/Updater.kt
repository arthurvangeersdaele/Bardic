package com.bardic.app.data

import android.content.Context
import com.bardic.app.BuildConfig
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Updates: every push to main publishes the "Latest dev build" release on GitHub.
 * The app compares the commit it was built from with the release's, and downloads the newer APK.
 * Every function blocks: call off the main thread.
 */
object Updater {
    private const val API = "https://api.github.com/repos/arthurvangeersdaele/Bardic/releases/tags/dev-latest"

    class Release(val sha: String, val url: String, val name: String, val size: Long, val published: String)

    /** True for a build made by GitHub Actions (a local build cannot tell its commit). */
    val canCheck: Boolean get() = BuildConfig.GIT_SHA != "dev"

    val current: String get() = "${BuildConfig.VERSION_NAME} (${BuildConfig.GIT_SHA})"

    /** The published build, or null when there is none or no connection. */
    fun latest(): Release? {
        val c = open(API)
        c.setRequestProperty("Accept", "application/vnd.github+json")
        try {
            if (c.responseCode != 200) return null
            val o = JSONObject(c.inputStream.use { it.readBytes().toString(Charsets.UTF_8) })
            val assets = o.optJSONArray("assets") ?: return null
            val apk = (0 until assets.length()).mapNotNull { assets.optJSONObject(it) }
                .firstOrNull { it.optString("name").endsWith(".apk") } ?: return null
            return Release(
                sha = o.optString("target_commitish"),
                url = apk.getString("browser_download_url"),
                name = apk.optString("name"),
                size = apk.optLong("size", 0),
                published = o.optString("published_at"),
            )
        } finally {
            c.disconnect()
        }
    }

    fun isNewer(r: Release): Boolean =
        canCheck && r.sha.length >= 7 && !r.sha.startsWith(BuildConfig.GIT_SHA)

    /** Downloads the APK into the cache, reporting the bytes received. */
    fun download(context: Context, r: Release, onBytes: (Long) -> Unit): File {
        val dir = File(context.cacheDir, "updates").apply { deleteRecursively(); mkdirs() }
        val target = File(dir, r.name.ifBlank { "bardic.apk" })
        var url = r.url
        // GitHub answers with a redirection to its file storage, possibly more than once.
        repeat(5) {
            val c = open(url)
            c.instanceFollowRedirects = false
            try {
                when (c.responseCode) {
                    in 300..399 -> {
                        url = c.getHeaderField("Location") ?: error("Download failed (no address).")
                        return@repeat
                    }
                    in 200..299 -> {
                        var got = 0L
                        c.inputStream.use { input ->
                            target.outputStream().use { out ->
                                val buffer = ByteArray(64 * 1024)
                                while (true) {
                                    val n = input.read(buffer)
                                    if (n < 0) break
                                    out.write(buffer, 0, n)
                                    got += n
                                    onBytes(got)
                                }
                            }
                        }
                        return target
                    }
                    else -> error("Download failed (${c.responseCode}).")
                }
            } finally {
                c.disconnect()
            }
        }
        error("Download failed (too many redirections).")
    }

    private fun open(url: String): HttpURLConnection =
        (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15000
            readTimeout = 30000
            useCaches = false
            setRequestProperty("User-Agent", "Bardic-Android")
        }
}
