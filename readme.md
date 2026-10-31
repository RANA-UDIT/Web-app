# Trek-Stop

Trek-Stop is a hiking and trail guide built for the **Special Topics in Database Systems — Exercise 4** web-services assignment. It replaces the copied travel catalogue with an interactive trail board, an Express REST API, Azure Maps, and optional Azure Cosmos DB storage.

The frontend byline is **UDIT - 2025SIY7621**. Trail distances and elevation values in the starter dataset are illustrative, not official route or safety information.

## What the assignment asks for

The brief provided for this project asks you to:

1. Demonstrate your effort to build a web-services application in the viva voce (at least one application/service).
2. Submit a short report of **no more than two pages**, with screenshots, summarizing difficulties, successes, or failures.

The brief does **not** specify a map provider, cloud deployment, performance targets, or required measurements. Azure deployment below is an optional project deployment workflow, not a requirement stated in that brief.

### Suggested report evidence

The assignment requires screenshots but does not prescribe their number or exact contents. A concise report can include:

- **Goal and design:** Trek-Stop, its trail REST API, Azure Maps, and (when configured) Cosmos DB.
- **Implementation and demo:** one screenshot of the UI with the map and trail list; one of a working filter or added trail; one API response such as `GET /api/trails`.
- **Outcome:** what worked, difficulties/failures, and how they were handled. If deployment was attempted, include the Terraform validation/plan and deployed app only if you actually completed those steps.
- **Measurements:** no numeric measurements are required by the supplied brief. If useful, record observed API status codes (`200`, `201`, and a validation `400`) and actual response times; do not invent values or claim a performance threshold.

Keep the report within two pages and ensure screenshots do not expose API keys, Terraform state, or other credentials.

## Features and architecture

- **Interactive map:** Leaflet displays trail markers over Azure Maps road tiles. The browser requests tiles and map attribution from same-origin Express endpoints; the Azure Maps subscription key stays on the server.
- **Web services:** `GET /api/trails` supports text, region, and difficulty filters; `POST /api/trails` validates and saves new trail entries.
- **Data:** the checked-in `trails.json` works locally. Configure both Cosmos settings to use Azure Cosmos DB; configure neither to stay in local mode.
- **Cloud observability:** Application Insights is enabled when `APPLICATIONINSIGHTS_CONNECTION_STRING` is configured.
- **No geolocation:** the app does not request the visitor’s location. Azure Maps receives map tile/viewport requests through the app server.

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Shows configured data-store and map mode without returning credentials |
| `GET /api/trails?search=&region=&difficulty=` | Lists/filters trails as JSON |
| `POST /api/trails` | Validates and saves a trail |
| `GET /api/maps/status` | Reports whether a server-side Azure Maps key is configured |
| `GET /api/maps/tiles/{z}/{x}/{y}` | Proxies Azure Maps road tiles; validates coordinates and limits requests |
| `GET /api/maps/attribution?bounds=west,south,east,north&zoom=` | Proxies required Azure Maps copyright attribution |

## Run locally (Windows PowerShell)

Use Node.js 18 or newer. The local trail API works without Azure credentials; map tiles require an Azure Maps account/key.

```powershell
Set-Location C:\Users\uditr\Downloads\Web-app
npm ci
Copy-Item .\.env.example .\.env
notepad .\.env
npm run dev
```

In `.env`, add `AZURE_MAPS_SUBSCRIPTION_KEY` from your Azure Maps account if you want to load the live map. The value is read only by Express and must never be copied into frontend files, screenshots, GitHub, or a committed `.env`. The starter `.env.example` contains no live secrets. With no key, the trail API still works and the page explains why the map is unavailable.

