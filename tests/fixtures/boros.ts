/** Public Boros market response shape; synthetic time and values, no wallet data. */
export const borosRaw = {
  "marketId": 128,
  "address": "0xc8be609770ae2007bfc12fd02b6ae9b230d0ede6",
  "tokenId": 2,
  "imData": {
    "name": "Hyperliquid ETH 25 Dec 2026",
    "symbol": "HYPERLIQUID-ETH-25DEC2026",
    "isIsolatedOnly": false,
    "maturity": 1798156800,
    "tickStep": 2,
    "iTickThresh": 770,
    "marginFloor": 0.08003999738290433
  },
  "config": {
    "maxOpenOrders": 80,
    "markRateOracle": "0x0000000000000000000000000000000000000000",
    "fIndexOracle": "0xc9540bd59f76614d9404bd2ac347b2e0095287a0",
    "hardOICap": "20000000000000000000000",
    "takerFee": "500000000000000",
    "otcFee": "500000000000000",
    "liqSettings": {
      "base": "250000000000000000",
      "slope": "500000000000000000",
      "feeRate": "500000000000000"
    },
    "kIM": "645161290322580645",
    "kMM": "333333333333333333",
    "tThresh": 432000,
    "maxRateDeviationFactorBase1e4": 2500,
    "closingOrderBoundBase1e4": 1000,
    "loUpperConstBase1e4": 53,
    "loUpperSlopeBase1e4": 10667,
    "loLowerConstBase1e4": -53,
    "loLowerSlopeBase1e4": 9333,
    "status": 2,
    "useImpliedAsMarkRate": true,
    "softOICap": 9500,
    "cloLowerThresh": 9300,
    "cloUpperThresh": 9500
  },
  "extConfig": {
    "ammAddress": "0xd1a6378f6d87334468db9e61883432a6c983aa91",
    "ammId": 1280,
    "isPositiveAMM": true,
    "settleFeeRate": "1000000000000000",
    "paymentPeriod": 3600,
    "maxUpdateDelay": 900
  },
  "metadata": {
    "name": "ETHUSDC",
    "underlyingSymbol": "ETH",
    "fundingRateSymbol": "hyperliquid-eth",
    "maxLeverage": 1.55,
    "maxPerpLeverage": 25,
    "isUiWhitelisted": true
  },
  "data": {
    "volume24h": 3.6271309,
    "notionalOI": 1712.8084749955642,
    "markApr": 0.0791763324884592,
    "lastTradedApr": 0.0791763324884592,
    "midApr": 0.08101244660603268,
    "bestBid": 0.08003999738290433,
    "bestAsk": 0.08101244660603268,
    "ammImpliedApr": 0.08101244660603268,
    "floatingApr": 0.1095,
    "longYieldApr": 0.3788564280740169,
    "nextSettlementTime": 1791000000,
    "timeToMaturity": 7160400,
    "assetMarkPrice": 2680,
    "rateSensitivity": 0.0022705479452054794,
    "settlementsToMaturity": 1989,
    "dailyVolatility": 0.0017382940957624746,
    "dailyVolatilityState": "ready"
  },
  "platform": {
    "name": "Hyperliquid",
    "platformId": "Hyperliquid"
  }
};
