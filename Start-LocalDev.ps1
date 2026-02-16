<#
.SYNOPSIS
    Sets up and starts the Vibe Index development server on localhost.

.DESCRIPTION
    This script:
      1. Checks prerequisites (Node.js, npm, PostgreSQL connection)
      2. Prompts for any missing environment variables
      3. Installs npm dependencies
      4. Pushes the database schema via Drizzle Kit
      5. Starts the dev server on http://localhost:5000

.NOTES
    Run from the project root (c:\vibe-main):
        .\Start-LocalDev.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Colours / helpers ────────────────────────────────────────────────
function Write-Step  { param([string]$msg) Write-Host "`n=> $msg" -ForegroundColor Cyan }
function Write-Ok    { param([string]$msg) Write-Host "   $msg" -ForegroundColor Green }
function Write-Warn  { param([string]$msg) Write-Host "   $msg" -ForegroundColor Yellow }
function Write-Err   { param([string]$msg) Write-Host "   $msg" -ForegroundColor Red }

# ── 1. Check Node.js ────────────────────────────────────────────────
Write-Step "Checking Node.js..."
try {
    $nodeVersion = & node --version 2>&1
    Write-Ok "Node.js $nodeVersion found"
} catch {
    Write-Err "Node.js is not installed or not in PATH."
    Write-Err "Download it from https://nodejs.org (v18+ recommended)."
    exit 1
}

# ── 2. Check npm ────────────────────────────────────────────────────
Write-Step "Checking npm..."
try {
    $npmVersion = & npm --version 2>&1
    Write-Ok "npm $npmVersion found"
} catch {
    Write-Err "npm is not available. It should come with Node.js."
    exit 1
}

# ── 3. Verify we are in the project directory ───────────────────────
Write-Step "Verifying project directory..."
if (-not (Test-Path "package.json")) {
    Write-Err "package.json not found in $(Get-Location)."
    Write-Err "Please run this script from the vibe-main project root."
    exit 1
}
Write-Ok "Running in $(Get-Location)"

# ── 4. Environment variables ────────────────────────────────────────
Write-Step "Checking environment variables..."

# Load .env file if it exists
if (Test-Path ".env") {
    Write-Ok "Found .env file, loading variables..."
    Get-Content ".env" | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#")) {
            $parts = $line -split "=", 2
            if ($parts.Length -eq 2) {
                $key = $parts[0].Trim()
                $val = $parts[1].Trim().Trim('"').Trim("'")
                [Environment]::SetEnvironmentVariable($key, $val, "Process")
            }
        }
    }
}

$requiredVars = @(
    @{ Name = "DATABASE_URL";              Hint = "PostgreSQL connection string, e.g. postgresql://user:pass@localhost:5432/vibeindex" },
    @{ Name = "CLERK_SECRET_KEY";          Hint = "Clerk secret key (starts with sk_)" },
    @{ Name = "CLERK_PUBLISHABLE_KEY";     Hint = "Clerk publishable key (starts with pk_)" },
    @{ Name = "VITE_CLERK_PUBLISHABLE_KEY"; Hint = "Same Clerk publishable key used by the frontend (starts with pk_)" }
)

$missing = @()
foreach ($v in $requiredVars) {
    $val = [Environment]::GetEnvironmentVariable($v.Name, "Process")
    if ([string]::IsNullOrWhiteSpace($val)) {
        $missing += $v
    } else {
        # Mask the value for display
        $masked = $val.Substring(0, [Math]::Min(8, $val.Length)) + "..."
        Write-Ok "$($v.Name) = $masked"
    }
}

if ($missing.Count -gt 0) {
    Write-Warn "The following required environment variables are not set:"
    Write-Warn "You can enter them now, or press Ctrl+C to abort and create a .env file instead.`n"

    foreach ($v in $missing) {
        $prompt = "   $($v.Name) ($($v.Hint)): "
        $value = Read-Host $prompt
        if ([string]::IsNullOrWhiteSpace($value)) {
            Write-Err "$($v.Name) is required. Aborting."
            exit 1
        }
        [Environment]::SetEnvironmentVariable($v.Name, $value, "Process")
        $env:Path = $env:Path  # force refresh
    }

    # Offer to save to .env
    $save = Read-Host "`n   Save these values to .env for next time? (y/N)"
    if ($save -eq "y" -or $save -eq "Y") {
        $envLines = @()
        foreach ($v in $requiredVars) {
            $val = [Environment]::GetEnvironmentVariable($v.Name, "Process")
            $envLines += "$($v.Name)=$val"
        }
        $envLines | Set-Content ".env" -Encoding UTF8
        Write-Ok ".env file created"
        Write-Warn "Make sure .env is in your .gitignore!"
    }
}

# Set process-level env vars so child processes (node) inherit them
foreach ($v in $requiredVars) {
    $val = [Environment]::GetEnvironmentVariable($v.Name, "Process")
    Set-Item -Path "Env:$($v.Name)" -Value $val
}

# ── 5. Install dependencies ─────────────────────────────────────────
Write-Step "Installing npm dependencies..."
& npm install
if ($LASTEXITCODE -ne 0) {
    Write-Err "npm install failed. Check the output above."
    exit 1
}
Write-Ok "Dependencies installed"

# ── 6. Push database schema ─────────────────────────────────────────
Write-Step "Pushing database schema with Drizzle Kit..."
& npx drizzle-kit push
if ($LASTEXITCODE -ne 0) {
    Write-Err "Database schema push failed. Check your DATABASE_URL and ensure PostgreSQL is running."
    exit 1
}
Write-Ok "Database schema is up to date"

# ── 7. Start the dev server ─────────────────────────────────────────
Write-Step "Starting development server..."
Write-Ok "The app will be available at http://localhost:5000"
Write-Ok "Press Ctrl+C to stop the server`n"

$env:NODE_ENV = "development"
& npx tsx server/index.ts
