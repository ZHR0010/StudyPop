param(
  [Parameter(Mandatory = $true)]
  [string]$AudioPath,

  [Parameter(Mandatory = $true)]
  [string]$TranscriptPath,

  [Parameter(Mandatory = $true)]
  [string]$StopPath
)

$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class StudyPopMciAudio {
  [DllImport("winmm.dll", CharSet = CharSet.Auto)]
  public static extern int mciSendString(
    string command,
    StringBuilder buffer,
    int bufferSize,
    IntPtr callback
  );
}
"@

function Invoke-MciCommand {
  param([string]$Command)

  $buffer = New-Object System.Text.StringBuilder 256
  $code = [StudyPopMciAudio]::mciSendString(
    $Command,
    $buffer,
    $buffer.Capacity,
    [IntPtr]::Zero
  )
  if ($code -ne 0) {
    throw "Windows audio recorder returned error $code."
  }
}

$directory = Split-Path -Parent $AudioPath
New-Item -ItemType Directory -Force -Path $directory | Out-Null
Remove-Item -LiteralPath $AudioPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $TranscriptPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $StopPath -Force -ErrorAction SilentlyContinue
[System.IO.File]::WriteAllText($TranscriptPath, "")

$alias = "studypopvoice"
$recognizer = $null
$subscription = $null

try {
  try {
    Add-Type -AssemblyName System.Speech
    $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
    $recognizer.LoadGrammar(
      (New-Object System.Speech.Recognition.DictationGrammar)
    )
    $recognizer.SetInputToDefaultAudioDevice()
    $subscription = Register-ObjectEvent `
      -InputObject $recognizer `
      -EventName SpeechRecognized `
      -MessageData $TranscriptPath `
      -Action {
        $result = $Event.SourceEventArgs.Result
        if ($result -and $result.Text -and $result.Confidence -ge 0.12) {
          [System.IO.File]::AppendAllText(
            $Event.MessageData,
            $result.Text + [Environment]::NewLine
          )
        }
      }
    $recognizer.RecognizeAsync(
      [System.Speech.Recognition.RecognizeMode]::Multiple
    )
  } catch {
    if ($recognizer) {
      $recognizer.Dispose()
      $recognizer = $null
    }
  }

  Invoke-MciCommand "open new type waveaudio alias $alias"
  Invoke-MciCommand "set $alias time format ms bitspersample 16 channels 1 samplespersec 16000 bytespersec 32000 alignment 2"
  Invoke-MciCommand "record $alias"

  $deadline = [DateTime]::UtcNow.AddSeconds(90)
  while (-not (Test-Path -LiteralPath $StopPath) -and [DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 100
  }

  Invoke-MciCommand "stop $alias"
  Invoke-MciCommand "save $alias `"$AudioPath`""
} finally {
  if ($recognizer) {
    try {
      $recognizer.RecognizeAsyncStop()
      Start-Sleep -Milliseconds 800
    } catch {
      # Audio recording still works if local recognition stops early.
    }
  }
  if ($subscription) {
    Unregister-Event -SubscriptionId $subscription.Id -ErrorAction SilentlyContinue
    Remove-Job -Id $subscription.Id -Force -ErrorAction SilentlyContinue
  }
  if ($recognizer) {
    $recognizer.Dispose()
  }
  try {
    Invoke-MciCommand "close $alias"
  } catch {
    # The recorder may already be closed after a device error.
  }
}
