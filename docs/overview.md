---
Title: Overview
---

# Ordinals API Overview

The Ordinals API is a protocol that allows for Bitcoin inscriptions based on Ordinal theory. It provides a service that indexes Bitcoin Ordinals data and offers a REST API to access and query this data.

Here are the key features of the [Ordinals API](https://github.com/hirosystems/ordinals-api):

**Ordinal Inscription Ingestion**: The API helps with the complete ingestion of ordinal inscriptions. This includes information about the Genesis block, transactions, timestamps, and the history of inscriptions associated with each transaction. It also provides location and ownership information.

**Satoshi Ordinal Notation Endpoints**: The API offers endpoints to retrieve ordinal information using Satoshi ordinal notation. This allows you to query specific ordinals and obtain relevant data.

**REST JSON Endpoints with ETag Caching**: The API provides easy-to-use REST endpoints that return responses in JSON format. It also supports *ETag caching*, which allows you to cache responses based on inscriptions. This helps optimize performance and reduce unnecessary requests.

**Auto-Scale Server Configurations**: The Ordinals API supports three run modes based on the `RUN_MODE` environment variable:

- `default`: This mode runs all background jobs and the API server. It is suitable for running the service on a single instance.
- `readonly`: In this mode, only the API server runs. It is designed for auto-scaled clusters with multiple `readonly` instances and a single `writeonly` instance. The `writeonly` instance is responsible for populating the database.
- `writeonly`: This mode is used in an auto-scaled environment to consume new inscriptions. It works in conjunction with multiple `readonly` instances, as explained above.

For more detailed information and documentation, you can refer to the [Ordinals API reference](https://docs.hiro.so/ordinals).