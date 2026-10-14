package com.bardic.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun T(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = C.text,
    size: TextUnit = 15.sp,
    weight: FontWeight = FontWeight.Normal,
    maxLines: Int = Int.MAX_VALUE,
    style: TextStyle? = null,
    align: TextAlign? = null,
) {
    Text(
        text = text,
        modifier = modifier,
        textAlign = align,
        color = color,
        fontSize = if (style == null) size else style.fontSize,
        fontWeight = if (style == null) weight else style.fontWeight,
        fontFamily = if (style == null) Barlow else style.fontFamily,
        style = style ?: TextStyle.Default,
        maxLines = maxLines,
        overflow = TextOverflow.Ellipsis,
    )
}

@Composable
fun Title(text: String, size: Int, modifier: Modifier = Modifier, color: Color = C.text, maxLines: Int = 1, align: TextAlign? = null) {
    Text(text, modifier = modifier, color = color, style = titleStyle(size), maxLines = maxLines, overflow = TextOverflow.Ellipsis, textAlign = align)
}

/** Square icon button, 40 dp, as in the iPhone app. */
@Composable
fun IconBtn(
    icon: ImageVector,
    label: String,
    modifier: Modifier = Modifier,
    size: Dp = 40.dp,
    iconSize: Dp = 18.dp,
    tint: Color = C.text,
    background: Color = C.card,
    border: Color = C.line,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Box(
        modifier
            .size(size)
            .clip(RoundedCornerShape(10.dp))
            .background(background)
            .border(1.dp, border, RoundedCornerShape(10.dp))
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label }
            .alpha(if (enabled) 1f else 0.45f),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(iconSize))
    }
}

enum class BtnKind { NORMAL, PRIMARY, DANGER, ACCENT }

@Composable
fun Btn(
    text: String,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    kind: BtnKind = BtnKind.NORMAL,
    height: Dp = 40.dp,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    // Same as the web and iPhone editions: a primary button is the accent colour with dark ink.
    val bg = when (kind) {
        BtnKind.PRIMARY, BtnKind.ACCENT -> C.accent
        else -> C.card
    }
    val fg = when (kind) {
        BtnKind.PRIMARY, BtnKind.ACCENT -> C.onZ
        BtnKind.DANGER -> C.evt
        BtnKind.NORMAL -> C.text
    }
    val border = when (kind) {
        BtnKind.PRIMARY, BtnKind.ACCENT -> C.accent
        BtnKind.DANGER -> C.evt.copy(alpha = 0.5f)
        BtnKind.NORMAL -> C.line
    }
    Row(
        modifier
            .height(height)
            .clip(RoundedCornerShape(10.dp))
            .background(bg)
            .border(1.dp, border, RoundedCornerShape(10.dp))
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .alpha(if (enabled) 1f else 0.45f)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
    ) {
        if (icon != null) Icon(icon, contentDescription = null, tint = fg, modifier = Modifier.size(16.dp))
        T(text, color = fg, size = 15.sp, weight = FontWeight.SemiBold, maxLines = 1)
    }
}

/** Top bar of every screen. */
@Composable
fun Bar(content: @Composable RowScope.() -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .height(56.dp)
            .background(C.bar)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        content = content,
    )
}

/**
 * Volume slider: the whole bar is the handle. Touch anywhere, the value jumps under the finger
 * and follows it, and the row around it does not scroll (same feel as the iPhone app).
 */