To check the app, open `http://localhost:3000`, then run:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
Invoke-RestMethod http://localhost:3000/api/trails
```

Example request to demonstrate the create API (this adds a record to local `trails.json` when Cosmos DB is not configured):

```powershell
$trail = @{
  trailName = "Demo Ridge Walk"
  region = "Himachal Pradesh"
  difficulty = "Easy"
  distanceKm = 5
  elevationGainM = 250
  latitude = 32.1
  longitude = 76.2
  bestSeason = "Spring"
  description = "A short sample route for demonstrating the trail creation API."
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri http://localhost:3000/api/trails `
  -Method Post `
  -ContentType "application/json" `
  -Body $trail
```

Run the automated API tests:

```powershell
npm test
```

## Azure Maps key and privacy

Create or use an Azure Maps account in the Azure portal, then set its subscription key in your **local** `.env`. A shared Azure Maps key is sensitive: this app sends it only from the server to `atlas.microsoft.com`; it is not included in the HTML, browser JavaScript, or tile URL returned to the browser. The proxy also validates tile bounds, caps zoom, applies a per-IP request limit, and serves map attribution from Azure Maps.

Map transactions are usage-priced. Azure’s free transaction allowance and current rates depend on product, account offer, and pricing date; the Azure for Students subscription does not guarantee that all resources or use are free. Review the [Azure Maps pricing page](https://azure.microsoft.com/pricing/details/azure-maps/) and your subscription’s budget/credits before creating an account or deploying. The map uses the Azure Maps Render API and its viewport-based attribution API; see [Get Map Tile](https://learn.microsoft.com/rest/api/maps/render/get-map-tile) and [Get Map Attribution](https://learn.microsoft.com/rest/api/maps/render/get-map-attribution).

For local map testing, create an Azure Maps account in the Azure portal only after reviewing the usage pricing: **Create a resource > Azure Maps Account**, choose the Gen2 (`G2`) tier, then open the account's **Authentication** page and copy its primary key into `AZURE_MAPS_SUBSCRIPTION_KEY` in `.env`. The existing account `trekstopudit401261` in `rg-trekstop-maps` can be reused. The Terraform deployment below accepts that account's key as a sensitive variable; it does not create another Maps account.

## Optional Azure deployment with Terraform

The Trek-Stop Terraform stack is deliberately in **`infra/trekstop/`**, separate from the copied Assignment 3 Terraform directory and its existing local state. Use only this new directory for Trek-Stop. The old `infra/terraform/` directory, its state/plan, and `Teraform_readme.md` are historical Assignment 3 material; do not initialize, apply, or destroy that stack for this project.

### Resources and cost to review

Terraform creates a new, uniquely named resource group containing:

- Linux App Service plan (default **B1**, charged while it exists).
- Linux Node.js App Service.
- Serverless Cosmos DB account, database, and trail container (usage charges may apply).
- The existing Azure Maps Gen2 account in `rg-trekstop-maps` (no additional Maps account is created; map transactions remain usage-priced).
- Log Analytics workspace and Application Insights (ingestion/retention can incur charges).

This is **not a guaranteed free deployment**. Before `terraform apply`, check your Azure for Students balance and budget and estimate these resources in the [Azure Pricing Calculator](https://azure.microsoft.com/pricing/calculator/). Actual charges vary by region, offer, requests, stored data, and telemetry. This guide does not deploy or remove any cloud resources on your behalf.

The subscription policy allows `koreacentral`, `malaysiawest`, `indiasouthcentral`, `centralindia`, and `uaenorth`, and the policy definition exempts `global`. The App Service, Cosmos DB, and monitoring resources use `centralindia`. The already-created Azure Maps account is in `global`, which is supported for Maps in this subscription. This deployment reuses it and does not create another Maps account.

### Prerequisites and isolated Terraform setup

Install Terraform 1.6+ and Azure CLI. Sign in, select the intended subscription, and verify it before continuing:

```powershell
az login
az account list --output table
az account set --subscription "<your-subscription-id>"
az account show --output table
```

Fetch the existing Maps key into the current PowerShell process without printing it. Terraform's sensitive variable receives it from the environment:

```powershell
$mapsKey = az maps account keys list `
  --name trekstopudit401261 `
  --resource-group rg-trekstop-maps `
  --query primaryKey `
  --output tsv
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($mapsKey)) {
  throw "Could not retrieve the Azure Maps key."
}
$env:TF_VAR_azure_maps_subscription_key = $mapsKey
Remove-Variable mapsKey
```

Prepare the isolated Terraform stack and set its subscription ID:

```powershell
Set-Location C:\Users\uditr\Downloads\Web-app\infra\trekstop
Copy-Item .\terraform.tfvars.example .\terraform.tfvars
$subscriptionId = az account show --query id --output tsv
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($subscriptionId)) {
  throw "Could not read the selected Azure subscription."
}
Set-Content .\terraform.tfvars "subscription_id = `"$subscriptionId`""
```

