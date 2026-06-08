param(
  [Parameter(Mandatory = $true)]
  [string]$AudioPath
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech

$recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine

try {
  $recognizer.LoadGrammar(
    (New-Object System.Speech.Recognition.DictationGrammar)
  )
  $recognizer.SetInputToWaveFile($AudioPath)
  $result = $recognizer.Recognize([TimeSpan]::FromSeconds(30))
  if ($result -and $result.Text) {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    [Console]::Write($result.Text)
  }
} finally {
  $recognizer.Dispose()
}
