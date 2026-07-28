param(
    [string]$Router = "192.168.10.1",
    [string]$Password = ""
)

$ErrorActionPreference = "Stop"
$project = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$endpoint = "http://$Router/ubus"
$zeroSession = "00000000000000000000000000000000"
$requestId = 0

function Invoke-Ubus {
    param(
        [string]$Session,
        [string]$Object,
        [string]$Method,
        [hashtable]$Parameters
    )
    $script:requestId += 1
    $body = @{
        jsonrpc = "2.0"
        id = $script:requestId
        method = "call"
        params = @($Session, $Object, $Method, $Parameters)
    } | ConvertTo-Json -Depth 12 -Compress
    $response = Invoke-RestMethod -Uri $endpoint -Method Post -ContentType "application/json; charset=utf-8" -Body $body -TimeoutSec 20
    if ($response.error) {
        throw "JSON-RPC error: $($response.error.message)"
    }
    $code = [int]$response.result[0]
    $data = $response.result[1]
    if ($code -ne 0) {
        throw "UBUS $Object.$Method failed with code $code"
    }
    return $data
}

$login = Invoke-Ubus -Session $zeroSession -Object "session" -Method "login" -Parameters @{
    username = "root"
    password = $Password
}
$session = [string]$login.ubus_rpc_session
if (-not $session) {
    throw "Router login did not return a session."
}

$files = [ordered]@{
    "rootfs/usr/libexec/proxyos/proxyosctl" = "/usr/libexec/proxyos/proxyosctl"
    "rootfs/usr/libexec/proxyos/subscription_parser.py" = "/usr/libexec/proxyos/subscription_parser.py"
    "rootfs/usr/libexec/rpcd/proxyos" = "/usr/libexec/rpcd/proxyos"
    "rootfs/usr/share/rpcd/acl.d/proxyos.json" = "/usr/share/rpcd/acl.d/proxyos.json"
    "rootfs/etc/init.d/proxyos-health" = "/etc/init.d/proxyos-health"
    "rootfs/etc/proxyos/config-template.json" = "/etc/proxyos/config-template.json"
    "rootfs/www/assets/app.js" = "/www/assets/app.js"
    "rootfs/www/assets/app.css" = "/www/assets/app.css"
    "rootfs/www/assets/proxyos-mark.svg" = "/www/assets/proxyos-mark.svg"
    "rootfs/www/index.html" = "/www/index.html"
}

foreach ($entry in $files.GetEnumerator()) {
    $source = Join-Path $project $entry.Key
    $destination = $entry.Value
    $content = [IO.File]::ReadAllText($source, [Text.UTF8Encoding]::new($false))
    $chunkSize = 12000
    $offset = 0
    $first = $true
    while ($offset -lt $content.Length) {
        $length = [Math]::Min($chunkSize, $content.Length - $offset)
        if (
            $offset + $length -lt $content.Length -and
            [char]::IsHighSurrogate($content[$offset + $length - 1])
        ) {
            $length -= 1
        }
        $chunk = $content.Substring($offset, $length)
        Invoke-Ubus -Session $session -Object "file" -Method "write" -Parameters @{
            path = $destination
            data = $chunk
            append = -not $first
        } | Out-Null
        $first = $false
        $offset += $length
    }
    if ($content.Length -eq 0) {
        Invoke-Ubus -Session $session -Object "file" -Method "write" -Parameters @{
            path = $destination
            data = ""
            append = $false
        } | Out-Null
    }
    Write-Host "Uploaded $destination"
}

try {
    Invoke-Ubus -Session $session -Object "file" -Method "exec" -Parameters @{
        command = "/bin/sh"
        params = @(
            "-c",
            "chmod 0755 /usr/libexec/proxyos/proxyosctl /usr/libexec/proxyos/subscription_parser.py /usr/libexec/rpcd/proxyos /etc/init.d/proxyos-health; /etc/init.d/rpcd restart; /etc/init.d/uhttpd restart; /etc/init.d/proxyos restart; /etc/init.d/proxyos-health restart"
        )
    } | Out-Null
} catch {
    # Restarting rpcd/uhttpd can close the request that initiated the restart.
    Write-Host "Management services are restarting; the final RPC response may be interrupted."
}

Start-Sleep -Seconds 8
Write-Host "ProxyOS 0.2.2 hotfix deployed. Reload http://$Router/ with Ctrl+F5."