Initialize, validate, and review the plan. These steps do not create the stack's resources:

```powershell
terraform init
terraform fmt -check
terraform validate
terraform plan -out trekstop.tfplan
terraform show trekstop.tfplan
```

The plan should create a new App Service, Cosmos DB, monitoring resources, and resource group, but **not** another Azure Maps account. Review the complete plan and estimate charges before approving creation. If (and only if) the region, resources, subscription, and budget are acceptable, deploy the reviewed plan:

```powershell
terraform apply trekstop.tfplan
terraform output
```

The existing Maps key is passed to the App Service as an application setting. Terraform state can contain credentials. Keep `.tfstate`, `.tfplan`, `.tfvars`, and `.env` private and never commit or screenshot their contents. Terraform state is ignored by Git. After apply, clear the sensitive environment variable:

```powershell
Remove-Item Env:\TF_VAR_azure_maps_subscription_key
```

### Deploy the application package

From the repository root, build a source-only ZIP (it excludes `.env`, Terraform state, and `node_modules`) and deploy it to the app created by this stack:

```powershell
Set-Location C:\Users\uditr\Downloads\Web-app
$repoRoot = (Get-Location).Path
Set-Location .\infra\trekstop
$resourceGroup = terraform output -raw resource_group_name
$appName = terraform output -raw app_name
Set-Location $repoRoot

$buildId = [guid]::NewGuid().ToString("N")
$packageDirectory = Join-Path $env:TEMP "trekstop-package-$buildId"
$zipPath = Join-Path $env:TEMP "trekstop-deploy-$buildId.zip"
New-Item -ItemType Directory -Force $packageDirectory | Out-Null
Copy-Item .\server.js, .\package.json, .\package-lock.json, .\trails.json -Destination $packageDirectory -Force
Copy-Item .\public -Destination $packageDirectory -Recurse -Force
Compress-Archive -Path (Join-Path $packageDirectory "*") -DestinationPath $zipPath -Force

az webapp config appsettings set `
  --resource-group $resourceGroup `
  --name $appName `
  --settings SCM_DO_BUILD_DURING_DEPLOYMENT=true
az webapp deploy `
  --resource-group $resourceGroup `
  --name $appName `
  --src-path $zipPath `
  --type zip

Set-Location .\infra\trekstop
$deploymentUrl = terraform output -raw application_url
Set-Location $repoRoot
Write-Output $deploymentUrl
```

The ZIP deployment uses App Service remote build to install the dependencies from `package-lock.json`. The site’s startup command is `node server.js`. Check its health before seeding the sample trails into Cosmos DB:

```powershell
Invoke-RestMethod "$deploymentUrl/api/health"
$sampleTrails = Get-Content (Join-Path $repoRoot "trails.json") -Raw | ConvertFrom-Json
foreach ($trail in $sampleTrails) {
  $body = $trail | ConvertTo-Json -Depth 10
  Invoke-RestMethod `
    -Uri "$deploymentUrl/api/trails" `
    -Method Post `
    -ContentType "application/json" `
    -Body $body
}
Invoke-RestMethod "$deploymentUrl/api/trails"
```

Open `$deploymentUrl` in a browser and confirm the map, markers, and trail list load. Do not copy the Maps key into browser code to troubleshoot.

### Cleanup after the assignment (optional)

Only destroy the new Trek-Stop stack if you no longer need it. From `infra/trekstop`, create and inspect a destroy plan; verify every listed resource belongs to `rg-trekstop-*` before applying:

```powershell
terraform plan -destroy -out trekstop-destroy.tfplan
terraform show trekstop-destroy.tfplan
terraform apply trekstop-destroy.tfplan
```

Do not run cleanup against the historical `infra/terraform` directory or another resource group.
