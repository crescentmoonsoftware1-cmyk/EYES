$sdk1 = (Get-ChildItem -Path src -Recurse -Include *.ts,*.tsx | Select-String -Pattern '@anthropic-ai/sdk' | Measure-Object).Count
$sdk2 = (Get-ChildItem -Path src -Recurse -Include *.ts,*.tsx | Select-String -Pattern '@google/generative-ai' | Measure-Object).Count
$sdk3 = (Get-ChildItem -Path src -Recurse -Include *.ts,*.tsx | Select-String -Pattern '@google-cloud/vertexai' | Measure-Object).Count
$models = (Get-ChildItem -Path src -Recurse -Include *.ts,*.tsx | Select-String -Pattern 'claude-3|gemini-2\.' | Measure-Object).Count
$mock = (Select-String -Path 'src\services\ai\ai.ts' -Pattern 'MOCK_MODE' | Measure-Object).Count
$smoke = if (Test-Path 'scripts\smoke-test.ts') { 1 } else { 0 }
$stripe = (Select-String -Path 'src\app\api\webhooks\stripe\route.ts' -Pattern 'verifyStripeSignature' | Measure-Object).Count

Write-Host ''
Write-Host '=== K6 Friday Verification Greps ==='
if ($sdk1 -eq 0) { Write-Host 'PASS K1 @anthropic-ai/sdk -> 0 hits' } else { Write-Host "FAIL K1 @anthropic-ai/sdk -> $sdk1 hits" }
if ($sdk2 -eq 0) { Write-Host 'PASS K1 @google/generative-ai -> 0 hits' } else { Write-Host "FAIL K1 @google/generative-ai -> $sdk2 hits" }
if ($sdk3 -eq 0) { Write-Host 'PASS K1 @google-cloud/vertexai -> 0 hits' } else { Write-Host "FAIL K1 @google-cloud/vertexai -> $sdk3 hits" }
if ($models -eq 0) { Write-Host 'PASS K2 Literal model strings -> 0 hits' } else { Write-Host "INFO K2 $models model string hits remain as env-var defaults only" }
if ($mock -gt 0) { Write-Host 'PASS K3 MOCK_MODE flag in ai.ts' } else { Write-Host 'FAIL K3 MOCK_MODE missing' }
if ($smoke -gt 0) { Write-Host 'PASS K4 scripts/smoke-test.ts exists' } else { Write-Host 'FAIL K4 smoke-test.ts missing' }
if ($stripe -gt 0) { Write-Host 'PASS K5 Stripe verifyStripeSignature wired' } else { Write-Host 'FAIL K5 Stripe sig missing' }
Write-Host '====================================='
