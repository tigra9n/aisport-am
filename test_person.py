import json
import urllib.request

url = "https://api.apitube.io/v1/news/everything?api_key=api_live_IC9sMCy9vUoOAhRSTOnDCOfcvHE1GZ3M9dMzJIBT8GCyAgTVOJnOj&person.name=Erling+Haaland&published_at.start=2026-08-28&per_page=50&language.code=en&sort.by=published_at&sort.order=desc"

req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req, timeout=30) as resp:
    d = json.loads(resp.read().decode("utf-8"))

print("status:", d.get("status"))
results = d.get("results", [])
print("num results:", len(results))
for r in results[:5]:
    print("-", r.get("title"), "|", r.get("published_at"))
if "errors" in d:
    print("errors:", d["errors"])
