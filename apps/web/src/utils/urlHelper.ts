export function normalizeUrl(raw: string | undefined | null): string | null {
    try {
        if (!raw) return null;
        let u = raw.trim();

        // 1. Add protocol if missing (so URL() constructor works)
        if (!/^https?:\/\//i.test(u)) u = "https://" + u;

        const url = new URL(u);

        // 2. Normalize hostname: lower case & remove 'www.'
        url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");

        // 3. Remove hash (anchors usually point to same page content)
        url.hash = "";

        // 4. Remove common tracking params
        const dropParams = [
            "utm_source",
            "utm_medium",
            "utm_campaign",
            "utm_term",
            "utm_content",
            "gclid",
            "fbclid",
            "ref",
        ];
        dropParams.forEach((p) => url.searchParams.delete(p));

        // 5. Remove trailing slash (unless it's root '/')
        if (url.pathname !== "/" && url.pathname.endsWith("/")) {
            url.pathname = url.pathname.slice(0, -1);
        }

        // 6. Force https for consistency
        url.protocol = "https:";

        return url.toString();
    } catch (e) {
        return null; // Invalid URL
    }
}