@Composable
fun BardSlider(
    value: Float,
    onChange: (Float) -> Unit,
    color: Color,
    modifier: Modifier = Modifier,
    label: String = "Volume",
    enabled: Boolean = true,
) {
    val latest by rememberUpdatedState(onChange)
    val density = LocalDensity.current
    var widthPx by remember { mutableFloatStateOf(1f) }
    val pad = with(density) { 8.dp.toPx() }
    fun at(x: Float) = ((x - pad) / (widthPx - 2 * pad).coerceAtLeast(1f)).coerceIn(0f, 1f)
    BoxWithConstraints(
        modifier
            .height(32.dp)
            .semantics { contentDescription = label }
            .pointerInput(enabled) {
                if (!enabled) return@pointerInput
                awaitEachGesture {
                    val down = awaitFirstDown()
                    down.consume()
                    widthPx = size.width.toFloat()
                    latest(at(down.position.x))
                    while (true) {
                        val event = awaitPointerEvent()
                        val change = event.changes.firstOrNull { it.id == down.id } ?: break
                        if (!change.pressed) break
                        change.consume()
                        latest(at(change.position.x))
                    }
                }
            },
        contentAlignment = Alignment.CenterStart,
    ) {
        val w = maxWidth
        val v = value.coerceIn(0f, 1f)
        Box(
            Modifier
                .padding(horizontal = 8.dp)
                .fillMaxWidth()
                .height(4.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(C.line)
        ) {
            Box(Modifier.fillMaxWidth(v).height(4.dp).background(if (enabled) color else C.muted))
        }
        Box(
            Modifier
                .offset(x = (w - 16.dp) * v)
                .size(16.dp)
                .clip(CircleShape)
                .background(if (enabled) color else C.muted)
                .border(2.dp, C.card, CircleShape)
        )
    }
}

/** Segmented choice (Dark / Light / System, fade length). */
@Composable
fun <T> Segmented(options: List<Pair<T, String>>, selected: T, onSelect: (T) -> Unit) {
    Row(
        Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(C.card)
            .border(1.dp, C.line, RoundedCornerShape(10.dp))
            .padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        options.forEach { (v, label) ->
            val on = v == selected
            Box(
                Modifier
                    .height(34.dp)
                    .clip(RoundedCornerShape(7.dp))
                    .background(if (on) C.text else Color.Transparent)
                    .clickable(role = Role.RadioButton) { onSelect(v) }
                    .padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center,
            ) {
                T(label, color = if (on) C.bg else C.muted, weight = FontWeight.SemiBold, size = 14.sp)
            }
        }
    }
}

@Composable
fun Toggle(checked: Boolean, onChange: (Boolean) -> Unit) {
    Box(
        Modifier
            .width(46.dp)
            .height(28.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(if (checked) C.accent else C.line)
            .clickable(role = Role.Switch) { onChange(!checked) }
            .padding(3.dp),
        contentAlignment = if (checked) Alignment.CenterEnd else Alignment.CenterStart,
    ) {
        Box(Modifier.size(22.dp).clip(CircleShape).background(if (checked) C.onZ else C.text))
    }
}

/** A single-line text field in the Bardic style. */
@Composable
fun Field(
    value: String,
    onChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    max: Int = 120,
    style: TextStyle = TextStyle(fontFamily = Barlow, fontSize = 16.sp),
    border: Boolean = true,
    onDone: () -> Unit = {},
    onFocusLost: () -> Unit = {},
) {
    val focus = LocalFocusManager.current
    var focused by remember { mutableStateOf(false) }
    BasicTextField(
        value = value,
        onValueChange = { onChange(it.take(max)) },
        singleLine = true,
        textStyle = style.copy(color = C.text),
        cursorBrush = SolidColor(C.accent),
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { onDone(); focus.clearFocus() }),
        modifier = modifier.onFocusChanged {
            if (focused && !it.isFocused) onFocusLost()
            focused = it.isFocused
        },
        decorationBox = { inner ->
            Box(
                Modifier
                    .then(
                        if (border) Modifier
                            .clip(RoundedCornerShape(9.dp))
                            .background(C.card)
                            .border(1.dp, if (focused) C.accent else C.line, RoundedCornerShape(9.dp))
                            .padding(horizontal = 10.dp, vertical = 8.dp)
                        else Modifier
                    ),
                contentAlignment = Alignment.CenterStart,
            ) {
                if (value.isEmpty()) T(placeholder, color = C.muted, size = style.fontSize, maxLines = 1)
                inner()
            }
        },
    )
}

/** Thin progress bar, green to red as a sound nears its end, electric blue for infinite loops. */
@Composable
fun ProgressTrack(progress: Float, active: Boolean, modifier: Modifier = Modifier) {
    val fraction: Float
    val color: Color
    if (progress < 0f) {
        fraction = if (active) 1f else 0f
        color = C.blue
    } else {
        fraction = progress.coerceIn(0f, 1f)
        color = hsl(130f * (1f - fraction), 0.72f, 0.5f)
    }
    Box(
        modifier
            .fillMaxWidth()
            .height(6.dp)
            .clip(RoundedCornerShape(3.dp))
            .background(C.line)
    ) {
        Box(Modifier.fillMaxWidth(fraction).height(6.dp).clip(RoundedCornerShape(3.dp)).background(color))
    }
}

fun hsl(hue: Float, saturation: Float, lightness: Float): Color {
    val c = (1f - kotlin.math.abs(2f * lightness - 1f)) * saturation
    val h = ((hue % 360f) + 360f) % 360f / 60f
    val x = c * (1f - kotlin.math.abs(h % 2f - 1f))
    val (r, g, b) = when {
        h < 1f -> Triple(c, x, 0f)
        h < 2f -> Triple(x, c, 0f)
        h < 3f -> Triple(0f, c, x)
        h < 4f -> Triple(0f, x, c)
        h < 5f -> Triple(x, 0f, c)
        else -> Triple(c, 0f, x)
    }
    val m = lightness - c / 2f
    return Color(r + m, g + m, b + m)
}

/** The three bars of the Bardic logo. */
@Composable
fun Eq(modifier: Modifier = Modifier, height: Dp = 28.dp, bar: Dp = 6.dp) {
    Row(modifier.height(height), horizontalArrangement = Arrangement.spacedBy(bar * 0.66f), verticalAlignment = Alignment.Bottom) {
        listOf(C.music to 0.6f, C.amb to 1f, C.evt to 0.75f).forEach { (c, f) ->
            Box(Modifier.width(bar).height(height * f).clip(RoundedCornerShape(bar / 2)).background(c))
        }
    }
}
