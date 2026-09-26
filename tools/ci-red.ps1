<#  Red error text a buyer would see: PowerShell's own error records from a
    cmdlet or a native command that the tune did not catch. The Windows check
    runs this over every capture of the script's output, keeps each record
    with a few lines of context, labelled by step, and the run record
    (studio/assets/ci-run.json) carries the total. Zero is the target; a rise
    is a regression in what a paying customer sees on screen.

      & .\tools\ci-red.ps1 -Text $out -Step 'the full run'
#>
param([string]$Text, [string]$Step)
$lines = @($Text -split "`r?`n")
$file = 'C:\OmniDx\ci-red-lines.txt'
$found = 0
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($lines[$i] -notmatch 'FullyQualifiedErrorId') { continue }
  $found++
  $j = $i
  while ($j -gt 0 -and $lines[$j - 1] -match '^\s*$') { $j-- }
  Add-Content -Path $file -Value ("{0}: {1}" -f $Step, (($lines[[math]::Max(0, $j - 4)..$i] | ForEach-Object { $_.Trim() }) -join ' | '))
}
Write-Host ("red error records in {0}: {1}" -f $Step, $found)
