# Ordinals API

A service that indexes Bitcoin Ordinals data and exposes it via REST API endpoints.

## Table of Contents

* [Features](#features)
* [API Reference](#api-reference)
* [Quick Start](#quick-start)
    * [System Requirements](#system-requirements)
    * [Running the API](#running-the-api)
    * [Run Modes](#run-modes)
    * [Stopping the API](#stopping-the-api)

## Features

* Complete ordinal inscription ingestion
    * Genesis block and transaction information
    * Transfer history
    * Current location and ownership information
* Satoshi ordinal notation endpoints
* Easy to use REST JSON endpoints with ETag caching
* Run modes for auto-scaling

## API Reference

See the [Ordinals API Reference](https://docs.hiro.so/ordinals/) for more information.

## Quick Start

### System Requirements

The Ordinals API is a microservice that has hard dependencies on other systems. Before you start,
you'll need to have access to:

1. A [Chainhook node](https://github.com/hirosystems/chainhook) with a fully indexed Ordinals
   `.redb` database.
1. A local writeable Postgres database for data storage

### Running the API

Clone the repo.

Create an `.env` file and specify the appropriate values to configure the local API server, postgres
DB and Chainhook node reachability. See
[`env.ts`](https://github.com/hirosystems/ordinals-api/blob/develop/src/env.ts) for all available
configuration options.

Build the app (NodeJS v18+ is required)
```
npm install
npm run build
```

Start the service
```
npm run start
```

### Run Modes

To better support auto-scaling server configurations, this service supports three run modes
specified by the `RUN_MODE` environment variable:

* `default`: Runs all background jobs and the API server. Use this when you're running this service
  only on one instance. This is the default mode.
* `readonly`: Runs only the API server. Use this in an auto-scaled cluster when you have multiple
  `readonly` instances and just one `writeonly` instance. This mode needs a `writeonly` instance to
  continue populating the DB.
* `writeonly`: Use one of these in an auto-scaled environment so you can continue consuming new
  inscriptions. Use in conjunction with multiple `readonly` instances as explained above.

### Stopping the API

When shutting down, you should always prefer to send the `SIGINT` signal instead of `SIGKILL` so
the service has time to finish any pending background work and all dependencies are gracefully
disconnected.