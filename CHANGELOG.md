## [0.1.0-beta.14](https://github.com/hirosystems/ordinals-api/compare/v0.1.0-beta.13...v0.1.0-beta.14) (2023-05-11)


### Bug Fixes

* use materialized view total count correctly ([#64](https://github.com/hirosystems/ordinals-api/issues/64)) ([939f6b9](https://github.com/hirosystems/ordinals-api/commit/939f6b987202f4c554aedc36a766f41f51bae434))

## [0.1.0-beta.13](https://github.com/hirosystems/ordinals-api/compare/v0.1.0-beta.12...v0.1.0-beta.13) (2023-05-05)


### Bug Fixes

* use bignumber.js for sat percentiles ([8914e27](https://github.com/hirosystems/ordinals-api/commit/8914e27d4215470f9bea9a1f1e5339ffe38c31d0))

## [0.1.0-beta.12](https://github.com/hirosystems/ordinals-api/compare/v0.1.0-beta.11...v0.1.0-beta.12) (2023-05-05)


### Bug Fixes

* cache inscription counts for mime_type and sat_rarity ([#55](https://github.com/hirosystems/ordinals-api/issues/55)) ([f4fb4c7](https://github.com/hirosystems/ordinals-api/commit/f4fb4c75d8191b71c4d09443f698ec36491841dc))

## [0.1.0-beta.11](https://github.com/hirosystems/ordinals-api/compare/v0.1.0-beta.10...v0.1.0-beta.11) (2023-05-02)


### Bug Fixes

* expand int column sizes ([0e425ff](https://github.com/hirosystems/ordinals-api/commit/0e425ff42aa0f58c0203f4483acb1114f0e604e5))

## [0.1.0-beta.10](https://github.com/hirosystems/ordinals-api/compare/v0.1.0-beta.9...v0.1.0-beta.10) (2023-04-30)


### Bug Fixes

* use pre-calculated inscription count for unfiltered results ([#48](https://github.com/hirosystems/ordinals-api/issues/48)) ([3e7a4f4](https://github.com/hirosystems/ordinals-api/commit/3e7a4f41b0429a26cca1c1af544fff90ed8a3c33))

## [0.1.0-beta.9](https://github.com/hirosystems/ordinals-api/compare/v0.1.0-beta.8...v0.1.0-beta.9) (2023-04-24)


### Bug Fixes

* increase out-of-order log level to error ([#42](https://github.com/hirosystems/ordinals-api/issues/42)) ([56ca661](https://github.com/hirosystems/ordinals-api/commit/56ca6610fe707080272274d60672a65574547fa2))

## [0.1.0-beta.8](https://github.com/hirosystems/ordinals-api/compare/v0.1.0-beta.7...v0.1.0-beta.8) (2023-04-18)


### Features

* move to new inscription_feed predicate ([#41](https://github.com/hirosystems/ordinals-api/issues/41)) ([efa4a62](https://github.com/hirosystems/ordinals-api/commit/efa4a6241db3de70a79b9a228a2c2ffa8e1fecd7))

## [0.1.0-beta.7](https://github.com/hirosystems/ordinals-api/compare/v0.1.0-beta.6...v0.1.0-beta.7) (2023-04-12)


### Features

* support inscription transfers ([#37](https://github.com/hirosystems/ordinals-api/issues/37)) ([ebeb805](https://github.com/hirosystems/ordinals-api/commit/ebeb8054980b18db90e038ecf525e2d93b45de28))

## [0.1.0-beta.6](https://github.com/hirosystems/ordinals-api/compare/v0.1.0-beta.5...v0.1.0-beta.6) (2023-03-09)


### Features

* configurable event server body limit ([1a37769](https://github.com/hirosystems/ordinals-api/commit/1a37769cdb4500e1141224fba953a9133f95a88e))

## [0.1.0-beta.5](https://github.com/hirosystems/ordinals-api/compare/v0.1.0-beta.4...v0.1.0-beta.5) (2023-03-08)


### Bug Fixes

* set starting block height to 767430 ([84ce95e](https://github.com/hirosystems/ordinals-api/commit/84ce95ede9b6905c69eaff354a7ac331a5a4605a))

## [0.1.0-beta.4](https://github.com/hirosystems/ordinals-api/compare/v0.1.0-beta.3...v0.1.0-beta.4) (2023-03-08)


### Bug Fixes

* adjust payloads ([#21](https://github.com/hirosystems/ordinals-api/issues/21)) ([d6d91e9](https://github.com/hirosystems/ordinals-api/commit/d6d91e9259f5086565dca4a2f9883698b110947b))

## [0.1.0-beta.3](https://github.com/hirosystems/ordinals-api/compare/v0.1.0-beta.2...v0.1.0-beta.3) (2023-03-06)


### Features

* address array param ([5d3bc4b](https://github.com/hirosystems/ordinals-api/commit/5d3bc4bdcb3958e4f7a52bd32b0aaceae5d26b36))
* filter by array of ids or numbers ([34721b0](https://github.com/hirosystems/ordinals-api/commit/34721b00df1e44e43b0366cd026c4da00bddcd51))
* resume indexing from last observed block height ([fc4a549](https://github.com/hirosystems/ordinals-api/commit/fc4a549041131467cad0f3544a7371a3beafa517))
* return current tx_id ([a503f73](https://github.com/hirosystems/ordinals-api/commit/a503f7308414d99dbb4b7cbc64cd7f3d5bb10f86))

## [0.1.0-beta.2](https://github.com/hirosystems/ordinals-api/compare/v0.1.0-beta.1...v0.1.0-beta.2) (2023-03-03)


### Features

* add status endpoint ([e42b351](https://github.com/hirosystems/ordinals-api/commit/e42b351ce69b953c0aabec8ac29b773f3d7ae761))
* support authorized chainhook events ([a2ff106](https://github.com/hirosystems/ordinals-api/commit/a2ff1065aa4a64ab15d1d74209361707c82e704e))

## [0.1.0-beta.1](https://github.com/hirosystems/ordinals-api/compare/v0.0.1...v0.1.0-beta.1) (2023-03-03)


### Features

* /ordinals prefix ([38d6c6b](https://github.com/hirosystems/ordinals-api/commit/38d6c6b6275c17e6039a5ac5c9e7724aeb80b5c9))
* accept inscription number on endpoints ([952bf8e](https://github.com/hirosystems/ordinals-api/commit/952bf8e8be7035f48a7252102a4c574e32e4f9ff))
* add rarity filter ([41f9207](https://github.com/hirosystems/ordinals-api/commit/41f92071be2beab390362140f075e248da630c19))
* btc indexer poc, update types and tables ([#7](https://github.com/hirosystems/ordinals-api/issues/7)) ([6ff2bd9](https://github.com/hirosystems/ordinals-api/commit/6ff2bd94c7a48a44764b505a9ea387f63cf798ff))
* chain tip cache for index ([7019f98](https://github.com/hirosystems/ordinals-api/commit/7019f985d99e2d9f9c40b4e593404bd443c14194))
* consume inscription reveals from chainhook node ([#13](https://github.com/hirosystems/ordinals-api/issues/13)) ([a99b4a4](https://github.com/hirosystems/ordinals-api/commit/a99b4a4a1f0ecb5d7a5c7ee38994abc30bc0e796))
* filter by block hash ([ed73b78](https://github.com/hirosystems/ordinals-api/commit/ed73b785746cee0d05b9b14bb89f468e2b586b7d))
* filter by coinbase block height range ([5698ebc](https://github.com/hirosystems/ordinals-api/commit/5698ebce90a253b3f2898fb1e0880c9969e932f6))
* filter by genesis block height range ([4f11c44](https://github.com/hirosystems/ordinals-api/commit/4f11c44eec973ef44c238687c8c16dd9c1fab0c7))
* filter by genesis timestamp range ([67a0e9e](https://github.com/hirosystems/ordinals-api/commit/67a0e9eb6ae3ee78d9428c4b2a344edc51619959))
* filter by inscription number range ([f8453b6](https://github.com/hirosystems/ordinals-api/commit/f8453b6a87ee1fce6f35d67d9e521bf3d69914f5))
* filter by mime type ([f0093c7](https://github.com/hirosystems/ordinals-api/commit/f0093c712512bc3157331152eb5acc31d2a400f9))
* filter by rarity array ([4037af3](https://github.com/hirosystems/ordinals-api/commit/4037af340f811439e1ad7b01c7b5edec47433849))
* filter by sat ordinal range ([377ebb0](https://github.com/hirosystems/ordinals-api/commit/377ebb028c694ddf30a4450c457fd4dc6f27aabb))
* inscription cache control ([b9370d8](https://github.com/hirosystems/ordinals-api/commit/b9370d8d2bb994351f7e3ad54ce6748b4f298f2b))
* inscriptions index with filters ([790cbf7](https://github.com/hirosystems/ordinals-api/commit/790cbf7d848a94224f15ab5dce64e5d1e48f5629))
* order index by ordinal, height, rarity ([aba47af](https://github.com/hirosystems/ordinals-api/commit/aba47af3ae36b6c1614112c189e471564a64b124))
* return genesis_address ([ee1e4ea](https://github.com/hirosystems/ordinals-api/commit/ee1e4ea1e082521cc041971e41614c6efefb9018))
* return genesis_timestamp ([d46eb0f](https://github.com/hirosystems/ordinals-api/commit/d46eb0fcae3fbc7edafb70db5e73bd60a1968438))
* sat endpoint ([ff7608b](https://github.com/hirosystems/ordinals-api/commit/ff7608b63a1cc5d9f16d732bd0e023e48b3c3c69))
* shows inscription_id on sats ([1028a13](https://github.com/hirosystems/ordinals-api/commit/1028a13628249c4c746c9f3ccf011d0f54be3d6c))


### Bug Fixes

* add inscription number to responses ([d4d36c2](https://github.com/hirosystems/ordinals-api/commit/d4d36c2409abfcc7fe33605fd50b9939590279d0))
* add vercel.json ([ae66a07](https://github.com/hirosystems/ordinals-api/commit/ae66a0728500ccec3351ace232040ad8e37208d5))
* allow max limit of 60 ([2391a75](https://github.com/hirosystems/ordinals-api/commit/2391a7537df6a8912081b98e8624d224c1976f6b))
* buffers ([ae45e06](https://github.com/hirosystems/ordinals-api/commit/ae45e06caa8a914fa1a29b73bc1f3021d2d42b9b))
* complete sat ordinal data ([56389b5](https://github.com/hirosystems/ordinals-api/commit/56389b5be589491be9f53d3f204cf478d456894b))
* env default values ([867fc63](https://github.com/hirosystems/ordinals-api/commit/867fc63764d167d048154da557f129228c100dae))
* inscription number filtering ([adb5cf6](https://github.com/hirosystems/ordinals-api/commit/adb5cf6155a724c229e008a23d6dad15091eaa9e))
