package com.bardic.app.data

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * "Connect with GitHub": talks to the Bardic sign-in helper (auth-worker/ in the repository),
 * whose address is in the site's auth/config.json. Every function blocks: call off the main thread.
 *
 * GitHub's device sign-in: the bard types a short code on github.com, no permission is asked,
 * Bardic only learns the public username. The helper keeps the registry of bard names.
 */
object BardAccount {
    class Reply(val status: Int, val body: JSONObject)
    class DeviceCode(val deviceCode: String, val userCode: String, val uri: String, val interval: Int, val expiresIn: Int)

    @Volatile private var worker: String? = null

    /** The helper's address, or "" while GitHub connection is not open yet. */
    fun worker(): String {
        worker?.let { return it }
        val w = JSONObject(BardicIO.fetchText("${BardicIO.SITE}auth/config.json")).optString("worker").trimEnd('/')
        if (w.isNotBlank()) worker = w
        return w
    }

    private fun call(path: String, method: String = "GET", token: String? = null, body: JSONObject? = null): Reply {
        val base = worker()
        if (base.isBlank()) error("GitHub connection is not open yet.")
        val c = (URL(base + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 15000
            readTimeout = 30000
            useCaches = false
            setRequestProperty("Accept", "application/json")
            if (token != null) setRequestProperty("Authorization", "Bearer $token")
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
            }
        }
        try {
            if (body != null) c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val code = c.responseCode
            val text = (if (code in 200..299) c.inputStream else c.errorStream)?.use { it.readBytes().toString(Charsets.UTF_8) }.orEmpty()
            return Reply(code, runCatching { JSONObject(text) }.getOrElse { JSONObject() })
        } finally {
            c.disconnect()
        }
    }

    fun deviceCode(): DeviceCode {
        val r = call("/device/code", "POST")
        val b = r.body
        if (r.status != 200 || b.optString("user_code").isBlank()) error(b.optString("error").ifBlank { "GitHub did not answer." })
        return DeviceCode(
            b.getString("device_code"), b.getString("user_code"),
            b.optString("verification_uri").ifBlank { "https://github.com/login/device" },
            b.optInt("interval", 5).coerceAtLeast(5), b.optInt("expires_in", 900),
        )
    }

    /** status "ok" (with token, login, name), "authorization_pending", "slow_down", "expired_token", "access_denied". */
    fun deviceToken(deviceCode: String): JSONObject = call("/device/token", "POST", body = JSONObject().put("device_code", deviceCode)).body

    fun whoAmI(token: String): Reply = call("/bard", token = token)

    fun register(token: String, name: String): Reply = call("/bard", "POST", token, JSONObject().put("name", name))
}
