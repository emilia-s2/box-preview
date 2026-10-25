param([int]$TargetPid, [int]$ParentPid, [switch]$SelfTest, [int]$ProbeSeconds = 0)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
try {
 Add-Type -Path (Join-Path $PSScriptRoot 'input.cs') -ReferencedAssemblies System.Drawing,System.Windows.Forms
 if ($SelfTest) {
  $g = New-Object BoxPreviewInput+MouseGesture
  $tests = @([BoxPreviewInput]::TriggerAllowed(123,123,123),-not [BoxPreviewInput]::TriggerAllowed(456,123,123),-not [BoxPreviewInput]::TriggerAllowed(123,456,123),($g.Buttons(1,$true,$false,$false) -eq 1),($g.Buttons(1,$true,$false,$false) -eq 0),($g.Buttons(2,$true,$false,$false) -eq 0),($g.Buttons(0x10,$false,$false,$true) -eq 2),($g.Buttons(0x400,$false,$false,$true) -eq 0),[BoxPreviewInput]::MiddleCommand('middle 0'),-not [BoxPreviewInput]::MiddleEnabled(),[BoxPreviewInput]::MiddleCommand('middle 1'),[BoxPreviewInput]::MiddleEnabled(),-not [BoxPreviewInput]::MiddleCommand('middle true'),[BoxPreviewInput]::CaptureAllowed(456,123,123,456),[BoxPreviewInput]::SnapshotMatches(100,10,20,10,20,$true),-not [BoxPreviewInput]::SnapshotMatches(301,10,20,10,20,$true))
  if ($tests -contains $false) { throw 'Falha no filtro do atalho.' }
  if (-not [BoxPreviewInput]::TestRaw()) { throw 'Falha ao registrar/remover o leitor de mouse.' }
  @{ ok=$true; checks=$tests.Count; rawRegisteredAndRemoved=$true } | ConvertTo-Json -Compress
 } else { if ($TargetPid -lt 1 -or $ParentPid -lt 1) { throw 'PID do cliente ausente.' }; if ($ProbeSeconds -gt 0) { [BoxPreviewInput]::Probe($TargetPid,$ParentPid,$ProbeSeconds*1000) } else { [BoxPreviewInput]::Run($TargetPid,$ParentPid) } }
} catch { @{event='error';error=$_.Exception.Message} | ConvertTo-Json -Compress;exit 1 }
