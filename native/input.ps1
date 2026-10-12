param([int]$TargetPid, [int]$ParentPid, [switch]$SelfTest, [int]$ProbeSeconds = 0)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
try {
 Add-Type -Path (Join-Path $PSScriptRoot 'input.cs') -ReferencedAssemblies System.Drawing,System.Windows.Forms
 if ($SelfTest) {
  $tests = @(
   [BoxPreviewInput]::Matches(0x201,$true,$false,123,123),
   -not [BoxPreviewInput]::Matches(0x201,$false,$false,123,123),
   -not [BoxPreviewInput]::Matches(0x201,$true,$false,124,123),
   -not [BoxPreviewInput]::Matches(0x201,$true,$true,123,123),
   -not [BoxPreviewInput]::Matches(0x204,$true,$false,123,123),
   -not [BoxPreviewInput]::Matches(0x201,$true,$false,0,0),
   [BoxPreviewInput]::Scoped(0x201,$true,$false,123,123,123,456),
   [BoxPreviewInput]::Scoped(0x201,$true,$false,456,123,123,456),
   -not [BoxPreviewInput]::Scoped(0x201,$true,$false,789,123,123,456),
   -not [BoxPreviewInput]::Scoped(0x201,$true,$false,123,789,123,456),
   [BoxPreviewInput]::ModifierHeld([int16]::MinValue,0,0),
   [BoxPreviewInput]::ModifierHeld(0,[int16]::MinValue,0),
   [BoxPreviewInput]::ModifierHeld(0,0,[int16]::MinValue),
   -not [BoxPreviewInput]::ModifierHeld(0,0,0),
   [BoxPreviewInput]::RawMatches(1,$true,123,123,123,456),
   -not [BoxPreviewInput]::RawMatches(4,$true,123,123,123,456),
   -not [BoxPreviewInput]::RawMatches(1,$false,123,123,123,456),
   -not [BoxPreviewInput]::RawMatches(1,$true,789,123,123,456),
   [BoxPreviewInput]::Duplicate('raw','hook',50,1,2,1,2),
   -not [BoxPreviewInput]::Duplicate('hook','hook',50,1,2,1,2),
   -not [BoxPreviewInput]::Duplicate('raw','hook',50,30,20,1,2),
   ([BoxPreviewInput]::Command('direct 7',7) -eq 2),
   ([BoxPreviewInput]::Command('capture 7',7) -eq 1),
   ([BoxPreviewInput]::Command('skip 7',7) -eq 0),
   ([BoxPreviewInput]::Command('direct 6',7) -eq -1),
   ([BoxPreviewInput]::Command('invalid 7',7) -eq -1),
   [BoxPreviewInput]::CaptureAllowed(123,123,123,456),
   [BoxPreviewInput]::CaptureAllowed(456,123,123,456),
   -not [BoxPreviewInput]::CaptureAllowed(789,123,123,456),
   -not [BoxPreviewInput]::CaptureAllowed(456,789,123,456),
   [BoxPreviewInput]::CursorStable(-100,200,-97,204),
   -not [BoxPreviewInput]::CursorStable(100,200,113,200),
   [BoxPreviewInput]::SnapshotMatches(100,10,20,10,20,$true),
   [BoxPreviewInput]::SnapshotMatches(300,10,20,12,22,$true),
   -not [BoxPreviewInput]::SnapshotMatches(301,10,20,10,20,$true),
   -not [BoxPreviewInput]::SnapshotMatches(-1,10,20,10,20,$true),
   -not [BoxPreviewInput]::SnapshotMatches(100,10,20,13,20,$true),
   -not [BoxPreviewInput]::SnapshotMatches(100,10,20,10,23,$true),
   -not [BoxPreviewInput]::SnapshotMatches(100,10,20,10,20,$false)
  ); if ($tests -contains $false) { throw 'Falha no filtro do gesto.' }; if (-not [BoxPreviewInput]::TestHook()) { throw 'Falha ao registrar/remover o leitor de mouse.' }; if (-not [BoxPreviewInput]::TestRaw()) { throw 'Falha ao registrar/remover Raw Input.' }; @{ ok = $true; checks = $tests.Count; registeredAndRemoved = $true; rawRegisteredAndRemoved = $true } | ConvertTo-Json -Compress
 } else { if ($TargetPid -lt 1 -or $ParentPid -lt 1) { throw 'PID do cliente ausente.' }; if ($ProbeSeconds -gt 0) { [BoxPreviewInput]::Probe($TargetPid,$ParentPid,$ProbeSeconds*1000) } else { [BoxPreviewInput]::Run($TargetPid,$ParentPid) } }
} catch { @{ event = 'error'; error = $_.Exception.Message } | ConvertTo-Json -Compress; exit 1 }
