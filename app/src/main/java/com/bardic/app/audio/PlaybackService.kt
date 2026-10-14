package com.bardic.app.audio

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.bardic.app.MainActivity
import com.bardic.app.R

/**
 * Glue between the open table and Android: the foreground service that keeps the sound going
 * with the screen off, audio focus (pause on a phone call) and unplugged headphones.
 */
object PlaybackController {
    var session: TableSession? = null
        private set
    private var focusRequest: AudioFocusRequest? = null
    private var serviceOn = false
    private var lastPlaying: Boolean? = null
    private var appContext: Context? = null

    private val noisy = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) session?.pauseForInterruption()
        }
    }

    private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
        when (change) {
            AudioManager.AUDIOFOCUS_LOSS, AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> session?.pauseForInterruption()
        }
    }

    fun attach(context: Context, s: TableSession) {
        appContext = context.applicationContext
        session = s
        lastPlaying = null
        ContextCompat.registerReceiver(
            context.applicationContext, noisy, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY),
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
    }

    fun detach(s: TableSession) {
        if (session !== s) return
        val ctx = appContext ?: return
        session = null
        runCatching { ctx.unregisterReceiver(noisy) }
        focusRequest?.let { (ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager).abandonAudioFocusRequest(it) }
        focusRequest = null
        if (serviceOn) {
            ctx.stopService(Intent(ctx, PlaybackService::class.java))
            serviceOn = false
        }
    }

    /** Called before any sound starts: takes audio focus and starts the foreground service. */
    fun willPlay(context: Context) {
        val ctx = context.applicationContext
        if (focusRequest == null) {
            val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build()
                )
                .setOnAudioFocusChangeListener(focusListener)
                .setWillPauseWhenDucked(false)
                .build()
            am.requestAudioFocus(req)
            focusRequest = req
        }
        if (!serviceOn) {
            runCatching {
                ContextCompat.startForegroundService(ctx, Intent(ctx, PlaybackService::class.java))
                serviceOn = true
            }
        }
    }

    /** Keeps the notification in step with what plays. */
    fun update(playing: Boolean) {
        if (!serviceOn || lastPlaying == playing) return
        lastPlaying = playing
        val ctx = appContext ?: return
        PlaybackService.notify(ctx, session?.story?.title.orEmpty(), playing)
    }
}

class PlaybackService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PAUSE -> PlaybackController.session?.pauseAll()
            ACTION_STOP -> PlaybackController.session?.stopAll()
        }
        val s = PlaybackController.session
        val notification = build(this, s?.story?.title.orEmpty(), s?.anyPlaying() ?: false)
        ServiceCompat.startForeground(
            this, ID, notification,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0,
        )
        if (s == null) stopSelf()
        return START_NOT_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Swiping Bardic away from the recent apps ends the session.
        PlaybackController.session?.stopAll()
        stopSelf()
        super.onTaskRemoved(rootIntent)
    }

    companion object {
        private const val CHANNEL = "playback"
        private const val ID = 7
        const val ACTION_PAUSE = "com.bardic.app.PAUSE_ALL"
        const val ACTION_STOP = "com.bardic.app.STOP_ALL"

        fun notify(context: Context, title: String, playing: Boolean) {
            if (Build.VERSION.SDK_INT >= 33 &&
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            ) return
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(ID, build(context, title, playing))
        }

        fun build(context: Context, title: String, playing: Boolean): Notification {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(CHANNEL) == null) {
                nm.createNotificationChannel(
                    NotificationChannel(CHANNEL, "Playing at the table", NotificationManager.IMPORTANCE_LOW).apply {
                        description = "Keeps the sounds going while the screen is off"
                        setShowBadge(false)
                    }
                )
            }
            val open = PendingIntent.getActivity(
                context, 0,
                Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            fun action(a: String, code: Int) = PendingIntent.getService(
                context, code, Intent(context, PlaybackService::class.java).setAction(a),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            return NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_launcher_monochrome)
                .setContentTitle(title.ifBlank { "Bardic" })
                .setContentText(if (playing) "Playing at the table" else "The table is open")
                .setContentIntent(open)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .addAction(0, if (playing) "Pause all" else "Resume all", action(ACTION_PAUSE, 1))
                .addAction(0, "Fade out all", action(ACTION_STOP, 2))
                .build()
        }
    }
}
