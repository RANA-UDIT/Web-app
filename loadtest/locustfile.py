from locust import HttpUser, between, task


class TravelCatalogueUser(HttpUser):
    wait_time = between(1, 3)

    @task(3)
    def list_destinations(self):
        with self.client.get(
            "/api/destinations", name="/api/destinations", catch_response=True
        ) as response:
            if response.status_code != 200:
                response.failure(f"Unexpected status: {response.status_code}")
                return
            try:
                if not isinstance(response.json(), list):
                    response.failure("Expected the API to return a JSON list")
            except ValueError:
                response.failure("The API response was not valid JSON")

    @task(1)
    def filter_destinations(self):
        with self.client.get(
            "/api/destinations",
            params={"continent": "Asia"},
            name="/api/destinations?continent=[filter]",
            catch_response=True,
        ) as response:
            if response.status_code != 200:
                response.failure(f"Unexpected status: {response.status_code}")
                return
            try:
                if not isinstance(response.json(), list):
                    response.failure("Expected the API to return a JSON list")
            except ValueError:
                response.failure("The API response was not valid JSON")

    @task(1)
    def open_homepage(self):
        with self.client.get("/", name="/", catch_response=True) as response:
            if response.status_code != 200:
                response.failure(f"Unexpected status: {response.status_code}")
