"""The visitor's IP address, also when the server runs behind a proxy.

Behind a host's load balancer every connection comes from the proxy, so the
real address has to be read from X-Forwarded-For. Each proxy appends the
address it received the request from, so only the last `trusted_proxy_hops`
entries were written by proxies we trust. Anything to their left came from
the client and can be made up, which is why the leftmost entry is never used.
"""

from fastapi import Request

from app.config import settings


def client_ip(request: Request) -> str:
    direct = request.client.host if request.client else "unknown"
    hops = settings.trusted_proxy_hops
    if hops <= 0:
        return direct
    forwarded = [
        part.strip()
        for header in request.headers.getlist("x-forwarded-for")
        for part in header.split(",")
        if part.strip()
    ]
    if not forwarded:
        return direct
    return forwarded[-hops] if len(forwarded) >= hops else forwarded[0]
