package com.bardic.app

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.lifecycle.lifecycleScope
import com.bardic.app.audio.NativeEngine
import com.bardic.app.audio.PlaybackController
import com.bardic.app.data.Library
import com.bardic.app.ui.AppModel
import com.bardic.app.ui.BardicTheme
import com.bardic.app.ui.C
import com.bardic.app.ui.EditorScreen
import com.bardic.app.ui.EngineTestScreen
import com.bardic.app.ui.Host
import com.bardic.app.ui.LibraryScreen
import com.bardic.app.ui.Overlays
import com.bardic.app.ui.Screen
import com.bardic.app.ui.SharedScreen
import com.bardic.app.ui.Splash
import com.bardic.app.ui.TableScreen
import kotlinx.coroutines.CompletableDeferred
import java.io.File

class MainActivity : ComponentActivity(), Host {

    private lateinit var model: AppModel

    // File pickers and permission requests, awaited by the app model.
    private var pendingUri: CompletableDeferred<Uri?>? = null
    private var pendingUris: CompletableDeferred<List<Uri>>? = null

    private val openDocument = registerForActivityResult(ActivityResultContracts.OpenDocument()) { pendingUri?.complete(it) }
    private val openDocuments = registerForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { pendingUris?.complete(it) }
    private val createDocument = registerForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { pendingUri?.complete(it) }
    private val openTree = registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { pendingUri?.complete(it) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        Library.init(this)
        NativeEngine.start()
        model = AppModel(applicationContext, this, lifecycleScope)
        model.start()
        setContent {
            BardicTheme(model.settings.theme, model.settings.appearance) {
                App(model)
            }
        }
    }

    @Composable
    private fun App(m: AppModel) {
        BackHandler { if (!m.back()) finish() }
        val screen = m.screen
        // Keep the screen on while a story is open (table or editor), as on iPhone.
        val awake = m.settings.keepAwake && (m.table != null || screen is Screen.Table || screen == Screen.Editor)
        val view = LocalView.current
        DisposableEffect(awake) {
            view.keepScreenOn = awake
            if (awake) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            onDispose { }
        }
        Box(Modifier.fillMaxSize().background(C.bg).safeDrawingPadding()) {
            when (screen) {
                Screen.Library -> LibraryScreen(m)
                Screen.Shared -> SharedScreen(m)
                Screen.Editor -> EditorScreen(m)
                is Screen.Table -> TableScreen(m)
                Screen.EngineTest -> {
                    EngineTestScreen()
                    // The test uses all 20 voices: free them when leaving it.
                    DisposableEffect(Unit) {
                        onDispose { for (i in 0 until NativeEngine.MAX_VOICES) NativeEngine.unload(i) }
                    }
                }
            }
            Overlays(m)
        }
        if (m.splash) Splash { m.splash = false }
    }

    override fun onDestroy() {
        if (isFinishing) {
            model.table?.let { PlaybackController.detach(it) }
            NativeEngine.stop()
        }
        super.onDestroy()
    }

    // ------------------------------------------------------------------ Host

    override suspend fun pickBardic(): Uri? {
        val d = CompletableDeferred<Uri?>()
        pendingUri = d
        openDocument.launch(arrayOf("*/*"))
        return d.await()
    }

    override suspend fun pickAudio(): List<Uri> {
        val d = CompletableDeferred<List<Uri>>()
        pendingUris = d
        openDocuments.launch(arrayOf("audio/*"))
        return d.await()
    }

    override suspend fun saveAs(name: String): Uri? {
        val d = CompletableDeferred<Uri?>()
        pendingUri = d
        createDocument.launch(name)
        return d.await()
    }

    override suspend fun pickFolder(): Uri? {
        val d = CompletableDeferred<Uri?>()
        pendingUri = d
        openTree.launch(null)
        return d.await()
    }

    override fun share(files: List<File>) {
        val uris = files.map { FileProvider.getUriForFile(this, "$packageName.files", it) }
        val intent = if (uris.size == 1) {
            Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_STREAM, uris[0])
        } else {
            Intent(Intent.ACTION_SEND_MULTIPLE).putParcelableArrayListExtra(Intent.EXTRA_STREAM, ArrayList(uris))
        }
        intent.type = "application/octet-stream"
        intent.clipData = ClipData.newRawUri("", uris[0]).apply { uris.drop(1).forEach { addItem(ClipData.Item(it)) } }
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        startActivity(Intent.createChooser(intent, if (uris.size == 1) "Share the story" else "Share the stories"))
    }

    override fun openLink(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (e: ActivityNotFoundException) {
            model.toast("No browser to open the link.")
        }
    }
}
