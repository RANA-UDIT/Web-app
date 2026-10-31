# Assignment 3: Infrastructure automation, cost analysis, and monitoring

This guide extends the Assignment 2 travel catalogue without changing or importing its manually created Azure resources. The Terraform configuration creates a separate resource group and app stack, so the original deployment remains untouched. Terraform files are in [`../infra/terraform/`](../infra/terraform/); the read-only Locust scenario is in [`../loadtest/`](../loadtest/).

The Terraform defaults match the working Assignment 2 hosting setup: Central India, Linux Basic B1, and Node.js 24 LTS. The new Cosmos DB account uses serverless capacity in Central India, and the storage account uses standard RA-GRS replication. This provisions new resources; it does not reuse the Assignment 2 resources.

## Before creating Azure resources

- Sign in to the intended Azure subscription and confirm its current budget and available credits.
- The default App Service plan is **B1** and incurs a charge while it exists, even if the app receives no traffic. Cosmos DB serverless, Application Insights/Log Analytics ingestion, and storage can also incur usage charges.
- This is not a guaranteed free deployment. Use the Azure Pricing Calculator before applying, and destroy the Assignment 3 resource group after capturing the required evidence if you no longer need it.
- Do not stop or delete the Assignment 2 app as part of these steps. The Terraform resource group is independently named `rg-travel-a3-*`.
- Terraform state and App Service settings contain credentials. Keep the state file and your `terraform.tfvars` out of Git and do not include secret values in screenshots.

## Part 1: Terraform deployment

### Prerequisites

Install Terraform 1.6 or newer and Azure CLI. Authenticate with an account that can create resources in the selected subscription:

```powershell
az login
az account list --output table
az account set --subscription "<your-subscription-id>"
```

Copy `infra/terraform/terraform.tfvars.example` to `infra/terraform/terraform.tfvars` and replace the placeholder with the subscription ID. The actual `terraform.tfvars` file is ignored by Git.

### Validate, review, and apply

Run these commands from the Terraform directory:

```powershell
Set-Location .\infra\terraform
terraform init
terraform fmt -check
terraform validate
terraform plan -out assignment3.tfplan
terraform show assignment3.tfplan
```

Review the plan, Azure region, resource names, and expected charges before creating anything. If the plan is correct and your budget allows it:

```powershell
terraform apply assignment3.tfplan
terraform show
terraform output
```

Capture screenshots of the successful `terraform validate`, `terraform apply`, and `terraform show` outputs. Avoid displaying credentials or copying the full state file. The app's URL and name are available with:

```powershell
terraform output -raw application_url
terraform output -raw app_name
```

### Deploy the app to the Terraform-created App Service

The existing GitHub Actions deployment workflow still targets the Assignment 2 App Service by default. To target the Terraform app instead, add a repository **Actions variable** named `AZURE_WEBAPP_NAME` with the value from `terraform output -raw app_name`. Keep the existing Azure login secrets and federated identity configuration; the workflow's Azure identity must also have deployment permission to the new App Service. Then run the `main` workflow using **Actions > Build and deploy Node.js app to Azure Web App - travel-catalogue-udit > Run workflow**.

Alternatively, use the Azure portal's App Service Deployment Center to connect the repository and configure deployment for the Terraform-created app. Do not change the existing Assignment 2 app's settings to point it at the new resources.

## Part 2: Cost estimate

Open the [Azure Pricing Calculator](https://azure.microsoft.com/pricing/calculator/) and add the Azure services in the Terraform stack. Select **Central India** where the calculator offers a region choice. Prices and free allowances vary by account, region, and date; record the estimate and calculator date rather than treating an example as a guaranteed bill.

In the calculator, explicitly choose **Central India**, **Linux**, **Basic B1**, and 730 hours for App Service. The supplied calculator text had Windows selected; its displayed monthly price is for that Windows selection, so do not use it as the Linux estimate. Record the monthly price shown after switching to Linux. Use these explicit monthly assumptions as a starting point, and adjust them if your observed load differs:

| Assumption | Estimate |
|---|---:|
| Active users | 100 users/day |
| Requests | 20 requests/user/day, about 60,000 requests/month |
| App Service | 1 Linux Basic B1 instance, 730 hours/month |
| Cosmos DB | Serverless, estimate 300,000 request units/month (assume 5 RU per request; actual operations vary) |
| Blob Storage | 1 GB, read-access geo-redundant storage (RA-GRS) |
| Monitoring | 0.5 GB of logs/telemetry ingested per month; 30-day retention |

Include App Service, Azure Cosmos DB for NoSQL (serverless), Storage Accounts (Blob, RA-GRS), and Application Insights/Log Analytics. If the calculator does not expose the exact serverless or monitoring field, state the closest available input and the assumption you used. Capture a screenshot of the completed calculator estimate with the monthly total and configuration visible.

## Part 3: Monitoring and performance analysis

Deploy and verify the Terraform app first. Follow [`../loadtest/README.md`](../loadtest/README.md) to run the default read-only Locust profile (5 users, 1 user/second ramp-up, 2 minutes). Avoid running Locust against someone else's app or increasing traffic without permission.

Before the test, note the start time and open the Terraform app's Application Insights resource in Azure Portal. During and after the test, inspect:

- **Application Insights > Investigate > Performance** (or the equivalent Performance view in the current portal) for request count, duration/latency, and failed requests.
- **Application Insights > Monitoring > Metrics** for server requests, response time, and failed requests.
- **App Service > Metrics** for CPU percentage and memory working set.
- **Cosmos DB > Insights/Metrics** for total request units and throttled requests (HTTP 429), if exposed in the portal.
- Locust's request statistics and CSV output for request count, failure count, median, average, and 95th-percentile response time.

Capture screenshots that show the test time window and service/resource name. Write a short evidence-based insight, for example: “During a two-minute, five-user read-only test, Locust reported ___ requests, ___ failures, and ___ ms p95 latency. App Service CPU peaked at ___%, and Cosmos DB reported ___ RU/s or ___ throttled requests. This suggests ___.” Fill in only values actually observed; do not claim the app passed a threshold unless you measured it.

## Cleanup

After saving the screenshots, cost estimate, and insights, remove only this stack if it is no longer needed. From `infra/terraform/`:

```powershell
terraform destroy
```

Review the plan and confirm it names only the Assignment 3 resource group/resources before approving. Do not delete the manually deployed Assignment 2 resource group. Keep the Terraform state until the destroy completes; then remove local state files only if you no longer need the record.
