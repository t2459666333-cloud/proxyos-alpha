param(
    [Parameter(Mandatory = $true)]
    [string]$ImagePath,
    [Parameter(Mandatory = $true)]
    [int]$DiskNumber,
    [Parameter(Mandatory = $true)]
    [string]$ExpectedSerial,
    [Parameter(Mandatory = $true)]
    [long]$ExpectedDiskSize,
    [Parameter(Mandatory = $true)]
    [string]$ExpectedImageSha256,
    [Parameter(Mandatory = $true)]
    [string]$StatusPath
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Set-WriteStatus {
    param([string]$Message)
    Set-Content -LiteralPath $StatusPath -Value $Message -Encoding UTF8
}

function Get-RawPrefixHash {
    param(
        [string]$DevicePath,
        [long]$ByteCount
    )

    $stream = [System.IO.FileStream]::new(
        $DevicePath,
        [System.IO.FileMode]::Open,
        [System.IO.FileAccess]::Read,
        [System.IO.FileShare]::ReadWrite,
        4MB,
        [System.IO.FileOptions]::SequentialScan
    )
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    $buffer = New-Object byte[] 4194304
    $remaining = $ByteCount

    try {
        while ($remaining -gt 0) {
            $wanted = [int][Math]::Min($buffer.Length, $remaining)
            $read = $stream.Read($buffer, 0, $wanted)
            if ($read -le 0) {
                throw "USB verification ended early with $remaining bytes remaining."
            }
            [void]$hasher.TransformBlock($buffer, 0, $read, $null, 0)
            $remaining -= $read
        }
        [void]$hasher.TransformFinalBlock([byte[]]::new(0), 0, 0)
        return ([BitConverter]::ToString($hasher.Hash)).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $hasher.Dispose()
        $stream.Dispose()
    }
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).
    IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    throw 'Administrator privileges are required to write a physical disk.'
}

$resolvedImage = (Resolve-Path -LiteralPath $ImagePath).Path
$image = Get-Item -LiteralPath $resolvedImage
if ($image.Length -le 0) {
    throw 'The image file is empty.'
}

$actualImageHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedImage).Hash.ToLowerInvariant()
if ($actualImageHash -ne $ExpectedImageSha256.ToLowerInvariant()) {
    throw "Image SHA256 mismatch: $actualImageHash"
}

$disk = Get-Disk -Number $DiskNumber
if ($disk.BusType -ne 'USB' -or $disk.IsBoot -or $disk.IsSystem) {
    throw "Disk $DiskNumber is not a safe USB target."
}
if ($disk.SerialNumber.Trim() -ne $ExpectedSerial.Trim()) {
    throw "USB serial number mismatch."
}
if ([long]$disk.Size -ne $ExpectedDiskSize) {
    throw "USB capacity mismatch."
}
if ($image.Length -ge $disk.Size) {
    throw 'The image is larger than the target USB disk.'
}

$devicePath = "\\.\PhysicalDrive$DiskNumber"
$diskWasOffline = $disk.IsOffline
$diskCanBeOfflined = $disk.BusType -ne 'USB'

try {
    Set-WriteStatus "PREPARING|0|Target disk $DiskNumber confirmed"
    if ($disk.IsReadOnly) {
        Set-Disk -Number $DiskNumber -IsReadOnly $false
    }
    if ($diskCanBeOfflined -and -not $disk.IsOffline) {
        Set-Disk -Number $DiskNumber -IsOffline $true
    }
    if (-not $diskCanBeOfflined) {
        $mountedPartitions = @(
            Get-Partition -DiskNumber $DiskNumber -ErrorAction SilentlyContinue |
                Where-Object { $_.DriveLetter }
        )
        if ($mountedPartitions.Count -gt 0) {
            throw 'The USB disk has mounted volumes. Close Explorer windows and remove drive letters before writing.'
        }
    }
    Start-Sleep -Milliseconds 750

    $source = [System.IO.FileStream]::new(
        $resolvedImage,
        [System.IO.FileMode]::Open,
        [System.IO.FileAccess]::Read,
        [System.IO.FileShare]::Read,
        4MB,
        [System.IO.FileOptions]::SequentialScan
    )
    $target = [System.IO.FileStream]::new(
        $devicePath,
        [System.IO.FileMode]::Open,
        [System.IO.FileAccess]::ReadWrite,
        [System.IO.FileShare]::ReadWrite,
        4MB,
        [System.IO.FileOptions]::WriteThrough
    )
    $buffer = New-Object byte[] 4194304
    $written = 0L
    $lastPercent = -1

    try {
        $target.Position = 0
        while (($read = $source.Read($buffer, 0, $buffer.Length)) -gt 0) {
            $target.Write($buffer, 0, $read)
            $written += $read
            $percent = [int](($written * 100) / $image.Length)
            if ($percent -ne $lastPercent) {
                Set-WriteStatus "WRITING|$percent|Wrote $written / $($image.Length) bytes"
                $lastPercent = $percent
            }
        }
        $target.Flush($true)
    }
    finally {
        $target.Dispose()
        $source.Dispose()
    }

    Set-WriteStatus 'VERIFYING|100|Reading the USB disk back for verification'
    $rawHash = Get-RawPrefixHash -DevicePath $devicePath -ByteCount $image.Length
    if ($rawHash -ne $ExpectedImageSha256.ToLowerInvariant()) {
        throw "USB read-back SHA256 mismatch: $rawHash"
    }

    if ($diskCanBeOfflined) {
        Set-Disk -Number $DiskNumber -IsOffline $false
    }
    Update-HostStorageCache
    Set-WriteStatus "SUCCESS|100|Write and read-back verification completed|$rawHash"
}
catch {
    Set-WriteStatus "ERROR|0|$($_.Exception.Message)"
    throw
}
finally {
    try {
        if ($diskCanBeOfflined -and -not $diskWasOffline) {
            Set-Disk -Number $DiskNumber -IsOffline $false -ErrorAction SilentlyContinue
            Update-HostStorageCache -ErrorAction SilentlyContinue
        }
    }
    catch {
    }
}
