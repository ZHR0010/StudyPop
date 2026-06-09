package com.studypop.android.ui

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import com.studypop.android.model.StudyTheme

fun StudyTheme.accent(): Color = when (this) {
    StudyTheme.LIGHT -> Color(0xFFF39C3D)
    StudyTheme.PINK -> Color(0xFFFF6FAF)
    StudyTheme.PURPLE -> Color(0xFF8C6BE8)
    StudyTheme.BLUE -> Color(0xFF4F8FF5)
    StudyTheme.RED -> Color(0xFFEF6161)
    StudyTheme.DARK -> Color(0xFFB59AF5)
}

private fun palette(theme: StudyTheme): ColorScheme {
    val accent = theme.accent()
    return if (theme == StudyTheme.DARK) {
        darkColorScheme(
            primary = accent,
            secondary = Color(0xFFFF8FC0),
            background = Color(0xFF191723),
            surface = Color(0xFF252230),
            surfaceVariant = Color(0xFF302C3E),
            onPrimary = Color.White,
            onBackground = Color(0xFFF7F1FF),
            onSurface = Color(0xFFF7F1FF),
        )
    } else {
        lightColorScheme(
            primary = accent,
            secondary = Color(0xFF8C6BE8),
            background = Color(0xFFFFFAF4),
            surface = Color.White,
            surfaceVariant = accent.copy(alpha = 0.09f),
            onPrimary = Color.White,
            onBackground = Color(0xFF292332),
            onSurface = Color(0xFF292332),
        )
    }
}

@Composable
fun StudyPopTheme(theme: StudyTheme, content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = palette(theme),
        typography = MaterialTheme.typography,
        content = content,
    )
}
