# Instance Activity Console is global, session-scoped, and privacy-exceptional

**Status: accepted**

Nanahoshi will expose the Instance Activity Console only to the global administrator, not to organization owners or organization roles. It presents one live Playback Session per authenticated device session and a 90-day immutable Security Audit Event record across all authentication origins; playback titles are visible to that administrator even when a member disabled social activity sharing, but are never retained after the session ends. This deliberately favors global operational oversight while limiting the privacy exception to an administrative, live-only surface. Audit-write failures log a structured server error without blocking users, and a daily purge deletes only expired audit events.
