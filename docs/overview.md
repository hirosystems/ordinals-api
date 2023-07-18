---
Title: Overview
---

# Ordinals API Overview

Ordinals is a new protocol that enables Bitcoin inscriptions based on Ordinal theory. The ordinal theory is based on Satoshis(the atomic, native currency of Bitcoin), numbered in the order of the users to enjoy digital artifacts on Bitcoin. [Ordinals API](https://github.com/hirosystems/ordinals-api) is a service that indexes Bitcoin Ordinals data and exposes it via REST API endpoints.

You can query ordinal inscriptions and get JSON responses with inscription data, blocks, and addresses.

## Features

- Ordinals API helps you with complete ordinal inscription ingestion that includes:
  - Genesis block and transaction information with timestamp
  - history of the inscriptions that went through the transaction
  - Location and ownership information
- Satoshi ordinal notation endpoints that retrieve ordinal information
- Easy to use REST JSON endpoints with ETag caching
  - You can provide endpoints and cache the responses based on inscriptions
- Supports auto-scale server configurations
  - this service supports three run modes specified by the `RUN_MODE` environment variable
    - `default`: Runs all background jobs and the API server. Use this when you're running the service only on one instance. It is the default mode.
    - `readonly`: Runs only the API server. Use this in an auto-scaled cluster with multiple readonly instances and just one `writeonly` instance. This mode needs a `writeonly` instance to continue populating the DB.
    - `writeonly`: Use one of these in an auto-scaled environment to continue consuming new inscriptions. Use in conjunction with multiple `readonly` instances, as explained above.

Refer to [Ordinals API reference](https://docs.hiro.so/ordinals) for more information.