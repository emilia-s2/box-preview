param([string]$ImagePath = '', [string]$Language = '', [switch]$Server)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
try {
 Add-Type -AssemblyName System.Runtime.WindowsRuntime
 $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]
 $null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType=WindowsRuntime]
 $null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Foundation, ContentType=WindowsRuntime]
 $null = [Windows.Globalization.Language, Windows.Foundation, ContentType=WindowsRuntime]
 $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
 function Await($Operation, $Type) { $task = $asTask.MakeGenericMethod($Type).Invoke($null, @($Operation)); if (-not $task.Wait(10000)) { throw 'Tempo da leitura de imagem encerrado.' }; return $task.Result }
 $available = @([Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages)
 $selectedLanguage = $available | Where-Object { $_.LanguageTag -eq $Language } | Select-Object -First 1
 if (-not $selectedLanguage) { $selectedLanguage = $available | Where-Object { $_.LanguageTag -like 'en-*' } | Select-Object -First 1 }
 if (-not $selectedLanguage) { $selectedLanguage = $available | Where-Object { $_.LanguageTag -like 'pt-*' -or $_.LanguageTag -like 'es-*' } | Select-Object -First 1 }
 if (-not $selectedLanguage) { $selectedLanguage = $available | Select-Object -First 1 }
 if (-not $selectedLanguage) { throw 'Nenhum idioma de reconhecimento de texto está instalado no Windows.' }
 $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($selectedLanguage)
 function Read-Frame([byte[]]$bytes) {
  $memory = $null; $stream = $null; $bitmap = $null
  try {
   $memory = New-Object IO.MemoryStream(,$bytes)
   $stream = [System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($memory)
   $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
   if ($decoder.PixelWidth -gt [Windows.Media.Ocr.OcrEngine]::MaxImageDimension -or $decoder.PixelHeight -gt [Windows.Media.Ocr.OcrEngine]::MaxImageDimension) { throw 'Resolução maior que o limite do leitor do Windows.' }
   $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
   $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
   $lines = [Collections.Generic.List[object]]::new()
   foreach ($line in $result.Lines) {
    $left = [double]::PositiveInfinity; $top = [double]::PositiveInfinity; $right = 0.0; $bottom = 0.0
    foreach ($word in $line.Words) { $rect = $word.BoundingRect; $left = [Math]::Min($left,$rect.X); $top = [Math]::Min($top,$rect.Y); $right = [Math]::Max($right,$rect.X+$rect.Width); $bottom = [Math]::Max($bottom,$rect.Y+$rect.Height) }
    if ([double]::IsInfinity($left)) { continue }
    $lines.Add(@{text=$line.Text;x=$left;y=$top;width=$right-$left;height=$bottom-$top})
   }
   return @{ok=$true;language=$selectedLanguage.LanguageTag;width=$decoder.PixelWidth;height=$decoder.PixelHeight;lines=$lines.ToArray()}
  } finally { if ($bitmap) { $bitmap.Dispose() }; if ($stream) { $stream.Dispose() }; if ($memory) { $memory.Dispose() } }
 }
 if ($Server) {
  [Console]::WriteLine('{"event":"ready"}'); [Console]::Out.Flush()
  while ($null -ne ($requestLine = [Console]::In.ReadLine())) {
   $requestId = 0
   try {
    if ($requestLine.Length -gt 18001000) { throw 'Imagem grande demais.' }
    $request = $requestLine | ConvertFrom-Json; $requestId = [int]$request.seq
    if ($requestId -lt 1 -or -not $request.image -or $request.image.Length -gt 18000000) { throw 'Pedido de leitura inválido.' }
    $reply = Read-Frame ([Convert]::FromBase64String($request.image)); $reply.seq = $requestId
   } catch { $reply = @{ok=$false;seq=$requestId;error=$_.Exception.Message} }
   [Console]::WriteLine(($reply | ConvertTo-Json -Depth 5 -Compress)); [Console]::Out.Flush()
   $request = $null; $requestLine = $null; $reply = $null
  }
 } else {
  if ($ImagePath) { $bytes = [IO.File]::ReadAllBytes($ImagePath) } else { $inputData = [Console]::In.ReadLine(); if (-not $inputData -or $inputData.Length -gt 18000000) { throw 'Imagem ausente ou grande demais.' }; $bytes = [Convert]::FromBase64String($inputData) }
  Read-Frame $bytes | ConvertTo-Json -Depth 5 -Compress
 }
} catch { @{ok=$false;error=$_.Exception.Message} | ConvertTo-Json -Compress; exit 1 }
