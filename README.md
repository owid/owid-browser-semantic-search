# OWID in-browser semantic search

This is a prototype of a semantic search engine for the OWID website which runs entirely in the browser (from embedding to similarity search).

The goal is to provide a no-infrastructure solution for quick prototyping and experimentation with (semantic) search on the OWID website. It is also a test of how far we can get with only embedding the titles of the site's content (as opposed to the full content).

It uses the [transformers.js](https://github.com/huggingface/transformers.js) library for generating embeddings of the site's content. It stores the embeddings alongside some metadata in a wasm port of postgres, pglite, augmented with pgvector for similarity search.

You can run the search engine locally by following the quick start below, which will use a pre-generated coredump of the site's content.

Alternatively, you can generate a new coredump by following the instructions in "Refresh the coredump.json file".

## Quick start

- `npm run dev`
- visit `http://localhost:5173/`
- "Generate embeddings" -> this will take a while

You can run searches while the embedding generation is in progress, but the results will be incomplete.

## Refresh the coredump.json file

- create a new route in `mockSiteRouter.ts` in the owid-grapher repo and wire it to the `makeCoreDump()` function in `coredump.tsx` (to be created, file content below). This will generate a lightweight dump of the site's content for the semantic search engine to index.

### mockSiteRouter.ts

```
getPlainRouteWithROTransaction(
    mockSiteRouter,
    "/coredump.json",
    async (_, res, trx) => {
        const dump = await makeCoreDump(explorerAdminServer, trx)
        res.json(dump)
    }
)
```

### coredump.tsx

```
import {
    BAKED_BASE_URL,
    BAKED_GRAPHER_URL,
} from "../settings/serverSettings.js"
import { dayjs, countries, DbPlainChart, Span } from "@ourworldindata/utils"
import * as db from "../db/db.js"
import urljoin from "url-join"
import { ExplorerAdminServer } from "../explorerAdminServer/ExplorerAdminServer.js"

import { GdocPost } from "../db/model/Gdoc/GdocPost.js"

interface SitemapUrl {
    loc: string
    lastmod?: string
}

// Borrowed from sitemap.ts

export const makeCoreDump = async (
    explorerAdminServer: ExplorerAdminServer,
    knex: db.KnexReadonlyTransaction
) => {
    const gdocPosts = await db.getPublishedGdocPosts(knex)

    const publishedDataInsights = await db.getPublishedDataInsights(knex)

    const charts = await db.knexRaw<
        Pick<DbPlainChart, "updatedAt"> & { slug: string; title: string }
    >(
        knex,
        `-- sql
            SELECT c.updatedAt, cc.slug, JSON_UNQUOTE(cc.full->"$.title") as title
            FROM charts c
            JOIN chart_configs cc ON cc.id = c.configId
            WHERE
                cc.full->"$.isPublished" = true
        `
    )

    const dods = await GdocPost.getDetailsOnDemandGdoc(knex)

    let urls = countries.map((c) => ({
        loc: urljoin(BAKED_BASE_URL, "country", c.slug),
        title: `${c.name}`,
    })) as SitemapUrl[]

    urls = urls
        .concat(
            gdocPosts.map((p) => ({
                loc: urljoin(BAKED_BASE_URL, p.slug),
                title: p.content.title,
                type: "gdoc",
                lastmod: dayjs(p.updatedAt).format("YYYY-MM-DD"),
            }))
        )
        .concat(
            publishedDataInsights.map((d) => ({
                loc: urljoin(BAKED_BASE_URL, "data-insights", d.slug),
                title: `${d.title}`,
                type: "insight",
                lastmod: dayjs(d.updatedAt).format("YYYY-MM-DD"),
            }))
        )
        .concat(
            charts.map((c) => ({
                loc: urljoin(BAKED_GRAPHER_URL, c.slug),
                title: `${c.title}`,
                type: "chart",
                lastmod: dayjs(c.updatedAt).format("YYYY-MM-DD"),
            }))
        )
        .concat(
            Object.keys(dods.details)
                .filter((id) => {
                    //hack until dod parsing is fixed
                    return dods.details[id].text.length >= 2
                })
                .map((id) => {
                    return {
                        title: extractTextFromSpans(
                            dods.details[id].text[0].value
                        ),
                        content: extractTextFromSpans(
                            dods.details[id].text[1].value
                        ),
                        type: "dod",
                        loc: urljoin(BAKED_BASE_URL, `dods/${id}`),
                    }
                })
        )

    return urls
}

export function extractTextFromSpans(spans: Span[]): string {
    return spans
        .map((span) => {
            switch (span.spanType) {
                case "span-simple-text":
                    return span.text
                case "span-link":
                case "span-ref":
                case "span-dod":
                case "span-italic":
                case "span-bold":
                case "span-underline":
                case "span-subscript":
                case "span-superscript":
                case "span-quote":
                case "span-fallback":
                    return extractTextFromSpans(span.children)
                case "span-newline":
                    return "\n"
                default:
                    return ""
            }
        })
        .join("")
}
```

- run the owid-grapher site locally. This will expose the `http://localhost:3030/coredump.json` route, for this repo to fetch and process.

_Explorers, standalone pages, topic country profiles, author pages are not indexed for this experiment._

Inspired by https://github.com/huggingface/transformers.js-examples/tree/main/pglite-semantic-search
