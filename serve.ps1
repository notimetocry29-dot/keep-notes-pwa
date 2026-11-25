param(
  [int]$Port = 8080
)

$Root = $PSScriptRoot
$Prefix = "http://localhost:$Port/"

$MimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/manifest+json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".txt"  = "text/plain; charset=utf-8"
}

$Listener = New-Object System.Net.HttpListener
$Listener.Prefixes.Add($Prefix)
$Listener.Start()

Write-Host "KeepLite PWA server running at $Prefix"
Write-Host "Press Ctrl+C to stop."

try {
  while ($Listener.IsListening) {
    $Context = $Listener.GetContext()
    $ReqPath = $Context.Request.Url.AbsolutePath.TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($ReqPath)) { $ReqPath = "index.html" }

    $FilePath = Join-Path $Root $ReqPath
    $FullRoot = [System.IO.Path]::GetFullPath($Root)
    $FullFile = [System.IO.Path]::GetFullPath($FilePath)

    if (-not $FullFile.StartsWith($FullRoot) -or -not (Test-Path $FullFile -PathType Leaf)) {
      $Context.Response.StatusCode = 404
      $Bytes = [System.Text.Encoding]::UTF8.GetBytes("Not Found")
      $Context.Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
      $Context.Response.Close()
      continue
    }

    $Ext = [System.IO.Path]::GetExtension($FullFile).ToLowerInvariant()
    $ContentType = $MimeTypes[$Ext]
    if (-not $ContentType) { $ContentType = "application/octet-stream" }

    $Bytes = [System.IO.File]::ReadAllBytes($FullFile)
    $Context.Response.ContentType = $ContentType
    $Context.Response.ContentLength64 = $Bytes.Length
    $Context.Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
    $Context.Response.Close()
  }
} finally {
  $Listener.Stop()
}
