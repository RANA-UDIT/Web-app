# Locust load test

This test sends read-only requests to the travel catalogue: list destinations, filter by continent, and open the homepage. It does not create or change catalogue entries.

## Run a short, low-volume test

Use the Terraform application's URL from `terraform output -raw application_url` as the host. Confirm the app is running and that the target URL is your own deployment before starting.

From the repository root in PowerShell:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r .\loadtest\requirements.txt
locust -f .\loadtest\locustfile.py --host https://YOUR-APP-NAME.azurewebsites.net
```

Open http://localhost:8089 and use **5 users**, **1 user started per second**, and a **2-minute** test duration. Start with this small profile; do not increase the load unless your instructor requires it and you have checked the Azure budget.

Alternatively, run the same profile without the web UI:

```powershell
locust -f .\loadtest\locustfile.py --host https://YOUR-APP-NAME.azurewebsites.net --headless -u 5 -r 1 --run-time 2m --csv .\loadtest-results
```

The CSV output contains request counts, failures, and response-time statistics. Keep generated results and screenshots for submission, but do not commit telemetry that contains private information.
