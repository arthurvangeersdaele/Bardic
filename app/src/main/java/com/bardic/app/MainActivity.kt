package com.bardic.app

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.bardic.app.audio.NativeEngine
import com.bardic.app.ui.BardicTheme
import com.bardic.app.ui.EngineTestScreen

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        NativeEngine.start()
        setContent {
            BardicTheme {
                EngineTestScreen()
            }
        }
    }

    override fun onDestroy() {
        if (isFinishing) NativeEngine.stop()
        super.onDestroy()
    }
}
