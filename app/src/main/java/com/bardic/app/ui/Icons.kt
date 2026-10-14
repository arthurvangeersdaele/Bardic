package com.bardic.app.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.dp

/** The icons of the iPhone app (24 × 24 SVG paths), as Compose vectors. */
object BIcons {
    private fun circle(cx: Float, cy: Float, r: Float) =
        "M${cx - r},${cy}a$r,$r 0 1,0 ${2 * r},0a$r,$r 0 1,0 ${-2 * r},0z"

    private fun rrect(x: Float, y: Float, w: Float, h: Float, r: Float) =
        "M${x + r},${y}h${w - 2 * r}a$r,$r 0 0 1 $r,${r}v${h - 2 * r}a$r,$r 0 0 1 ${-r},${r}h${-(w - 2 * r)}" +
            "a$r,$r 0 0 1 ${-r},${-r}v${-(h - 2 * r)}a$r,$r 0 0 1 $r,${-r}z"

    private fun stroke(vararg d: String): ImageVector = build(d.joinToString(""), fill = false)
    private fun fill(vararg d: String): ImageVector = build(d.joinToString(""), fill = true)

    private fun build(d: String, fill: Boolean): ImageVector {
        val nodes = PathParser().parsePathString(d).toNodes()
        return ImageVector.Builder(defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f)
            .addPath(
                pathData = nodes,
                fill = if (fill) SolidColor(Color.Black) else null,
                stroke = if (fill) null else SolidColor(Color.Black),
                strokeLineWidth = if (fill) 0f else 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
            .build()
    }

    val back = stroke("M15 18l-6-6 6-6")
    val gear = stroke(
        circle(12f, 12f, 3f),
        "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
    )
    val close = stroke("M18 6L6 18M6 6l12 12")
    val play = fill("M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z")
    val pause = fill(rrect(6f, 4.5f, 4f, 15f, 1.2f), rrect(14f, 4.5f, 4f, 15f, 1.2f))
    val stop = fill(rrect(5.5f, 5.5f, 13f, 13f, 2f))
    val star = stroke("M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z")
    val starFill = fill("M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z")
    val plus = stroke("M12 5v14M5 12h14")
    val import = stroke("M12 3v12M7 10l5 5 5-5M5 21h14")
    val share = stroke("M12 15V3M7 8l5-5 5 5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7")
    val edit = stroke("M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16zM13.5 6.5l4 4")
    val trash = stroke("M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13")
    val left = stroke("M15 18l-6-6 6-6")
    val right = stroke("M9 18l6-6-6-6")
    val up = stroke("M18 15l-6-6-6 6")
    val down = stroke("M6 9l6 6 6-6")
    val info = stroke(circle(12f, 12f, 9f), "M12 11v6M12 7.5v.5")
    val book = stroke("M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7")
    val compass = stroke(circle(12f, 12f, 9f), "M15.5 8.5l-2 5-5 2 2-5z")
    val files = stroke("M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z")
    val check = stroke("M5 12.5l4.5 4.5L19 7.5")
    val save = stroke("M12 4v10M7.5 9.5L12 14l4.5-4.5M5 18v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1")
    val volume = stroke("M11 5L6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7")
}
